"use client";

// =============================================================
// 물음표로 책 읽기 — 교사 화면 (개인 활동)
// -------------------------------------------------------------
// 곁텍스트 · RAFT · KWLS와 **같은 뼈대**입니다(BookStudentRail · 가운데 그
// 학생의 답 — CSS도 그대로). 오른쪽 '학생별 진행'은 모둠 활동에만 서므로
// 개인 활동인 여기는 두 칸입니다.
//
// 가운데 칸은 '나의 물음표'(궁금증 · 이유) 한 장이 위에 넓게, 다섯 물음이
// 그 아래 격자로 섭니다. **고르지 않은 물음은 옅게**(점선) 둡니다 — 빈 칸으로
// 그리면 '안 했다'로 읽히는데, 이 활동은 두 개 이상만 고르는 것이라 안 고른
// 것은 덜 한 것이 아닙니다.
//
// 칸마다 '수업 시작'으로 학급 화면에 띄우고, 수업 화면 창(CastStageModal)이
// 함께 열려 **같은 칸을 학생별로** 넘깁니다. 영역은 여섯으로 못 박습니다
// (물음표 한 장 + 다섯 물음) — 학생마다 고른 물음이 달라도 '다음 학생 →'이
// 같은 자리를 짚어야 하므로, 안 고른 물음이면 그 사실을 적어 띄웁니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeParatextEntries } from "@/lib/store";
import { useEntryCast } from "@/lib/useEntryCast";
import {
  QMARK_MIN_PICKS,
  QMARK_REGIONS,
  normalizeQmarkAnswers,
  qmarkAnsweredPicks,
  qmarkCellState,
  qmarkChars,
  qmarkDone,
  qmarkQuestionDone,
  qmarkRegionFields,
  qmarkRows,
  qmarkStarted,
} from "@/lib/qmark";
import { safeBookUrl } from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";
import QmarkProgressBoard from "./QmarkProgressBoard";
import BookStudentRail from "./BookStudentRail";
import CastStageModal from "./CastStageModal";

const REGIONS = QMARK_REGIONS;
const REGION_COUNT = REGIONS.length; // 6

