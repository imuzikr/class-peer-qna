"use client";

// =============================================================
// RAFT 글쓰기 — 교사 화면 (개인 활동)
// -------------------------------------------------------------
// 곁텍스트 읽기와 같은 흐름입니다.
//   1) 학생 목록 — 반 명단대로 한 명당 카드 한 장.
//   2) 학생 상세 — 카드를 누르면 다섯 영역(역할·청중·형식·주제·글쓰기)이
//      한 화면에 모두 펼쳐집니다(모달이 아닙니다).
//
// 각 영역의 '수업 시작'으로 그 영역만 학급 전체 화면에 띄웁니다. 방송 중에
// 다른 영역 버튼을 누르면 끄지 않아도 그리로 곧바로 전환됩니다.
// 방송에는 '나는 …이 되어, …에게, … 형식으로' 문장을 함께 실어, 낱말 하나만
// 크게 떠서 무슨 말인지 모르는 일이 없게 합니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import {
  subscribeParatextEntries,
  subscribeAllPeerReviews,
  setPeerReviewLocked,
} from "@/lib/store";
import { useEntryCast } from "@/lib/useEntryCast";
import {
  RAFT_COLUMNS,
  RAFT_COLUMN_COUNT,
  RAFT_WRITING,
  raftPlanCount,
  raftSentence,
  raftStarted,
  raftWritingChars,
  raftDone,
  raftRows,
  raftCellState,
} from "@/lib/raft";
import { safeBookUrl } from "@/lib/paratext";
import { IconBook, IconLock, IconLockState } from "./StatusIcons";
import CastBar from "./CastBar";
import GroupFilterRow from "./GroupFilterRow";
import RaftProgressBoard from "./RaftProgressBoard";
import BookStudentRail from "./BookStudentRail";
import EntryProgressPanel from "./EntryProgressPanel";
import { PeerReviewList } from "./PeerReviewModal";
import { isGroupedActivity, useBookGroups, isPeerReviewOpen } from "@/lib/bookGroups";

// 방송할 수 있는 영역 — 네 요소 + 글쓰기
const REGIONS = [
  ...RAFT_COLUMNS.map((c) => ({
    key: c.key,
    letter: c.letter,
    ko: c.ko,
    en: c.en,
    prompt: c.prompt,
  })),
  { key: RAFT_WRITING.key, letter: "", ko: RAFT_WRITING.ko, en: "", prompt: RAFT_WRITING.prompt },
];
const REGION_COUNT = REGIONS.length; // 5

