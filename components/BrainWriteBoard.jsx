"use client";

// =============================================================
// 브레인 라이팅 — 교사 화면
// -------------------------------------------------------------
// 다른 독서 활동과 같은 세 칸입니다(.book-workspace).
//   왼쪽  — 모둠 카드(모둠원 이름 알약 — RAFT 모둠 카드와 같은 모양).
//           알약을 누르면 가운데에 그 학생의 컬럼이 섭니다.
//   가운데 — 고른 학생의 컬럼(질문 → 주인의 첫 줄 → 이어 쓴 줄들, 읽기만).
//   오른쪽 — 학생별 진행(조각 바). 칸 하나가 '몇 번째로 이어 쓰는 줄'이고
//           (1 = 제 칸 첫 줄), 썼으면 초록 · 앞 사람이 써서 차례가 왔으면 주황 —
//           모둠 크기만큼 칸이 섭니다. 전광판도 같은 셈(BrainWriteProgressBoard).
//
// 컬럼 머리 오른쪽의 '수업 시작'이 그 학생의 컬럼을 학급 화면에 띄우고 수업
// 화면 창(CastStageModal)을 엽니다 — 이전 · 다음 학생은 왼쪽 모둠 카드 차례.
// 방송 모양은 곁텍스트 · RAFT와 같은 mode "entry"(줄마다 이름 + 글)입니다.
//
// 글은 모둠마다 구독합니다(groups/{gId}/bwNotes — 모둠 여섯이면 리스너 여섯).
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeBwNotes, composeBookGroups } from "@/lib/store";
import {
  sortMembers,
  columnRows,
  notesByColumn,
  writerSlots,
  writerChars,
} from "@/lib/brainwrite";
import { useEntryCast } from "@/lib/useEntryCast";
import CastStageModal from "./CastStageModal";
import BrainWriteProgressBoard from "./BrainWriteProgressBoard";
import { useBookGroups } from "@/lib/bookGroups";
import { safeBookUrl } from "@/lib/paratext";
import { IconBook, IconLock, IconPeople } from "./StatusIcons";
import EntryProgressPanel from "./EntryProgressPanel";
import GroupComposer from "./GroupComposer";

