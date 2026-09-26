"use client";

// =============================================================
// 열 개의 해시태그 — 학생 화면
// -------------------------------------------------------------
// 위에서 아래로 한 줄기입니다:
//   ① 보고서 제목  ② 읽은 글(출처)  ③ 대표 이미지
//   ④ 해시태그 열 칸 — 한 칸에 **입력칸 셋이 따로** 섭니다
//        태그(# 알약) · 원문 문장(인용 상자) · 알 수 있는 것(→ 해설)
//      셋의 바탕·테두리·이름표가 다 달라, 무엇을 어디에 쓰는지 헷갈리지
//      않습니다. 보고서에 실리는 모양(소제목 → 인용 → 해설)과 같은 차례입니다.
//   ⑤ 요약 — 쓴 태그가 칩으로 켜집니다(해시태그 n/10개 사용)
//   ⑥ 보고서 미리보기 — 적는 대로 곧바로 짜여 보입니다(HashtagReport)
//   ⑦ 내 보고서에 달린 댓글
//
// 선생님이 **공개하기**를 누르면 머리에 '내 보고서 / 친구 보고서' 탭이 서고,
// 친구 보고서를 읽고 댓글을 답니다. 공개 전에는 제 것만 보입니다.
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
  HASHTAG_SUMMARY_MAX,
  HASHTAG_TAG_MAX,
  HASHTAG_TITLE_MAX,
  duplicateTagIndexes,
  emptyHashtagPost,
  hashtagCloud,
  hashtagProgress,
  hashtagReportTitle,
  hasHashtagTitle,
  isEntryDone,
  isEntryStarted,
  newCommentCount,
  normalizeHashtagPost,
  normalizeTag,
  quoteHasTag,
  safeSourceUrl,
  tagKey,
  tagsUsedInSummary,
} from "@/lib/hashtag";
import { IMAGE_ACCEPT } from "@/lib/image";
import { iGa } from "@/lib/korean";
import { uploadImage, deleteUploadedFile } from "@/lib/storageUpload";
import { printHashtagReport } from "@/lib/exportHashtag";
import HashtagReport from "./HashtagReport";
import HashtagComments from "./HashtagComments";
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

  // 내 보고서에 달린 댓글 — 공개 전에도 읽습니다(선생님 댓글).
  useEffect(
    () => subscribeHashtagComments(activity.id, setMyComments, { postUid: uid }),
    [activity.id, uid]
  );

  // 친구 보고서 — **공개된 뒤에만** 구독합니다(그 전에는 규칙이 거부).
  useEffect(() => {
    if (!published) { setPosts([]); setAllComments([]); return; }
    const a = subscribeHashtagPosts(activity.id, setPosts);
    const b = subscribeHashtagComments(activity.id, setAllComments);
    return () => { a(); b(); };
  }, [activity.id, published]);

  // 공개를 거두면 친구 탭에서 내 보고서로 돌아옵니다.
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
  const progress = hashtagProgress(post);
  const used = tagsUsedInSummary(post.tags, post.summary);
  const newCount = newCommentCount(myComments, uid, meta?.seenCommentsAt ?? null);
  const autoTitle = hashtagReportTitle({ ...post, title: "" });
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
    () => posts.filter((p) => p.authorId !== uid && hasHashtagTitle(p)).sort(byStudentId),
    [posts, uid]
  );
  const commentCountBy = useMemo(() => {
    const m = new Map();
    allComments.forEach((c) => m.set(c.postUid, (m.get(c.postUid) ?? 0) + 1));
    return m;
  }, [allComments]);
  const cloud = useMemo(() => hashtagCloud(posts.filter(hasHashtagTitle)), [posts]);
  const friendPost = openFriend ? posts.find((p) => p.authorId === openFriend) ?? null : null;
  const myAuthor = authorLabelOf({
    studentId: user?.studentId,
    authorName: user?.realName || user?.displayName,
  });

  return (
    <main className="books-main hashtag-main">
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
            해시태그 {progress.done} / {HASHTAG_COUNT} · 요약 {post.summary.trim().length}자
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
        <div className="dash-view-tabs ht-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "mine"}
            className={`dash-view-tab${tab === "mine" ? " on" : ""}`}
            onClick={() => setTab("mine")}
          >
            내 보고서
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "friends"}
            className={`dash-view-tab${tab === "friends" ? " on" : ""}`}
            onClick={() => { setTab("friends"); setOpenFriend(null); }}
          >
            친구 보고서 {friends.length}
          </button>
        </div>
      ) : (
        <p className="ht-pubnote">친구 보고서는 선생님이 공개하면 서로 보고 댓글을 달 수 있어요.</p>
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
            <HashtagReport post={friendPost} author={authorLabelOf(friendPost)} />
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
              <p className="empty-note">아직 볼 수 있는 친구 보고서가 없어요. 제목을 적은 보고서부터 여기에 섭니다.</p>
            ) : (
              <ul className="ht-friend-grid">
                {friends.map((f) => {
                  const pr = hashtagProgress(f);
                  const n = commentCountBy.get(f.authorId) ?? 0;
                  return (
                    <li key={f.authorId}>
                      <button type="button" className="ht-friend-card" onClick={() => setOpenFriend(f.authorId)}>
                        <strong>{hashtagReportTitle(f)}</strong>
                        <span className="ht-friend-who">{authorLabelOf(f)}</span>
                        <span className="ht-friend-tags">
                          {normalizeHashtagPost(f).tags.filter((e) => e.tag).slice(0, 4).map((e, i) => (
                            <em key={i}>#{e.tag}</em>
                          ))}
                        </span>
                        <span className="ht-friend-meta">
                          <b className={pr.done === HASHTAG_COUNT ? "full" : ""}>해시태그 {pr.done}/{HASHTAG_COUNT}</b>
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
            {/* ① 보고서 제목 */}
            <section className="ht-sec">
              <h2 className="ht-sec-title"><span>1</span> 보고서 제목</h2>
              <input
                className="ht-input ht-title-input"
                type="text"
                value={post.title}
                onChange={(e) => setField("title", e.target.value)}
                maxLength={HASHTAG_TITLE_MAX}
                disabled={locked}
                placeholder={autoTitle ? `비워 두면 ‘${autoTitle}’` : "예: 바다는 왜 뜨거워지는가"}
                aria-label="보고서 제목"
              />
            </section>

            {/* ② 읽은 글 */}
            <section className="ht-sec">
              <h2 className="ht-sec-title"><span>2</span> 읽은 글 <em>보고서 끝의 참고문헌이 여기서 지어집니다</em></h2>
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

            {/* ③ 대표 이미지 */}
            <section className="ht-sec">
              <h2 className="ht-sec-title"><span>3</span> 대표 이미지 <em>선택 · 보고서에 ‘그림 1’로 실립니다</em></h2>
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

            {/* ④ 해시태그 열 칸 */}
            <section className="ht-sec">
              <h2 className="ht-sec-title">
                <span>4</span> 해시태그 열 개
                <em>글을 꿰뚫는 낱말 · 그 낱말이 쓰인 원문 문장 · 그 문장으로 알 수 있는 것</em>
                <b className={`ht-sec-count${progress.done === HASHTAG_COUNT ? " full" : ""}`}>
                  {progress.done} / {HASHTAG_COUNT} 완성
                </b>
              </h2>
              <ol className="ht-entries">
                {post.tags.map((e, i) => {
                  const done = isEntryDone(e) && !dup.has(i);
                  const started = isEntryStarted(e);
                  const dupOf = dup.has(i)
                    ? post.tags.findIndex((x, j) => j < i && tagKey(x.tag) === tagKey(e.tag)) + 1
                    : 0;
                  const quoteMiss = !quoteHasTag(e.tag, e.quote);
                  return (
                    <li key={i} className={`ht-entry${done ? " done" : started ? " doing" : ""}`}>
                      <header className="ht-entry-head">
                        <span className="ht-entry-no">{String(i + 1).padStart(2, "0")}</span>
                        <span className="ht-entry-state">{done ? "완성" : started ? "쓰는 중" : "비어 있음"}</span>
                      </header>

                      <label className="ht-field ht-field--tag">
                        <span className="ht-field-lab">해시태그</span>
                        <span className="ht-tag-input">
                          <b aria-hidden="true">#</b>
                          <input
                            type="text"
                            value={e.tag}
                            disabled={locked}
                            maxLength={HASHTAG_TAG_MAX}
                            onChange={(ev) => setEntry(i, "tag", normalizeTag(ev.target.value))}
                            placeholder="낱말 하나"
                            aria-label={`${i + 1}번 해시태그`}
                          />
                        </span>
                        {dupOf > 0 && (
                          <em className="ht-warn">{dupOf}번과 같은 태그예요 — 보고서에는 한 번만 실려요.</em>
                        )}
                      </label>

                      <label className="ht-field ht-field--quote">
                        <span className="ht-field-lab">원문 문장 <em>그 낱말이 쓰인 문장을 그대로 옮겨요</em></span>
                        <textarea
                          rows={2}
                          value={e.quote}
                          disabled={locked}
                          maxLength={HASHTAG_QUOTE_MAX}
                          onChange={(ev) => setEntry(i, "quote", ev.target.value)}
                          placeholder="“글에서 그대로 옮긴 문장”"
                          aria-label={`${i + 1}번 원문 문장`}
                        />
                        {quoteMiss && (
                          <em className="ht-warn soft">
                            이 문장에 ‘{e.tag}’{iGa(e.tag).slice(e.tag.length)} 보이지 않아요. 태그를 문장 속 낱말과 맞춰 보세요(저장은 돼요).
                          </em>
                        )}
                      </label>

                      <label className="ht-field ht-field--insight">
                        <span className="ht-field-lab">그 문장으로 알 수 있는 것 <em>한두 문장</em></span>
                        <textarea
                          rows={2}
                          value={e.insight}
                          disabled={locked}
                          maxLength={HASHTAG_INSIGHT_MAX}
                          onChange={(ev) => setEntry(i, "insight", ev.target.value)}
                          placeholder="이 문장에서 무엇을 알 수 있나요?"
                          aria-label={`${i + 1}번 알 수 있는 것`}
                        />
                      </label>
                    </li>
                  );
                })}
              </ol>
            </section>

            {/* ⑤ 요약 */}
            <section className="ht-sec">
              <h2 className="ht-sec-title">
                <span>5</span> 요약 <em>해시태그를 엮어 글 전체를 내 말로</em>
                <b className={`ht-sec-count${used.size >= HASHTAG_COUNT ? " full" : ""}`}>
                  해시태그 {used.size}/{HASHTAG_COUNT}개 사용
                </b>
              </h2>
              <div className="ht-used">
                {post.tags.map((e, i) =>
                  e.tag && !dup.has(i) ? (
                    <span key={i} className={`ht-used-chip${used.has(tagKey(e.tag)) ? " on" : ""}`}>
                      #{e.tag}
                    </span>
                  ) : null
                )}
              </div>
              <textarea
                className="ht-summary"
                rows={8}
                value={post.summary}
                disabled={locked}
                maxLength={HASHTAG_SUMMARY_MAX}
                onChange={(e) => setField("summary", e.target.value)}
                placeholder="해시태그 낱말을 넣어 가며 글 전체를 요약해 보세요. 넣은 태그는 위 칩이 켜지고, 보고서에서 칠해집니다."
                aria-label="요약"
              />
            </section>
          </div>

          {/* ⑥ 보고서 미리보기 */}
          <div className="ht-preview-head">
            <h2>보고서 미리보기</h2>
            <span>적는 대로 곧바로 짜입니다</span>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => printHashtagReport(post, { author: myAuthor, activityTitle: activity.title })}
              title="브라우저 인쇄 창에서 ‘PDF로 저장’을 고르세요"
            >
              PDF로 저장
            </button>
          </div>
          <HashtagReport post={{ ...post, updatedAt: meta?.updatedAt }} author={myAuthor} draft />

          {/* ⑦ 내 보고서에 달린 댓글 */}
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
                    ? "선생님이 보고서를 공개하면 친구들이 댓글을 달 수 있어요."
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
    </main>
  );
}
