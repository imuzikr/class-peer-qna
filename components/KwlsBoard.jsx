"use client";

// =============================================================
// KWLS로 성찰하기 — 교사 화면 (개인 활동)
// -------------------------------------------------------------
// 곁텍스트 읽기·RAFT 글쓰기와 같은 흐름입니다.
//   1) 학생 목록 — 반 명단대로 한 명당 카드 한 장.
//   2) 학생 상세 — 네 칸(K·W·L·S)이 한 화면에 모두 펼쳐집니다(모달이 아닙니다).
//
// 각 칸의 '수업 시작'으로 그 칸만 학급 전체 화면에 띄웁니다. 방송 중에 다른
// 칸 버튼을 누르면 끄지 않아도 그리로 곧바로 전환됩니다.
//
// 학생 목록의 네모 넷은 K·W·L·S 순서 그대로라, 읽기 전 두 칸만 채우고 멈춘
// 학생과 읽은 뒤까지 마친 학생을 한눈에 가려낼 수 있습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeActivityKwl } from "@/lib/store";
import { useEntryCast } from "@/lib/useEntryCast";
import {
  KWLS_COLUMNS,
  KWLS_COLUMN_COUNT,
  kwlsChars,
  kwlsDone,
  kwlsFilledCount,
  kwlsPhaseDone,
  kwlsStarted,
  kwlsRows,
  kwlsCellState,
} from "@/lib/kwls";
import { safeBookUrl } from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";
import KwlsProgressBoard from "./KwlsProgressBoard";
import GroupFilterRow from "./GroupFilterRow";
import BookStudentRail from "./BookStudentRail";
import EntryProgressPanel from "./EntryProgressPanel";
import CastBar from "./CastBar";

// 방송할 수 있는 영역 — 네 칸 그대로
const REGIONS = KWLS_COLUMNS;
const REGION_COUNT = REGIONS.length; // 4