export default function QmarkBoard({
  activity,
  className = "",
  classId = null,
  user = null,
  roster = [],
  onBack,
  classTools = null,
  classPicker = null,
}) {
  const [entries, setEntries] = useState([]);
  const [openUid, setOpenUid] = useState(null);
  const [stageOpen, setStageOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);

  useEffect(() => subscribeParatextEntries(activity.id, setEntries), [activity.id]);

  const bookUrl = safeBookUrl(activity.bookUrl);
  const cast = useEntryCast(classId, user);

  const cards = useMemo(() => {
    const byUid = new Map(entries.map((e) => [e.authorId, e]));
    const fromRoster = roster.map((s) => ({
      uid: s.uid,
      name: s.name,
      studentId: s.studentId,
      emoji: s.emoji,
      entry: byUid.get(s.uid) ?? null,
    }));
    const seen = new Set(roster.map((s) => s.uid));
    const strays = entries
      .filter((e) => !seen.has(e.authorId))
      .map((e) => ({ uid: e.authorId, name: e.authorName || "이름 미설정", studentId: null, entry: e }));
    return [...fromRoster, ...strays];
  }, [roster, entries]);

  const startedCount = cards.filter((c) => qmarkStarted(c.entry?.answers)).length;
  const askedCount = cards.filter((c) => qmarkQuestionDone(c.entry?.answers)).length;
  const doneCount = cards.filter((c) => qmarkDone(c.entry?.answers)).length;

  const open = openUid ? cards.find((c) => c.uid === openUid) ?? null : null;
  const stepRows = useMemo(() => qmarkRows(), []);

  const castCard = cast.target ? cards.find((c) => c.uid === cast.target.uid) ?? null : null;
  const castIndex = cast.target ? REGIONS.findIndex((r) => r.key === cast.target.key) : -1;

  const livePayload = useMemo(() => {
    if (!castCard || castIndex < 0) return null;
    return buildPayload(activity, castCard, castIndex);
  }, [castCard, castIndex, activity]);
  cast.useLiveUpdate(livePayload);

  function castRegion(card, index, openStage = true) {
    // 지금 띄우는 것을 다시 누르면 수업 화면 창을 엽니다(끄지 않습니다) —
    // 끄는 길은 그 창의 '수업 종료'와, 창을 닫았을 때 상단바의 '방송 종료'.
    if (cast.isCasting(card.uid, REGIONS[index].key)) {
      setStageOpen(true);
      return;
    }
    cast.cast({ uid: card.uid, key: REGIONS[index].key }, buildPayload(activity, card, index));
    // 영역만 옮길 때는 창 상태를 안 건드립니다(닫아 둔 창이 되살아나지 않게)
    setStageOpen(openStage);
    setOpenUid(card.uid);
  }

  function stopCast() {
    cast.stop();
    setStageOpen(false);
  }

  const castAt = cast.target ? cards.findIndex((c) => c.uid === cast.target.uid) : -1;
  const prevStudent = castAt > 0 ? cards[castAt - 1] : null;
  const nextStudent = castAt >= 0 && castAt < cards.length - 1 ? cards[castAt + 1] : null;

  function goStudent(card) {
    if (!card || castIndex < 0) return;
    castRegion(card, castIndex);
  }

  function step(delta) {
    if (castIndex < 0 || !castCard) return;
    const next = castIndex + delta;
    if (next < 0 || next >= REGION_COUNT) return;
    castRegion(castCard, next, stageOpen);
  }

  const openAnswers = normalizeQmarkAnswers(open?.entry?.answers);

  const boardBtn = cards.length > 0 && (
    <button
      type="button"
      className="group-filter-act"
      onClick={() => setBoardOpen(true)}
      title="궁금증 · 이유 · 나의 생각 × 반 전체를 한 격자로 봅니다"
    >
      전광판
    </button>
  );

  function castBtn(i, live) {
    if (!cast.canCast) return null;
    return (
      <button
        type="button"
        className={`btn-ghost dash-cast-btn${live ? " on" : ""}`}
        onClick={() => castRegion(open, i)}
        title={
          live
            ? "지금 띄우는 중 — 눌러서 수업 화면 창을 엽니다(끝내기는 그 창의 수업 종료)"
            : "이 칸을 학급 전체 화면에 띄웁니다"
        }
      >
        {live && <span className="broadcast-live-dot" aria-hidden="true" />}
        {live ? "수업 화면 보기" : "수업 시작"}
      </button>
    );
  }

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
            <span className={`book-group-topic${(activity.topic ?? "").trim() ? "" : " soft"}`}>
              {(activity.topic ?? "").trim() || "학생마다 다른 주제"}
            </span>
            {classPicker ?? (className && <span className="book-group-class">{className}</span>)}
            <span className="paratext-sum">
              시작 {startedCount}명 · 물음표 {askedCount}명 · 완성 {doneCount}명 /
              {" "}전체 {cards.length}명
            </span>
            {boardBtn}
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

      {cards.length === 0 ? (
        <p className="empty-note">
          아직 이 반에 들어온 학생이 없어요. 학생이 반에 들어오면 카드가 생깁니다.
        </p>
      ) : (
        <div className="book-workspace">
          <BookStudentRail
            cards={cards}
            pickedUid={openUid}
            onPick={setOpenUid}
            rows={stepRows}
            cellState={qmarkCellState}
            castUid={cast.target?.uid ?? null}
            meta={(c) =>
              !qmarkStarted(c.entry?.answers)
                ? "아직 시작 전"
                : `나의 생각 ${qmarkAnsweredPicks(c.entry?.answers).length} / ${QMARK_MIN_PICKS} · 글 ${qmarkChars(c.entry?.answers)}자`
            }
          />

          <div className="book-workspace-center">
            {open ? (
              <>
                <div className="entry-detail-head">
                  <h2>
                    {open.name}
                    {open.studentId && <em>{open.studentId}</em>}
                  </h2>
                  {!(activity.topic ?? "").trim() && open.entry?.topic && (
                    <span className="book-group-topic">{open.entry.topic}</span>
                  )}
                  <span className="book-group-class">
                    나의 생각 {qmarkAnsweredPicks(openAnswers).length} / {QMARK_MIN_PICKS} ·
                    {" "}글 {qmarkChars(openAnswers)}자
                  </span>
                </div>

                <div className="entry-detail-grid qmark-detail-grid">
                  {REGIONS.map((r, i) => {
                    const live = cast.isCasting(open.uid, r.key);
                    const isAsk = r.key === "question";
                    const picked = isAsk || openAnswers.picks.includes(r.key);
                    const done = isAsk
                      ? qmarkQuestionDone(openAnswers)
                      : picked && openAnswers[r.key].trim().length > 0;
                    return (
                      <section
                        key={r.key}
                        className={`entry-region${isAsk ? " wide" : ""}${done ? " done" : ""}${
                          picked ? "" : " skipped"
                        }${live ? " live" : ""}`}
                      >
                        <header className="paratext-card-head">
                          <span className="paratext-letter" aria-hidden="true">{r.letter}</span>
                          <span className="paratext-card-title">
                            <strong>{isAsk ? r.ko : r.prompt}</strong>
                            {!isAsk && !picked && <em>고르지 않음</em>}
                          </span>
                          {castBtn(i, live)}
                        </header>
                        <div className="entry-region-body">
                          {isAsk ? (
                            qmarkRegionFields(openAnswers, "question").map((f) => (
                              <div key={f.label} className="paratext-read-field">
                                <span className="paratext-read-label">{f.label}</span>
                                <p className={`paratext-read-text${f.text ? "" : " empty"}`}>
                                  {f.text || "아직 쓰지 않았어요"}
                                </p>
                              </div>
                            ))
                          ) : picked ? (
                            <p className={`paratext-read-text${openAnswers[r.key].trim() ? "" : " empty"}`}>
                              {openAnswers[r.key].trim() || "골랐지만 아직 쓰지 않았어요"}
                            </p>
                          ) : null}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="empty-note">왼쪽에서 학생을 골라 주세요.</p>
            )}
          </div>

          {/* 오른쪽 '학생별 진행'은 두지 않습니다 — 모둠이 없는 활동이라 왼쪽
              목록이 곧 반 전체이고, 같은 조각 바가 왼쪽 카드에 있습니다. */}
        </div>
      )}

      {stageOpen && cast.target && castCard && castIndex >= 0 && (
        <CastStageModal
          payload={livePayload}
          student={castCard}
          studentIndex={castAt}
          studentTotal={cards.length}
          prevStudent={prevStudent}
          nextStudent={nextStudent}
          onStudent={goStudent}
          onPrevSection={castIndex > 0 ? () => step(-1) : null}
          onNextSection={castIndex < REGION_COUNT - 1 ? () => step(1) : null}
          classId={classId}
          user={user}
          onStop={stopCast}
          onClose={() => setStageOpen(false)}
        />
      )}

      {boardOpen && (
        <QmarkProgressBoard
          activity={activity}
          cards={cards}
          onOpenStudent={(uid) => { setOpenUid(uid); setBoardOpen(false); }}
          onClose={() => setBoardOpen(false)}
        />
      )}
    </main>
  );
}

// 한 칸을 방송 꾸러미로(곁텍스트 · RAFT · KWLS와 같은 'entry' 모양).
// 다섯 물음 칸에는 그 학생의 물음을 함께 실어 — '무엇에 대한 생각인가'가
// 칠판에 있어야 합니다(RAFT가 문장을 함께 싣는 자리 `note`).
function buildPayload(activity, card, index) {
  const r = REGIONS[index];
  const answers = normalizeQmarkAnswers(card.entry?.answers);
  const question = answers.question.trim();
  return {
    mode: "entry",
    activityTitle: activity.title ?? "",
    topic: activity.topic ?? "",
    writerName: card.name,
    letter: r.letter,
    label: r.ko,
    labelEn: r.en,
    prompt: r.prompt,
    note: r.key !== "question" && question ? `나의 물음 — “${question}”` : "",
    index,
    total: REGION_COUNT,
    fields: qmarkRegionFields(answers, r.key),
  };
}
