"use client";

// =============================================================
// 우리 모둠 (학생) — 모둠원 확인 + 모둠원에게 메모 남기기
// -------------------------------------------------------------
// **왼쪽에 대화 목록, 오른쪽에 그 대화.** 예전에는 모둠원을 눌러야 비로소
// 무언가 보였는데, 창을 여는 이유의 태반은 '새 메모를 쓰려고'가 아니라
// '방금 온 메모를 보려고'입니다. 열자마자 최근 대화가 서 있어야 합니다.
//
// [스레드로 묶습니다] 답장이 오간 것은 **한 줄**입니다(lib/memoThreads.js).
// 목록에는 그 대화의 **첫 메모**만 서고, 누르면 오른쪽에 오간 말이 전부
// 펼쳐집니다. 이렇게 묶어 두면 목록을 **최근순**으로 세워도 대화가 흩어지지
// 않습니다 — 한 대화가 여러 줄로 쪼개져 사이사이 남의 말이 끼지 않으니까요.
// 세우는 기준은 뿌리가 아니라 **마지막 글**입니다: 어제 시작한 대화에 방금
// 답이 오면 그것이 지금 볼 것인데, 뿌리 기준이면 아래에 묻힙니다.
//
// [모둠원 칩은 '새로 쓰기'입니다] 목록은 이어 가는 길, 칩은 시작하는 길로
// 갈라 둡니다. 칩을 누르면 오른쪽이 빈 대화(새 메모)가 됩니다.
//
// [쓰는 칸] 누가기록 모달과 같은 자리(위에 쓰는 칸, 아래에 지금까지의 글).
// 다른 점은 서식 에디터라는 것과, 목록이 **오래된 것부터**라는 것입니다 —
// 대화라 최신순이면 답과 물음이 거꾸로 놓입니다.
//
// [읽는 문서] 모둠 문서 하나 + 이 반에서 내가 주고받은 메모 전부(등호
// 하나짜리 질의 둘). 친구를 고를 때마다 리스너를 새로 걸지 않습니다.
//
// [읽음 처리] 그 대화를 **연 순간** 받은 것을 읽음으로 바꿉니다 — 알림의
// '읽음'을 따로 누르게 하면, 읽고 답까지 했는데 배지가 남습니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  deleteGroupMemo,
  markGroupMemoRead,
  sendGroupMemo,
  subscribeMyGroupMemos,
  subscribeStudyGroupAssignment,
  formatTime,
} from "@/lib/store";
import { buildMemoThreads } from "@/lib/memoThreads";
import { richHtml, stripHtml } from "@/lib/html";
import RichTextEditor from "./RichTextEditor";
import { IconGroup } from "./StatusIcons";

// 목록에 세우는 대화 수. 더 늘리면 창이 길어지기만 하고, 오래된 대화는
// 어차피 그 친구 칩으로 새로 시작하는 편이 빠릅니다.
const THREAD_LIMIT = 5;

