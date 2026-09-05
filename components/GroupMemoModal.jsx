"use client";

// =============================================================
// 우리 모둠 (학생) — 모둠원 확인 + 모둠원에게 메모 남기기
// -------------------------------------------------------------
// 구성은 '누가기록' 모달을 그대로 따릅니다: 위에 쓰는 칸, 아래에 지금까지의
// 글 목록. 다른 점은 셋뿐입니다 —
//  · 쓰는 칸이 서식 에디터입니다(RichTextEditor, variant="chat").
//  · 주고받는 글이라 목록이 **오래된 것부터**입니다(대화처럼 위에서 아래로).
//    누가기록은 교사가 혼자 쌓는 기록이라 최신순이 맞지만, 여기서는 최신순이면
//    답과 물음이 거꾸로 놓여 읽을 수가 없습니다.
//  · 글마다 '답장'이 있습니다 — 누르면 그 말을 인용해 두고 씁니다.
//
// [읽는 문서] 모둠 문서 하나(groupAssignments/default) + 이 모둠원과 주고받은
// 메모(pairKey 하나로 질의) + 내가 받은 안 읽은 메모(배지용). 셋 다 등호
// 하나짜리라 새 색인이 없습니다.
//
// [읽음 처리] 그 친구의 대화를 **연 순간** 받은 것을 읽음으로 바꿉니다 —
// 알림 벨의 '읽음'을 따로 누르게 하면, 읽고 답까지 했는데 배지가 남습니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  deleteGroupMemo,
  markGroupMemoRead,
  sendGroupMemo,
  subscribeGroupMemoThread,
  subscribeMyUnreadMemos,
  subscribeStudyGroupAssignment,
  formatTime,
} from "@/lib/store";
import { richHtml, stripHtml } from "@/lib/html";
import RichTextEditor from "./RichTextEditor";
import { IconGroup } from "./StatusIcons";

export default function GroupMemoModal({
  classId,
  user,
  roster = [],
  // 알림에서 들어왔을 때 곧바로 열 상대 — 없으면 아무도 안 고른 상태
  initialUid = null,
  onClose,
}) {
  const myUid = user?.uid ?? null;
  const [assignment, setAssignment] = useState(null);
  const [pickedUid, setPickedUid] = useState(initialUid);
  const [unread, setUnread] = useState([]);
  const [thread, setThread] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);
  // 보낸 뒤 에디터를 비우려면 통째로 새로 그려야 합니다(내용을 DOM이 들고
  // 있는 contentEditable이라 값을 밖에서 되돌릴 길이 없습니다).
  const [composeKey, setComposeKey] = useState(0);
  const draftRef = useRef("");

  useEffect(() => {
    if (!classId) return;
    return subscribeStudyGroupAssignment(classId, setAssignment);
  }, [classId]);

  useEffect(() => {
    if (!myUid) return;
    return subscribeMyUnreadMemos(myUid, setUnread);
  }, [myUid]);

  useEffect(() => {
    if (!classId || !myUid || !pickedUid) { setThread([]); return; }
    return subscribeGroupMemoThread(classId, myUid, pickedUid, setThread);
  }, [classId, myUid, pickedUid]);

  // 상대를 바꾸면 쓰다 만 글·인용이 따라오지 않게 정리합니다
  useEffect(() => {
    setReplyTo(null);
    draftRef.current = "";
    setComposeKey((k) => k + 1);
  }, [pickedUid]);

  // 열어 본 대화의 받은 메모를 읽음으로. 실패해도 무시합니다 — 배지가
  // 남을 뿐이고, 다음에 열면 다시 시도합니다.
  useEffect(() => {
    thread
      .filter((m) => m.toUid === myUid && !m.read)
      .forEach((m) => markGroupMemoRead(m.id).catch(() => {}));
  }, [thread, myUid]);

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

  const unreadByUid = useMemo(() => {
    const map = {};
    unread.forEach((m) => { map[m.fromUid] = (map[m.fromUid] ?? 0) + 1; });
    return map;
  }, [unread]);

  const picked = mates.find((m) => m.uid === pickedUid) ?? null;

  async function handleSend() {
    const html = draftRef.current;
    if (!picked || sending || !stripHtml(html).trim()) return;
    setSending(true);
    try {
      await sendGroupMemo(user, {
        classId,
        toUid: picked.uid,
        toName: picked.name,
        html,
        replyTo,
      });
      draftRef.current = "";
      setReplyTo(null);
      setComposeKey((k) => k + 1);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(memo) {
    if (!confirm("이 메모를 거둘까요? 되돌릴 수 없어요.")) return;
    if (replyTo?.id === memo.id) setReplyTo(null);
    await deleteGroupMemo(memo.id).catch(() => {});
  }

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
          <>
            {/* 모둠원 — 누르면 그 친구와의 메모가 아래에 열립니다 */}
            <div className="gmemo-mates" role="tablist" aria-label="모둠원">
              {mates.map((m) => {
                const n = unreadByUid[m.uid] ?? 0;
                const on = m.uid === pickedUid;
                return (
                  <button
                    key={m.uid}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    className={`gmemo-mate${on ? " on" : ""}`}
                    onClick={() => setPickedUid(on ? null : m.uid)}
                    title={`${m.name}에게 메모 남기기`}
                  >
                    <span aria-hidden="true">{m.emoji || "🙂"}</span> {m.name}
                    {n > 0 && (
                      <span className="gmemo-mate-badge" aria-label={`안 읽은 메모 ${n}건`}>
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {!picked ? (
              <p className="notes-empty">모둠원을 누르면 메모를 주고받을 수 있어요.</p>
            ) : (
              <div className="notes-thread gmemo-thread">
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
                  placeholder={`${picked.name}에게 남길 말 — Ctrl+Enter로 보내기`}
                  onChange={(html) => { draftRef.current = html; }}
                  onSend={handleSend}
                  sendDisabled={sending}
                />

                {thread.length === 0 ? (
                  <p className="notes-empty">아직 주고받은 메모가 없어요.</p>
                ) : (
                  <ul className="notes-list gmemo-list">
                    {thread.map((m) => {
                      const mine = m.fromUid === myUid;
                      return (
                        <li
                          key={m.id}
                          className={`notes-item gmemo-item${mine ? " gmemo-item--mine" : ""}`}
                        >
                          {m.replyToText && (
                            <p className="gmemo-quote">
                              ↩ {m.replyToName ? `${m.replyToName}: ` : ""}
                              {m.replyToText}
                            </p>
                          )}
                          <div
                            className="notes-text gmemo-text"
                            dangerouslySetInnerHTML={{ __html: richHtml(m.html) }}
                          />
                          <div className="notes-meta">
                            {/* 누가·언제를 한 덩이로 묶습니다 — .notes-meta가
                                space-between이라 셋을 그냥 두면 시각이
                                한가운데로 떠 버립니다. */}
                            <span className="gmemo-by">
                              <span className="gmemo-who">{mine ? "나" : m.fromName}</span>
                              <time>{formatTime(m.createdAt)}</time>
                            </span>
                            <span className="notes-item-actions">
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
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
