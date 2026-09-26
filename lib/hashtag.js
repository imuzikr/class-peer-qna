// =============================================================
// 여섯 개의 해시태그 — 한 학생의 기록 모양과 셈 (순수 함수)
// -------------------------------------------------------------
// 학생이 책·기사·잡지·뉴스레터를 읽고, 글을 꿰뚫는 낱말을 해시태그로
// 뽑습니다(최대 여섯 개). **먼저 '내가 찾은 해시태그'를 칩으로 모으고**, 그
// 아래에서 태그마다 **그 낱말이 쓰인 원문 문장**과 **생각 표현하기**(그
// 해시태그를 활용한 나의 생각)를 씁니다. 교사가 '수업 시작'을 누르면 한
// 학생의 것이 슬라이드 한 장으로 학급 화면에 뜹니다.
// (한때 이것을 학술 보고서 모양으로 짜 보여 주고 PDF로 뽑았는데, 선생님이
// 거두셨습니다. 저장 문서의 title·summary 칸은 그때의 흔적입니다 — 이제
// 쓰는 화면이 없지만 지난 기록이 지워지지 않게 모양은 그대로 둡니다.)
//
//   활동 문서   bookActivities/{id}   type 'hashtag' · guide(안내, 선택)
//                                     · published(친구 해시태그 공개 — 교사 단추)
//   학생 기록   bookActivities/{id}/hashtagPosts/{uid}   — 학생 한 명에 한 장
//   댓글        bookActivities/{id}/hashtagComments/{자동 id}
//
// 이 파일은 Firebase를 모릅니다 — 단위 시험(tests/unit/hashtag.test.mjs)이
// 그대로 읽습니다.
// =============================================================
import { cloudWords } from "./wordCloud";

// 한 학생이 찾는 해시태그 수 — 여섯(선생님 결정). 처음에는 '열 개의
// 해시태그'라 열이었습니다.
export const HASHTAG_COUNT = 6;
// 저장 칸의 천장 — 열 개이던 때 적은 기록이 남아 있어 그만큼은 **지우지
// 않고 읽습니다**(규칙의 `tags.size() <= 10`과 같은 값). 새로 더하는 것은
// HASHTAG_COUNT까지만입니다(addTagsTo).
export const HASHTAG_SLOT_MAX = 10;

// 글자 수 천장 — 규칙(firestore.rules의 hashtagPosts·hashtagComments)이
// 문서 크기와 요약·댓글 길이를 같은 값으로 봅니다. 한쪽만 늘리면 화면은
// 받아 주는데 저장이 거부됩니다.
export const HASHTAG_TAG_MAX = 30;
export const HASHTAG_QUOTE_MAX = 600;
export const HASHTAG_INSIGHT_MAX = 600;
export const HASHTAG_SUMMARY_MAX = 5000;
export const HASHTAG_TITLE_MAX = 80;
export const HASHTAG_FIELD_MAX = 120;   // 출처 칸 · 그림 설명 · 그림 출처
export const HASHTAG_URL_MAX = 500;
export const HASHTAG_COMMENT_MAX = 500;
export const HASHTAG_GUIDE_MAX = 200;   // 교사 안내 문구

// 읽은 글의 종류 — 참고문헌 줄의 모양이 여기서 갈립니다(책은 『』, 나머지는 「」).
export const HASHTAG_SOURCE_KINDS = [
  { key: "book", label: "책" },
  { key: "article", label: "기사" },
  { key: "magazine", label: "잡지" },
  { key: "newsletter", label: "뉴스레터" },
  { key: "etc", label: "기타" },
];
const SOURCE_KIND_KEYS = new Set(HASHTAG_SOURCE_KINDS.map((k) => k.key));
export function sourceKindLabel(key) {
  return HASHTAG_SOURCE_KINDS.find((k) => k.key === key)?.label ?? "책";
}

// 댓글의 말머리 — 쓰는 사람이 고릅니다. 무엇을 하려는 댓글인지 먼저 밝히면
// '좋아요' 한 마디만 쌓이지 않고 묻고 제안하는 말이 섞입니다.
export const HASHTAG_COMMENT_KINDS = [
  { key: "like", label: "좋아요", hint: "좋았던 점을 짚어 주세요" },
  { key: "ask", label: "궁금해요", hint: "더 알고 싶은 것을 물어보세요" },
  { key: "suggest", label: "제안합니다", hint: "더 좋아질 방법을 제안해 주세요" },
];
const COMMENT_KIND_KEYS = new Set(HASHTAG_COMMENT_KINDS.map((k) => k.key));
export function commentKindOf(key) {
  return HASHTAG_COMMENT_KINDS.find((k) => k.key === key) ?? HASHTAG_COMMENT_KINDS[0];
}
export function isCommentKind(key) {
  return COMMENT_KIND_KEYS.has(key);
}

