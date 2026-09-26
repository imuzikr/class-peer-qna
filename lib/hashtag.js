// =============================================================
// 열 개의 해시태그 — 보고서 한 장의 모양과 셈 (순수 함수)
// -------------------------------------------------------------
// 학생이 책·기사·잡지·뉴스레터를 읽고, 글을 꿰뚫는 낱말 열 개를 해시태그로
// 뽑습니다. 태그마다 **그 낱말이 쓰인 원문 문장**을 옮겨 적고, **생각
// 표현하기**(그 해시태그를 활용한 나의 생각)를 씁니다. 끝으로 태그를 엮어
// 요약문을 씁니다. 입력한 것은 폼 아래에서 곧바로 학술 보고서 모양으로 짜여 보입니다
// (AI가 쓰는 것이 아니라 정해 둔 틀에 학생 글을 앉히는 것입니다).
//
//   활동 문서   bookActivities/{id}   type 'hashtag' · guide(안내, 선택)
//                                     · published(친구 보고서 공개 — 교사 단추)
//   보고서      bookActivities/{id}/hashtagPosts/{uid}   — 학생 한 명에 한 장
//   댓글        bookActivities/{id}/hashtagComments/{자동 id}
//
// 이 파일은 Firebase를 모릅니다 — 단위 시험(tests/unit/hashtag.test.mjs)이
// 그대로 읽습니다.
// =============================================================
import { cloudWords } from "./wordCloud";
import { eulReul } from "./korean";

export const HASHTAG_COUNT = 10;

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

// 저장된 값(또는 옛 값·빈 값)을 늘 같은 모양으로 — 칸은 언제나 열 개.
// 화면은 이 모양만 믿고 그립니다.
export function normalizeHashtagPost(raw) {
  const r = raw ?? {};
  const s = r.source ?? {};
  const im = r.image ?? {};
  const list = Array.isArray(r.tags) ? r.tags : [];
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
    tags: Array.from({ length: HASHTAG_COUNT }, (_, i) => {
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

// 진행 — '다 찬 칸'을 셉니다(중복 태그 칸은 빼고). 열 칸이 목표지만 다
// 못 채워도 공개 대상입니다 — 목록과 보고서 머리에 n/10으로 적습니다.
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
    complete: done === HASHTAG_COUNT && !!p.summary.trim(),
  };
}

// 보고서 제목 — 학생이 적은 것, 없으면 읽은 글 제목으로 짓습니다
// ('「기후 위기의 시대」를 읽고'). 둘 다 없으면 빈 문자열.
export function hashtagReportTitle(post) {
  const t = line(post?.title, HASHTAG_TITLE_MAX);
  if (t) return t;
  const st = line(post?.source?.title, HASHTAG_FIELD_MAX);
  if (!st) return "";
  const quoted = post?.source?.kind === "book" ? `『${st}』` : `「${st}」`;
  // 조사는 제목의 마지막 글자로 고릅니다(괄호 밖에 붙지만 읽는 소리는 안쪽 글자)
  const josa = eulReul(st).slice(st.length);
  return `${quoted}${josa} 읽고`;
}

// 친구 목록에 오르는 보고서 — 제목(또는 읽은 글 제목)이 있는 것만.
// 아무것도 안 쓴 빈 카드가 목록을 채우지 않게 합니다. 교사 화면은 전원.
export function hasHashtagTitle(post) {
  return !!hashtagReportTitle(post);
}

// 참고문헌 한 줄 — 지은이(펴낸 곳). (날짜). 제목 [종류]. 주소
// 빈 칸은 건너뜁니다. 제목이 없으면 빈 문자열(참고문헌 절을 안 그립니다).
export function hashtagReference(source) {
  const s = source ?? {};
  const title = line(s.title, HASHTAG_FIELD_MAX);
  if (!title) return "";
  const kind = SOURCE_KIND_KEYS.has(s.kind) ? s.kind : "book";
  const parts = [];
  const author = line(s.author, HASHTAG_FIELD_MAX);
  const date = line(s.date, 40);
  if (author) parts.push(`${author}.`);
  if (date) parts.push(`(${date}).`);
  const quoted = kind === "book" ? `『${title}』` : `「${title}」`;
  parts.push(kind === "book" ? `${quoted}.` : `${quoted} [${sourceKindLabel(kind)}].`);
  const url = safeSourceUrl(s.url);
  if (url) parts.push(url);
  return parts.join(" ");
}

// ── 요약문 ────────────────────────────────────────────────────
// 요약에 쓴 태그 — 칸에 적은 태그 중 요약에 (띄어쓰기 무시하고) 나온 것.
export function tagsUsedInSummary(tags, summary) {
  const text = String(summary ?? "").toLowerCase().replace(/\s+/g, "");
  const used = new Set();
  if (!text) return used;
  const dup = duplicateTagIndexes(tags);
  (tags ?? []).forEach((e, i) => {
    if (dup.has(i)) return;
    const k = tagKey(e?.tag);
    if (k && text.includes(k)) used.add(k);
  });
  return used;
}

// 보고서에서 요약의 태그 낱말을 칠하려고 글을 조각으로 나눕니다.
// 띄어쓰기까지 맞아야 칠합니다(요약에 '기후 위기'로 적었으면 그대로는
// 안 칠합니다 — 조각을 나누는 셈이 띄어쓰기를 건너뛰면 글자 자리가
// 어긋나기 쉬워, 그만한 값이 없습니다). 셈은 위 '쓴 태그' 판정보다
// 좁습니다 — 판정은 너그럽게, 칠하기는 확실한 곳만.
// 긴 태그부터 찾습니다('기후' 안의 '기후위기'가 먼저 걸리게).
export function summarySegments(summary, tags) {
  const text = String(summary ?? "");
  const keys = [...new Set((tags ?? []).map((e) => normalizeTag(e?.tag)).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  if (!text || keys.length === 0) return text ? [{ text, tag: false }] : [];
  const lower = text.toLowerCase();
  const lowKeys = keys.map((k) => k.toLowerCase());
  const out = [];
  let i = 0;
  let buf = "";
  while (i < text.length) {
    const hit = lowKeys.find((k) => lower.startsWith(k, i));
    if (hit) {
      if (buf) { out.push({ text: buf, tag: false }); buf = ""; }
      out.push({ text: text.slice(i, i + hit.length), tag: true });
      i += hit.length;
    } else {
      buf += text[i];
      i += 1;
    }
  }
  if (buf) out.push({ text: buf, tag: false });
  return out;
}

// ── 반 전체 ───────────────────────────────────────────────────
// 반의 해시태그 구름 — 보고서마다 적은 태그를 모읍니다(한 보고서 안의
// 같은 태그는 한 번만). 이미 받아 둔 보고서로만 셉니다.
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
        byKey.set(k, { text: `#${tag}`, count: 1, firstAt: at, from: [] });
      }
    });
  });
  return cloudWords({ all: [...byKey.values()] }, n);
}

// ── 댓글 ──────────────────────────────────────────────────────
// 내 보고서에 **남이 단** 댓글 중 마지막으로 본 뒤에 온 것.
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
