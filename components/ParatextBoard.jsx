"use client";

// =============================================================
// 곁텍스트 읽기 — 교사 화면 (개인 활동)
// -------------------------------------------------------------
// 두 단계입니다.
//   1) 학생 목록 — 반 명단대로 한 명당 카드 한 장. 어디까지 썼는지 보입니다.
//   2) 학생 상세 — 카드를 누르면 그 학생의 여덟 영역이 한 화면에 모두 펼쳐집니다
//      (모달이 아니라 화면 전체를 씁니다).
//
// 각 영역에는 '수업 시작' 버튼이 있어, 그 영역만 학급 전체 화면에 띄웁니다.
// 방송 중에 다른 영역의 버튼을 누르면 끄지 않아도 그리로 곧바로 전환됩니다
// (방송 문서가 반마다 하나라 덮어쓰면 학생 화면이 그대로 바뀝니다).
// 위쪽 방송 막대에서 이전/다음 영역으로 넘기거나 방송을 끝낼 수 있습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeParatextEntries, updateBookActivity } from "@/lib/store";
import { useEntryCast } from "@/lib/useEntryCast";
import {
  PARATEXT_SECTIONS,
  PARATEXT_SECTION_COUNT,
  isSectionDone,
  isSectionStarted,
  isSectionLocked,
  openSectionCount,
  sectionLocksWith,
  sectionLocksUpTo,
  firstLockedIndex,
  paratextDoneCount,
  paratextCharCount,
  safeBookUrl,
} from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";
import CastBar from "./CastBar";

