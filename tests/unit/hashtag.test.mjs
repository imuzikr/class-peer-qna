// 열 개의 해시태그(lib/hashtag.js) — 칸 손질 · 중복 · 인용 확인 · 진행 · 칩 · 슬라이드.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HASHTAG_COUNT,
  duplicateTagIndexes,
  hashtagCloud,
  hashtagPostForSave,
  hashtagProgress,
  addTagsTo,
  hasHashtagEntries,
  hashtagEntries,
  hashtagSlide,
  hashtagSlideSize,
  hashtagSourceLine,
  normalizeHashtagSlide,
  removeTagAt,
  newCommentCount,
  normalizeHashtagPost,
  normalizeTag,
  quoteHasTag,
  commentAuthorLabel,
  sortComments,
} from "@/lib/hashtag";

test("태그는 #을 떼고 띄어쓰기·끝 문장부호를 지웁니다", () => {
  assert.equal(normalizeTag("##기후 위기"), "기후위기");
  assert.equal(normalizeTag(" #AI, "), "AI");
  assert.equal(normalizeTag("＃탄소#중립"), "탄소중립");
  assert.equal(normalizeTag(""), "");
});

test("칸은 여섯 개 — 빈 값·옛 값도 같은 모양", () => {
  const p = normalizeHashtagPost(null);
  assert.equal(p.tags.length, HASHTAG_COUNT);
  assert.equal(p.source.kind, "book");
  const q = normalizeHashtagPost({ tags: [{ tag: "#가" }], source: { kind: "이상한값" } });
  assert.equal(q.tags[0].tag, "가");
  assert.equal(q.tags.length, 6);
  assert.equal(q.source.kind, "book");
});

test("중복 태그는 뒤에 적은 칸이 걸립니다(대소문자 무시)", () => {
  const dup = duplicateTagIndexes([{ tag: "AI" }, { tag: "기후" }, { tag: "#ai" }, { tag: "" }, { tag: "기후" }]);
  assert.deepEqual([...dup].sort(), [2, 4]);
});

test("원문 문장에 태그 낱말이 있나 — 띄어쓰기 무시, 빈 칸은 문제없음", () => {
  assert.equal(quoteHasTag("기후위기", "지금은 기후 위기가 심각하다."), true);
  assert.equal(quoteHasTag("탄소", "지구가 뜨거워진다."), false);
  assert.equal(quoteHasTag("", "아무 문장"), true);
  assert.equal(quoteHasTag("탄소", ""), true);
  assert.equal(quoteHasTag("AI", "ai가 바꾼 세상"), true);
});

test("진행 — 태그와 생각이 다 찬 칸만, 중복 칸은 빼고 · 원문은 안 봄", () => {
  const tags = [
    { tag: "가", insight: "알게 됨" },
    { tag: "나", quote: "옛 원문만", insight: "" },
    { tag: "가", insight: "또" },
    { tag: "다", insight: "원문 없이도 완성" },
  ];
  const pr = hashtagProgress({ tags, summary: "" });
  assert.equal(pr.done, 2);
  assert.equal(pr.tagged, 3);
  assert.equal(pr.complete, false);
  const six = Array.from({ length: 6 }, (_, i) => ({ tag: `t${i}`, insight: "생각" }));
  assert.equal(hashtagProgress({ tags: six }).complete, true);
});

test("저장 모양 — 위험한 그림 주소는 걷습니다", () => {
  const s = hashtagPostForSave({ image: { url: "javascript:1" }, title: "  제목  " });
  assert.equal(s.image.url, "");
  assert.equal(s.title, "제목");
  assert.equal(hashtagPostForSave({ image: { url: "https://a/b.jpg" } }).image.url, "https://a/b.jpg");
});

test("칩 더하기 — 붙여 넣은 여러 개 · 같은 태그 막기 · 여섯 칸 넘침", () => {
  const r = addTagsTo([], "#기후위기 #바다, 탄소 #AI");
  assert.deepEqual(r.tags.slice(0, 4).map((e) => e.tag), ["기후위기", "바다", "탄소", "AI"]);
  assert.deepEqual(r.added, [0, 1, 2, 3]);
  const r2 = addTagsTo(r.tags, "ai 바다 산호");
  assert.deepEqual(r2.dupes, ["ai", "바다"]);
  assert.equal(r2.tags[4].tag, "산호");
  const full = addTagsTo([], "a b c d e f g h i j k l");
  assert.equal(full.added.length, 6);
  assert.deepEqual(full.overflow, ["g", "h", "i", "j", "k", "l"]);
});

test("칩 더하기 — 태그 없이 글만 있는 옛 칸은 건너뜁니다", () => {
  const r = addTagsTo([{ tag: "", quote: "옛 문장" }], "새태그");
  assert.equal(r.tags[0].quote, "옛 문장");
  assert.equal(r.tags[0].tag, "");
  assert.equal(r.tags[1].tag, "새태그");
});

