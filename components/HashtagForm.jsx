"use client";

// =============================================================
// 열 개의 해시태그 — 학생 화면
// -------------------------------------------------------------
// 위에서 아래로 한 줄기입니다:
//   ① 내가 찾은 해시태그 — **먼저 태그 목록을 칩으로** 모읍니다(최대 열 개).
//      낱말을 적고 Enter(여러 개를 한꺼번에 붙여 넣어도 낱말마다 칩).
//      칩의 ×로 빼면 그 태그에 쓴 원문·생각도 함께 빠집니다(글이 있으면 되물음).
//   ② 해시태그별 원문 · 생각 — 칩 하나에 카드 한 장. 펼친 카드 하나만 열고
//      나머지는 한 줄로 접습니다(칩을 누르면 그 카드가 펴짐). 카드 안의 입력칸
//      셋은 모양이 다 다릅니다 — 태그(# 알약) · 원문(인용 상자) · 생각(초록 선).
//   ③ 읽은 글  ④ 대표 이미지(선택) — 슬라이드 머리에 함께 실립니다.
//   ⑤ 내 해시태그에 달린 댓글
//
// 교사가 '수업 시작'을 누르면 한 학생의 것이 **슬라이드 한 장**
// (HashtagSlide)으로 학급 화면에 뜹니다. 한때 폼 아래에서 학술 보고서로
// 짜 보여 주고 PDF로 뽑았는데 선생님이 거두셨습니다(보고서 제목·요약 칸도
// 함께 — 저장 문서에는 지난 값이 그대로 남습니다).
//
// 선생님이 **공개하기**를 누르면 머리에 '내 해시태그 / 친구 해시태그' 탭이
// 서고, 친구 것을 슬라이드로 읽고 댓글을 답니다. 공개 전에는 제 것만.
//
// 저장은 자동입니다(입력을 멈추면 조용히). '제출'은 없습니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  subscribeMyHashtagPost,
  subscribeHashtagPosts,
  subscribeHashtagComments,
  saveHashtagPost,
  markHashtagCommentsSeen,
} from "@/lib/store";
import {
  HASHTAG_COUNT,
  HASHTAG_FIELD_MAX,
  HASHTAG_INSIGHT_MAX,
  HASHTAG_QUOTE_MAX,
  HASHTAG_SOURCE_KINDS,
  HASHTAG_TAG_MAX,
  addTagsTo,
  duplicateTagIndexes,
  emptyHashtagPost,
  hashtagCloud,
  hashtagProgress,
  hashtagSlide,
  hashtagSourceLine,
  hasHashtagEntries,
  isEntryDone,
  isEntryStarted,
  newCommentCount,
  normalizeHashtagPost,
  normalizeTag,
  quoteHasTag,
  removeTagAt,
  safeSourceUrl,
  tagKey,
} from "@/lib/hashtag";
import { IMAGE_ACCEPT } from "@/lib/image";
import { iGa, eulReul } from "@/lib/korean";
import { uploadImage, deleteUploadedFile } from "@/lib/storageUpload";
import HashtagSlide from "./HashtagSlide";
import HashtagComments from "./HashtagComments";
import ConfirmModal from "./ConfirmModal";
import WordCloud from "./WordCloud";
import { IconLock } from "./StatusIcons";

const SAVE_DELAY = 900; // ms — 이만큼 입력이 없으면 저장

export function authorLabelOf(p) {
  const sid = String(p?.studentId ?? "").trim();
  const name = String(p?.authorName ?? "").trim();
  return [sid, name].filter(Boolean).join(" ");
}

function byStudentId(a, b) {
  const sa = String(a.studentId ?? "");
  const sb = String(b.studentId ?? "");
  if (sa && sb && sa !== sb) return sa.localeCompare(sb, "ko", { numeric: true });
  if (sa && !sb) return -1;
  if (!sa && sb) return 1;
  return String(a.authorName ?? "").localeCompare(String(b.authorName ?? ""), "ko");
}

