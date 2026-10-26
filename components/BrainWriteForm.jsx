"use client";

// =============================================================
// 브레인 라이팅 — 학생 화면
// -------------------------------------------------------------
// 모둠원마다 세로 칸(컬럼)이 하나씩 있고, 맨 위에 그 주인의 이름이 섭니다.
// 주인이 첫 줄에 자기 생각이나 질문을 남기고, 그 아래로 모둠원이 **학번순으로
// 주인 다음부터 돌아가며** 앞 사람의 글에 이어 질문하거나 생각을 보탭니다.
//
//   왼쪽  — 우리 모둠의 컬럼 목록(나 · 친구). 누르면 가운데가 그 컬럼.
//   가운데 — 고른 컬럼. 내 이름이 있는 줄만 쓰는 칸이고 나머지는 읽기만.
//
// 저장은 저절로(0.8초 모아서) — 줄마다 문서 한 장(lib/brainwrite.js).
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeBwNotes, saveBwNote } from "@/lib/store";
import {
  BW_TEXT_MAX,
  sortMembers,
  columnRows,
  notesByColumn,
  writerProgress,
} from "@/lib/brainwrite";
import { useBookGroups, myBookGroup } from "@/lib/bookGroups";
import { safeBookUrl } from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";
import GroupJoinRow from "./GroupJoinRow";

const SAVE_MS = 800;

