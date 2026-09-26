"use client";

// =============================================================
// 여섯 개의 해시태그 — 교사 화면
// -------------------------------------------------------------
// 곁텍스트·RAFT·KWLS와 같은 뼈대(`.book-workspace`)인데 **두 칸**입니다:
//   왼쪽  학생 목록 — 네모 여섯 개(해시태그 칸마다), 읽은 글 제목,
//         찾은 태그 수 · 완성 수 · 댓글 수
//   가운데 그 학생의 **슬라이드 한 장**(HashtagSlide) + 댓글
//         아무도 안 골랐으면 **우리 반 해시태그 구름**
// 오른쪽 '학생별 진행' 패널은 **일부러 뺐습니다** — 양옆에 '오늘'·'멋진 순간'
// 패널까지 서면 세 칸일 때 가운데가 150px 남짓으로 줄어듭니다(실측 1400px).
// 진행은 왼쪽 목록의 네모가 이미 말합니다.
//
// **수업 시작** — 가운데 머리의 단추를 누르면 그 학생의 슬라이드가 학급
// 화면에 뜨고, 수업 화면 창(CastStageModal)이 함께 열려 **다음 학생 →**으로
// 넘깁니다. 넘기는 차례는 왼쪽 목록 그대로이되, 아직 태그를 하나도 안 찾은
// 학생은 건너뜁니다(빈 슬라이드를 띄울 까닭이 없습니다). 창을 닫아도 방송은
// 그대로이고, 끝내는 길은 '수업 종료' 하나뿐입니다(KWLS·곁텍스트와 같음).
//
// 머리말의 **공개하기 / 공개 거두기**가 친구 해시태그를 여닫습니다
// (`published`). 방송과는 별개입니다 — 공개 전에도 교사는 띄울 수 있습니다.
//
// [읽는 문서] 학생 기록 전부 + 댓글 전부, 구독 둘. 반 한 개 분량이라(스물몇 장)
// 학생을 옮겨 다녀도 · 방송을 넘겨도 더 읽지 않습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import {
  subscribeHashtagPosts,
  subscribeHashtagComments,
  setHashtagPublished,
} from "@/lib/store";
import {
  HASHTAG_COUNT,
  hashtagCloud,
  hashtagProgress,
  hashtagSlide,
  hasHashtagEntries,
  isEntryDone,
  isEntryStarted,
  normalizeHashtagPost,
} from "@/lib/hashtag";
import { useEntryCast } from "@/lib/useEntryCast";
import { IconLock } from "./StatusIcons";
import BookStudentRail from "./BookStudentRail";
import HashtagSlide from "./HashtagSlide";
import HashtagComments from "./HashtagComments";
import WordCloud from "./WordCloud";
import CastBar from "./CastBar";
import CastStageModal from "./CastStageModal";

// 네모 여섯 개 — 해시태그 칸마다(왼쪽 목록의 칸 색).
const ROWS = Array.from({ length: HASHTAG_COUNT }, (_, i) => ({
  key: `t${i}`,
  letter: String(i + 1),
  label: `해시태그 ${i + 1}`,
}));

// 방송 대상의 '영역' 열쇠 — 이 활동은 학생마다 한 장뿐이라 하나로 못 박습니다.
const SLIDE_KEY = "slide";

function cellState(row, post) {
  if (!post) return "empty";
  const e = post.tags?.[Number(row.key.slice(1))];
  if (isEntryDone(e)) return "done";
  if (isEntryStarted(e)) return "doing";
  return "empty";
}

function payloadOf(activity, card) {
  return {
    mode: "hashtag",
    ...hashtagSlide(card.post, { writerName: card.name, activityTitle: activity.title }),
  };
}