const str = (v, max) => String(v ?? "").replace(/\r\n?/g, "\n").slice(0, max);
const line = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// ── 태그 한 개 ────────────────────────────────────────────────
// 앞의 #은 몇 개든 떼고(화면이 늘 하나를 붙여 그립니다), 띄어쓰기는 지웁니다 —
// 해시태그는 한 덩어리 낱말이라 '기후 위기'는 '기후위기'가 됩니다.
// 끝에 붙은 문장부호(쉼표·마침표)도 뗍니다(붙여 넣다 딸려 오기 쉽습니다).
export function normalizeTag(raw) {
  return String(raw ?? "")
    .replace(/^[#＃\s]+/, "")
    .replace(/\s+/g, "")
    .replace(/[#＃]/g, "")
    .replace(/[.,;:!?·、。，]+$/u, "")
    .slice(0, HASHTAG_TAG_MAX);
}

// 같은 태그인지 가리는 열쇠 — 영문 대소문자는 같은 것으로 봅니다(#AI = #ai).
export function tagKey(tag) {
  return normalizeTag(tag).toLowerCase();
}

function emptyEntry() {
  return { tag: "", quote: "", insight: "" };
}

export function emptyHashtagPost() {
  return {
    title: "",
    source: { kind: "book", title: "", author: "", date: "", url: "" },
    image: { url: "", caption: "", credit: "" },
    tags: Array.from({ length: HASHTAG_COUNT }, emptyEntry),
    summary: "",
  };
}

// 저장된 값(또는 옛 값·빈 값)을 늘 같은 모양으로 — 칸은 여섯 개.
// 여섯 칸 뒤까지 글이 든 옛 기록(열 개이던 때)은 그 칸까지 늘려 둡니다 —
// 잘라 내면 다음 저장에서 그 글이 지워집니다. 화면은 이 모양만 믿고 그립니다.
export function normalizeHashtagPost(raw) {
  const r = raw ?? {};
  const s = r.source ?? {};
  const im = r.image ?? {};
  const list = Array.isArray(r.tags) ? r.tags.slice(0, HASHTAG_SLOT_MAX) : [];
  let last = -1;
  list.forEach((e, i) => { if (isEntryStarted(e)) last = i; });
  const slots = Math.max(HASHTAG_COUNT, last + 1);
  return {
    title: str(r.title, HASHTAG_TITLE_MAX),
    source: {
      kind: SOURCE_KIND_KEYS.has(s.kind) ? s.kind : "book",
      title: str(s.title, HASHTAG_FIELD_MAX),
      author: str(s.author, HASHTAG_FIELD_MAX),
      date: str(s.date, 40),
      url: str(s.url, HASHTAG_URL_MAX),
    },
    image: {
      url: typeof im.url === "string" ? im.url : "",
      caption: str(im.caption, HASHTAG_FIELD_MAX),
      credit: str(im.credit, HASHTAG_FIELD_MAX),
    },
    tags: Array.from({ length: slots }, (_, i) => {
      const e = list[i] ?? {};
      return {
        tag: normalizeTag(e.tag),
        quote: str(e.quote, HASHTAG_QUOTE_MAX),
        insight: str(e.insight, HASHTAG_INSIGHT_MAX),
      };
    }),
    summary: str(r.summary, HASHTAG_SUMMARY_MAX),
  };
}

// 저장할 모양 — 앞뒤 공백을 걷고, 그림 주소는 https·data 이미지 주소만
// 남깁니다(다른 학생 화면에 그대로 그려지는 값이라서).
export function hashtagPostForSave(raw) {
  const p = normalizeHashtagPost(raw);
  return {
    title: line(p.title, HASHTAG_TITLE_MAX),
    source: {
      kind: p.source.kind,
      title: line(p.source.title, HASHTAG_FIELD_MAX),
      author: line(p.source.author, HASHTAG_FIELD_MAX),
      date: line(p.source.date, 40),
      url: line(p.source.url, HASHTAG_URL_MAX),
    },
    image: {
      url: safeImageUrl(p.image.url) ?? "",
      caption: line(p.image.caption, HASHTAG_FIELD_MAX),
      credit: line(p.image.credit, HASHTAG_FIELD_MAX),
    },
    tags: p.tags.map((e) => ({
      tag: e.tag,
      quote: e.quote.trim(),
      insight: e.insight.trim(),
    })),
    summary: p.summary.trim(),
  };
}

export function safeImageUrl(raw) {
  const u = String(raw ?? "").trim();
  if (!u) return null;
  if (/^https:\/\//i.test(u)) return u;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(u)) return u;
  return null;
}

// 참고 주소 — http(s)만. 'www.…'처럼 적어도 https를 붙여 엽니다.
export function safeSourceUrl(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// ── 칸 판정 ───────────────────────────────────────────────────
// 앞 칸과 같은 태그를 적은 칸의 번호들. **뒤에 적은 쪽**이 걸립니다 —
// 먼저 적어 둔 칸에 빨간 줄이 생기면 무엇을 고쳐야 할지 헷갈립니다.
export function duplicateTagIndexes(tags) {
  const seen = new Set();
  const dup = new Set();
  (tags ?? []).forEach((e, i) => {
    const k = tagKey(e?.tag);
    if (!k) return;
    if (seen.has(k)) dup.add(i);
    else seen.add(k);
  });
  return dup;
}

// 원문 문장에 그 태그 낱말이 들어 있나. 띄어쓰기와 영문 대소문자는
// 무시합니다('기후위기' 태그 ↔ '기후 위기가' 문장). 둘 중 하나라도 비었으면
// 아직 견줄 것이 없어 '문제없음'으로 봅니다(경고는 둘 다 적었을 때만).
// 저장을 막지는 않습니다 — 경고만 띄웁니다(태그를 원문과 조금 다르게,
// 이를테면 뜻을 묶어 지을 수도 있습니다).
export function quoteHasTag(tag, quote) {
  const t = tagKey(tag).replace(/\s+/g, "");
  const q = String(quote ?? "").toLowerCase().replace(/\s+/g, "");
  if (!t || !q) return true;
  return q.includes(t);
}

// 한 칸이 다 찼나 — 태그 · 원문 문장 · 생각 표현하기 셋 모두.
export function isEntryDone(e) {
  return !!(normalizeTag(e?.tag) && String(e?.quote ?? "").trim() && String(e?.insight ?? "").trim());
}
export function isEntryStarted(e) {
  return !!(normalizeTag(e?.tag) || String(e?.quote ?? "").trim() || String(e?.insight ?? "").trim());
}

// 진행 — '다 찬 칸'을 셉니다(중복 태그 칸은 빼고). 여섯 칸이 목표지만 다
// 못 채워도 공개 대상입니다 — 목록과 폼 머리에 n/6으로 적습니다.
export function hashtagProgress(post) {
  const p = normalizeHashtagPost(post);
  const dup = duplicateTagIndexes(p.tags);
  let done = 0;
  let tagged = 0;
  p.tags.forEach((e, i) => {
    if (dup.has(i)) return;
    if (e.tag) tagged += 1;
    if (isEntryDone(e)) done += 1;
  });
  return {
    done,
    tagged,
    total: HASHTAG_COUNT,
    hasSummary: !!p.summary.trim(),
    hasSource: !!p.source.title.trim(),
    hasImage: !!p.image.url,
    complete: done >= HASHTAG_COUNT,
  };
}

// ── 내가 찾은 해시태그(칩) ────────────────────────────────────
// 학생은 **먼저 태그 목록을 칩으로 모으고**, 그 아래에서 태그마다 원문과
// 생각을 씁니다. 저장 모양은 칸 배열(tags[6])이고 칩 하나가 칸
// 하나입니다 — 규칙도 자료도 안 바뀝니다.
//   · 칩을 더하면 **비어 있는 첫 칸**에 태그가 들어갑니다.
//   · 칩을 빼면 그 칸이 원문·생각째로 빠지고 뒤 칸이 한 칸씩 당겨집니다
//     (빈 칸이 가운데 남으면 다음 칩이 엉뚱한 자리에 들어갑니다).

// 한 번에 여러 개 — '#기후 #바다, 탄소'처럼 붙여 넣어도 낱말마다 칩이 됩니다.
// 그래서 태그 안에는 띄어쓰기를 둘 수 없습니다('기후 위기' → 칩 둘).
// 한 덩어리로 두려면 붙여 씁니다('기후위기').
export function splitTags(raw) {
  return String(raw ?? "")
    .split(/[\s,#＃，、;]+/u)
    .map(normalizeTag)
    .filter(Boolean);
}

// 칩 더하기 — 같은 태그(대소문자 무시)는 막고, 여섯 칸이 차면 넘친 것을
// 돌려줍니다. 화면은 dupes·overflow로 까닭을 적습니다. **세는 것은 글이 든
// 칸 수**입니다 — 열 개이던 때의 옛 기록에 칸 사이 빈자리가 있어도 그리로
// 여섯을 넘겨 들어가지 않게.
export function addTagsTo(tags, raw) {
  const list = normalizeHashtagPost({ tags }).tags;
  const keys = new Set(list.map((e) => tagKey(e.tag)).filter(Boolean));
  const added = [];
  const dupes = [];
  const overflow = [];
  let used = list.filter(isEntryStarted).length;
  splitTags(raw).forEach((tag) => {
    const k = tagKey(tag);
    if (keys.has(k)) { dupes.push(tag); return; }
    const slot = used >= HASHTAG_COUNT ? -1 : list.findIndex((e) => !isEntryStarted(e));
    if (slot < 0) { overflow.push(tag); return; }
    used += 1;
    list[slot] = { ...list[slot], tag };
    keys.add(k);
    added.push(slot);
  });
  return { tags: list, added, dupes, overflow };
}

// 칩 빼기 — 그 칸을 통째로 빼고 뒤 칸을 당깁니다(칸 수는 다시 셈 —
// 늘 여섯 칸 이상).
export function removeTagAt(tags, index) {
  const list = normalizeHashtagPost({ tags }).tags;
  if (!(index >= 0 && index < list.length)) return list;
  return normalizeHashtagPost({ tags: list.filter((_, i) => i !== index) }).tags;
}

// 쓴 칸들 — 칸 번호(index)를 달아 차례대로. 중복 태그 칸은 뺍니다.
// 태그 없이 원문·생각만 적힌 칸(칩이 생기기 전의 옛 기록)도 넣습니다 —
// 빼면 그 글이 화면 어디에도 안 보입니다.
export function hashtagEntries(post) {
  const p = normalizeHashtagPost(post);
  const dup = duplicateTagIndexes(p.tags);
  return p.tags
    .map((e, index) => ({ ...e, index }))
    .filter((e) => isEntryStarted(e) && !dup.has(e.index));
}

// 친구 목록에 오르는 것 — 태그를 하나라도 찾은 학생만. 아무것도 안 쓴 빈
// 카드가 목록을 채우지 않게 합니다(교사 화면은 전원).
export function hasHashtagEntries(post) {
  return hashtagEntries(post).some((e) => e.tag);
}

// ── 슬라이드 한 장 ────────────────────────────────────────────
// 교사가 '수업 시작'을 누르면 **학생 한 명의 것이 슬라이드 한 장**으로
// 학급 화면에 뜹니다. 학생은 남의 기록을 직접 읽을 권한이 없어(공개 전)
// 내용이 방송 문서에 실려 가므로, 여기서 **실어 보낼 모양**을 짓습니다.
// 교사 화면 가운데 · 친구 보기 · 방송 화면이 같은 모양을 그립니다
// (components/HashtagSlide.jsx · 친구 보기는 HashtagInfographic.jsx).
export function hashtagSlide(post, { writerName = "", activityTitle = "" } = {}) {
  const p = normalizeHashtagPost(post);
  return normalizeHashtagSlide({
    activityTitle,
    writerName,
    source: p.source,
    image: p.image,
    entries: hashtagEntries(p),
  });
}

// 방송으로 받은 값(남이 쓴 값)을 그리기 전에 한 번 더 거릅니다 — 길이를
// 자르고 그림 주소는 https·data 이미지만.
export function normalizeHashtagSlide(raw) {
  const r = raw ?? {};
  const s = r.source ?? {};
  const im = r.image ?? {};
  const list = Array.isArray(r.entries) ? r.entries.slice(0, HASHTAG_SLOT_MAX) : [];
  return {
    activityTitle: line(r.activityTitle, 80),
    writerName: line(r.writerName, 60),
    source: {
      kind: SOURCE_KIND_KEYS.has(s.kind) ? s.kind : "book",
      title: line(s.title, HASHTAG_FIELD_MAX),
      author: line(s.author, HASHTAG_FIELD_MAX),
    },
    image: {
      url: safeImageUrl(im.url) ?? "",
      caption: line(im.caption, HASHTAG_FIELD_MAX),
    },
    entries: list.map((e) => ({
      tag: normalizeTag(e?.tag),
      quote: str(e?.quote, HASHTAG_QUOTE_MAX).trim(),
      insight: str(e?.insight, HASHTAG_INSIGHT_MAX).trim(),
    })),
  };
}

// 읽은 글 한 줄 — 책은 『』, 나머지는 「」. 제목이 없으면 빈 문자열.
export function hashtagSourceLine(source) {
  const s = source ?? {};
  const title = line(s.title, HASHTAG_FIELD_MAX);
  if (!title) return "";
  const kind = SOURCE_KIND_KEYS.has(s.kind) ? s.kind : "book";
  const quoted = kind === "book" ? `『${title}』` : `「${title}」 ${sourceKindLabel(kind)}`;
  const author = line(s.author, HASHTAG_FIELD_MAX);
  return author ? `${quoted} · ${author}` : quoted;
}

// 글이 적을수록 크게 — 칠판에 띄우는 화면이라 뒷자리에서 읽혀야 합니다
// (곁텍스트·KWLS 방송의 data-size와 같은 생각). 칸이 여럿이라 그보다 한
// 단계씩 작습니다.
export function hashtagSlideSize(slide) {
  const entries = slide?.entries ?? [];
  const chars = entries.reduce(
    (n, e) => n + String(e.quote ?? "").length + String(e.insight ?? "").length,
    0
  );
  if (entries.length <= 3 && chars <= 300) return "lg";
  if (chars <= 1200) return "md";
  return "sm";
}
// ── 반 전체 ───────────────────────────────────────────────────
// 반의 해시태그 구름 — 학생마다 적은 태그를 모읍니다(한 학생 안의
// 같은 태그는 한 번만). 이미 받아 둔 기록으로만 셉니다.
// 구름의 낱말에는 **#을 안 붙입니다**(선생님 요청) — 낱말마다 같은 글자가
// 앞에 붙으면 크기 차이보다 '#'이 먼저 읽히고, 그만큼 자리도 먹습니다.
// 해시태그 구름이라는 것은 제목이 말합니다.
// 고르고 세우는 셈은 닿소리 구름과 **같은 함수**(cloudWords)를 씁니다.
export function hashtagCloud(posts, n) {
  const byKey = new Map();
  (posts ?? []).forEach((post) => {
    const at = timeOf(post?.createdAt ?? post?.updatedAt);
    const seen = new Set();
    (post?.tags ?? []).forEach((e) => {
      const tag = normalizeTag(e?.tag);
      const k = tag.toLowerCase();
      if (!k || seen.has(k)) return;
      seen.add(k);
      const hit = byKey.get(k);
      if (hit) {
        hit.count += 1;
        if (at < hit.firstAt) hit.firstAt = at;
      } else {
        byKey.set(k, { text: tag, count: 1, firstAt: at, from: [] });
      }
    });
  });
  return cloudWords({ all: [...byKey.values()] }, n);
}

// ── 댓글 ──────────────────────────────────────────────────────
// 내 해시태그에 **남이 단** 댓글 중 마지막으로 본 뒤에 온 것.
// 방금 달린 댓글은 서버 시각이 오기 전 null이라 '지금'으로 셉니다.
export function newCommentCount(comments, ownerUid, seenAt) {
  const seen = seenAt == null ? 0 : timeOf(seenAt);
  return (comments ?? []).filter(
    (c) => c?.authorId !== ownerUid && timeOf(c?.createdAt, Date.now()) > seen
  ).length;
}

// 댓글 이름표 — '30105 홍길동', 선생님은 '선생님'.
export function commentAuthorLabel(c) {
  if (c?.byTeacher) return "선생님";
  const sid = String(c?.studentId ?? "").trim();
  const name = String(c?.authorName ?? "").trim() || "이름 없음";
  return sid ? `${sid} ${name}` : name;
}

export function cleanCommentText(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n").trim().slice(0, HASHTAG_COMMENT_MAX);
}

// 오래된 댓글이 위 — 대화처럼 읽힙니다.
export function sortComments(list) {
  return (list ?? []).slice().sort(
    (a, b) => timeOf(a?.createdAt, Infinity) - timeOf(b?.createdAt, Infinity)
  );
}

export function timeOf(t, fallback = 0) {
  if (t == null) return fallback;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (t instanceof Date) return t.getTime();
  if (typeof t === "number") return t;
  const v = new Date(t).getTime();
  return Number.isFinite(v) ? v : fallback;
}
