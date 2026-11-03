"use client";

// =============================================================
// RAFT 글쓰기 — 교사 화면 (개인·모둠 활동)
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
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  subscribeParatextEntries,
  subscribeAllPeerReviews,
  setPeerReviewLocked,
  composeBookGroups,
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
import { IconLockState } from "./StatusIcons";
import CastStageModal from "./CastStageModal";
import EntryOverviewModal from "./EntryOverviewModal";
import GroupComposer from "./GroupComposer";
import BookEntryGroupRail from "./BookEntryGroupRail";
import RaftProgressBoard from "./RaftProgressBoard";
import BookStudentRail from "./BookStudentRail";
import EntryProgressPanel from "./EntryProgressPanel";
import { PeerReviewList, PeerReviewRow, peerReviewSlots } from "./PeerReviewModal";
import { isGroupedActivity, useBookGroups, isPeerReviewOpen, myBookGroup, groupMembers } from "@/lib/bookGroups";
import BookBoardHead, { BOOK_NO_STUDENTS } from "./BookHeadParts";

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
  // 반의 기본 모둠 — '활동 모둠' 창이 '기본 모둠 그대로 가져오기'에 씁니다
  baseGroupAssignment = null,
  onToast = null,
}) {
  const [entries, setEntries] = useState([]);
  const [openUid, setOpenUid] = useState(null);
  // 수업 화면 — '수업 시작'을 누르면 열리는 큰 창. 지금 띄우는 것을 교사도
  // 보고, **같은 영역을 학생별로** 넘깁니다(CastStageModal).
  const [stageOpen, setStageOpen] = useState(false);
  // 한 눈에 보기 — 고른 학생의 다섯 영역을 큰 창에서 카드로(읽기만)
  const [overviewOpen, setOverviewOpen] = useState(false);
  // 모둠으로 진행하는 활동이면 카드를 모둠으로 좁혀 볼 수 있습니다.
  // 글은 모둠으로 묶여도 학생마다 한 장이라, 모둠은 '보는 차례'만 정합니다.
  const grouped = isGroupedActivity(activity);
  const groups = useBookGroups(activity.id, grouped);
  const [pickedGroup, setPickedGroup] = useState(null);
  const [composing, setComposing] = useState(false);
  // '학생이 고르기'는 학생이 스스로 드는 방식이라 교사가 짤 것이 없습니다
  // (닿소리 머리말의 같은 단추와 판정이 같아야 합니다).
  const freeMode = activity.groupMode === "free";
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

  const cast = useEntryCast(classId, user);

  const cards = useMemo(() => {
    const byUid = new Map(entries.map((e) => [e.authorId, e]));
    const fromRoster = roster.map((s) => ({
      uid: s.uid,
      name: s.name,
      studentId: s.studentId,
      // 과일을 줄 때 이름표로 함께 적습니다(수업 화면 창의 과일 단추)
      emoji: s.emoji,
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

  // 왼쪽 모둠 카드(모둠 활동) — 물러난 모둠은 빼고, 모둠원은 카드(명단에
  // 있는 학생 · 글을 쓴 학생)가 있는 사람만. 어느 모둠에도 없는 학생은 맨 뒤
  // '미배정' 카드로 모읍니다(안 그러면 그 학생을 열 길이 없습니다).
  const railGroups = useMemo(() => {
    if (!grouped) return [];
    const placed = new Set();
    const out = groups
      .filter((g) => !g.retired)
      .map((g) => {
        const uids = new Set(g.memberUids ?? (g.members ?? []).map((m) => m.uid));
        const members = cards.filter((c) => uids.has(c.uid));
        members.forEach((c) => placed.add(c.uid));
        return { id: g.id, name: g.groupName || `${g.groupIndex}모둠`, cards: members };
      });
    const loose = cards.filter((c) => !placed.has(c.uid));
    if (loose.length > 0) out.push({ id: "__none", name: "미배정", cards: loose });
    return out;
  }, [grouped, groups, cards]);

  const selectedGroup = railGroups.find((g) => g.id === pickedGroup) ?? railGroups[0] ?? null;
  const shownCards = useMemo(
    () => grouped ? selectedGroup?.cards ?? [] : cards,
    [grouped, selectedGroup, cards]
  );

  function pickStudent(uid) {
    setOpenUid(uid);
    if (grouped) {
      const group = railGroups.find((g) => g.cards.some((c) => c.uid === uid));
      if (group) setPickedGroup(group.id);
    }
  }

  const startedCount = cards.filter((c) => raftStarted(c.entry?.answers)).length;
  const doneCount = cards.filter((c) => raftDone(c.entry?.answers)).length;

  const open = grouped
    ? shownCards.find((c) => c.uid === openUid) ?? shownCards[0] ?? null
    : cards.find((c) => c.uid === openUid) ?? null;

  // 왼쪽 목록의 네모·오른쪽 패널의 칸이 쓰는 줄 정의 — 전광판과 **같은**
  // 것입니다(lib/raft.js). 한쪽만 고치면 같은 학생이 두 화면에서 다른
  // 상태로 보입니다.
  const stepRows = useMemo(() => raftRows(), []);

  // 모둠 RAFT — 그 학생이 받은 동료 평가를 모둠 친구 자리마다(한 눈에 보기와 같은 셈).
  // 글쓰기를 방송할 때 꾸러미에 함께 실어, 카드 아래로 굴려 내려 읽게 합니다(선생님 요청).
  const peersOf = useCallback(
    (card) => {
      if (!grouped || !card) return null;
      const mates = groupMembers(
        myBookGroup(groups.filter((g) => !g.retired), card.uid),
        roster.length ? roster : null
      ).filter((m) => m.uid !== card.uid);
      return peerReviewSlots(reviews.filter((r) => r.toUid === card.uid), mates);
    },
    [grouped, groups, roster, reviews]
  );

  const castCard = cast.target ? cards.find((c) => c.uid === cast.target.uid) ?? null : null;
  const castIndex = cast.target ? REGIONS.findIndex((r) => r.key === cast.target.key) : -1;

  const livePayload = useMemo(() => {
    if (!castCard || castIndex < 0) return null;
    return buildPayload(activity, castCard, castIndex, peersOf(castCard));
  }, [castCard, castIndex, activity, peersOf]);
  cast.useLiveUpdate(livePayload);

  function castRegion(card, index, openStage = true) {
    // 지금 띄우는 것을 다시 누르면 **수업 화면 창을 엽니다**(끄지 않습니다).
    // 끄는 길은 그 창 오른쪽 아래 '수업 종료' 한 곳뿐입니다 — 같은 일을 하는
    // 단추가 여기저기 있으면 무엇을 눌러야 끝나는지 헷갈립니다(선생님 지적).
    if (cast.isCasting(card.uid, REGIONS[index].key)) {
      setStageOpen(true);
      return;
    }
    cast.cast({ uid: card.uid, key: REGIONS[index].key }, buildPayload(activity, card, index, peersOf(card)));
    // **영역만 옮길 때는 창 상태를 안 건드립니다** — 닫아 둔 창이
    // '다음 영역 →'에 되살아나면 닫은 뜻이 없어집니다.
    setStageOpen(openStage);
    // 뒤의 화면도 따라옵니다 — 창을 닫았을 때 그 학생이 열려 있어야
    // 방금 본 답을 이어서 읽습니다.
    pickStudent(card.uid);
  }

  // 창을 닫는 것과 수업을 끝내는 것은 다릅니다 — 끝낼 때만 방송을 끕니다.
  function stopCast() {
    cast.stop();
    setStageOpen(false);
  }

  // 학생 축 — 왼쪽 목록에 보이는 차례 그대로. 지금 띄우는 학생이 그 목록에
  // 없으면 반 전체로 되돌아갑니다(안 그러면 넘길 곳이 없습니다).
  const castList = useMemo(() => {
    const uid = cast.target?.uid;
    if (!uid) return shownCards;
    return shownCards.some((c) => c.uid === uid) ? shownCards : cards;
  }, [shownCards, cards, cast.target]);

  const castAt = cast.target ? castList.findIndex((c) => c.uid === cast.target.uid) : -1;
  const prevStudent = castAt > 0 ? castList[castAt - 1] : null;
  const nextStudent = castAt >= 0 && castAt < castList.length - 1 ? castList[castAt + 1] : null;

  // 학생을 넘기면 **같은 영역 그대로** 그 학생의 것을 띄웁니다.
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

  // 한 눈에 보기의 카드 — 방송 꾸러미와 같은 것(칸 이름 · 물음 · 글).
  // 네 요소는 두 칸씩, 글쓰기는 가로를 다 씁니다(가운데 칸의 배치와 같음).
  // 한 눈에 보기 — 네 요소는 카드로 펼치지 않고 위의 한 문장('나는 ○○이 되어,
  // ○○에게, ○○ 형식으로, ○○에 대해 씁니다')이 담고, 카드는 **글쓰기 하나**만
  // 바로 섭니다(선생님 요청 — 네 칸 격자는 문장과 같은 말을 되풀이했습니다).
  // 카드가 하나라 위의 영역 바로가기 줄도 안 섭니다(EntryOverviewModal).
  const overviewSections = useCallback(
    (card) => {
      const i = REGIONS.findIndex((r) => r.key === RAFT_WRITING.key);
      return [{ ...buildPayload(activity, card, i), key: RAFT_WRITING.key, wide: true }];
    },
    [activity]
  );

  const openAnswers = open?.entry?.answers ?? {};
  const openReviews = useMemo(
    () => (open ? reviews.filter((r) => r.toUid === open.uid) : []),
    [reviews, open]
  );

  return (
    <main className="books-main book-workspace-main book-entry-workspace-main">
      {/* 머리말 — 독서 활동 교사 화면이 모두 같은 조각 · 같은 차례입니다(BookBoardHead). */}
      <BookBoardHead
        activity={activity}
        onBack={onBack}
        classTools={classTools}
        classPicker={classPicker}
        className={className}
        onCompose={grouped && !freeMode ? () => setComposing(true) : null}
        topicFallback="학생마다 다른 책"
        summary={`시작 ${startedCount}명 · 완성 ${doneCount}명 / 전체 ${cards.length}명`}
        onOpenBoard={cards.length > 0 ? () => setBoardOpen(true) : null}
        boardTitle="R·A·F·T와 글쓰기 × 반 전체를 한 격자로 봅니다"
        actions={
          /* 동료 평가 열기/잠그기 — 활동 전체 잠금과 별개입니다. '이제 그만 쓰고
             이야기하자'로 닫는 자리라, 글쓰기까지 함께 잠기면 안 됩니다. */
          grouped && (
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
          )
        }
        onOverview={() => setOverviewOpen(true)}
        overviewDisabled={!open}
      />

      {cards.length === 0 ? (
        <p className="empty-note">
          {BOOK_NO_STUDENTS}
        </p>
      ) : (
        /* ── 세 칸 — 왼쪽 학생 목록 · 가운데 그 학생의 다섯 영역 · 오른쪽 진행 ──
           닿소리 채우기(BookGroupBoard)와 **같은 뼈대·같은 CSS**입니다. */
        <div className="book-workspace">
          {grouped ? (
            <BookEntryGroupRail
              groups={railGroups}
              pickedGroupId={selectedGroup?.id}
              pickedUid={open?.uid}
              onPickGroup={(g) => { setPickedGroup(g.id); setOpenUid(g.cards[0]?.uid ?? null); }}
              onPickStudent={pickStudent}
            />
          ) : (
            <BookStudentRail
              cards={shownCards}
              allCards={cards}
              pickedUid={openUid}
              onPick={pickStudent}
              rows={stepRows}
              cellState={raftCellState}
              castUid={cast.target?.uid ?? null}
              extra={(c) => ` · 글 ${raftWritingChars(c.entry?.answers)}자`}
            />
          )}

          <div className="book-workspace-center">
            {open && (
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
            )}
            {open ? (
              <>

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
                          {/* 글쓰기 칸만 — 글자 수를 칸 머리 오른쪽에(위 머리줄의 '글 n자'와 같은 셈 · 같은 알약) */}
                          {isWriting && (
                            <span className="book-group-class entry-region-count">
                              글 {raftWritingChars(openAnswers)}자
                            </span>
                          )}
                          {cast.canCast && (
                            <button
                              type="button"
                              className={`btn-ghost dash-cast-btn${live ? " on" : ""}`}
                              onClick={() => castRegion(open, i)}
                              title={
                                live
                                  ? "지금 띄우는 중 — 눌러서 수업 화면 창을 엽니다(끝내기는 그 창의 수업 종료)"
                                  : "이 영역을 학급 전체 화면에 띄웁니다"
                              }
                            >
                              {live && <span className="broadcast-live-dot" aria-hidden="true" />}
                              {live ? "수업 화면 보기" : "수업 시작"}
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
              <p className="empty-note">
                {grouped
                  ? "왼쪽 모둠 카드에서 학생 이름을 눌러 주세요."
                  : "왼쪽에서 학생을 골라 주세요."}
              </p>
            )}
          </div>

          {/* 오른쪽 — 선택한 모둠 학생의 진행 정보 */}
          {grouped && (
            <EntryProgressPanel
              title={`${selectedGroup?.name ?? "모둠"} 학생 정보`}
              cards={shownCards}
              rows={stepRows}
              cellState={raftCellState}
              pickedUid={open?.uid ?? null}
              onPick={pickStudent}
              nameAsButton
              emptyText="이 모둠에는 아직 학생이 없어요."
              extra={(m) => ` · 글 ${raftWritingChars(m.entry?.answers)}자`}
            />
          )}
        </div>
      )}

      {/* 전광판 — 학생 카드를 열면 닫습니다(그 화면이 곧 답이라 뒤에
          격자를 켜 둘 이유가 없습니다). */}
      {/* 수업 화면 — 지금 띄우는 것을 교사도 크게 보고, **같은 영역을
          학생별로** 넘기며 그 자리에서 과일을 줍니다. 닫아도 방송은
          그대로이고, 머리말 막대의 '수업 화면 보기'로 다시 엽니다. */}
      {stageOpen && cast.target && castCard && castIndex >= 0 && (
        <CastStageModal
          payload={livePayload}
          student={castCard}
          studentIndex={castAt}
          studentTotal={castList.length}
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

      {overviewOpen && open && (
        <EntryOverviewModal
          activityTitle={activity.title}
          cards={shownCards.some((c) => c.uid === open.uid) ? shownCards : cards}
          uid={open.uid}
          onPick={pickStudent}
          onClose={() => setOverviewOpen(false)}
          sectionsOf={overviewSections}
          summaryOf={(c) =>
            `${raftPlanCount(c.entry?.answers)} / ${RAFT_COLUMN_COUNT}칸 · 글 ${raftWritingChars(c.entry?.answers)}자`
          }
          footOf={grouped ? (c) => (
            <PeerReviewRow slots={peersOf(c)} />
          ) : null}
          leadOf={(c) => ({
            text: raftSentence(c.entry?.answers ?? {}),
            done: raftPlanCount(c.entry?.answers) === RAFT_COLUMN_COUNT,
          })}
        />
      )}

      {boardOpen && (
        <RaftProgressBoard
          activity={activity}
          cards={cards}
          onOpenStudent={(uid) => { pickStudent(uid); setBoardOpen(false); }}
          onClose={() => setBoardOpen(false)}
        />
      )}

      {/* 모둠 짜기 창 — 닿소리(BookGroupBoard)와 **같은 것을 같은 인자로**
          부릅니다. 글은 모둠으로 묶여도 학생마다 한 장이라(entries/{uid}),
          여기서 바뀌는 것은 '누구와 함께 보는가'와 동료 평가의 범위뿐입니다. */}
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
          groupSetName={
            activity.groupSetName ||
            `${activity.topic || activity.title || "독서 활동"} 활동 모둠`
          }
          onClose={() => setComposing(false)}
          onSaved={() => onToast?.("모둠을 구성했어요.")}
        />
      )}
    </main>
  );
}

// 한 영역을 방송 꾸러미로. RAFT는 낱말 하나만 뜨면 무슨 말인지 알기 어려워서
// '나는 …이 되어…' 문장을 함께 실어 보냅니다.
// peers — 모둠 RAFT 글쓰기에만 싣는 동료 평가 자리(peerReviewSlots). 개인 활동 · 네 요소는 null.
function buildPayload(activity, card, index, peers = null) {
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
    // 글쓰기는 '한 눈에 보기'와 같은 카드 모양으로(EntryCastCard) — 긴 글이라
    // 문장 한 줄 아래 카드 한 장에 담아야 무엇에 대한 글인지 함께 읽힙니다.
    ...(r.key === RAFT_WRITING.key ? { look: "card" } : {}),
    // 모둠 친구들이 남긴 한 마디 — 카드 아래에 섭니다(글자 크기는 그대로, 굴려서 읽음).
    ...(r.key === RAFT_WRITING.key && Array.isArray(peers) ? { peers } : {}),
  };
}