export default function GroupMemoModal({
  classId,
  user,
  roster = [],
  // 알림에서 들어왔을 때 곧바로 열 상대 — 그 사람과의 **가장 최근 대화**를
  // 폅니다. 없으면 그 사람에게 쓰는 새 메모.
  initialUid = null,
  onClose,
}) {
  const myUid = user?.uid ?? null;
  const [assignment, setAssignment] = useState(null);
  const [memos, setMemos] = useState([]);
  // 고른 것 — { kind: 'thread', id } | { kind: 'new', uid } | null
  const [picked, setPicked] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);
  // 보낸 뒤 에디터를 비우려면 통째로 새로 그려야 합니다(내용을 DOM이 들고
  // 있는 contentEditable이라 값을 밖에서 되돌릴 길이 없습니다).
  const [composeKey, setComposeKey] = useState(0);
  const draftRef = useRef("");
  const seededRef = useRef(false);

  useEffect(() => {
    if (!classId) return;
    return subscribeStudyGroupAssignment(classId, setAssignment);
  }, [classId]);

  useEffect(() => {
    if (!classId || !myUid) { setMemos([]); return; }
    return subscribeMyGroupMemos(classId, myUid, setMemos);
  }, [classId, myUid]);

  const threads = useMemo(() => buildMemoThreads(memos, myUid), [memos, myUid]);

  // 내 모둠 — 명단에서 나를 뺀 나머지가 '모둠원'입니다.
  const myGroup = useMemo(() => {
    const groups = assignment?.groups ?? [];
    return groups.find((g) => (g.memberUids ?? []).includes(myUid)) ?? null;
  }, [assignment, myUid]);

  // 모둠에 저장된 members는 배정하던 때의 스냅샷이라 반에서 빠진 학생이
  // 남아 있을 수 있습니다(CLAUDE.md '모둠 현황' 참고). 명단이 도착했을
  // 때만 걸러 냅니다 — 받는 중(빈 배열)에 거르면 모둠원이 통째로 사라집니다.
  const mates = useMemo(() => {
    const all = (myGroup?.members ?? []).filter((m) => m.uid && m.uid !== myUid);
    if (roster.length === 0) return all;
    const inClass = new Map(roster.map((r) => [r.uid, r]));
    return all
      .filter((m) => inClass.has(m.uid))
      .map((m) => ({ ...m, ...inClass.get(m.uid) }));
  }, [myGroup, myUid, roster]);

  const nameOf = useMemo(() => {
    const map = new Map(mates.map((m) => [m.uid, m]));
    return (uid) => map.get(uid)?.name ?? "";
  }, [mates]);

  // 알림에서 들어왔으면 그 사람과의 가장 최근 대화를 폅니다. 대화가 아직
  // 없으면 그 사람에게 쓰는 새 메모로. **한 번만** 합니다(ref) — 그러지
  // 않으면 목록이 갱신될 때마다 사용자가 고른 것을 덮어씁니다.
  useEffect(() => {
    if (seededRef.current || !initialUid || memos.length === 0) return;
    seededRef.current = true;
    const t = threads.find((x) => x.otherUid === initialUid);
    setPicked(t ? { kind: "thread", id: t.id } : { kind: "new", uid: initialUid });
  }, [initialUid, memos.length, threads]);

  const activeThread =
    picked?.kind === "thread" ? threads.find((t) => t.id === picked.id) ?? null : null;
  const partnerUid =
    picked?.kind === "new" ? picked.uid : activeThread?.otherUid ?? null;
  const partner = mates.find((m) => m.uid === partnerUid) ?? null;

  // 고른 것이 바뀌면 쓰다 만 글·인용을 정리합니다
  useEffect(() => {
    setReplyTo(null);
    draftRef.current = "";
    setComposeKey((k) => k + 1);
  }, [picked?.kind, picked?.id, picked?.uid]);

  // 펼친 대화에서 받은 메모를 읽음으로. 실패해도 무시합니다 — 배지가 남을
  // 뿐이고, 다음에 열면 다시 시도합니다.
  useEffect(() => {
    (activeThread?.items ?? [])
      .filter((m) => m.toUid === myUid && !m.read)
      .forEach((m) => markGroupMemoRead(m.id).catch(() => {}));
  }, [activeThread, myUid]);

  async function handleSend() {
    const html = draftRef.current;
    if (!partner || sending || !stripHtml(html).trim()) return;
    setSending(true);
    try {
      // 대화 안에서 쓴 글은 그 대화에 이어 붙입니다 — 답장할 글을 따로
      // 고르지 않았으면 **그 대화의 마지막 글**에 답한 것으로 둡니다.
      // 이래야 스레드가 갈라지지 않습니다.
      const link = replyTo ?? activeThread?.last ?? null;
      const id = await sendGroupMemo(user, {
        classId,
        toUid: partner.uid,
        toName: partner.name,
        html,
        replyTo: link,
      });
      draftRef.current = "";
      setReplyTo(null);
      setComposeKey((k) => k + 1);
      // 새 메모를 보냈으면 방금 만든 대화를 그대로 폅니다(빈 화면으로
      // 돌아가면 '보내진 건가' 싶어집니다).
      if (picked?.kind === "new" && id) setPicked({ kind: "thread", id });
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(memo) {
    if (!confirm("이 메모를 거둘까요? 되돌릴 수 없어요.")) return;
    if (replyTo?.id === memo.id) setReplyTo(null);
    await deleteGroupMemo(memo.id).catch(() => {});
  }

  const recent = threads.slice(0, THREAD_LIMIT);

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal group-memo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-memo-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="group-memo-title" className="head-icon">
            <IconGroup size={20} /> 우리 모둠
            {myGroup && <span className="gmemo-group-name">{myGroup.name}</span>}
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {!assignment ? (
          <p className="notes-empty">모둠을 불러오는 중이에요.</p>
        ) : !myGroup ? (
          <p className="notes-empty">아직 모둠에 들어가 있지 않아요 — 선생님께 말씀드리세요.</p>
        ) : mates.length === 0 ? (
          <p className="notes-empty">우리 모둠에 나 말고 다른 친구가 없어요.</p>
        ) : (
          <div className="gmemo-cols">
            {/* ── 왼쪽: 누구에게 새로 쓸까 + 어떤 대화를 이어 갈까 ── */}
            <div className="gmemo-side">
              <span className="gmemo-side-label">모둠원에게 새 메모</span>
              <div className="gmemo-mates">
                {mates.map((m) => {
                  const on = picked?.kind === "new" && picked.uid === m.uid;
                  return (
                    <button
                      key={m.uid}
                      type="button"
                      className={`gmemo-mate${on ? " on" : ""}`}
                      onClick={() => setPicked(on ? null : { kind: "new", uid: m.uid })}
                      title={`${m.name}에게 새 메모 쓰기`}
                    >
                      <span aria-hidden="true">{m.emoji || "🙂"}</span> {m.name}
                    </button>
                  );
                })}
              </div>

              <span className="gmemo-side-label">최근 대화</span>
              {recent.length === 0 ? (
                <p className="gmemo-side-empty">아직 주고받은 메모가 없어요.</p>
              ) : (
                <ul className="gmemo-threads">
                  {recent.map((t) => {
                    const on = picked?.kind === "thread" && picked.id === t.id;
                    const mine = t.root.fromUid === myUid;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          className={`gmemo-thread${on ? " on" : ""}`}
                          onClick={() => setPicked({ kind: "thread", id: t.id })}
                          aria-current={on}
                        >
                          <span className="gmemo-thread-head">
                            <span className="gmemo-thread-who">
                              {nameOf(t.otherUid) || t.root.toName || "모둠 친구"}
                            </span>
                            {t.unread > 0 && (
                              <span
                                className="gmemo-mate-badge"
                                aria-label={`안 읽은 메모 ${t.unread}건`}
                              >
                                {t.unread}
                              </span>
                            )}
                            <time className="gmemo-thread-at">{formatTime(t.lastAt)}</time>
                          </span>
                          {/* 목록에는 **첫 메모**만. 대화가 무엇으로 시작했는지가
                              그 줄의 이름표입니다(마지막 말은 자꾸 바뀝니다). */}
                          <span className="gmemo-thread-text">
                            {mine ? "나: " : ""}
                            {stripHtml(t.root.html || "")}
                          </span>
                          {t.items.length > 1 && (
                            <span className="gmemo-thread-count">
                              답장 {t.items.length - 1}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* ── 오른쪽: 고른 대화 ── */}
            <div className="gmemo-main">
              {!partner ? (
                <p className="notes-empty">
                  왼쪽에서 대화를 누르거나, 모둠원을 눌러 새 메모를 써 보세요.
                </p>
              ) : (
                <div className="notes-thread gmemo-thread-pane">
                  <div className="gmemo-pane-head">
                    <span aria-hidden="true">{partner.emoji || "🙂"}</span>
                    <strong>{partner.name}</strong>
                    <span className="gmemo-pane-sub">
                      {activeThread ? `메모 ${activeThread.items.length}` : "새 메모"}
                    </span>
                  </div>

                  {/* 답장 — 어느 말에 답하는 중인지 쓰는 칸 바로 위에 둡니다 */}
                  {replyTo && (
                    <div className="gmemo-replying">
                      <span className="gmemo-replying-label">
                        ↩ {replyTo.fromName}에게 답장
                      </span>
                      <span className="gmemo-replying-text">
                        {stripHtml(replyTo.html).slice(0, 60)}
                      </span>
                      <button
                        type="button"
                        className="gmemo-replying-cancel"
                        onClick={() => setReplyTo(null)}
                        aria-label="답장 취소"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  <RichTextEditor
                    key={composeKey}
                    variant="chat"
                    /* 꾸미개가 먼저, 쓰는 칸이 그다음 — 질문·공지 작성 창과
                       같은 순서입니다. 메신저처럼 아래에 두면 서식을 쓰려고
                       칸 밖으로 눈이 한 번 내려갔다 올라와야 합니다. */
                    toolbarTop
                    placeholder={`${partner.name}에게 남길 말 — Ctrl+Enter로 보내기`}
                    onChange={(html) => { draftRef.current = html; }}
                    onSend={handleSend}
                    sendDisabled={sending}
                  />

                  {/* 대화는 **테두리 하나 안**에서 좌우로 오갑니다. 글마다
                      상자를 두르면 한 대화가 여러 덩이로 쪼개져, 목록에서
                      스레드로 묶어 놓은 것이 여기서 도로 흩어집니다.
                      누가 한 말인지는 **왼쪽/오른쪽**이 말하므로 이름을
                      줄마다 적지 않습니다(1:1 대화라 위 머리줄이 이미
                      상대를 말합니다). */}
                  {!activeThread ? (
                    <p className="notes-empty">첫 마디를 남겨 보세요.</p>
                  ) : (
                    <div className="gmemo-chat">
                      {activeThread.items.map((m) => {
                        const mine = m.fromUid === myUid;
                        return (
                          <div
                            key={m.id}
                            className={`gmemo-msg${mine ? " gmemo-msg--mine" : ""}`}
                          >
                            <div className="gmemo-bubble">
                              {m.replyToText && (
                                <p className="gmemo-quote">
                                  ↩ {m.replyToName ? `${m.replyToName}: ` : ""}
                                  {m.replyToText}
                                </p>
                              )}
                              <div
                                className="gmemo-text"
                                dangerouslySetInnerHTML={{ __html: richHtml(m.html) }}
                              />
                            </div>
                            <div className="gmemo-msg-meta">
                              <time>{formatTime(m.createdAt)}</time>
                              <button
                                type="button"
                                className="notes-edit"
                                onClick={() => setReplyTo(m)}
                              >
                                답장
                              </button>
                              {mine && (
                                <button
                                  type="button"
                                  className="notes-del"
                                  onClick={() => handleDelete(m)}
                                >
                                  거두기
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
