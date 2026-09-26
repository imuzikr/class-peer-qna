"use client";

// =============================================================
// 열 개의 해시태그 — 교사 화면
// -------------------------------------------------------------
// 곁텍스트·RAFT·KWLS와 같은 뼈대(`.book-workspace`)인데 **두 칸**입니다:
//   왼쪽  학생 목록 — 네모 열한 개(해시태그 열 칸 + 요약), 읽은 글 제목,
//         해시태그 n/10 · 댓글 수
//   가운데 그 학생의 보고서 + 댓글(선생님 댓글 · 지우기)
//         아무도 안 골랐으면 **우리 반 해시태그 구름**
// 오른쪽 '학생별 진행' 패널은 **일부러 뺐습니다.** 이 화면의 주인공은 학술지
// 한 쪽 모양의 보고서인데, 양옆에 '오늘'·'멋진 순간' 패널까지 서면 세 칸일 때
// 가운데가 150px 남짓이라 보고서가 한 줄에 서너 자씩 접혔습니다(실측 1400px).
// 진행은 왼쪽 목록의 네모와 n/10이 이미 말합니다.
//
// 머리말의 **공개하기 / 공개 거두기**가 활동 전체의 친구 보고서를 여닫습니다
// (`published`). 공개 전에는 학생마다 제 보고서만 보이고, 공개하면 서로 읽고
// 댓글을 답니다. 거둬도 댓글은 지우지 않습니다.
//
// [읽는 문서] 보고서 전부 + 댓글 전부, 구독 둘. 반 한 개 분량이라(스물몇 장)
// 학생을 옮겨 다녀도 더 읽지 않습니다.
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
  hashtagReportTitle,
  isEntryDone,
  isEntryStarted,
  normalizeHashtagPost,
} from "@/lib/hashtag";
import { printHashtagReport } from "@/lib/exportHashtag";
import { IconLock } from "./StatusIcons";
import BookStudentRail from "./BookStudentRail";
import HashtagReport from "./HashtagReport";
import HashtagComments from "./HashtagComments";
import WordCloud from "./WordCloud";
import { authorLabelOf } from "./HashtagForm";

// 네모 열한 개 — 해시태그 열 칸 + 요약(왼쪽 목록의 칸 색).
const ROWS = [
  ...Array.from({ length: HASHTAG_COUNT }, (_, i) => ({
    key: `t${i}`,
    letter: String(i + 1),
    label: `해시태그 ${i + 1}`,
  })),
  { key: "summary", letter: "요", label: "요약" },
];

function cellState(row, post) {
  if (!post) return "empty";
  if (row.key === "summary") return String(post.summary ?? "").trim() ? "done" : "empty";
  const e = post.tags?.[Number(row.key.slice(1))];
  if (isEntryDone(e)) return "done";
  if (isEntryStarted(e)) return "doing";
  return "empty";
}