export default function BrainWriteForm({ activity, user, onBack }) {
  const groups = useBookGroups(activity.id, true);
  const myGroup = myBookGroup(groups, user?.uid);
  const freeMode = activity.groupMode === "free";
  const locked = !!activity.locked;
  const bookUrl = safeBookUrl(activity.bookUrl);

  const [notes, setNotes] = useState(null); // null = 아직 모름
  useEffect(() => {
    if (!myGroup?.id) { setNotes(null); return undefined; }
    return subscribeBwNotes(activity.id, myGroup.id, setNotes);
  }, [activity.id, myGroup?.id]);

  const members = useMemo(() => sortMembers(myGroup?.members ?? []), [myGroup]);
  const byColumn = useMemo(() => notesByColumn(notes ?? []), [notes]);
  const progress = useMemo(
    () => writerProgress(members, user?.uid, byColumn),
    [members, user?.uid, byColumn]
  );
  const doneCount = progress.filter((p) => p.done).length;

  // 고른 컬럼 — 처음에는 내 컬럼
  const [ownerUid, setOwnerUid] = useState(null);
  const owner = members.find((m) => m.uid === ownerUid) ?? members.find((m) => m.uid === user?.uid) ?? members[0] ?? null;

  // 쓰는 중인 글 — 컬럼마다(다른 컬럼으로 옮겨도 쓰던 글이 남게)
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState({}); // { [주인]: 'saving' | 'saved' | 'error' }
  const timers = useRef({});
  const pending = useRef({});

  const flush = (oUid) => {
    clearTimeout(timers.current[oUid]);
    const text = pending.current[oUid];
    if (text === undefined || !myGroup?.id) return;
    delete pending.current[oUid];
    setStatus((s) => ({ ...s, [oUid]: "saving" }));
    saveBwNote(activity.id, myGroup.id, oUid, { uid: user.uid, name: user.realName || user.displayName || "" }, text)
      .then(() => setStatus((s) => ({ ...s, [oUid]: "saved" })))
      .catch((e) => {
        console.warn("[브레인 라이팅] 저장 실패:", e?.code, e?.message);
        setStatus((s) => ({ ...s, [oUid]: "error" }));
      });
  };
  // 화면을 떠날 때 남은 글을 씁니다
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => {
    Object.keys(pending.current).forEach((k) => flushRef.current(k));
  }, []);

  const edit = (oUid, text) => {
    const t = text.slice(0, BW_TEXT_MAX);
    setDrafts((d) => ({ ...d, [oUid]: t }));
    pending.current[oUid] = t;
    clearTimeout(timers.current[oUid]);
    timers.current[oUid] = setTimeout(() => flushRef.current(oUid), SAVE_MS);
  };

  const pick = (uid) => {
    if (owner?.uid && owner.uid !== uid) flush(owner.uid);
    setOwnerUid(uid);
  };

  const rows = owner ? columnRows(members, owner.uid, byColumn) : [];
  const myAt = rows.findIndex((r) => r.member.uid === user?.uid);
  const prev = myAt > 0 ? rows[myAt - 1] : null;
  const prompt = String(activity.prompt ?? "").trim();

  return (
    <main className="books-main">
      <div className="books-head">
        <div className="books-head-title">
          <h1 className="book-group-title">{activity.title}</h1>
          <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
        </div>
        <div className="books-head-row">
          <div className="books-head-main">
            {(activity.topic ?? "").trim() && <span className="book-group-topic">{activity.topic}</span>}
            {myGroup && (
              <span className="paratext-sum">
                {myGroup.groupName} · 내가 쓴 칸 {doneCount} / {progress.length}
              </span>
            )}
            {locked && (
              <span className="paratext-saved locked">
                <IconLock size={14} /> 잠김
              </span>
            )}
          </div>
          {bookUrl && (
            <a className="btn-primary book-info-btn" href={bookUrl} target="_blank" rel="noopener noreferrer">
              <IconBook size={15} /> 도서 정보
            </a>
          )}
        </div>
      </div>

      {prompt && (
        <p className="bw-prompt">
          <span className="bw-prompt-tag">질문</span>
          {prompt}
        </p>
      )}

      {!myGroup ? (
        freeMode ? (
          <GroupJoinRow activity={activity} groups={groups} user={user} maxPerGroup={activity.maxPerGroup ?? 6} />
        ) : (
          <p className="empty-note">아직 모둠에 들지 않았어요. 선생님이 모둠을 짜면 시작할 수 있어요.</p>
        )
      ) : notes === null ? (
        <p className="empty-note">불러오는 중이에요…</p>
      ) : (
        <div className="bw-layout">
          <aside className="bw-rail" aria-label="모둠 친구의 칸">
            <h3>우리 모둠 칸</h3>
            <ul>
              {members.map((m) => {
                const p = progress.find((x) => x.owner.uid === m.uid);
                const me = m.uid === user?.uid;
                const on = owner?.uid === m.uid;
                return (
                  <li key={m.uid}>
                    <button
                      type="button"
                      className={`bw-rail-item${on ? " on" : ""}${p?.done ? " done" : ""}`}
                      onClick={() => pick(m.uid)}
                      aria-pressed={on}
                      title={p?.done ? "이 칸에 내 글을 남겼어요" : "아직 이 칸에 쓰지 않았어요"}
                    >
                      <span className="bw-rail-name">
                        {m.name}
                        {me && <em>나</em>}
                      </span>
                      <span className="bw-rail-state">{p?.done ? "✓ 씀" : "아직"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="bw-col" aria-label={`${owner?.name ?? ""}의 칸`}>
            <header className="bw-col-head">
              <strong>{owner?.name}</strong>
              <span>{owner?.uid === user?.uid ? "나의 칸 — 첫 줄에 내 생각이나 질문을 남겨요" : "앞 사람의 글에 이어 질문하거나 생각을 보태요"}</span>
            </header>
            <ol className="bw-rows">
              {rows.map((r, i) => {
                const mine = r.member.uid === user?.uid;
                const text = mine
                  ? drafts[owner.uid] ?? r.note?.text ?? ""
                  : String(r.note?.text ?? "");
                const st = mine ? status[owner.uid] : null;
                return (
                  <li key={r.member.uid} className={`bw-row${mine ? " mine" : ""}${r.filled ? " filled" : ""}`}>
                    <span className="bw-row-who">
                      <b>{i + 1}</b>
                      {r.member.name}
                      {mine && <em>나</em>}
                      {st && (
                        <span className={`bw-row-save ${st}`}>
                          {st === "saving" ? "저장 중…" : st === "saved" ? "저장됨" : "저장 못 함"}
                        </span>
                      )}
                    </span>
                    {mine ? (
                      <>
                        {prev && !prev.filled && !String(text).trim() && (
                          <p className="bw-row-hint">
                            앞 사람({prev.member.name})이 아직 쓰지 않았어요 — 기다렸다가 이어 써도, 먼저 써도 괜찮아요.
                          </p>
                        )}
                        <textarea
                          className="bw-row-input"
                          value={text}
                          onChange={(e) => edit(owner.uid, e.target.value)}
                          onBlur={() => flush(owner.uid)}
                          disabled={locked}
                          rows={3}
                          placeholder={
                            i === 0
                              ? "이 질문에 대한 내 생각이나 궁금한 점을 적어요"
                              : "앞 사람의 글에 이어 질문하거나 생각을 보태요"
                          }
                        />
                      </>
                    ) : (
                      <p className={`bw-row-text${r.filled ? "" : " empty"}`}>
                        {r.filled ? text : "아직 쓰지 않았어요"}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      )}
    </main>
  );
}