export default function HashtagBoard({
  activity,
  className = "",
  classPicker = null,
  classId = null,
  user = null,
  roster = [],
  onBack,
  onToast,
  classTools = null,
}) {
  const [posts, setPosts] = useState([]);
  const [comments, setComments] = useState([]);
  const [openUid, setOpenUid] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);

  useEffect(() => subscribeHashtagPosts(activity.id, setPosts), [activity.id]);
  useEffect(() => subscribeHashtagComments(activity.id, setComments), [activity.id]);

  const published = activity.published === true;
  const locked = !!activity.locked;
  const cast = useEntryCast(classId, user);

  // 반 명단 기준 — 아직 안 쓴 학생도 목록에 섭니다(누가 아직인지가 보여야
  // 합니다). 명단에 없는데 기록이 있는 학생(반에서 빠진)은 뒤에 붙입니다.
  const cards = useMemo(() => {
    const byUid = new Map(posts.map((p) => [p.authorId, p]));
    const asEntry = (p) =>
      p ? { answers: normalizeHashtagPost(p), topic: p.source?.title?.trim() || "" } : null;
    const fromRoster = roster.map((s) => ({
      uid: s.uid,
      name: s.name,
      studentId: s.studentId,
      // 과일을 줄 때 이름표로 함께 적습니다(수업 화면 창의 과일 단추)
      emoji: s.emoji,
      post: byUid.get(s.uid) ?? null,
      entry: asEntry(byUid.get(s.uid)),
    }));
    const seen = new Set(roster.map((s) => s.uid));
    const strays = posts
      .filter((p) => !seen.has(p.authorId))
      .map((p) => ({
        uid: p.authorId,
        name: p.authorName || "이름 미설정",
        studentId: p.studentId ?? null,
        post: p,
        entry: asEntry(p),
      }));
    return [...fromRoster, ...strays];
  }, [roster, posts]);

  const startedCount = cards.filter((c) => c.post && hasHashtagEntries(c.post)).length;
  const doneCount = cards.filter((c) => c.post && hashtagProgress(c.post).complete).length;
  const commentCountBy = useMemo(() => {
    const m = new Map();
    comments.forEach((c) => m.set(c.postUid, (m.get(c.postUid) ?? 0) + 1));
    return m;
  }, [comments]);
  const cloud = useMemo(() => hashtagCloud(posts), [posts]);

  const open = openUid ? cards.find((c) => c.uid === openUid) ?? null : null;

  // ── 방송 ──
  const castCard = cast.target ? cards.find((c) => c.uid === cast.target.uid) ?? null : null;
  const livePayload = useMemo(
    () => (castCard ? payloadOf(activity, castCard) : null),
    [castCard, activity]
  );
  // 방송 중인 학생이 글을 고치면 칠판도 따라갑니다(잠깐 모았다가 다시 보냄).
  cast.useLiveUpdate(livePayload);

  function castStudent(card, openStage = true) {
    // 지금 띄우는 것을 다시 누르면 **수업 화면 창을 엽니다**(끄지 않습니다).
    // 끄는 길은 그 창 오른쪽 아래 '수업 종료' 한 곳뿐입니다 — 같은 일을 하는
    // 단추가 여기저기 있으면 무엇을 눌러야 끝나는지 헷갈립니다(선생님 지적).
    if (cast.isCasting(card.uid, SLIDE_KEY)) {
      setStageOpen(true);
      return;
    }
    cast.cast({ uid: card.uid, key: SLIDE_KEY }, payloadOf(activity, card));
    setStageOpen(openStage);
    // 뒤의 화면도 따라옵니다 — 창을 닫았을 때 그 학생이 열려 있어야 합니다.
    setOpenUid(card.uid);
  }
  function stopCast() {
    cast.stop();
    setStageOpen(false);
  }

  // 학생 축 — 왼쪽 목록 차례 그대로, 태그를 하나도 안 찾은 학생은 건너뜀.
  // 지금 띄우는 학생은 (그새 다 지웠더라도) 목록에 남겨 둡니다 — 안 그러면
  // 몇 번째인지와 넘길 곳을 잃습니다.
  const castList = useMemo(
    () => cards.filter((c) => (c.post && hasHashtagEntries(c.post)) || c.uid === cast.target?.uid),
    [cards, cast.target]
  );
  const castAt = cast.target ? castList.findIndex((c) => c.uid === cast.target.uid) : -1;
  const prevStudent = castAt > 0 ? castList[castAt - 1] : null;
  const nextStudent = castAt >= 0 && castAt < castList.length - 1 ? castList[castAt + 1] : null;

  async function togglePublish() {
    if (busy) return;
    setBusy(true);
    try {
      await setHashtagPublished(activity.id, !published);
      onToast?.(
        published
          ? "공개를 거두었어요. 학생마다 제 해시태그만 보입니다(댓글은 그대로)."
          : "해시태그를 공개했어요. 학생들이 서로의 것을 읽고 댓글을 달 수 있어요."
      );
    } catch (e) {
      onToast?.(`바꾸지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setBusy(false);
    }
  }

  const openHas = !!(open?.post && hasHashtagEntries(open.post));
  const openLive = open ? cast.isCasting(open.uid, SLIDE_KEY) : false;

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
            <span className="paratext-sum">
              시작 {startedCount}명 · 완성 {doneCount}명 / 전체 {cards.length}명
            </span>
            {/* 공개하기 — 활동 전체에 한 번에. 지금 상태는 글자(공개 중 / 공개
                전)가, 할 일은 단추 글자가 말합니다(잠김 배지와 단추를 가른 것과
                같은 까닭). */}
            <span className={`book-group-class${published ? " ht-pub-on" : ""}`}>
              {published ? "친구 해시태그 공개 중" : "공개 전 — 학생마다 제 것만"}
            </span>
            <button
              type="button"
              className={`group-filter-act ht-publish${published ? "" : " on"}`}
              onClick={togglePublish}
              disabled={busy}
              title={
                published
                  ? "공개를 거두면 학생마다 제 해시태그만 보입니다. 달린 댓글은 지우지 않아요."
                  : "학생들이 서로의 해시태그를 읽고 댓글을 달 수 있게 엽니다."
              }
            >
              {published ? "공개 거두기" : "공개하기"}
            </button>
            {locked && (
              <span className="book-locked-note book-locked-chip">
                <IconLock size={14} /> 지금은 잠겨 있어 학생이 고칠 수 없어요.
              </span>
            )}
          </div>
          {/* 방송 막대 — 배지와 같은 줄에(KWLS·곁텍스트와 같은 짜임). 학생마다
              한 장이라 영역을 넘기는 단추는 없습니다. */}
          {cast.target && castCard && (
            <CastBar
              who={castCard.name}
              label="해시태그 슬라이드"
              index={0}
              total={1}
              onPrev={null}
              onNext={null}
              onStop={stopCast}
              onOpenStage={stageOpen ? null : () => setStageOpen(true)}
              stopInStage
            />
          )}
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="empty-note">
          아직 이 반에 들어온 학생이 없어요. 학생이 반에 들어오면 목록이 생깁니다.
        </p>
      ) : (
        <div className="book-workspace">
          <BookStudentRail
            cards={cards}
            pickedUid={openUid}
            onPick={(u) => setOpenUid((prev) => (prev === u ? null : u))}
            rows={ROWS}
            cellState={cellState}
            castUid={cast.target?.uid ?? null}
            meta={(c) => {
              if (!c.post || !hasHashtagEntries(c.post)) return "아직 시작 전";
              const pr = hashtagProgress(c.post);
              return `태그 ${pr.tagged}개 · 완성 ${pr.done} · 댓글 ${commentCountBy.get(c.uid) ?? 0}`;
            }}
          />

          <div className="book-workspace-center ht-teacher-center">
            {open ? (
              <>
                <div className="entry-detail-head">
                  <h2>
                    {open.name}
                    {open.studentId && <em>{open.studentId}</em>}
                  </h2>
                  <span className="book-group-class">
                    완성 {open.post ? hashtagProgress(open.post).done : 0}/{HASHTAG_COUNT}
                  </span>
                  <button type="button" className="btn-ghost" onClick={() => setOpenUid(null)}>
                    우리 반 해시태그
                  </button>
                  {cast.canCast && (
                    <button
                      type="button"
                      className={`btn-ghost dash-cast-btn${openLive ? " on" : ""}`}
                      onClick={() => castStudent(open)}
                      disabled={!openHas && !openLive}
                      title={
                        openLive
                          ? "지금 띄우는 중 — 눌러서 수업 화면 창을 엽니다(끝내기는 그 창의 수업 종료)"
                          : openHas
                          ? "이 학생의 해시태그를 슬라이드 한 장으로 학급 화면에 띄웁니다"
                          : "아직 찾은 해시태그가 없어 띄울 것이 없어요"
                      }
                    >
                      {openLive && <span className="broadcast-live-dot" aria-hidden="true" />}
                      {openLive ? "수업 화면 보기" : "수업 시작"}
                    </button>
                  )}
                </div>
                {openHas ? (
                  <>
                    <HashtagSlide slide={payloadOf(activity, open)} maxCols={2} />
                    <HashtagComments
                      activityId={activity.id}
                      postUid={open.uid}
                      comments={comments.filter((c) => c.postUid === open.uid)}
                      user={user}
                      isTeacher
                      canWrite={!locked}
                      closedNote="활동이 잠겨 있어요. 댓글은 읽고 지울 수만 있습니다."
                    />
                  </>
                ) : (
                  <p className="empty-note">아직 해시태그를 찾기 시작하지 않았어요.</p>
                )}
              </>
            ) : (
              <section className="ht-teacher-cloud">
                <h3>우리 반 해시태그</h3>
                <WordCloud
                  words={cloud.words}
                  rest={cloud.rest}
                  hint={
                    cloud.words.length
                      ? "여러 학생이 함께 고른 해시태그일수록 크게 · 왼쪽에서 학생을 고르고 ‘수업 시작’을 누르면 그 학생의 슬라이드가 학급 화면에 뜹니다."
                      : "아직 모인 해시태그가 없어요. 왼쪽에서 학생을 고르면 그 학생의 슬라이드가 열립니다."
                  }
                />
              </section>
            )}
          </div>
        </div>
      )}

      {/* 수업 화면 — 지금 띄우는 슬라이드를 교사도 보고, 학생별로 넘기며
          그 자리에서 과일을 줍니다. 본문은 학생 화면과 **같은 컴포넌트**. */}
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
          body={<HashtagSlide slide={livePayload} maxCols={2} />}
          stepTo="슬라이드로"
          hint="해시태그를 찾은 학생을 차례로 넘깁니다 · 키보드 ← →"
        />
      )}
    </main>
  );
}
