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
import { subscribeParatextEntries, updateBookActivity, composeBookGroups } from "@/lib/store";
import { useEntryCast } from "@/lib/useEntryCast";
import GroupComposer from "./GroupComposer";
import GroupFilterRow from "./GroupFilterRow";
import ParatextProgressBoard from "./ParatextProgressBoard";
import BookStudentRail from "./BookStudentRail";
import EntryProgressPanel from "./EntryProgressPanel";
import { isGroupedActivity, useBookGroups } from "@/lib/bookGroups";
import {
  PARATEXT_SECTIONS,
  PARATEXT_SECTION_COUNT,
  isSectionDone,
  isSectionStarted,
  isSectionLocked,
  openSectionCount,
  sectionLocksWith,
  sectionLocksUpTo,
  paratextDoneCount,
  paratextCharCount,
  paratextRows,
  paratextCellState,
  safeBookUrl,
} from "@/lib/paratext";
import { IconBook, IconLock, IconLockState, IconPeople } from "./StatusIcons";
import CastStageModal from "./CastStageModal";

export default function ParatextBoard({
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
  // 모둠으로 진행하는 활동이면 카드를 모둠으로 좁혀 볼 수 있습니다.
  // 글은 모둠으로 묶여도 학생마다 한 장이라, 모둠은 '보는 차례'만 정합니다.
  const grouped = isGroupedActivity(activity);
  const groups = useBookGroups(activity.id, grouped);
  const [composing, setComposing] = useState(false);
  // '학생이 고르기'는 학생이 스스로 드는 방식이라 교사가 짤 것이 없습니다
  // (닿소리 머리말의 같은 단추와 판정이 같아야 합니다).
  const freeMode = activity.groupMode === "free";
  const [pickedGroup, setPickedGroup] = useState(null);
  // 읽는중 전광판 — 여덟 단계 × 반 전체를 한 격자로(공부방 전광판과 같은 모양)
  const [boardOpen, setBoardOpen] = useState(false);
  // 수업 화면 — '수업 시작'을 누르면 열리는 큰 창. 지금 띄우는 것을 교사도
  // 보고, **같은 단계를 학생별로** 넘깁니다(CastStageModal).
  const [stageOpen, setStageOpen] = useState(false);

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
      cards.filter((c) => paratextCharCount(c.entry?.answers) > 0).map((c) => c.uid)
    );
    const out = {};
    groups.forEach((g) => {
      out[g.id] = (g.members ?? []).filter((m) => started.has(m.uid)).length;
    });
    return out;
  }, [grouped, groups, cards]);

  const startedCount = cards.filter((c) => paratextCharCount(c.entry?.answers) > 0).length;
  const doneCount = cards.filter(
    (c) => paratextDoneCount(c.entry?.answers) === PARATEXT_SECTION_COUNT
  ).length;

  const open = openUid ? cards.find((c) => c.uid === openUid) ?? null : null;

  // 왼쪽 목록의 네모·오른쪽 패널의 칸이 쓰는 단계 정의 — 전광판과 **같은**
  // 것입니다(lib/paratext.js). 한쪽만 고치면 같은 학생이 두 화면에서 다른
  // 상태로 보입니다.
  const stepRows = useMemo(() => paratextRows(activity), [activity]);

  const castIndex = cast.target
    ? PARATEXT_SECTIONS.findIndex((s) => s.key === cast.target.key)
    : -1;

  // 방송 중인 영역의 내용 — 학생이 고치면 방송도 따라 바뀌게 다시 보냅니다.
  const castCard = cast.target ? cards.find((c) => c.uid === cast.target.uid) ?? null : null;
  const livePayload = useMemo(() => {
    if (!castCard || !cast.target) return null;
    const at = PARATEXT_SECTIONS.findIndex((s) => s.key === cast.target.key);
    if (at < 0) return null;
    return buildPayload(activity, castCard, at);
  }, [castCard, cast.target, activity]);
  cast.useLiveUpdate(livePayload);

  function castSection(card, index, openStage = true) {
    const s = PARATEXT_SECTIONS[index];
    // 지금 띄우는 것을 다시 누르면 **수업 화면 창을 엽니다**(끄지 않습니다).
    // 끄는 길은 그 창 오른쪽 아래 '수업 종료' 한 곳뿐입니다 — 같은 일을 하는
    // 단추가 여기저기 있으면 무엇을 눌러야 끝나는지 헷갈립니다(선생님 지적).
    if (cast.isCasting(card.uid, s.key)) {
      setStageOpen(true);
      return;
    }
    cast.cast({ uid: card.uid, key: s.key }, buildPayload(activity, card, index));
    // **영역만 옮길 때는 창 상태를 안 건드립니다** — 닫아 둔 창이
    // '다음 영역 →'에 되살아나면 닫은 뜻이 없어집니다.
    setStageOpen(openStage);
    // 뒤의 화면도 따라옵니다 — 창을 닫았을 때 그 학생이 열려 있어야
    // 방금 본 답을 이어서 읽습니다.
    setOpenUid(card.uid);
  }

  // 창을 닫는 것과 수업을 끝내는 것은 다릅니다 — 끝낼 때만 방송을 끕니다.
  function stopCast() {
    cast.stop();
    setStageOpen(false);
  }

  // 학생 축 — **왼쪽 목록에 보이는 차례 그대로**입니다(모둠으로 좁혀 놓았으면
  // 그 모둠 안에서). 지금 띄우는 학생이 그 목록에 없으면(다른 모둠을 띄운
  // 채 좁혔을 때) 반 전체로 되돌아갑니다 — 안 그러면 넘길 곳이 없습니다.
  const castList = useMemo(() => {
    const uid = cast.target?.uid;
    if (!uid) return shownCards;
    return shownCards.some((c) => c.uid === uid) ? shownCards : cards;
  }, [shownCards, cards, cast.target]);

  const castAt = cast.target ? castList.findIndex((c) => c.uid === cast.target.uid) : -1;
  const prevStudent = castAt > 0 ? castList[castAt - 1] : null;
  const nextStudent = castAt >= 0 && castAt < castList.length - 1 ? castList[castAt + 1] : null;

  // 학생을 넘기면 **같은 단계 그대로** 그 학생의 것을 띄웁니다.
  function goStudent(card) {
    if (!card || castIndex < 0) return;
    castSection(card, castIndex);
  }

  // 방송 막대의 이전/다음 — 같은 학생 안에서 영역만 옮깁니다.
  function step(delta) {
    if (!cast.target || !castCard) return;
    const at = PARATEXT_SECTIONS.findIndex((s) => s.key === cast.target.key);
    const next = at + delta;
    if (next < 0 || next >= PARATEXT_SECTION_COUNT) return;
    castSection(castCard, next, stageOpen);
  }

  // 전광판 단추 — 서는 자리가 둘입니다: 모둠 칩이 있으면 그 줄 끝,
  // 없으면 머리말의 진행 요약 옆. 어느 쪽이든 보여 주는 것은 **반 전체**
  // 입니다(모둠으로 좁혀 봐도 격자는 반 전체).
  const chipRow = grouped && groups.length > 0;
  const boardBtn = cards.length > 0 && (
    <button
      type="button"
      className="group-filter-act"
      onClick={() => setBoardOpen(true)}
      title="여덟 단계 × 반 전체를 한 격자로 봅니다"
    >
      전광판
    </button>
  );

  return (
    <main className="books-main book-workspace-main">
      <div className="books-head">
        {/* 제목 · 돌아가는 길 · 도구 순서 — 닿소리 머리말(BookGroupBoard)과
            같은 차례입니다. 화면을 한 단계 되돌리는 버튼은 '무엇을 읽는
            활동인가'를 알려 주는 배지와 성격이 달라, 도구들과 함께 첫 줄에
            둡니다(둘째 줄에 두면 그 줄에서만 작게 그려집니다). */}
        {/* 제목은 늘 활동 이름입니다 — 학생은 왼쪽 목록이 말해 주므로
            제목이 학생 이름으로 바뀌면 지금 어느 활동인지 알 수 없어집니다.
            '← 학생 목록'도 없앴습니다(목록이 늘 왼쪽에 서 있습니다). */}
        <div className="books-head-title">
          <h1 className="book-group-title">{activity.title}</h1>
          <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
          {classTools}
        </div>
        <div className="books-head-row">
          <div className="books-head-main">
            {/* 모둠 짜기 — 닿소리 머리말과 **같은 자리·같은 말**입니다.
                모둠으로 진행하는 활동인데 짜는 길이 만들기 창에만 있어,
                한 번 만들고 나면 교사가 모둠을 고칠 수 없었습니다. */}
            {grouped && !freeMode && (
              <button type="button" className="btn-ghost" onClick={() => setComposing(true)}>
                <IconPeople size={15} /> 활동 모둠
              </button>
            )}
            {/* 주제어를 비워 두면 학생마다 제 책을 적습니다 —
                빈 배지를 두는 대신 그 사실을 적어 둡니다 */}
            <span className={`book-group-topic${(activity.topic ?? "").trim() ? "" : " soft"}`}>
              {(activity.topic ?? "").trim() || "학생마다 다른 책"}
            </span>
            {/* 반 표시 — 고를 반이 둘 이상이면 고르개(반을 바꾸면 그 반의
                활동 목록으로 갑니다), 하나면 이름 배지입니다. */}
            {classPicker ?? (className && <span className="book-group-class">{className}</span>)}
            <span className="paratext-sum">
              시작 {startedCount}명 · 완성 {doneCount}명 / 전체 {cards.length}명
            </span>
            {/* 칩 줄이 없는 활동에서는 전광판이 여기 섭니다 */}
            {!chipRow && boardBtn}
            {/* 잠김 안내도 이 줄에 — 예전엔 머리말 아래 제 줄을 차지했는데,
                이 줄은 배지 두어 개뿐이라 오른쪽이 비어 있었습니다.
                '지금 잠겨 있다'는 활동에 붙는 상태라 배지와 같은 성격입니다. */}
            {activity.locked && (
              <span className="book-locked-note book-locked-chip">
                <IconLock size={14} /> 지금은 잠겨 있어 학생이 고칠 수 없어요.
              </span>
            )}
          </div>
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
        {/* 단계 열기 — 공부방 프로젝트의 활동 잠금과 같은 생각입니다.
            여덟 칩이 학생이 보는 여덟 카드와 1:1이라, '지금 어디까지 열렸나'가
            한눈에 들어옵니다. 수업 중 실제로 하는 동작(다음 열기)은 버튼 하나로. */}
        <SectionGate activity={activity} />
      </div>

      {/* 모둠 고르는 줄 — 그 끝(마지막 모둠 뒤)에 전광판을 엽니다.
          모둠이 없는 활동에서는 이 줄에 전광판 단추만 섭니다.
          전광판은 **고른 모둠이 아니라 반 전체**를 보여 줍니다(cards). */}
      {/* 모둠 칩 줄 — 그 끝(마지막 모둠 뒤)에 전광판을 엽니다.
          칩이 없으면 이 줄을 아예 안 그리고 전광판은 머리말로 갑니다
          (단추 하나를 세우려고 줄 하나를 쓰지 않게). */}
      <GroupFilterRow
        groups={grouped ? groups : []}
        value={pickedGroup}
        onChange={setPickedGroup}
        counts={groupCounts}
        trailing={chipRow ? boardBtn : null}
      />

      {cards.length === 0 ? (
        <p className="empty-note">
          아직 이 반에 들어온 학생이 없어요. 학생이 반에 들어오면 카드가 생깁니다.
        </p>
      ) : (
        /* ── 세 칸 — 왼쪽 학생 목록 · 가운데 그 학생의 여덟 영역 · 오른쪽 진행 ──
           닿소리 채우기(BookGroupBoard)와 **같은 뼈대·같은 CSS**입니다. */
        <div className="book-workspace">
          <BookStudentRail
            cards={shownCards}
            pickedUid={openUid}
            onPick={setOpenUid}
            rows={stepRows}
            cellState={paratextCellState}
            castUid={cast.target?.uid ?? null}
            meta={(c) => {
              const n = paratextCharCount(c.entry?.answers);
              return n === 0
                ? "아직 시작 전"
                : `${paratextDoneCount(c.entry?.answers)} / ${PARATEXT_SECTION_COUNT}칸 · ${n}자`;
            }}
          />

          <div className="book-workspace-center">
            {open ? (
              <>
                {/* 가운데 칸의 머리 — 누구를 보고 있는지. 머리말의 제목은
                    활동 이름이라, 이 줄이 없으면 학생 이름이 화면 어디에도
                    없습니다(왼쪽 목록의 켜진 카드만으로는 약합니다). */}
                <div className="entry-detail-head">
                  <h2>
                    {open.name}
                    {open.studentId && <em>{open.studentId}</em>}
                  </h2>
                  {/* 활동에 주제어가 없으면 학생이 적은 책이름을 씁니다 */}
                  {!(activity.topic ?? "").trim() && open.entry?.topic && (
                    <span className="book-group-topic">{open.entry.topic}</span>
                  )}
                  <span className="book-group-class">
                    {paratextDoneCount(open.entry?.answers)} / {PARATEXT_SECTION_COUNT}칸
                  </span>
                </div>

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
                                  ? "지금 띄우는 중 — 눌러서 수업 화면 창을 엽니다(끝내기는 그 창의 수업 종료)"
                                  : "이 영역을 학급 전체 화면에 띄웁니다"
                              }
                            >
                              {live && <span className="broadcast-live-dot" aria-hidden="true" />}
                              {live ? "수업 화면 보기" : "수업 시작"}
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
              </>
            ) : (
              <p className="empty-note">왼쪽에서 학생을 골라 주세요.</p>
            )}
          </div>

          {/* 오른쪽 — 학생별 진행. 모둠으로 좁혀 봐도 **반 전체**를 셉니다
              (닿소리의 개별 활동과 같습니다 — 한 모둠만 보면 견줄 대상이
              없습니다). */}
          <EntryProgressPanel
            cards={cards}
            rows={stepRows}
            cellState={paratextCellState}
            pickedUid={openUid}
            onPick={setOpenUid}
            extra={(m) => ` · ${paratextCharCount(m.entry?.answers)}자`}
          />
        </div>
      )}

      {/* 수업 화면 — 지금 띄우는 것을 교사도 크게 보고, **같은 단계를
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
          onNextSection={castIndex < PARATEXT_SECTION_COUNT - 1 ? () => step(1) : null}
          classId={classId}
          user={user}
          onStop={stopCast}
          onClose={() => setStageOpen(false)}
        />
      )}

      {/* 전광판 — 학생 상세로 들어가면 닫습니다(그 화면이 곧 답이라
          뒤에 격자를 켜 둘 이유가 없습니다). */}
      {boardOpen && (
        <ParatextProgressBoard
          activity={activity}
          cards={cards}
          onOpenStudent={(uid) => { setOpenUid(uid); setBoardOpen(false); }}
          onClose={() => setBoardOpen(false)}
        />
      )}

      {/* 모둠 짜기 창 — 닿소리(BookGroupBoard)와 **같은 것을 같은 인자로**
          부릅니다. 글은 모둠으로 묶여도 학생마다 한 장이라(entries/{uid}),
          여기서 바뀌는 것은 '누구와 함께 보는가'뿐입니다. */}
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
              {/* 열림/잠김은 테두리·바탕색으로도 갈리지만 둘 다 옅은 색이라,
                  칠판에 띄우면 그 차이가 좁아집니다. 자물쇠를 함께 답니다. */}
              <IconLockState locked={locked} size={13} className="section-gate-lock" />
            </button>
          );
        })}
      </div>
      {/* '다음 단계 열기'는 뺐습니다 — 칩을 바로 눌러 여는 길이 이미 있어
          같은 일을 두 자리에서 하고, 채워진 단추라 줄에서 혼자 튀었습니다. */}
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
