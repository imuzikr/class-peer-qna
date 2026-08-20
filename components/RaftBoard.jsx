"use client";

// =============================================================
// RAFT 글쓰기 — 교사 화면 (개인 활동)
// -------------------------------------------------------------
// 반 명단대로 학생 한 명당 카드 한 장. 카드에는 네 요소를 몇 개 정했는지와
// 쓴 글자 수가 보이고, 누르면 그 학생의 글을 모달로 펼쳐 봅니다.
//
// 모달에는 '수업 시작' 버튼이 있어, 지금 보고 있는 학생의 글을 학급 전체
// 화면에 그대로 띄울 수 있습니다(발표·모범글 공유). 학생은 보안 규칙상 남의
// 기록을 직접 못 읽으므로, 닿소리 집계 중계와 같은 방식으로 방송 문서에
// 내용을 실어 보냅니다 — 교사가 켜야만 보이고, 끄면 곧바로 사라집니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeParatextEntries, startBroadcast, stopBroadcast } from "@/lib/store";
import { backdropClose } from "@/lib/modal";
import {
  RAFT_COLUMNS,
  RAFT_COLUMN_COUNT,
  RAFT_WRITING,
  raftPlanCount,
  raftSentence,
  raftStarted,
  raftWritingChars,
  raftDone,
} from "@/lib/raft";
import { safeBookUrl } from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";