export default function HashtagForm({ activity, user, onBack }) {
  const [post, setPost] = useState(emptyHashtagPost);
  const [meta, setMeta] = useState(null);     // 저장된 문서의 나머지(시각·읽음 표시)
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const [tab, setTab] = useState("mine");
  const [openFriend, setOpenFriend] = useState(null);
  const [myComments, setMyComments] = useState([]);
  const [posts, setPosts] = useState([]);
  const [allComments, setAllComments] = useState([]);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgError, setImgError] = useState("");
  // 처음 열었을 때의 '댓글 여기까지 봤다' — 새 댓글을 칠하는 기준입니다.
  // 보는 순간 서버 값은 지금으로 바뀌지만, 이번에 연 동안에는 칠한 채로 둡니다.
  const [seenSnap, setSeenSnap] = useState(undefined);

  const dirtyRef = useRef(false);
  const existsRef = useRef(false);
  const timerRef = useRef(null);
  const fileRef = useRef(null);
  const commentsRef = useRef(null);
  // 해시태그 카드 — 지금 펼친 칸 번호. null이면 '아직 다 안 쓴 첫 카드'를,
  // -1이면 아무것도 펴지 않습니다.
  const [openIdx, setOpenIdx] = useState(null);
  const focusQuoteRef = useRef(null); // 칩을 눌러 편 카드의 원문 칸에 커서를
  // 칩 입력칸
  const [draft, setDraft] = useState("");
  const [tagMsg, setTagMsg] = useState("");
  const [askRemove, setAskRemove] = useState(null); // 글이 든 칸을 빼기 전에 되물음

  const locked = !!activity.locked;
  const published = activity.published === true;
  const uid = user?.uid;

  useEffect(() => {
    let first = true;
    return subscribeMyHashtagPost(activity.id, uid, (doc) => {
      existsRef.current = !!doc;
      if (!dirtyRef.current) setPost(normalizeHashtagPost(doc));
      setMeta(doc);
      if (first) {
        first = false;
        setSeenSnap(doc?.seenCommentsAt ?? null);
      }
      setLoaded(true);
    });
  }, [activity.id, uid]);

  // 내 해시태그에 달린 댓글 — 공개 전에도 읽습니다(선생님 댓글).
  useEffect(
    () => subscribeHashtagComments(activity.id, setMyComments, { postUid: uid }),
    [activity.id, uid]
  );

  // 친구 해시태그 — **공개된 뒤에만** 구독합니다(그 전에는 규칙이 거부).
  useEffect(() => {
    if (!published) { setPosts([]); setAllComments([]); return; }
    const a = subscribeHashtagPosts(activity.id, setPosts);
    const b = subscribeHashtagComments(activity.id, setAllComments);
    return () => { a(); b(); };
  }, [activity.id, published]);

  // 공개를 거두면 친구 탭에서 내 것으로 돌아옵니다.
  useEffect(() => {
    if (!published) { setTab("mine"); setOpenFriend(null); }
  }, [published]);

  // 자동 저장
  useEffect(() => {
    if (!dirtyRef.current || locked) return;
    clearTimeout(timerRef.current);
    setStatus("saving");
    timerRef.current = setTimeout(async () => {
      try {
        await saveHashtagPost(activity.id, user, post, { first: !existsRef.current });
        existsRef.current = true;
        setStatus("saved");
      } catch (e) {
        console.warn("[해시태그] 저장 실패:", e?.code, e?.message);
        setStatus("error");
      }
    }, SAVE_DELAY);
    return () => clearTimeout(timerRef.current);
  }, [post, activity.id, user, locked]);

  function edit(fn) {
    if (locked) return;
    dirtyRef.current = true;
    setPost((prev) => fn(prev));
  }
  const setField = (key, value) => edit((p) => ({ ...p, [key]: value }));
  const setSource = (key, value) => edit((p) => ({ ...p, source: { ...p.source, [key]: value } }));
  const setImage = (patch) => edit((p) => ({ ...p, image: { ...p.image, ...patch } }));
  const setEntry = (i, key, value) =>
    edit((p) => ({
      ...p,
      tags: p.tags.map((e, j) => (j === i ? { ...e, [key]: value } : e)),
    }));

  async function pickImage(file) {
    if (!file || locked) return;
    if (!file.type?.startsWith("image/")) {
      setImgError("이미지 파일만 넣을 수 있어요.");
      return;
    }
    setImgBusy(true);
    setImgError("");
    const old = post.image.url;
    try {
      const url = await uploadImage(file, { maxWidth: 1280, quality: 0.8 });
      setImage({ url });
      if (old && old !== url) deleteUploadedFile(old);
    } catch (e) {
      setImgError(`이미지를 올리지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setImgBusy(false);
    }
  }
  function dropImage() {
    const old = post.image.url;
    setImage({ url: "" });
    if (old) deleteUploadedFile(old);
  }

  const dup = useMemo(() => duplicateTagIndexes(post.tags), [post.tags]);
  // 카드로 세울 칸 — 무엇이든 쓴 칸(태그 없이 글만 있는 옛 칸도). 지금 편
  // 칸은 비어도 남깁니다 — 카드의 태그 칸을 지우고 다시 적는 사이에 카드가
  // 사라지면 안 됩니다.
  const entries = useMemo(
    () =>
      post.tags
        .map((e, index) => ({ ...e, index }))
        .filter((e) => isEntryStarted(e) || e.index === openIdx),
    [post.tags, openIdx]
  );
  const chips = entries.filter((e) => e.tag);
  const full = entries.length >= HASHTAG_COUNT;
  const firstTodo = entries.find((e) => !isEntryDone(e) || dup.has(e.index));
  const openAt =
    openIdx === null
      ? firstTodo?.index ?? entries[entries.length - 1]?.index ?? -1
      : openIdx;

  // 칩 더하기 — Enter · 쉼표 · '추가' 단추. 못 넣은 것은 까닭을 잠깐 적습니다.
  function commitDraft() {
    if (locked) return;
    const raw = draft.trim();
    if (!raw) return;
    const r = addTagsTo(post.tags, raw);
    const notes = [];
    if (r.dupes.length) notes.push(`${r.dupes.map((t) => `#${t}`).join(" ")} — 이미 있어요`);
    if (r.overflow.length) notes.push(`${HASHTAG_COUNT}개까지만 담을 수 있어요`);
    setTagMsg(notes.join(" · "));
    if (r.added.length) {
      edit((p) => ({ ...p, tags: r.tags }));
      // 방금 더한 태그의 카드를 폅니다(커서는 칩 입력칸에 그대로 — 태그를
      // 잇달아 적는 중일 수 있습니다).
      setOpenIdx(r.added[r.added.length - 1]);
    }
    setDraft("");
  }
  function onDraftKey(e) {
    if (e.nativeEvent.isComposing) return; // 한글 조합 중의 Enter는 글자를 맺는 것
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft();
    }
  }
  function removeEntry(index) {
    edit((p) => ({ ...p, tags: removeTagAt(p.tags, index) }));
    setOpenIdx(null);
    setAskRemove(null);
  }
  function requestRemove(e) {
    if (locked) return;
    if (e.quote.trim() || e.insight.trim()) setAskRemove(e);
    else removeEntry(e.index);
  }
  function openEntry(index) {
    setOpenIdx(index);
    focusQuoteRef.current = index;
  }
  // 칩을 눌러 편 카드 — 그려진 뒤 원문 칸으로 데려갑니다.
  useEffect(() => {
    const i = focusQuoteRef.current;
    if (i == null) return;
    focusQuoteRef.current = null;
    const el = document.getElementById(`ht-quote-${i}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }, [openAt]);
  // 까닭 한 줄은 잠깐만
  useEffect(() => {
    if (!tagMsg) return;
    const t = setTimeout(() => setTagMsg(""), 4000);
    return () => clearTimeout(t);
  }, [tagMsg]);

  const progress = hashtagProgress(post);
  const newCount = newCommentCount(myComments, uid, meta?.seenCommentsAt ?? null);
  const urlBad = post.source.url.trim() && !safeSourceUrl(post.source.url);

  // 댓글 칸이 화면에 들어오면 '여기까지 봤다'를 적습니다.
  useEffect(() => {
    const el = commentsRef.current;
    if (!el || newCount === 0 || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          io.disconnect();
          markHashtagCommentsSeen(activity.id, uid);
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [newCount, activity.id, uid, tab]);

  const friends = useMemo(
    () => posts.filter((p) => p.authorId !== uid && hasHashtagEntries(p)).sort(byStudentId),
    [posts, uid]
  );
  const commentCountBy = useMemo(() => {
    const m = new Map();
    allComments.forEach((c) => m.set(c.postUid, (m.get(c.postUid) ?? 0) + 1));
    return m;
  }, [allComments]);
  const cloud = useMemo(() => hashtagCloud(posts.filter(hasHashtagEntries)), [posts]);
  const friendPost = openFriend ? posts.find((p) => p.authorId === openFriend) ?? null : null;

  return (
    <main className="books-main hashtag-main">
      {/* 폭을 못 박고 가운데로 — 넓은 화면에서 왼쪽에 붙어 오른쪽이 텅
          비었습니다. 폼 한 기둥이라 가운데가 제자리입니다. */}
      <div className="ht-wrap">
      <div className="books-head">
        <div className="books-head-title">
          <h1 className="book-group-title">{activity.title}</h1>
          <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
          {newCount > 0 && tab === "mine" && (
            <button
              type="button"
              className="ht-newc"
              onClick={() => commentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              새 댓글 {newCount}개
            </button>
          )}
        </div>
        <div className="paratext-status">
          <span className="paratext-progress">
            해시태그 {progress.tagged}개 · 완성 {progress.done} / {HASHTAG_COUNT}
          </span>
          {locked ? (
            <span className="paratext-saved locked">
              <IconLock size={14} /> 잠김
            </span>
          ) : (
            status !== "idle" && (
              <span className={`paratext-saved${status === "error" ? " err" : ""}`}>
                {status === "saving" ? "저장 중…" : status === "error" ? "저장하지 못했어요" : "저장됨"}
              </span>
            )
          )}
        </div>
      </div>

      {activity.guide?.trim() && <p className="ht-guide">{activity.guide}</p>}

      {published ? (
        <div className="ht-tabs-row">
        <div className="dash-view-tabs ht-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "mine"}
            className={`dash-view-tab${tab === "mine" ? " on" : ""}`}
            onClick={() => setTab("mine")}
          >
            내 해시태그
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "friends"}
            className={`dash-view-tab${tab === "friends" ? " on" : ""}`}
            onClick={() => { setTab("friends"); setOpenFriend(null); }}
          >
            친구 해시태그 {friends.length}
          </button>
        </div>
        </div>
      ) : (
        <p className="ht-pubnote">친구 해시태그는 선생님이 공개하면 서로 보고 댓글을 달 수 있어요.</p>
      )}

      {locked && (
        <p className="book-locked-note">
          <IconLock size={15} /> 지금은 잠겨 있어 고칠 수 없어요. 쓴 내용은 그대로 남아 있습니다.
        </p>
      )}

      {!loaded ? (
        <p className="empty-note">불러오는 중이에요…</p>
      ) : tab === "friends" ? (
        friendPost ? (
          <div className="ht-friend">
            <button type="button" className="btn-ghost ht-friend-back" onClick={() => setOpenFriend(null)}>
              ← 친구 목록
            </button>
            <HashtagSlide slide={hashtagSlide(friendPost, { writerName: authorLabelOf(friendPost) })} />
            <HashtagComments
              activityId={activity.id}
              postUid={friendPost.authorId}
              comments={allComments.filter((c) => c.postUid === friendPost.authorId)}
              user={user}
              canWrite={published && !locked}
              closedNote={locked ? "활동이 잠겨 댓글을 더 달 수 없어요." : ""}
            />
          </div>
        ) : (
          <div className="ht-friends">
            <section className="ht-cloud">
              <h3>우리 반 해시태그</h3>
              <WordCloud
                words={cloud.words}
                rest={cloud.rest}
                hint={
                  cloud.words.length
                    ? "여러 친구가 함께 고른 해시태그일수록 크게 보여요."
                    : "아직 모인 해시태그가 없어요."
                }
              />
            </section>
            {friends.length === 0 ? (
              <p className="empty-note">아직 볼 수 있는 친구 해시태그가 없어요. 태그를 하나라도 찾은 친구부터 여기에 섭니다.</p>
            ) : (
              <ul className="ht-friend-grid">
                {friends.map((f) => {
                  const pr = hashtagProgress(f);
                  const n = commentCountBy.get(f.authorId) ?? 0;
                  return (
                    <li key={f.authorId}>
                      <button type="button" className="ht-friend-card" onClick={() => setOpenFriend(f.authorId)}>
                        <strong>{authorLabelOf(f) || "이름 없음"}</strong>
                        {hashtagSourceLine(f.source) && (
                          <span className="ht-friend-who">{hashtagSourceLine(f.source)}</span>
                        )}
                        <span className="ht-friend-tags">
                          {normalizeHashtagPost(f).tags.filter((e) => e.tag).slice(0, 4).map((e, i) => (
                            <em key={i}>#{e.tag}</em>
                          ))}
                        </span>
                        <span className="ht-friend-meta">
                          <b className={pr.done === HASHTAG_COUNT ? "full" : ""}>태그 {pr.tagged}개 · 완성 {pr.done}</b>
                          <span>댓글 {n}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )
      ) : (
        <>
          <div className="ht-form">
            {/* ① 내가 찾은 해시태그 — 먼저 목록부터 */}
            <section className="ht-sec">
              <h2 className="ht-sec-title">
                <span>1</span> 내가 찾은 해시태그
                <em>글을 꿰뚫는 낱말을 먼저 모아요 · 최대 {HASHTAG_COUNT}개</em>
                <b className={`ht-sec-count${chips.length >= HASHTAG_COUNT ? " full" : ""}`}>
                  {chips.length} / {HASHTAG_COUNT}
                </b>
              </h2>
              <div className="ht-chips">
                {chips.map((e) => (
                  <span
                    key={e.index}
                    className={`ht-chip${e.index === openAt ? " on" : ""}${
                      isEntryDone(e) && !dup.has(e.index) ? " done" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="ht-chip-go"
                      onClick={() => openEntry(e.index)}
                      title="눌러서 이 해시태그의 원문 · 생각 쓰기"
                    >
                      #{e.tag}
                    </button>
                    {!locked && (
                      <button
                        type="button"
                        className="ht-chip-x"
                        onClick={() => requestRemove(e)}
                        aria-label={`#${e.tag} 빼기`}
                        title="빼기"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {!locked && !full && (
                  <span className="ht-chip-add">
                    <b aria-hidden="true">#</b>
                    <input
                      type="text"
                      value={draft}
                      onChange={(ev) => setDraft(ev.target.value)}
                      onKeyDown={onDraftKey}
                      maxLength={HASHTAG_TAG_MAX * 4}
                      placeholder={chips.length ? "낱말 더하기" : "낱말을 적고 Enter"}
                      aria-label="해시태그 더하기"
                    />
                    <button type="button" onClick={commitDraft} disabled={!draft.trim()}>
                      추가
                    </button>
                  </span>
                )}
              </div>
              {tagMsg ? (
                <em className="ht-warn">{tagMsg}</em>
              ) : (
                !locked && (
                  <p className="ht-chips-hint">
                    {full
                      ? `${HASHTAG_COUNT}개를 모두 찾았어요. 바꾸려면 ×로 하나를 빼세요.`
                      : "띄어쓰기·쉼표로 여러 개를 한꺼번에 넣을 수 있어요. 두 낱말을 한 태그로 하려면 붙여 쓰세요(기후위기)."}
                  </p>
                )
              )}
            </section>

            {/* ② 해시태그별 원문 · 생각 — 펼친 카드 하나만 연다 */}
            <section className="ht-sec">
              <h2 className="ht-sec-title">
                <span>2</span> 해시태그별 원문 · 생각
                <em>그 낱말이 쓰인 원문 문장 · 생각 표현하기</em>
                <b className={`ht-sec-count${progress.done === HASHTAG_COUNT ? " full" : ""}`}>
                  {progress.done} / {HASHTAG_COUNT} 완성
                </b>
              </h2>
              {entries.length === 0 ? (
                <p className="ht-entries-empty">
                  위에서 해시태그를 먼저 찾아 적어 주세요. 태그마다 여기에 카드가 한 장씩 생깁니다.
                </p>
              ) : (
                <ol className="ht-entries">
                  {entries.map((e, n) => {
                    const i = e.index;
                    const done = isEntryDone(e) && !dup.has(i);
                    const dupOf = dup.has(i)
                      ? post.tags.findIndex((x, j) => j < i && tagKey(x.tag) === tagKey(e.tag)) + 1
                      : 0;
                    const quoteMiss = !quoteHasTag(e.tag, e.quote);
                    const open = i === openAt;
                    const state = done ? "완성" : "쓰는 중";
                    const no = String(n + 1).padStart(2, "0");
                    const cls = `ht-entry${done ? " done" : " doing"}${open ? " open" : ""}`;
                    if (!open) {
                      // 접힌 칸 — 번호 · 태그 · 원문 한 줄. 누르면 그 칸만 펼칩니다.
                      return (
                        <li key={i} className={cls}>
                          <button
                            type="button"
                            className="ht-entry-fold"
                            onClick={() => setOpenIdx(i)}
                            aria-expanded="false"
                            title="눌러서 펼치기"
                          >
                            <span className="ht-entry-no">{no}</span>
                            <b className={`ht-fold-tag${e.tag ? "" : " empty"}`}>
                              {e.tag ? `#${e.tag}` : "태그 없음"}
                            </b>
                            <span className="ht-fold-quote">{e.quote.trim() || e.insight.trim()}</span>
                            {(dupOf > 0 || quoteMiss) && (
                              <span className="ht-fold-warn" title="펼쳐서 확인해 주세요">!</span>
                            )}
                            <span className="ht-entry-state">{state}</span>
                            <span className="ht-fold-caret" aria-hidden="true">▾</span>
                          </button>
                        </li>
                      );
                    }
                    return (
                      <li key={i} className={cls} id={`ht-entry-${i}`}>
                        <button
                          type="button"
                          className="ht-entry-head"
                          onClick={() => setOpenIdx(-1)}
                          aria-expanded="true"
                          title="눌러서 접기"
                        >
                          <span className="ht-entry-no">{no}</span>
                          <span className="ht-entry-state">{state}</span>
                          <span className="ht-fold-caret up" aria-hidden="true">▾</span>
                        </button>

                        {/* 태그 — 칩에서 정한 것. 잘못 적었으면 여기서 고칩니다
                            (칩을 빼고 다시 넣으면 쓴 글이 함께 빠지므로). */}
                        <label className="ht-field ht-field--tag">
                          <span className="ht-field-lab">해시태그 <em>고칠 때만</em></span>
                          <span className="ht-tag-input">
                            <b aria-hidden="true">#</b>
                            <input
                              type="text"
                              value={e.tag}
                              disabled={locked}
                              maxLength={HASHTAG_TAG_MAX}
                              onChange={(ev) => setEntry(i, "tag", normalizeTag(ev.target.value))}
                              placeholder="낱말 하나"
                              aria-label={`${n + 1}번 해시태그`}
                            />
                          </span>
                          {dupOf > 0 && (
                            <em className="ht-warn">앞의 카드와 같은 태그예요 — 슬라이드에는 한 번만 실려요.</em>
                          )}
                        </label>

                        <label className="ht-field ht-field--quote">
                          <span className="ht-field-lab">원문 문장 <em>그 낱말이 쓰인 문장을 그대로 옮겨요</em></span>
                          <textarea
                            id={`ht-quote-${i}`}
                            rows={2}
                            value={e.quote}
                            disabled={locked}
                            maxLength={HASHTAG_QUOTE_MAX}
                            onChange={(ev) => setEntry(i, "quote", ev.target.value)}
                            placeholder="“글에서 그대로 옮긴 문장”"
                            aria-label={`${n + 1}번 원문 문장`}
                          />
                          {quoteMiss && (
                            <em className="ht-warn soft">
                              이 문장에 ‘{e.tag}’{iGa(e.tag).slice(e.tag.length)} 보이지 않아요. 태그를 문장 속 낱말과 맞춰 보세요(저장은 돼요).
                            </em>
                          )}
                        </label>

                        <label className="ht-field ht-field--insight">
                          <span className="ht-field-lab">생각 표현하기 <em>해시태그를 활용하여 나의 생각을 표현해 주세요</em></span>
                          <textarea
                            rows={3}
                            value={e.insight}
                            disabled={locked}
                            maxLength={HASHTAG_INSIGHT_MAX}
                            onChange={(ev) => setEntry(i, "insight", ev.target.value)}
                            placeholder="이 해시태그로 떠오른 나의 생각을 적어 보세요."
                            aria-label={`${n + 1}번 생각 표현하기`}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {/* ③ 읽은 글 */}
            <section className="ht-sec">
              <h2 className="ht-sec-title"><span>3</span> 읽은 글 <em>슬라이드 머리에 함께 실립니다</em></h2>
              <div className="book-seg ht-kinds">
                {HASHTAG_SOURCE_KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    className={`book-seg-btn${post.source.kind === k.key ? " active" : ""}`}
                    onClick={() => setSource("kind", k.key)}
                    aria-pressed={post.source.kind === k.key}
                    disabled={locked}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <div className="ht-grid2">
                <label className="ht-lab">
                  <span>제목</span>
                  <input className="ht-input" type="text" value={post.source.title} disabled={locked}
                    onChange={(e) => setSource("title", e.target.value)} maxLength={HASHTAG_FIELD_MAX}
                    placeholder="예: 바다가 뜨거워진다" />
                </label>
                <label className="ht-lab">
                  <span>지은이 · 펴낸 곳</span>
                  <input className="ht-input" type="text" value={post.source.author} disabled={locked}
                    onChange={(e) => setSource("author", e.target.value)} maxLength={HASHTAG_FIELD_MAX}
                    placeholder="예: 김작가 / ○○신문" />
                </label>
                <label className="ht-lab">
                  <span>펴낸 날짜 <em>선택</em></span>
                  <input className="ht-input" type="text" value={post.source.date} disabled={locked}
                    onChange={(e) => setSource("date", e.target.value)} maxLength={40}
                    placeholder="예: 2026-09-20 · 2026년 10월호" />
                </label>
                <label className="ht-lab">
                  <span>주소(URL) <em>선택</em></span>
                  <input className="ht-input" type="text" inputMode="url" value={post.source.url} disabled={locked}
                    onChange={(e) => setSource("url", e.target.value)} maxLength={500}
                    placeholder="예: www.example.com/news/123" />
                  {urlBad && <em className="ht-warn">열 수 없는 주소예요 — http(s)로 시작하는 주소를 넣어 주세요.</em>}
                </label>
              </div>
            </section>

            {/* ④ 대표 이미지 */}
            <section className="ht-sec">
              <h2 className="ht-sec-title"><span>4</span> 대표 이미지 <em>선택 · 슬라이드 오른쪽 위에 실립니다</em></h2>
              <div className="ht-image">
                <div className={`ht-image-box${post.image.url ? " has" : ""}`}>
                  {post.image.url ? (
                    <img src={post.image.url} alt={post.image.caption || "대표 이미지"} />
                  ) : (
                    <span>{imgBusy ? "올리는 중…" : "이미지 없음"}</span>
                  )}
                </div>
                <div className="ht-image-side">
                  <div className="ht-image-btns">
                    <button type="button" className="btn-ghost" disabled={locked || imgBusy} onClick={() => fileRef.current?.click()}>
                      {imgBusy ? "올리는 중…" : post.image.url ? "이미지 바꾸기" : "이미지 넣기"}
                    </button>
                    {post.image.url && (
                      <button type="button" className="btn-ghost qa-delete" disabled={locked || imgBusy} onClick={dropImage}>
                        빼기
                      </button>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      accept={IMAGE_ACCEPT}
                      hidden
                      onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }}
                    />
                  </div>
                  <label className="ht-lab">
                    <span>그림 설명</span>
                    <input className="ht-input" type="text" value={post.image.caption} disabled={locked}
                      onChange={(e) => setImage({ caption: e.target.value })} maxLength={HASHTAG_FIELD_MAX}
                      placeholder="예: 1980년 이후 바다 표면 온도의 변화" />
                  </label>
                  <label className="ht-lab">
                    <span>그림 출처</span>
                    <input className="ht-input" type="text" value={post.image.credit} disabled={locked}
                      onChange={(e) => setImage({ credit: e.target.value })} maxLength={HASHTAG_FIELD_MAX}
                      placeholder="예: 기사 본문 · 직접 그림" />
                  </label>
                  {imgError && <em className="ht-warn">{imgError}</em>}
                </div>
              </div>
            </section>
          </div>

          {/* ⑤ 내 해시태그에 달린 댓글 */}
          <div ref={commentsRef}>
            {(published || myComments.length > 0) && (
              <HashtagComments
                activityId={activity.id}
                postUid={uid}
                comments={myComments}
                user={user}
                ownerUid={uid}
                canWrite={published && !locked && !!meta}
                closedNote={
                  !published
                    ? "선생님이 공개하면 친구들이 댓글을 달 수 있어요."
                    : locked
                    ? "활동이 잠겨 댓글을 더 달 수 없어요."
                    : ""
                }
                highlightAfter={seenSnap === undefined ? null : seenSnap ?? 0}
              />
            )}
          </div>
        </>
      )}
      </div>

      {askRemove && (
        <ConfirmModal
          title={askRemove.tag ? `${eulReul(`#${askRemove.tag}`)} 뺄까요?` : "이 카드를 뺄까요?"}
          preview={(askRemove.quote.trim() || askRemove.insight.trim()).slice(0, 60)}
          description="이 해시태그에 쓴 원문 문장과 생각도 함께 지워집니다."
          confirmLabel="빼기"
          danger
          onConfirm={() => removeEntry(askRemove.index)}
          onClose={() => setAskRemove(null)}
        />
      )}
    </main>
  );
}