export default function HashtagBoard({
  activity,
  className = "",
  classPicker = null,
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

  useEffect(() => subscribeHashtagPosts(activity.id, setPosts), [activity.id]);
  useEffect(() => subscribeHashtagComments(activity.id, setComments), [activity.id]);

  const published = activity.published === true;
  const locked = !!activity.locked;

  // 반 명단 기준 — 아직 안 쓴 학생도 목록에 섭니다(누가 아직인지가 보여야
  // 합니다). 명단에 없는데 보고서가 있는 학생(반에서 빠진)은 뒤에 붙입니다.
  const cards = useMemo(() => {
    const byUid = new Map(posts.map((p) => [p.authorId, p]));
    const asEntry = (p) =>
      p ? { answers: normalizeHashtagPost(p), topic: p.source?.title?.trim() || "" } : null;
    const fromRoster = roster.map((s) => ({
      uid: s.uid,
      name: s.name,
      studentId: s.studentId,
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

  const startedCount = cards.filter((c) => c.post).length;
  const doneCount = cards.filter((c) => c.post && hashtagProgress(c.post).complete).length;
  const commentCountBy = useMemo(() => {
    const m = new Map();
    comments.forEach((c) => m.set(c.postUid, (m.get(c.postUid) ?? 0) + 1));
    return m;
  }, [comments]);
  const cloud = useMemo(() => hashtagCloud(posts), [posts]);

  const open = openUid ? cards.find((c) => c.uid === openUid) ?? null : null;

  async function togglePublish() {
    if (busy) return;
    setBusy(true);
    try {
      await setHashtagPublished(activity.id, !published);
      onToast?.(
        published
          ? "공개를 거두었어요. 학생마다 제 보고서만 보입니다(댓글은 그대로)."
          : "보고서를 공개했어요. 학생들이 서로의 보고서를 읽고 댓글을 달 수 있어요."
      );
    } catch (e) {
      onToast?.(`바꾸지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setBusy(false);
    }
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
            {classPicker ?? (className && <span className="book-group-class">{className}</span>)}
            <span className="paratext-sum">
              시작 {startedCount}명 · 완성 {doneCount}명 / 전체 {cards.length}명
            </span>
            {/* 공개하기 — 활동 전체에 한 번에. 지금 상태는 글자(공개 중 / 공개
                전)가, 할 일은 단추 글자가 말합니다(잠김 배지와 단추를 가른 것과
                같은 까닭). */}
            <span className={`book-group-class${published ? " ht-pub-on" : ""}`}>
              {published ? "친구 보고서 공개 중" : "공개 전 — 학생마다 제 보고서만"}
            </span>
            <button
              type="button"
              className={`group-filter-act ht-publish${published ? "" : " on"}`}
              onClick={togglePublish}
              disabled={busy}
              title={
                published
                  ? "공개를 거두면 학생마다 제 보고서만 보입니다. 달린 댓글은 지우지 않아요."
                  : "학생들이 서로의 보고서를 읽고 댓글을 달 수 있게 엽니다."
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
            meta={(c) =>
              !c.post
                ? "아직 시작 전"
                : `해시태그 ${hashtagProgress(c.post).done}/${HASHTAG_COUNT} · 댓글 ${commentCountBy.get(c.uid) ?? 0}`
            }
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
                    해시태그 {open.post ? hashtagProgress(open.post).done : 0}/{HASHTAG_COUNT}
                  </span>
                  <button type="button" className="btn-ghost" onClick={() => setOpenUid(null)}>
                    우리 반 해시태그
                  </button>
                  {open.post && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() =>
                        printHashtagReport(open.post, {
                          author: authorLabelOf({ studentId: open.studentId, authorName: open.name }),
                          activityTitle: activity.title,
                        })
                      }
                      title="브라우저 인쇄 창에서 ‘PDF로 저장’을 고르세요"
                    >
                      PDF로 저장
                    </button>
                  )}
                </div>
                {open.post ? (
                  <>
                    <HashtagReport
                      post={open.post}
                      author={authorLabelOf({ studentId: open.studentId, authorName: open.name })}
                    />
                    <HashtagComments
                      activityId={activity.id}
                      postUid={open.uid}
                      comments={comments.filter((c) => c.postUid === open.uid)}
                      user={user}
                      isTeacher
                      canWrite={!locked}
                      closedNote="활동이 잠겨 있어요. 댓글은 읽고 지울 수만 있습니다."
                    />
                    {!hashtagReportTitle(open.post) && published && (
                      <p className="ht-pubnote">
                        제목이 없어 친구 목록에는 아직 안 보이는 보고서예요.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="empty-note">아직 보고서를 쓰기 시작하지 않았어요.</p>
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
                      ? "여러 학생이 함께 고른 해시태그일수록 크게 · 왼쪽에서 학생을 고르면 그 보고서가 열립니다."
                      : "아직 모인 해시태그가 없어요. 왼쪽에서 학생을 고르면 그 보고서가 열립니다."
                  }
                />
              </section>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