test("칩 빼기 — 그 칸이 글째로 빠지고 뒤가 당겨집니다", () => {
  const tags = [
    { tag: "가", quote: "q1", insight: "i1" },
    { tag: "나", quote: "q2", insight: "" },
    { tag: "다" },
  ];
  const out = removeTagAt(tags, 1);
  assert.equal(out.length, 6);
  assert.deepEqual(out.slice(0, 3).map((e) => e.tag), ["가", "다", ""]);
  assert.equal(out[0].quote, "q1");
  assert.equal(removeTagAt(tags, 99).length, 6);
});

test("열 개이던 때의 옛 기록 — 여섯 칸 뒤의 글도 지우지 않고, 더는 못 더함", () => {
  const old = Array.from({ length: 8 }, (_, i) => ({ tag: `t${i}`, quote: `q${i}` }));
  const p = normalizeHashtagPost({ tags: old });
  assert.equal(p.tags.length, 8);
  assert.equal(p.tags[7].quote, "q7");
  const r = addTagsTo(p.tags, "새것");
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.overflow, ["새것"]);
  // 칸 사이에 빈자리가 있어도 여섯을 넘겨 채우지 않습니다
  const gap = [...old.slice(0, 3), {}, ...old.slice(3, 7)];
  assert.deepEqual(addTagsTo(gap, "새것").overflow, ["새것"]);
  // 하나를 빼면 칸이 당겨지고, 여섯 아래로 내려가야 다시 더할 수 있습니다
  const less = removeTagAt(p.tags, 0);
  assert.equal(less.length, 7);
  assert.deepEqual(addTagsTo(less, "새것").overflow, ["새것"]);
  const six = removeTagAt(removeTagAt(less, 0), 0);
  assert.equal(six.length, 6);
  assert.deepEqual(addTagsTo(six, "새것").added, [5]);
});

test("쓴 칸 · 친구 목록 판정", () => {
  const post = { tags: [{ tag: "바다" }, { tag: "" }, { tag: "", quote: "옛 글" }, { tag: "바다", quote: "중복" }] };
  const list = hashtagEntries(post);
  assert.deepEqual(list.map((e) => e.index), [0, 2]);
  assert.equal(hasHashtagEntries(post), true);
  assert.equal(hasHashtagEntries({ tags: [{ quote: "글만" }] }), false);
  assert.equal(hasHashtagEntries({}), false);
});

test("슬라이드 한 장 — 실어 보낼 모양 · 위험한 그림 주소 걷기 · 크기", () => {
  const slide = hashtagSlide(
    {
      source: { kind: "article", title: " 바다의 변화 ", author: "한겨레" },
      image: { url: "javascript:1", caption: "그림" },
      tags: [{ tag: "바다", quote: " 바다가 뜨겁다 ", insight: "걱정된다" }, { tag: "" }],
    },
    { writerName: "30105 홍길동", activityTitle: "해시태그" }
  );
  assert.equal(slide.writerName, "30105 홍길동");
  assert.equal(slide.image.url, "");
  // 원문은 실어 보내지 않습니다(거둔 칸)
  assert.deepEqual(slide.entries, [{ tag: "바다", insight: "걱정된다" }]);
  assert.equal(hashtagSourceLine(slide.source), "「바다의 변화」 기사 · 한겨레");
  assert.equal(hashtagSourceLine({ kind: "book", title: "어린 왕자" }), "『어린 왕자』");
  assert.equal(hashtagSourceLine({ title: "" }), "");
  assert.equal(hashtagSlideSize(slide), "lg");
  assert.equal(hashtagSlideSize({ entries: Array.from({ length: 10 }, () => ({ insight: "가".repeat(200) })) }), "sm");
  assert.equal(hashtagSlideSize({ entries: Array.from({ length: 3 }, () => ({ quote: "가".repeat(600) })) }), "lg");
  // 방송으로 받은 값은 열 칸까지만
  assert.equal(normalizeHashtagSlide({ entries: Array.from({ length: 15 }, () => ({ tag: "x" })) }).entries.length, 10);
});

test("반의 해시태그 구름 — 한 보고서 안의 같은 태그는 한 번", () => {
  const posts = [
    { tags: [{ tag: "기후" }, { tag: "기후" }, { tag: "바다" }], createdAt: 1 },
    { tags: [{ tag: "기후" }], createdAt: 2 },
  ];
  const { words } = hashtagCloud(posts);
  assert.deepEqual(words.map((w) => [w.text, w.count]), [["기후", 2], ["바다", 1]]);
});

test("새 댓글 수 — 남이 단 것 중 본 뒤의 것만", () => {
  const cs = [
    { authorId: "me", createdAt: 50 },
    { authorId: "a", createdAt: 5 },
    { authorId: "b", createdAt: 20 },
    { authorId: "c", createdAt: null },
  ];
  assert.equal(newCommentCount(cs, "me", 10), 2);
  assert.equal(newCommentCount(cs, "me", null), 3);
});

test("댓글 이름표 · 차례", () => {
  assert.equal(commentAuthorLabel({ byTeacher: true, authorName: "x" }), "선생님");
  assert.equal(commentAuthorLabel({ studentId: "30101", authorName: "김하윤" }), "30101 김하윤");
  const s = sortComments([{ id: "b", createdAt: 5 }, { id: "c", createdAt: null }, { id: "a", createdAt: 1 }]);
  assert.deepEqual(s.map((c) => c.id), ["a", "b", "c"]);
});
