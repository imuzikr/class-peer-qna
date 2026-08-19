"use client";

// =============================================================
// 곁텍스트 읽기 — 교사 화면 (개인 활동)
// -------------------------------------------------------------
// 모둠이 없는 개인 활동이라, 반 명단대로 학생 한 명당 카드 한 장을 깝니다.
// 카드에는 어디까지 썼는지(항목별 네모 + 채운 칸 수)가 보이고,
// 카드를 누르면 그 학생이 쓴 내용을 모달로 펼쳐 봅니다.
//
// 아직 한 글자도 쓰지 않은 학생도 카드가 보입니다 — 누가 시작조차
// 안 했는지가 교사에게 가장 필요한 정보라서, 기록이 있는 학생만
// 보여 주지 않습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeParatextEntries } from "@/lib/store";
import { backdropClose } from "@/lib/modal";
import {
  PARATEXT_SECTIONS,
  PARATEXT_SECTION_COUNT,
  isSectionDone,
  isSectionStarted,
  paratextDoneCount,
  paratextCharCount,
  safeBookUrl,
} from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";

export default function ParatextBoard({
  activity,
  className = "",
  roster = [],
  onBack,
}) {
  const [entries, setEntries] = useState([]);
  const [openUid, setOpenUid] = useState(null);

  useEffect(() => subscribeParatextEntries(activity.id, setEntries), [activity.id]);

  const bookUrl = safeBookUrl(activity.bookUrl);

  // 명단이 있으면 명단 순서대로, 없으면(명부를 아직 못 읽었으면) 제출한 학생만.
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

  const startedCount = cards.filter(
    (c) => paratextCharCount(c.entry?.answers) > 0
  ).length;
  const doneCount = cards.filter(
    (c) => paratextDoneCount(c.entry?.answers) === PARATEXT_SECTION_COUNT
  ).length;

  const open = openUid ? cards.find((c) => c.uid === openUid) ?? null : null;

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
            <StudentCard key={c.uid} card={c} onOpen={() => setOpenUid(c.uid)} />
          ))}
        </div>
      )}

      {open && <EntryModal card={open} onClose={() => setOpenUid(null)} />}
    </main>
  );
}

// 학생 한 명의 카드 — 이름 + 항목별 네모 + 채운 칸 수
function StudentCard({ card, onOpen }) {
  const answers = card.entry?.answers ?? {};
  const done = paratextDoneCount(answers);
  const chars = paratextCharCount(answers);
  const state = done === PARATEXT_SECTION_COUNT ? "done" : chars > 0 ? "doing" : "none";

  return (
    <button
      type="button"
      className={`paratext-student-card ${state}`}
      onClick={onOpen}
      aria-label={`${card.name} 학생의 곁텍스트 읽기 열기`}
    >
      <span className="paratext-student-head">
        <strong>{card.name}</strong>
        {card.studentId && <span className="paratext-student-no">{card.studentId}</span>}
      </span>

      <span className="paratext-marks">
        {PARATEXT_SECTIONS.map((s) => {
          const cls = isSectionDone(s, answers)
            ? "done"
            : isSectionStarted(s, answers)
              ? "doing"
              : "empty";
          return (
            <i
              key={s.key}
              className={`paratext-mark ${cls}`}
              title={`${s.letter} · ${s.ko}`}
            />
          );
        })}
      </span>

      <span className="paratext-student-meta">
        {chars === 0 ? "아직 시작 전" : `${done} / ${PARATEXT_SECTION_COUNT}칸 · ${chars}자`}
      </span>
    </button>
  );
}

// 카드를 누르면 열리는 모달 — 그 학생이 쓴 내용을 그대로 읽습니다(교사는 보기만).
function EntryModal({ card, onClose }) {
  const answers = card.entry?.answers ?? {};
  const done = paratextDoneCount(answers);

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal paratext-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>
            {card.name}
            {card.studentId && <span className="paratext-student-no">{card.studentId}</span>}
            <span className="paratext-modal-sum">{done} / {PARATEXT_SECTION_COUNT}칸</span>
          </h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="paratext-modal-body">
          {PARATEXT_SECTIONS.map((s) => (
            <section key={s.key} className="paratext-read">
              <header className="paratext-card-head">
                <span className="paratext-letter" aria-hidden="true">{s.letter}</span>
                <span className="paratext-card-title">
                  <strong>{s.ko}</strong>
                  <em>{s.en}</em>
                </span>
              </header>
              {s.fields.map((f) => {
                const text = String(answers[f.key] ?? "").trim();
                return (
                  <div key={f.key} className="paratext-read-field">
                    {f.label && <span className="paratext-read-label">{f.label}</span>}
                    {text ? (
                      <p className="paratext-read-text">{text}</p>
                    ) : (
                      <p className="paratext-read-text empty">아직 쓰지 않았어요</p>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