export default function BrainWriteBoard({
  activity,
  className = "",
  classId = null,
  user = null,
  roster = [],
  onBack,
  classTools = null,
  classPicker = null,
  baseGroupAssignment = null,
  onToast = null,
}) {
  const groups = useBookGroups(activity.id, true);
  const live = useMemo(() => groups.filter((g) => !g.retired), [groups]);
  const groupKey = live.map((g) => g.id).join("|");
  const [composing, setComposing] = useState(false);
  const freeMode = activity.groupMode === "free";

  // 모둠마다의 글 — { [모둠 id]: 문서 목록 }
  const [notesBy, setNotesBy] = useState({});
  useEffect(() => {
    const ids = groupKey ? groupKey.split("|") : [];
    const offs = ids.map((gId) =>
      subscribeBwNotes(activity.id, gId, (list) => setNotesBy((m) => ({ ...m, [gId]: list })))
    );
    return () => offs.forEach((off) => off());
  }, [activity.id, groupKey]);

  const allNotes = useMemo(() => Object.values(notesBy).flat(), [notesBy]);

  // 학생 한 명 = 한 줄. 모둠 차례 · 그 안은 학번순. 모둠에 없는 학생은 뒤로.
  const rosterSet = useMemo(() => new Set(roster.map((s) => s.uid)), [roster]);
  const cards = useMemo(() => {
    const out = [];
    const placed = new Set();
    for (const g of live) {
      const members = sortMembers(g.members ?? []).filter((m) => !roster.length || rosterSet.has(m.uid));
      const byColumn = notesByColumn(notesBy[g.id] ?? []);
      for (const m of members) {
        placed.add(m.uid);
        out.push({
          uid: m.uid,
          name: m.name,
          studentId: m.studentId ?? null,
          emoji: m.emoji,
          group: g,
          members,
          // 이어 쓰는 차례마다(k = 0 제 칸 첫 줄 …) 썼나 · 차례가 왔나
          slots: writerSlots(members, m.uid, byColumn),
        });
      }
    }
    for (const s of roster) {
      if (placed.has(s.uid)) continue;
      out.push({ uid: s.uid, name: s.name, studentId: s.studentId ?? null, emoji: s.emoji, group: null, members: [], slots: [] });
    }
    return out;
  }, [live, notesBy, roster, rosterSet]);

  const [openUid, setOpenUid] = useState(null);
  const open = cards.find((c) => c.uid === openUid) ?? null;
  const openRows = useMemo(() => {
    if (!open?.group) return [];
    return columnRows(open.members, open.uid, notesByColumn(notesBy[open.group.id] ?? []));
  }, [open, notesBy]);

  const startedCount = cards.filter((c) => c.slots.some((p) => p.done)).length;
  const doneCount = cards.filter((c) => c.slots.length > 0 && c.slots.every((p) => p.done)).length;
  const prompt = String(activity.prompt ?? "").trim();
  const bookUrl = safeBookUrl(activity.bookUrl);

  // ── 방송 — 한 학생의 컬럼 한 장 ──
  const cast = useEntryCast(classId, user);
  const [stageOpen, setStageOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const rowsOf = (card) =>
    card?.group ? columnRows(card.members, card.uid, notesByColumn(notesBy[card.group.id] ?? [])) : [];
  const payloadOf = (card) => ({
    mode: "entry",
    activityTitle: activity.title ?? "",
    topic: activity.topic ?? "",
    writerName: card.name,
    label: `${card.name}의 칸`,
    labelEn: card.group?.groupName ?? "",
    prompt,
    fields: rowsOf(card).map((r, i) => ({
      label: `${i + 1} · ${r.member.name}`,
      text: r.filled ? String(r.note.text).trim() : "",
    })),
  });
  // 차례는 왼쪽 모둠 카드 그대로 — 모둠이 없는 학생은 띄울 칸이 없어 뺍니다
  const castList = useMemo(() => cards.filter((c) => c.group), [cards]);
  const castCard = cast.target ? castList.find((c) => c.uid === cast.target.uid) ?? null : null;
  const livePayload = castCard ? payloadOf(castCard) : null;
  // 방송 중인 컬럼에 누가 새로 쓰면 칠판도 따라갑니다(잠깐 모았다가)
  cast.useLiveUpdate(livePayload);
  const castAt = castCard ? castList.findIndex((c) => c.uid === castCard.uid) : -1;
  const prevStudent = castAt > 0 ? castList[castAt - 1] : null;
  const nextStudent = castAt >= 0 && castAt < castList.length - 1 ? castList[castAt + 1] : null;
  function castStudent(card) {
    if (!card?.group) return;
    setOpenUid(card.uid);
    if (cast.isCasting(card.uid, "col")) { setStageOpen(true); return; }
    cast.cast({ uid: card.uid, key: "col" }, payloadOf(card));
    setStageOpen(true);
  }
  function stopCast() {
    cast.stop();
    setStageOpen(false);
  }
  const openLive = open ? cast.isCasting(open.uid, "col") : false;

  return (
    <main className="books-main book-workspace-main">
      <div className="books-head">
        <div className="books-head-title">
          <h1 className="book-group-title">{activity.title}</h1>
          <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
          {classTools}
        </div>
        <div className="books-head-row">
          <div className="books-head-main">
            {classPicker ?? (className && <span className="book-group-class">{className}</span>)}
            {!freeMode && (
              <button type="button" className="btn-ghost" onClick={() => setComposing(true)}>
                <IconPeople size={15} /> 활동 모둠
              </button>
            )}
            {(activity.topic ?? "").trim() && <span className="book-group-topic">{activity.topic}</span>}
            <span className="paratext-sum">
              시작 {startedCount}명 · 완성 {doneCount}명 / 전체 {cards.length}명
            </span>
            {cards.length > 0 && (
              <button
                type="button"
                className="group-filter-act"
                onClick={() => setBoardOpen(true)}
                title="이어 쓰는 차례 × 반 전체를 한 격자로 봅니다"
              >
                전광판
              </button>
            )}
            {activity.locked && (
              <span className="book-locked-note book-locked-chip">
                <IconLock size={14} /> 지금은 잠겨 있어 학생이 고칠 수 없어요.
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

      {cards.length === 0 ? (
        <p className="empty-note">아직 이 반에 들어온 학생이 없어요.</p>
      ) : (
        <div className="book-workspace">
          <aside className="book-group-rail raft-group-rail" aria-label="모둠">
            {live.length === 0 && <p className="book-group-empty">아직 모둠이 없어요.</p>}
            {live.map((g) => {
              const mates = cards.filter((c) => c.group?.id === g.id);
              const started = mates.filter((c) => c.slots.some((p) => p.done)).length;
              const on = mates.some((c) => c.uid === openUid);
              return (
                <div key={g.id} className={`book-rail-card raft-group-card${on ? " on" : ""}`}>
                  <span className="book-rail-head">
                    <strong>{g.groupName}</strong>
                    <span className="book-group-count">시작 {started}/{mates.length}</span>
                  </span>
                  {mates.length === 0 ? (
                    <span className="book-group-empty">아직 모둠원이 없어요</span>
                  ) : (
                    <span className="book-rail-chips">
                      {mates.map((c) => {
                        const picked = c.uid === openUid;
                        const done = c.slots.length > 0 && c.slots.every((p) => p.done);
                        return (
                          <button
                            key={c.uid}
                            type="button"
                            className={`book-rail-chip raft-mate-pill${picked ? " on" : ""}${done ? " done" : ""}`}
                            onClick={() => setOpenUid(c.uid)}
                            aria-pressed={picked}
                            title={`${c.studentId ? `${c.studentId} ` : ""}${c.name} — 쓴 칸 ${
                              c.slots.filter((p) => p.done).length
                            } / ${c.slots.length}`}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </span>
                  )}
                </div>
              );
            })}
            {cards.some((c) => !c.group) && (
              <div className="book-rail-card raft-group-card">
                <span className="book-rail-head"><strong>모둠 없음</strong></span>
                <span className="book-group-empty">
                  {cards.filter((c) => !c.group).map((c) => c.name).join(", ")}
                </span>
              </div>
            )}
          </aside>

          <div className="book-workspace-center">
            {open ? (
              <div className="bw-col-wrap">
                {/* 컬럼과 같은 폭의 머리 — 이름 · 모둠, 오른쪽 끝에 방송 단추 */}
                <div className="bw-col-top">
                  <h2>
                    {open.name}의 칸
                    {open.studentId && <em>{open.studentId}</em>}
                  </h2>
                  {open.group && <span className="book-group-class">{open.group.groupName}</span>}
                  {open.group && cast.canCast && (
                    <button
                      type="button"
                      className={`btn-ghost dash-cast-btn bw-cast-btn${openLive ? " on" : ""}`}
                      onClick={() => castStudent(open)}
                      title={
                        openLive
                          ? "지금 띄우는 중 — 눌러서 수업 화면 창을 엽니다(끝내기는 그 창의 수업 종료)"
                          : "이 학생의 칸을 학급 전체 화면에 띄웁니다"
                      }
                    >
                      {openLive && <span className="broadcast-live-dot" aria-hidden="true" />}
                      {openLive ? "수업 화면 보기" : "수업 시작"}
                    </button>
                  )}
                </div>
                {!open.group ? (
                  <p className="empty-note">이 학생은 아직 모둠에 들지 않아 칸이 없어요.</p>
                ) : (
                  <section className="bw-col bw-col--read" aria-label={`${open.name}의 칸`}>
                    <ol className="bw-rows">
                      {openRows.map((r, i) => (
                        <li key={r.member.uid} className={`bw-row${r.filled ? " filled" : ""}`}>
                          <span className="bw-row-who">
                            <b>{i + 1}</b>
                            {r.member.name}
                            {i === 0 && <em>주인</em>}
                          </span>
                          <p className={`bw-row-text${r.filled ? "" : " empty"}`}>
                            {r.filled ? r.note.text : "아직 쓰지 않았어요"}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
              </div>
            ) : (
              <p className="empty-note">왼쪽 모둠 카드에서 학생 이름을 누르면 그 학생의 칸이 보여요.</p>
            )}
          </div>

          {/* 오른쪽은 왼쪽에서 고른 모둠의 학생만 — 반 전체는 전광판이 봅니다(선생님 요청). */}
          <EntryProgressPanel
            title={open?.group ? `${open.group.groupName} 진행` : "모둠 진행"}
            cards={open?.group ? cards.filter((c) => c.group?.id === open.group.id) : []}
            emptyText="왼쪽 모둠 카드에서 학생 이름을 누르면 그 모둠의 진행이 보여요. 반 전체는 전광판에서 봐요."

            rows={[]}
            rowsOf={(c) =>
              c.slots.map((p) => ({
                key: `k${p.k}`,
                k: p.k,
                label: p.k === 0 ? "제 칸 · 첫 줄" : `${p.owner.name}의 칸 · ${p.k + 1}번째 줄`,
              }))
            }
            cellState={(row, _a, c) => {
              const p = c.slots[row.k];
              return p?.done ? "done" : p?.ready ? "doing" : "empty";
            }}
            pickedUid={openUid}
            onPick={setOpenUid}
            extra={(m) => ` · ${writerChars(m.uid, allNotes)}자`}
          />
        </div>
      )}

      {stageOpen && cast.target && castCard && livePayload && (
        <CastStageModal
          payload={livePayload}
          student={castCard}
          studentIndex={castAt}
          studentTotal={castList.length}
          prevStudent={prevStudent}
          nextStudent={nextStudent}
          onStudent={(card) => card && castStudent(card)}
          classId={classId}
          user={user}
          onStop={stopCast}
          onClose={() => setStageOpen(false)}
          stepTo="칸으로"
          hint="모둠 카드 차례로 학생의 칸을 넘깁니다 · 키보드 ← →"
        />
      )}

      {boardOpen && (
        <BrainWriteProgressBoard
          activity={activity}
          cards={cards.filter((c) => c.group)}
          onOpenStudent={(uid) => { setOpenUid(uid); setBoardOpen(false); }}
          onClose={() => setBoardOpen(false)}
        />
      )}

      {composing && (
        <GroupComposer
          board={{ id: activity.id, title: activity.title }}
          roster={roster}
          cards={groups.map((g) => ({
            groupId: g.id,
            groupIndex: g.groupIndex,
            title: g.groupName,
            groupName: g.groupName,
            members: g.members ?? [],
            leaderUid: g.leaderUid,
            retired: g.retired,
          }))}
          onCompose={composeBookGroups}
          keepEmpty
          baseGroups={baseGroupAssignment?.groups ?? []}
          groupSetName={activity.groupSetName || `${activity.title || "브레인 라이팅"} 활동 모둠`}
          onClose={() => setComposing(false)}
          onSaved={() => onToast?.("모둠을 구성했어요.")}
        />
      )}
    </main>
  );
}