export default function RaftBoard({
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
  // 모둠으로 진행하는 활동이면 카드를 모둠으로 좁혀 볼 수 있습니다.
  // 글은 모둠으로 묶여도 학생마다 한 장이라, 모둠은 '보는 차례'만 정합니다.
  const grouped = isGroupedActivity(activity);
  const groups = useBookGroups(activity.id, grouped);
  const [pickedGroup, setPickedGroup] = useState(null);
  // 글쓰는중 전광판 — R·A·F·T + 글쓰기 다섯 줄 × 반 전체(곁텍스트와 같은 격자)
  const [boardOpen, setBoardOpen] = useState(false);
  // 동료 평가 — 모둠 활동일 때만. 교사는 전부 읽고, 열고 닫을 수 있습니다.
  const [reviews, setReviews] = useState([]);
  useEffect(() => {
    if (!grouped) { setReviews([]); return undefined; }
    return subscribeAllPeerReviews(activity.id, setReviews);
  }, [grouped, activity.id]);
  const peerLocked = !isPeerReviewOpen(activity); // 표시가 없으면 잠김

  useEffect(() => subscribeParatextEntries(activity.id, setEntries), [activity.id]);

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

  // 고른 모둠으로 좁힌 카드 — 방송·통계는 반 전체(cards) 그대로 보고,
  // 격자에 늘어놓는 것만 좁힙니다.
  const shownCards = useMemo(() => {
    if (!pickedGroup) return cards;
    const g = groups.find((x) => x.id === pickedGroup);
    if (!g) return cards;
    const mine = new Set(g.memberUids ?? (g.members ?? []).map((m) => m.uid));
    return cards.filter((c) => mine.has(c.uid));
  }, [cards, groups, pickedGroup]);

  // 모둠 줄에 적을 '시작한 인원 / 전체' — 이미 받아 둔 것으로 셉니다
  const groupCounts = useMemo(() => {
    if (!grouped) return null;
    const started = new Set(
      cards.filter((c) => raftStarted(c.entry?.answers)).map((c) => c.uid)
    );
    const out = {};
    groups.forEach((g) => {
      out[g.id] = (g.members ?? []).filter((m) => started.has(m.uid)).length;
    });
    return out;
  }, [grouped, groups, cards]);

  const startedCount = cards.filter((c) => raftStarted(c.entry?.answers)).length;
  const doneCount = cards.filter((c) => raftDone(c.entry?.answers)).length;

  const open = openUid ? cards.find((c) => c.uid === openUid) ?? null : null;

  // 왼쪽 목록의 네모·오른쪽 패널의 칸이 쓰는 줄 정의 — 전광판과 **같은**
  // 것입니다(lib/raft.js). 한쪽만 고치면 같은 학생이 두 화면에서 다른
  // 상태로 보입니다.
  const stepRows = useMemo(() => raftRows(), []);

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
  const openReviews = useMemo(
    () => (open ? reviews.filter((r) => r.toUid === open.uid) : []),
    [reviews, open]
  );

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
            {/* 주제어를 비워 두면 학생마다 제 책으로 씁니다 —
                빈 배지를 두는 대신 그 사실을 적어 둡니다 */}
            <span className={`book-group-topic${(activity.topic ?? "").trim() ? "" : " soft"}`}>
              {(activity.topic ?? "").trim() || "학생마다 다른 책"}
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
            {/* 동료 평가 열기/잠그기 — 활동 전체 잠금과 별개입니다.
                '이제 그만 쓰고 이야기하자'로 닫는 자리라, 글쓰기까지 함께
                잠기면 안 됩니다. */}
            {grouped && (
              <button
                type="button"
                className={`btn-ghost peer-lock-btn${peerLocked ? " on" : ""}`}
                onClick={() => setPeerReviewLocked(activity.id, !peerLocked)}
                title={
                  peerLocked
                    ? "동료 평가를 다시 열어 줍니다"
                    : "동료 평가를 잠급니다 — 쓴 것은 그대로 남습니다"
                }
              >
                <IconLockState locked={peerLocked} size={14} />
                {peerLocked ? "동료 평가 잠김" : "동료 평가 열림"}
                {reviews.length > 0 && <em>{reviews.length}</em>}
              </button>
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
          시작 {startedCount}명 · 완성 {doneCount}명 / 전체 {cards.length}명
        </span>
      </div>

      {/* 모둠 고르는 줄 — 그 끝(마지막 모둠 뒤)에 전광판을 엽니다.
          전광판은 고른 모둠이 아니라 **반 전체**를 보여 줍니다(cards). */}
      <GroupFilterRow
        groups={grouped ? groups : []}
        value={pickedGroup}
        onChange={setPickedGroup}
        counts={groupCounts}
        trailing={
          cards.length > 0 && (
            <button
              type="button"
              className="group-filter-act"
              onClick={() => setBoardOpen(true)}
              title="R·A·F·T와 글쓰기 × 반 전체를 한 격자로 봅니다"
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
        /* ── 세 칸 — 왼쪽 학생 목록 · 가운데 그 학생의 다섯 영역 · 오른쪽 진행 ──
           닿소리 채우기(BookGroupBoard)와 **같은 뼈대·같은 CSS**입니다. */
        <div className="book-workspace">
          <BookStudentRail
            cards={shownCards}
            pickedUid={openUid}
            onPick={setOpenUid}
            rows={stepRows}
            cellState={raftCellState}
            castUid={cast.target?.uid ?? null}
            meta={(c) =>
              !raftStarted(c.entry?.answers)
                ? "아직 시작 전"
                : `${raftPlanCount(c.entry?.answers)} / ${RAFT_COLUMN_COUNT}칸 · 글 ${raftWritingChars(c.entry?.answers)}자`
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
                    {raftPlanCount(openAnswers)} / {RAFT_COLUMN_COUNT}칸 ·
                    {" "}글 {raftWritingChars(openAnswers)}자
                  </span>
                </div>

                {/* 늘 done으로 그렸더니, 한 칸도 안 쓴 학생 카드에서도 '다 정했다'는
                    짙은 색 알림줄이 떴습니다(0 / 4칸인데 문장은 완성 모습).
                    학생 화면과 같은 잣대로 — 네 칸을 다 정했을 때만 done입니다. */}
                <p
                  className={`raft-sentence${
                    raftPlanCount(openAnswers) === RAFT_COLUMN_COUNT ? " done" : ""
                  }`}
                >
                  {raftSentence(openAnswers)}
                </p>
                <div className="entry-detail-grid raft-detail-grid">
                  {REGIONS.map((r, i) => {
                    const text = String(openAnswers[r.key] ?? "").trim();
                    const live = cast.isCasting(open.uid, r.key);
                    const isWriting = r.key === RAFT_WRITING.key;
                    return (
                      <section
                        key={r.key}
                        className={`entry-region${text ? " done" : ""}${live ? " live" : ""}${isWriting ? " wide" : ""}`}
                      >
                        <header className="paratext-card-head">
                          {r.letter && (
                            <span className="paratext-letter" aria-hidden="true">{r.letter}</span>
                          )}
                          <span className="paratext-card-title">
                            <strong>{r.ko}</strong>
                            {r.en && <em>{r.en}</em>}
                          </span>
                          {cast.canCast && (
                            <button
                              type="button"
                              className={`btn-ghost dash-cast-btn${live ? " on" : ""}`}
                              onClick={() => castRegion(open, i)}
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
                        <div className="entry-region-body">
                          <p className={`paratext-read-text${text ? "" : " empty"}`}>
                            {text || "아직 쓰지 않았어요"}
                          </p>
                        </div>
                      </section>
                    );
                  })}
                </div>

                {/* 이 학생이 모둠 친구들에게 받은 한 마디 — 글 바로 아래.
                    규칙이 담당 교사에게 전체를 열어 두므로 여기서 다 보입니다
                    (학생끼리는 자기가 받은 것과 자기가 쓴 것만 봅니다). */}
                {grouped && <PeerReviewList reviews={openReviews} title="모둠 친구들이 남긴 한 마디" />}
              </>
            ) : (
              <p className="empty-note">왼쪽에서 학생을 골라 주세요.</p>
            )}
          </div>

          {/* 오른쪽 — 학생별 진행. 모둠으로 좁혀 봐도 **반 전체**를 셉니다. */}
          <EntryProgressPanel
            cards={cards}
            rows={stepRows}
            cellState={raftCellState}
            pickedUid={openUid}
            onPick={setOpenUid}
            extra={(m) => ` · 글 ${raftWritingChars(m.entry?.answers)}자`}
          />
        </div>
      )}

      {/* 전광판 — 학생 카드를 열면 닫습니다(그 화면이 곧 답이라 뒤에
          격자를 켜 둘 이유가 없습니다). */}
      {boardOpen && (
        <RaftProgressBoard
          activity={activity}
          cards={cards}
          onOpenStudent={(uid) => { setOpenUid(uid); setBoardOpen(false); }}
          onClose={() => setBoardOpen(false)}
        />
      )}
    </main>
  );
}

// 한 영역을 방송 꾸러미로. RAFT는 낱말 하나만 뜨면 무슨 말인지 알기 어려워서
// '나는 …이 되어…' 문장을 함께 실어 보냅니다.
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
    note: raftSentence(answers),
    index,
    total: REGION_COUNT,
    fields: [{ label: "", text: String(answers[r.key] ?? "").trim() }],
  };
}
