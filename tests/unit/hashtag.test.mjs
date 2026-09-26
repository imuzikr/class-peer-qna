// 열 개의 해시태그(lib/hashtag.js) — 칸 손질 · 중복 · 인용 확인 · 진행 · 참고문헌.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HASHTAG_COUNT,
  duplicateTagIndexes,
  hashtagCloud,
  hashtagPostForSave,
  hashtagProgress,
  hashtagReference,
  hashtagReportTitle,
  hasHashtagTitle,
  newCommentCount,
  normalizeHashtagPost,
  normalizeTag,
  quoteHasTag,
  summarySegments,
  tagsUsedInSummary,
  commentAuthorLabel,
  sortComments,
} from "@/lib/hashtag";

test("태그는 #을 떼고 띄어쓰기·끝 문장부호를 지웁니다", () => {
  assert.equal(normalizeTag("##기후 위기"), "기후위기");
  assert.equal(normalizeTag(" #AI, "), "AI");
  assert.equal(normalizeTag("＃탄소#중립"), "탄소중립");
  assert.equal(normalizeTag(""), "");
});

test("칸은 늘 열 개 — 빈 값·옛 값도 같은 모양", () => {
  const p = normalizeHashtagPost(null);
  assert.equal(p.tags.length, HASHTAG_COUNT);
  assert.equal(p.source.kind, "book");
  const q = normalizeHashtagPost({ tags: [{ tag: "#가" }], source: { kind: "이상한값" } });
  assert.equal(q.tags[0].tag, "가");
  assert.equal(q.tags.length, 10);
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

test("진행 — 세 칸이 다 찬 칸만, 중복 칸은 빼고", () => {
  const tags = [
    { tag: "가", quote: "가 문장", insight: "알게 됨" },
    { tag: "나", quote: "나 문장", insight: "" },
    { tag: "가", quote: "가 또", insight: "또" },
  ];
  const pr = hashtagProgress({ tags, summary: "" });
  assert.equal(pr.done, 1);
  assert.equal(pr.tagged, 2);
  assert.equal(pr.complete, false);
});

test("보고서 제목 — 적은 것, 없으면 읽은 글로 짓습니다", () => {
  assert.equal(hashtagReportTitle({ title: "내 보고서" }), "내 보고서");
  assert.equal(hashtagReportTitle({ source: { kind: "book", title: "어린 왕자" } }), "『어린 왕자』를 읽고");
  assert.equal(hashtagReportTitle({ source: { kind: "article", title: "바다의 변화" } }), "「바다의 변화」를 읽고");
  assert.equal(hashtagReportTitle({ source: { kind: "article", title: "탄소 중립" } }), "「탄소 중립」을 읽고");
  assert.equal(hasHashtagTitle({}), false);
  assert.equal(hasHashtagTitle({ source: { title: "  " } }), false);
});

test("참고문헌 한 줄", () => {
  assert.equal(
    hashtagReference({ kind: "book", title: "어린 왕자", author: "생텍쥐페리", date: "2015" }),
    "생텍쥐페리. (2015). 『어린 왕자』."
  );
  assert.equal(
    hashtagReference({ kind: "article", title: "바다", author: "한겨레", url: "www.example.com/a" }),
    "한겨레. 「바다」 [기사]. https://www.example.com/a"
  );
  assert.equal(hashtagReference({ kind: "book", title: "" }), "");
  // 스크립트 주소는 안 붙입니다
  assert.equal(hashtagReference({ kind: "etc", title: "x", url: "javascript:alert(1)" }), "「x」 [기타].");
});

test("저장 모양 — 위험한 그림 주소는 걷습니다", () => {
  const s = hashtagPostForSave({ image: { url: "javascript:1" }, title: "  제목  " });
  assert.equal(s.image.url, "");
  assert.equal(s.title, "제목");
  assert.equal(hashtagPostForSave({ image: { url: "https://a/b.jpg" } }).image.url, "https://a/b.jpg");
});

test("요약에 쓴 태그 · 칠할 조각", () => {
  const tags = [{ tag: "기후위기" }, { tag: "탄소" }, { tag: "바다" }];
  const used = tagsUsedInSummary(tags, "기후 위기로 탄소가 늘었다");
  assert.deepEqual([...used].sort(), ["기후위기", "탄소"]);
  const seg = summarySegments("탄소가 바다로", tags);
  assert.deepEqual(seg, [
    { text: "탄소", tag: true },
    { text: "가 ", tag: false },
    { text: "바다", tag: true },
    { text: "로", tag: false },
  ]);
  assert.deepEqual(summarySegments("", tags), []);
});

test("반의 해시태그 구름 — 한 보고서 안의 같은 태그는 한 번", () => {
  const posts = [
    { tags: [{ tag: "기후" }, { tag: "기후" }, { tag: "바다" }], createdAt: 1 },
    { tags: [{ tag: "기후" }], createdAt: 2 },
  ];
  const { words } = hashtagCloud(posts);
  assert.deepEqual(words.map((w) => [w.text, w.count]), [["#기후", 2], ["#바다", 1]]);
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