export default function RaftBoard({
  activity,
  className = "",
  classId = null,
  user = null,
  roster = [],
  onBack,
}) {
  const [entries, setEntries] = useState([]);
  const [openUid, setOpenUid] = useState(null);
  const [castingUid, setCastingUid] = useState(null); // 지금 방송 중인 학생

  useEffect(() => subscribeParatextEntries(activity.id, setEntries), [activity.id]);

  const bookUrl = safeBookUrl(activity.bookUrl);
  const canCast = !!(classId && user);

  // 명단이 있으면 명단 순서대로, 없으면(명부를 아직 못 읽었으면) 쓴 학생만.
  const cards = useMemo(() => {
    const byUid = new Map(entries.map((e) => [e.authorId, e]));
    const fromRoster = roster.map((s) => ({
      uid: s.uid,
      name: s.name,
      studentId: s.studentId,
      entry: byUid.get(s.uid) ?? null,
    }));
    const seen = new Set(roster.map((s) => s.uid));
    const strays = entries
      .filter((e) => !seen.has(e.authorId))
      .map((e) => ({
        uid: e.authorId,
        name: e.authorName || "이름 미설정",
        studentId: null,
        entry: e,
      }));
    return [...fromRoster, ...strays];
  }, [roster, entries]);

  const startedCount = cards.filter((c) => raftStarted(c.entry?.answers)).length;
  const doneCount = cards.filter((c) => raftDone(c.entry?.answers)).length;

  const open = openUid ? cards.find((c) => c.uid === openUid) ?? null : null;

  // 방송 중인 학생이 글을 고치면 화면에도 따라 바뀌게 다시 보냅니다.
  // 타자 한 글자마다 쓰지 않도록 잠깐 모았다 보냅니다.
  const castCard = castingUid ? cards.find((c) => c.uid === castingUid) ?? null : null;
  const castPayload = useMemo(() => {
    if (!castCard) return null;
    const a = castCard.entry?.answers ?? {};
    return {
      mode: "raft",
      activityTitle: activity.title ?? "",
      topic: activity.topic ?? "",
      writerName: castCard.name,
      sentence: raftSentence(a),
      columns: RAFT_COLUMNS.map((c) => ({
        letter: c.letter,
        ko: c.ko,
        en: c.en,
        text: String(a[c.key] ?? "").trim(),
      })),
      writing: String(a[RAFT_WRITING.key] ?? ""),
    };
  }, [castCard, activity.title, activity.topic]);

  const payloadKey = JSON.stringify(castPayload);
  useEffect(() => {
    if (!castingUid || !canCast || !castPayload) return;
    const t = setTimeout(() => {
      startBroadcast(user, classId, castPayload).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castingUid, canCast, payloadKey]);

  // 화면을 벗어나면 방송도 반드시 종료 — 학생 화면이 갇히지 않게
  useEffect(() => {
    if (!castingUid || !canCast) return;
    return () => { stopBroadcast(classId).catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castingUid, canCast, classId]);

  async function toggleCast(card) {
    if (!canCast) return;
    if (castingUid === card.uid) {
      setCastingUid(null);
      await stopBroadcast(classId).catch(() => {});
    } else {
      setCastingUid(card.uid);
      // payload는 위 useMemo가 만들지만, 켜는 순간 바로 한 번 보냅니다.
      const a = card.entry?.answers ?? {};
      await startBroadcast(user, classId, {
        mode: "raft",
        activityTitle: activity.title ?? "",
        topic: activity.topic ?? "",
        writerName: card.name,
        sentence: raftSentence(a),
        columns: RAFT_COLUMNS.map((c) => ({
          letter: c.letter,
          ko: c.ko,
          en: c.en,
          text: String(a[c.key] ?? "").trim(),
        })),
        writing: String(a[RAFT_WRITING.key] ?? ""),
      }).catch(() => {});
    }
  }

  return (
    <main className="books-main">
      <div className="books-head">
        <div className="books-head-main">
          <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
          <h1 className="book-group-title">
            {activity.title}
            <span className="book-group-topic">{activity.topic}</span>
            {className && <span className="book-group-class">{className}</span>}
          </h1>
          {bookUrl && (
            <a
              className="btn-primary book-info-btn"
              href={bookUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBook size={15} /> 도서 정보
            </a>
          )}
        </div>
        <span className="paratext-sum">
          시작 {startedCount}명 · 완성 {doneCount}명 / 전체 {cards.length}명
        </span>
      </div>

      {activity.locked && (
        <p className="book-locked-note">
          <IconLock size={15} /> 지금은 잠겨 있어 학생이 고칠 수 없어요.
        </p>
      )}

      {cards.length === 0 ? (
        <p className="empty-note">
          아직 이 반에 들어온 학생이 없어요. 학생이 반에 들어오면 카드가 생깁니다.
        </p>
      ) : (
        <div className="paratext-card-grid">
          {cards.map((c) => (
            <StudentCard
              key={c.uid}
              card={c}
              casting={castingUid === c.uid}
              onOpen={() => setOpenUid(c.uid)}
            />
          ))}
        </div>
      )}

      {open && (
        <EntryModal
          card={open}
          canCast={canCast}
          casting={castingUid === open.uid}
          onToggleCast={() => toggleCast(open)}
          onClose={() => setOpenUid(null)}
        />
      )}
    </main>
  );
}

// 학생 한 명의 카드 — 이름 + 네 요소 네모 + 글자 수
function StudentCard({ card, casting, onOpen }) {
  const answers = card.entry?.answers ?? {};
  const plan = raftPlanCount(answers);
  const chars = raftWritingChars(answers);
  const state = raftDone(answers) ? "done" : raftStarted(answers) ? "doing" : "none";

  return (
    <button
      type="button"
      className={`paratext-student-card ${state}${casting ? " casting" : ""}`}
      onClick={onOpen}
      aria-label={`${card.name} 학생의 RAFT 글 열기`}
    >
      <span className="paratext-student-head">
        <strong>{card.name}</strong>
        {card.studentId && <span className="paratext-student-no">{card.studentId}</span>}
        {casting && <span className="broadcast-live-dot" aria-hidden="true" />}
      </span>

      <span className="raft-marks">
        {RAFT_COLUMNS.map((c) => (
          <i
            key={c.key}
            className={`paratext-mark ${String(answers[c.key] ?? "").trim() ? "done" : "empty"}`}
            title={`${c.letter} · ${c.ko}`}
          />
        ))}
      </span>

      <span className="paratext-student-meta">
        {!raftStarted(answers)
          ? "아직 시작 전"
          : `${plan} / ${RAFT_COLUMN_COUNT}칸 · 글 ${chars}자`}
      </span>
    </button>
  );
}

// 카드를 누르면 열리는 모달 — 그 학생의 RAFT를 읽고, 학급 전체에 띄울 수 있습니다.
function EntryModal({ card, canCast, casting, onToggleCast, onClose }) {
  const answers = card.entry?.answers ?? {};
  const writing = String(answers[RAFT_WRITING.key] ?? "").trim();

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal raft-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>
            {card.name}
            {card.studentId && <span className="paratext-student-no">{card.studentId}</span>}
          </h3>
          <div className="raft-modal-actions">
            {canCast && (
              <button
                type="button"
                className={`btn-ghost dash-cast-btn${casting ? " on" : ""}`}
                onClick={onToggleCast}
                title={
                  casting
                    ? "학생 화면을 원래대로 되돌립니다"
                    : "이 글을 학급 전체 화면에 그대로 띄웁니다"
                }
              >
                {casting && <span className="broadcast-live-dot" aria-hidden="true" />}
                {casting ? "수업 종료" : "수업 시작"}
              </button>
            )}
            <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
          </div>
        </div>

        <p className="raft-sentence done">{raftSentence(answers)}</p>

        <div className="raft-modal-body">
          <div className="raft-read-cols">
            {RAFT_COLUMNS.map((c) => {
              const text = String(answers[c.key] ?? "").trim();
              return (
                <div key={c.key} className="raft-read-col">
                  <span className="raft-read-label">
                    <i className="paratext-letter" aria-hidden="true">{c.letter}</i>
                    {c.ko}
                  </span>
                  <p className={`paratext-read-text${text ? "" : " empty"}`}>
                    {text || "아직 정하지 않았어요"}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="raft-read-writing">
            <span className="raft-read-label">{RAFT_WRITING.ko}</span>
            {writing ? (
              <p className="paratext-read-text">{writing}</p>
            ) : (
              <p className="paratext-read-text empty">아직 쓰지 않았어요</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