export default function KwlsBoard({
  activity,
  className = "",
  classId = null,
  user = null,
  roster = [],
  onBack,
  // 누가기록 관리·수업 메모 버튼 묶음 (교사 전용, 없으면 null)
  classTools = null,
  classPicker = null,
}) {
  const [entries, setEntries] = useState([]);
  const [openUid, setOpenUid] = useState(null);
  // 성찰중 전광판 — 네 칸 × 반 전체(곁텍스트·RAFT와 같은 격자)
  const [boardOpen, setBoardOpen] = useState(false);

  // 제출물을 kwl 스트림에서 읽습니다 — 공부방·책방 KWLS를 한 곳에서 보기
  // 위한 전환입니다(store.js의 subscribeActivityKwl 주석 참고). 반환 모양은
  // 예전 entries와 같게 맞춰 두어 아래 코드는 그대로입니다.
  useEffect(
    () => subscribeActivityKwl(classId, activity.id, setEntries),
    [classId, activity.id]
  );

  const bookUrl = safeBookUrl(activity.bookUrl);
  const cast = useEntryCast(classId, user);

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

  const startedCount = cards.filter((c) => kwlsStarted(c.entry?.answers)).length;
  // 읽기 전 두 칸(K·W)을 마친 학생 — 본문을 읽기 시작해도 되는지 가늠하는 수
  const readyCount = cards.filter((c) => kwlsPhaseDone("before", c.entry?.answers)).length;
  const doneCount = cards.filter((c) => kwlsDone(c.entry?.answers)).length;

  const open = openUid ? cards.find((c) => c.uid === openUid) ?? null : null;

  // 왼쪽 목록의 네모·오른쪽 패널의 칸이 쓰는 줄 정의 — 전광판과 **같은**
  // 것입니다(lib/kwls.js).
  const stepRows = useMemo(() => kwlsRows(), []);

  const castCard = cast.target ? cards.find((c) => c.uid === cast.target.uid) ?? null : null;
  const castIndex = cast.target ? REGIONS.findIndex((r) => r.key === cast.target.key) : -1;

  const livePayload = useMemo(() => {
    if (!castCard || castIndex < 0) return null;
    return buildPayload(activity, castCard, castIndex);
  }, [castCard, castIndex, activity]);
  cast.useLiveUpdate(livePayload);

  function castRegion(card, index) {
    cast.cast({ uid: card.uid, key: REGIONS[index].key }, buildPayload(activity, card, index));
  }

  function step(delta) {
    if (castIndex < 0 || !castCard) return;
    const next = castIndex + delta;
    if (next < 0 || next >= REGION_COUNT) return;
    castRegion(castCard, next);
  }

  const openAnswers = open?.entry?.answers ?? {};

  return (
    <main className="books-main book-workspace-main">
      <div className="books-head">
        {/* 제목 · 돌아가는 길 · 도구 순서 — 닿소리 머리말(BookGroupBoard)과
            같은 차례입니다. 아래 둘째 줄은 딸림 정보(주제어·반)만 두는 자리라
            화면을 옮기는 버튼은 여기 첫 줄에 둡니다. */}
        {/* 제목은 늘 활동 이름입니다 — 학생은 왼쪽 목록이 말해 주므로
            제목이 학생 이름으로 바뀌면 지금 어느 활동인지 알 수 없어집니다. */}
        <div className="books-head-title">
          <h1 className="book-group-title">{activity.title}</h1>
          <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
          {classTools}
        </div>
        <div className="books-head-row">
          <div className="books-head-main">
            {/* 주제어를 비워 두면 학생마다 제 주제로 합니다 —
                빈 배지를 두는 대신 그 사실을 적어 둡니다 */}
            <span className={`book-group-topic${(activity.topic ?? "").trim() ? "" : " soft"}`}>
              {(activity.topic ?? "").trim() || "학생마다 다른 주제"}
            </span>
            {/* 반 표시 — 고를 반이 둘 이상이면 고르개(반을 바꾸면 그 반의
                활동 목록으로 갑니다), 하나면 이름 배지입니다. */}
            {classPicker ?? (className && <span className="book-group-class">{className}</span>)}
            {/* 잠김 안내도 이 줄에 — 예전엔 머리말 아래 제 줄을 차지했는데,
                이 줄은 배지 두어 개뿐이라 오른쪽이 비어 있었습니다.
                '지금 잠겨 있다'는 활동에 붙는 상태라 배지와 같은 성격입니다. */}
            {activity.locked && (
              <span className="book-locked-note book-locked-chip">
                <IconLock size={14} /> 지금은 잠겨 있어 학생이 고칠 수 없어요.
              </span>
            )}
          </div>
          {/* 방송 막대는 배지와 같은 줄에 — 배지 몇 개뿐인 줄 아래에 또 한 줄을
              깔면 본문이 그만큼 밀립니다(ParatextBoard와 같은 짜임) */}
          {cast.target && castCard && castIndex >= 0 && (
            <CastBar
              who={castCard.name}
              label={REGIONS[castIndex].ko}
              index={castIndex}
              total={REGION_COUNT}
              onPrev={castIndex > 0 ? () => step(-1) : null}
              onNext={castIndex < REGION_COUNT - 1 ? () => step(1) : null}
              onStop={cast.stop}
            />
          )}
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
          시작 {startedCount}명 · 읽기 전 마침 {readyCount}명 · 완성 {doneCount}명 /
          {" "}전체 {cards.length}명
        </span>
      </div>

      {/* 전광판 — 네 칸 × 반 전체. 모둠이 없는 활동이라 이 줄에는
          단추 하나만 섭니다(곁텍스트·RAFT와 같은 자리). */}
      <GroupFilterRow
        trailing={
          cards.length > 0 && (
            <button
              type="button"
              className="group-filter-act"
              onClick={() => setBoardOpen(true)}
              title="K·W·L·S 네 칸 × 반 전체를 한 격자로 봅니다"
            >
              전광판
            </button>
          )
        }
      />

      {cards.length === 0 ? (
        <p className="empty-note">
          아직 이 반에 들어온 학생이 없어요. 학생이 반에 들어오면 카드가 생깁니다.
        </p>
      ) : (
        /* ── 세 칸 — 왼쪽 학생 목록 · 가운데 그 학생의 네 칸 · 오른쪽 진행 ──
           닿소리 채우기(BookGroupBoard)와 **같은 뼈대·같은 CSS**입니다. */
        <div className="book-workspace">
          <BookStudentRail
            cards={cards}
            pickedUid={openUid}
            onPick={setOpenUid}
            rows={stepRows}
            cellState={kwlsCellState}
            castUid={cast.target?.uid ?? null}
            meta={(c) =>
              !kwlsStarted(c.entry?.answers)
                ? "아직 시작 전"
                : `${kwlsFilledCount(c.entry?.answers)} / ${KWLS_COLUMN_COUNT}칸 · 글 ${kwlsChars(c.entry?.answers)}자`
            }
          />

          <div className="book-workspace-center">
            {open ? (
              <>
                {/* 가운데 칸의 머리 — 누구를 보고 있는지. 머리말의 제목은
                    활동 이름이라, 이 줄이 없으면 학생 이름이 화면 어디에도
                    없습니다. */}
                <div className="entry-detail-head">
                  <h2>
                    {open.name}
                    {open.studentId && <em>{open.studentId}</em>}
                  </h2>
                  {!(activity.topic ?? "").trim() && open.entry?.topic && (
                    <span className="book-group-topic">{open.entry.topic}</span>
                  )}
                  <span className="book-group-class">
                    {kwlsFilledCount(openAnswers)} / {KWLS_COLUMN_COUNT}칸 ·
                    {" "}글 {kwlsChars(openAnswers)}자
                  </span>
                </div>

                <div className="entry-detail-grid kwls-detail-grid">
                  {REGIONS.map((r, i) => {
                    const text = String(openAnswers[r.key] ?? "").trim();
                    const live = cast.isCasting(open.uid, r.key);
                    return (
                      <section
                        key={r.key}
                        className={`entry-region kwls-region ${r.phase}${text ? " done" : ""}${
                          live ? " live" : ""
                        }`}
                      >
                        <header className="paratext-card-head">
                          <span className="paratext-letter" aria-hidden="true">{r.letter}</span>
                          <span className="paratext-card-title">
                            <strong>{r.ko}</strong>
                            <em>{r.en}</em>
                          </span>
                          {cast.canCast && (
                            <button
                              type="button"
                              className={`btn-ghost dash-cast-btn${live ? " on" : ""}`}
                              onClick={() => castRegion(open, i)}
                              title={
                                live
                                  ? "학생 화면을 원래대로 되돌립니다"
                                  : "이 칸을 학급 전체 화면에 띄웁니다"
                              }
                            >
                              {live && <span className="broadcast-live-dot" aria-hidden="true" />}
                              {live ? "수업 종료" : "수업 시작"}
                            </button>
                          )}
                        </header>
                        <div className="entry-region-body">
                          <p className={`paratext-read-text${text ? "" : " empty"}`}>
                            {text || "아직 쓰지 않았어요"}
                          </p>
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

          <EntryProgressPanel
            cards={cards}
            rows={stepRows}
            cellState={kwlsCellState}
            pickedUid={openUid}
            onPick={setOpenUid}
            extra={(m) => ` · 글 ${kwlsChars(m.entry?.answers)}자`}
          />
        </div>
      )}

      {/* 전광판 — 학생을 고르면 닫습니다(그 화면이 곧 답입니다). */}
      {boardOpen && (
        <KwlsProgressBoard
          activity={activity}
          cards={cards}
          onOpenStudent={(uid) => { setOpenUid(uid); setBoardOpen(false); }}
          onClose={() => setBoardOpen(false)}
        />
      )}
    </main>
  );
}

// 한 칸을 방송 꾸러미로. 낱말만 크게 뜨면 무슨 물음에 답한 것인지 알 수 없어
// 그 칸의 물음(prompt)을 함께 실어 보냅니다.
function buildPayload(activity, card, index) {
  const r = REGIONS[index];
  const answers = card.entry?.answers ?? {};
  return {
    mode: "entry",
    activityTitle: activity.title ?? "",
    topic: activity.topic ?? "",
    writerName: card.name,
    letter: r.letter,
    label: r.ko,
    labelEn: r.en,
    prompt: r.prompt,
    index,
    total: REGION_COUNT,
    fields: [{ label: "", text: String(answers[r.key] ?? "").trim() }],
  };
}
