// lib/의 순수 함수들 — CLAUDE.md에 '이래야 한다'로 적어 둔 규칙을 그대로 시험으로.
// 한 줄 규칙이 문서에만 있으면 고치는 사람이 못 보고 지나갑니다.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

// memoTime(null)이 '지금'을 돌려주는지 보려면 '지금'이 정해져 있어야 합니다.
const NOW = new Date(2026, 8, 25, 10, 0, 0);
mock.timers.enable({ apis: ["Date"], now: NOW });

const { toDate, todayDateKey, formatClockMs, formatStampMs } = await import("@/lib/dates");
const { splitEcho } = await import("@/lib/pyRun");
const { outputTextOf, pyResultHtml } = await import("@/lib/pyShare");
const { cellIndexOfWord } = await import("@/lib/consonants");
const { buildMemoThreads, memoTime } = await import("@/lib/memoThreads");

// ── 날짜 ─────────────────────────────────────────────────────
test("todayDateKey는 두 자리로 채운 YYYY-MM-DD", () => {
  assert.equal(todayDateKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(todayDateKey(), "2026-09-25");
});

test("toDate는 Firestore Timestamp·Date·문자열을 모두 받습니다", () => {
  const d = new Date(2026, 8, 1);
  assert.equal(toDate({ toDate: () => d }), d);
  assert.equal(toDate(d), d);
  assert.equal(toDate("2026-09-01T00:00:00Z").toISOString(), "2026-09-01T00:00:00.000Z");
});

test("밀리초 시각: 세 자리를 손으로 붙이고, 값이 없으면 지어내지 않습니다", () => {
  const d = new Date(2026, 8, 22, 9, 3, 7, 48);
  assert.equal(formatClockMs(d), "09:03:07.048");
  assert.match(formatStampMs(d), /09:03:07\.048$/);
  // serverTimestamp()가 아직 null인 순간 — '지금'의 밀리초를 찍으면 안 됩니다.
  assert.equal(formatClockMs(null), "");
  assert.equal(formatStampMs(undefined), "");
});

// ── 파이썬 실행 결과 ─────────────────────────────────────────
test("splitEcho: 표시가 없는 줄은 그대로, parts 없음", () => {
  assert.deepEqual(splitEcho("skan"), { text: "skan", parts: undefined });
});

test("splitEcho: input()이 찍은 값만 echo 조각으로, 안내 문구는 같은 줄에", () => {
  const { text, parts } = splitEcho("이름: \u0001홍길동\u0002");
  assert.equal(text, "이름: 홍길동");
  assert.deepEqual(parts, [
    { text: "이름: ", echo: false },
    { text: "홍길동", echo: true },
  ]);
});

test("splitEcho: 닫는 표시가 없어도 멈추지 않고 끝까지 입력으로 봅니다", () => {
  assert.equal(splitEcho("\u0001abc").text, "abc");
});

test("outputTextOf: 줄바꿈으로 잇고 안내 줄은 뺍니다", () => {
  // Pyodide는 줄 끝 줄바꿈을 뗀 채 넘깁니다 — 빈 글자로 이으면 한 줄로 뭉개집니다.
  const lines = [
    { type: "info", text: "파이썬을 불러오는 중이에요…" },
    { type: "out", text: "skan" },
    { type: "out", text: "테스트" },
    { type: "err", text: "Traceback" },
  ];
  assert.equal(outputTextOf(lines), "skan\n테스트\nTraceback");
});

test("pyResultHtml: 코드 속 < > &를 이스케이프하고 py-result 표시를 답니다", () => {
  const html = pyResultHtml("a < b & c > d\n");
  assert.match(html, /<pre class="py-result"><code>a &lt; b &amp; c &gt; d<\/code><\/pre>/);
  assert.equal(pyResultHtml("   "), "");
});

// ── 닿소리 칸 고르기 ─────────────────────────────────────────
test("쌍자음은 홑자음 칸, 한글로 시작하지 않으면 -1", () => {
  assert.equal(cellIndexOfWord("까치"), 0); // ㄱ
  assert.equal(cellIndexOfWord("땅"), 2); // ㄷ
  assert.equal(cellIndexOfWord("쓰레기"), 6); // ㅅ
  assert.equal(cellIndexOfWord("짜장"), 8); // ㅈ
  assert.equal(cellIndexOfWord("하늘"), 13); // ㅎ
  assert.equal(cellIndexOfWord("AI"), -1);
  assert.equal(cellIndexOfWord(""), -1);
});

// ── 모둠 메모 스레드 ─────────────────────────────────────────
const m = (id, from, to, t, replyToId = null) => ({
  id, fromUid: from, toUid: to, createdAt: new Date(2026, 8, 25, 9, t), replyToId, read: false,
});

test("답장은 한 스레드로, 목록은 '마지막 글'이 최근인 차례", () => {
  const threads = buildMemoThreads([
    m("a1", "me", "you", 0),
    m("b1", "me", "him", 5),
    m("a2", "you", "me", 10, "a1"), // 어제 시작한 대화에 방금 온 답
  ], "me");
  assert.deepEqual(threads.map((t) => t.id), ["a1", "b1"]);
  assert.deepEqual(threads[0].items.map((x) => x.id), ["a1", "a2"]);
  assert.equal(threads[0].otherUid, "you");
  assert.equal(threads[0].unread, 1);
});

test("가운데 글이 거둬지면 거기서 끊겨 새 뿌리가 됩니다", () => {
  const threads = buildMemoThreads([m("r", "me", "you", 0), m("c", "me", "you", 20, "gone")], "me");
  assert.equal(threads.length, 2);
});

test("고리(서로가 서로의 답장)여도 멈추지 않습니다", () => {
  const threads = buildMemoThreads([m("x", "me", "you", 0, "y"), m("y", "you", "me", 1, "x")], "me");
  assert.equal(threads.reduce((n, t) => n + t.items.length, 0), 2);
});

test("memoTime: 서버 시각이 아직 없으면 0이 아니라 '지금'", () => {
  // 0으로 치면 방금 보낸 메모가 대화 맨 위로 튀었다가 내려앉습니다.
  assert.equal(memoTime(null), NOW.getTime());
});