export default function ParatextBoard({
  activity,
  className = "",
  classId = null,
  user = null,
  roster = [],
  onBack,
  // 누가기록 관리·수업 메모 버튼 묶음 (교사 전용, 없으면 null)
  classTools = null,
}) {
  const [entries, setEntries] = useState([]);
  const [openUid, setOpenUid] = useState(null);

  useEffect(() => subscribeParatextEntries(activity.id, setEntries), [activity.id]);

  const bookUrl = safeBookUrl(activity.bookUrl);
  const cast = useEntryCast(classId, user);

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

  const startedCount = cards.filter((c) => paratextCharCount(c.entry?.answers) > 0).length;
  const doneCount = cards.filter(
    (c) => paratextDoneCount(c.entry?.answers) === PARATEXT_SECTION_COUNT
  ).length;

  const open = openUid ? cards.find((c) => c.uid === openUid) ?? null : null;

  // 방송 중인 영역의 내용 — 학생이 고치면 방송도 따라 바뀌게 다시 보냅니다.
  const castCard = cast.target ? cards.find((c) => c.uid === cast.target.uid) ?? null : null;
  const livePayload = useMemo(() => {
    if (!castCard || !cast.target) return null;
    const at = PARATEXT_SECTIONS.findIndex((s) => s.key === cast.target.key);
    if (at < 0) return null;
    return buildPayload(activity, castCard, at);
  }, [castCard, cast.target, activity]);
  cast.useLiveUpdate(livePayload);

  function castSection(card, index) {
    const s = PARATEXT_SECTIONS[index];
    cast.cast({ uid: card.uid, key: s.key }, buildPayload(activity, card, index));
  }

  // 방송 막대의 이전/다음 — 같은 학생 안에서 영역만 옮깁니다.
  function step(delta) {
    if (!cast.target || !castCard) return;
    const at = PARATEXT_SECTIONS.findIndex((s) => s.key === cast.target.key);
    const next = at + delta;
    if (next < 0 || next >= PARATEXT_SECTION_COUNT) return;
    castSection(castCard, next);
  }

  const castIndex = cast.target
    ? PARATEXT_SECTIONS.findIndex((s) => s.key === cast.target.key)
    : -1;

  return (
    <main className="books-main">
      <div className="books-head">
        {/* 제목 · 돌아가는 길 · 도구 순서 — 닿소리 머리말(BookGroupBoard)과
            같은 차례입니다. 화면을 한 단계 되돌리는 버튼은 '무엇을 읽는
            활동인가'를 알려 주는 배지와 성격이 달라, 도구들과 함께 첫 줄에
            둡니다(둘째 줄에 두면 그 줄에서만 작게 그려집니다). */}
        <div className="books-head-title">
          <h1 className="book-group-title">{open ? open.name : activity.title}</h1>
          {open ? (
            <button type="button" className="btn-ghost" onClick={() => setOpenUid(null)}>
              ← 학생 목록
            </button>
          ) : (
            <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
          )}
          {classTools}
        </div>
        <div className="books-head-row">
          <div className="books-head-main">
            {open ? (
              <>
                {open.studentId && (
                  <span className="book-group-class">{open.studentId}</span>
                )}
                {/* 활동에 주제어가 없으면 학생이 적은 책이름을 씁니다 */}
                {!(activity.topic ?? "").trim() && open.entry?.topic && (
                  <span className="book-group-topic">{open.entry.topic}</span>
                )}
                <span className="book-group-class">
                  {paratextDoneCount(open.entry?.answers)} / {PARATEXT_SECTION_COUNT}칸
                </span>
              </>
            ) : (
              <>
                {/* 주제어를 비워 두면 학생마다 제 책을 적습니다 —
                    빈 배지를 두는 대신 그 사실을 적어 둡니다 */}
                <span className={`book-group-topic${(activity.topic ?? "").trim() ? "" : " soft"}`}>
                  {(activity.topic ?? "").trim() || "학생마다 다른 책"}
                </span>
                {className && <span className="book-group-class">{className}</span>}
              </>
            )}
            {/* 잠김 안내도 이 줄에 — 예전엔 머리말 아래 제 줄을 차지했는데,
                이 줄은 배지 두어 개뿐이라 오른쪽이 비어 있었습니다.
                '지금 잠겨 있다'는 활동에 붙는 상태라 배지와 같은 성격입니다. */}
            {activity.locked && !open && (
              <span className="book-locked-note book-locked-chip">
                <IconLock size={14} /> 지금은 잠겨 있어 학생이 고칠 수 없어요.
              </span>
            )}
          </div>
          {/* 방송 막대는 배지와 같은 줄에 — 무엇을 방송 중인지 늘 보이게
              하되(학생 목록으로 나가도 남습니다), 배지 몇 개뿐인 줄 아래에
              또 한 줄을 깔면 본문이 그만큼 밀립니다. 남는 폭을 채우며
              오른쪽에 붙고, 좁아지면 알아서 아랫줄로 내려갑니다. */}
          {cast.target && castCard && castIndex >= 0 && (
            <CastBar
              who={castCard.name}
              label={PARATEXT_SECTIONS[castIndex].ko}
              index={castIndex}
              total={PARATEXT_SECTION_COUNT}
              onPrev={castIndex > 0 ? () => step(-1) : null}
              onNext={castIndex < PARATEXT_SECTION_COUNT - 1 ? () => step(1) : null}
              onStop={cast.stop}
            />
          )}
          {bookUrl && !open && (
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
        {!open && (
          <span className="paratext-sum">
            시작 {startedCount}명 · 완성 {doneCount}명 / 전체 {cards.length}명
          </span>
        )}
        {/* 단계 열기 — 공부방 프로젝트의 활동 잠금과 같은 생각입니다.
            여덟 칩이 학생이 보는 여덟 카드와 1:1이라, '지금 어디까지 열렸나'가
            한눈에 들어옵니다. 수업 중 실제로 하는 동작(다음 열기)은 버튼 하나로. */}
        {!open && <SectionGate activity={activity} />}
      </div>

      {open ? (
        /* ── 학생 상세 — 여덟 영역을 한 화면에 ── */
        <div className="entry-detail-grid">
          {PARATEXT_SECTIONS.map((s, i) => {
            const answers = open.entry?.answers ?? {};
            const live = cast.isCasting(open.uid, s.key);
            return (
              <section
                key={s.key}
                className={`entry-region${isSectionDone(s, answers) ? " done" : ""}${live ? " live" : ""}`}
              >
                <header className="paratext-card-head">
                  <span className="paratext-letter" aria-hidden="true">{s.letter}</span>
                  <span className="paratext-card-title">
                    <strong>{s.ko}</strong>
                    <em>{s.en}</em>
                  </span>
                  {cast.canCast && (
                    <button
                      type="button"
                      className={`btn-ghost dash-cast-btn${live ? " on" : ""}`}
                      onClick={() => castSection(open, i)}
                      title={
                        live
                          ? "학생 화면을 원래대로 되돌립니다"
                          : "이 영역을 학급 전체 화면에 띄웁니다"
                      }
                    >
                      {live && <span className="broadcast-live-dot" aria-hidden="true" />}
                      {live ? "수업 종료" : "수업 시작"}
                    </button>
                  )}
                </header>
                <p className="paratext-prompt">{s.prompt}</p>
                <div className="entry-region-body">
                  {s.fields.map((f) => {
                    const text = String(answers[f.key] ?? "").trim();
                    return (
                      <div key={f.key} className="paratext-read-field">
                        {f.label && <span className="paratext-read-label">{f.label}</span>}
                        <p className={`paratext-read-text${text ? "" : " empty"}`}>
                          {text || "아직 쓰지 않았어요"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : cards.length === 0 ? (
        <p className="empty-note">
          아직 이 반에 들어온 학생이 없어요. 학생이 반에 들어오면 카드가 생깁니다.
        </p>
      ) : (
        <div className="paratext-card-grid">
          {cards.map((c) => (
            <StudentCard
              key={c.uid}
              card={c}
              casting={cast.target?.uid === c.uid}
              onOpen={() => setOpenUid(c.uid)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

// 한 영역을 방송 꾸러미로 — 학생 화면은 이 내용만 보고 그립니다.
function buildPayload(activity, card, index) {
  const s = PARATEXT_SECTIONS[index];
  const answers = card.entry?.answers ?? {};
  return {
    mode: "entry",
    activityTitle: activity.title ?? "",
    topic: activity.topic ?? "",
    writerName: card.name,
    letter: s.letter,
    label: s.ko,
    labelEn: s.en,
    prompt: s.prompt,
    index,
    total: PARATEXT_SECTION_COUNT,
    fields: s.fields.map((f) => ({
      label: f.label ?? "",
      text: String(answers[f.key] ?? "").trim(),
    })),
  };
}

// 학생 한 명의 카드 — 이름 + 항목별 네모 + 채운 칸 수
// 단계 열기 (교사) — 여덟 칩 + '다음 단계 열기'
// -------------------------------------------------------------
// 활동 문서 하나(sectionLocks)만 고칩니다. 이 화면도 학생 화면도 그 문서를
// 이미 구독하고 있어서 읽기가 1건도 늘지 않고, 어느 화면에서 눌러도 같은
// 상태를 봅니다(공부방의 activityLocks와 같은 방식).
function SectionGate({ activity }) {
  const openCount = openSectionCount(activity);
  const nextLocked = firstLockedIndex(activity);
  const allOpen = openCount === PARATEXT_SECTION_COUNT;

  function setLocks(locks) {
    return updateBookActivity(activity.id, { sectionLocks: locks });
  }

  return (
    <div className="section-gate">
      <span className="section-gate-label">
        단계 열기 <b>{openCount} / {PARATEXT_SECTION_COUNT}</b>
      </span>
      <div className="section-gate-chips">
        {PARATEXT_SECTIONS.map((s, i) => {
          const locked = isSectionLocked(activity, s.key);
          return (
            <button
              key={s.key}
              type="button"
              className={`section-gate-chip${locked ? "" : " open"}`}
              onClick={() => setLocks(sectionLocksWith(activity, s.key, !locked))}
              title={`${i + 1}. ${s.ko} — ${locked ? "눌러서 열기" : "눌러서 닫기"}`}
              aria-pressed={!locked}
            >
              <span className="section-gate-letter">{s.letter}</span>
              <span className="section-gate-ko">{s.ko}</span>
            </button>
          );
        })}
      </div>
      {/* 수업 중 가장 잦은 동작 — 앞에서부터 아직 안 연 첫 단계를 엽니다.
          교사가 건너뛰며 열었어도 빠진 자리를 먼저 채웁니다. */}
      <button
        type="button"
        className="btn-primary section-gate-next"
        onClick={() => setLocks(sectionLocksUpTo(nextLocked + 1))}
        disabled={allOpen}
      >
        {allOpen ? "모두 열림" : `다음 단계 열기 (${PARATEXT_SECTIONS[nextLocked].ko})`}
      </button>
      <button
        type="button"
        className="btn-ghost section-gate-all"
        onClick={() => setLocks(sectionLocksUpTo(allOpen ? 1 : PARATEXT_SECTION_COUNT))}
      >
        {allOpen ? "1단계만 남기기" : "모두 열기"}
      </button>
    </div>
  );
}


function StudentCard({ card, casting, onOpen }) {
  const answers = card.entry?.answers ?? {};
  const done = paratextDoneCount(answers);
  const chars = paratextCharCount(answers);
  const state = done === PARATEXT_SECTION_COUNT ? "done" : chars > 0 ? "doing" : "none";

  return (
    <button
      type="button"
      className={`paratext-student-card ${state}${casting ? " casting" : ""}`}
      onClick={onOpen}
      aria-label={`${card.name} 학생의 곁텍스트 읽기 열기`}
    >
      <span className="paratext-student-head">
        <strong>{card.name}</strong>
        {card.studentId && <span className="paratext-student-no">{card.studentId}</span>}
        {casting && <span className="broadcast-live-dot" aria-hidden="true" />}
      </span>
      {/* 학생이 스스로 적은 도서명 — 활동에 주제어가 없을 때만 생깁니다.
          저마다 다른 책을 읽는 활동이라 누가 무엇을 읽는지가 여기서 보여야
          합니다. 이미 받아 온 기록에 들어 있어 읽기가 늘지 않습니다. */}
      {card.entry?.topic && (
        <span className="paratext-student-topic">{card.entry.topic}</span>
      )}

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
