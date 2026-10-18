// 간편 메신저의 순수 셈(lib/messenger.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dmRoom, groupRoom, roomMessages, roomSeenMark, unreadCount, totalUnread,
  buildChatRooms, chatTimeLabel, cleanChatText, chatPlainText, CHAT_TEXT_MAX,
} from "@/lib/messenger";

const at = (ms) => ({ toMillis: () => ms });
const msgs = [
  { id: "a", room: "dm_s1", fromUid: "t", text: "안녕", at: at(1000) },
  { id: "b", room: "dm_s1", fromUid: "s1", text: "네", at: at(2000) },
  { id: "c", room: "dm_s1", fromUid: "t", text: "좋아요", at: at(3000) },
  { id: "d", room: "grp_group_1", fromUid: "s2", text: "모둠", at: at(1500) },
  { id: "e", room: "dm_s1", fromUid: "s1", text: "방금", at: null }, // 서버 시각 전
];

test("방 열쇠는 dm_<학생> · grp_<모둠 id>", () => {
  assert.equal(dmRoom("s1"), "dm_s1");
  assert.equal(groupRoom("group_2"), "grp_group_2");
});

test("한 방의 말은 오래된 것부터, 시각이 아직 없는 말은 맨 끝", () => {
  assert.deepEqual(roomMessages(msgs, "dm_s1").map((m) => m.id), ["a", "b", "c", "e"]);
});

test("'어디까지 봤나'는 서버 시각이 있는 말 가운데 가장 늦은 것", () => {
  assert.equal(roomSeenMark(msgs, "dm_s1"), 3000);
  assert.equal(roomSeenMark(msgs, "grp_none"), 0);
});

test("안 읽은 수는 남이 보낸 말 가운데 표시보다 늦은 것만", () => {
  assert.equal(unreadCount(msgs, "dm_s1", "s1", 0), 2); // a, c
  assert.equal(unreadCount(msgs, "dm_s1", "s1", 1000), 1); // c
  assert.equal(unreadCount(msgs, "dm_s1", "s1", 3000), 0);
  assert.equal(unreadCount(msgs, "dm_s1", "t", 0), 1); // b (시각 없는 e는 안 셈)
  assert.equal(totalUnread(msgs, ["dm_s1", "grp_group_1"], "s1", { dm_s1: 1000 }), 2);
});

test("교사 목록 — 모둠 대화와 학생 대화(명단 차례 그대로)", () => {
  const r = buildChatRooms({
    isTeacher: true,
    myUid: "t",
    groups: [{ id: "group_1", name: "1모둠", memberUids: ["s1", "s2"] }, { name: "id 없음" }],
    roster: [{ uid: "s1", name: "김하늘", studentId: "30301" }, { uid: "s2", name: "이도윤" }],
    messages: msgs,
  });
  assert.deepEqual(r.groups.map((g) => g.room), ["grp_group_1"]);
  assert.equal(r.groups[0].sub, "2명");
  assert.deepEqual(r.people.map((p) => p.room), ["dm_s1", "dm_s2"]);
  assert.equal(r.people[0].unread, 1); // s1이 보낸 b
  assert.equal(r.people[0].last.id, "e");
});

test("교사 목록 — 명단 · 모둠에 없는데 말이 남은 방도 끝에 섭니다", () => {
  const r = buildChatRooms({
    isTeacher: true,
    myUid: "t",
    groups: [],
    roster: [{ uid: "s2", name: "이도윤" }],
    messages: [
      ...msgs,
      { id: "f", room: "dm_s1", fromUid: "s1", fromRole: "student", fromName: "김하늘", text: "x", at: at(4000) },
    ],
  });
  assert.deepEqual(r.people.map((p) => [p.room, p.title]), [["dm_s2", "이도윤"], ["dm_s1", "김하늘"]]);
  assert.deepEqual(r.groups.map((g) => [g.room, g.title]), [["grp_group_1", "지난 모둠"]]);
});

test("학생 목록 — 내 모둠 하나와 선생님", () => {
  const r = buildChatRooms({
    isTeacher: false,
    myUid: "s1",
    groups: [
      { id: "group_1", name: "1모둠", memberUids: ["s1", "s2"] },
      { id: "group_2", name: "2모둠", memberUids: ["s3"] },
    ],
    messages: msgs,
  });
  assert.deepEqual(r.groups.map((g) => g.room), ["grp_group_1"]);
  assert.deepEqual(r.people.map((p) => p.room), ["dm_s1"]);
  assert.equal(r.groups[0].unread, 1);
});

test("시각 글자 — 오늘 · 어제 · 그 전", () => {
  const now = new Date(2026, 9, 18, 15, 0).getTime();
  assert.equal(chatTimeLabel(new Date(2026, 9, 18, 9, 5).getTime(), now), "오전 9:05");
  assert.equal(chatTimeLabel(new Date(2026, 9, 18, 12, 30).getTime(), now), "오후 12:30");
  assert.equal(chatTimeLabel(new Date(2026, 9, 17, 21, 0).getTime(), now), "어제 오후 9:00");
  assert.equal(chatTimeLabel(new Date(2026, 8, 25, 10, 0).getTime(), now), "9월 25일");
  assert.equal(chatTimeLabel(0, now), "");
});

test("보낼 글 — 앞뒤 공백을 걷고 천장에서 자름", () => {
  assert.equal(cleanChatText("  안녕  "), "안녕");
  assert.equal(cleanChatText("   "), "");
  assert.equal(cleanChatText("가".repeat(CHAT_TEXT_MAX + 5)).length, CHAT_TEXT_MAX);
});

test("서식 글에서 글자만 — 태그를 걷고 엔티티를 풀고 공백을 하나로", () => {
  assert.equal(chatPlainText("<div><b>안녕</b> &amp; <i>반가워</i></div><ul><li>하나</li><li>둘</li></ul>"), "안녕 & 반가워 하나 둘");
  assert.equal(chatPlainText("<pre><code>if a &lt; 3:\n    print(a)</code></pre>"), "if a < 3: print(a)");
  assert.equal(chatPlainText("<div><br></div>&nbsp;"), "");
  assert.equal(chatPlainText(null), "");
});

test("인용 — 고른 글을 한 줄로, 한 글자는 무시, 천장에서 '…'", async () => {
  const { chatQuoteText, cleanChatQuote, CHAT_QUOTE_MAX } = await import("@/lib/messenger");
  assert.equal(chatQuoteText("  반복문\n  3번 줄이  "), "반복문 3번 줄이");
  assert.equal(chatQuoteText("가"), "");
  const long = chatQuoteText("가".repeat(CHAT_QUOTE_MAX + 10));
  assert.equal(long.length, CHAT_QUOTE_MAX);
  assert.ok(long.endsWith("…"));
  assert.deepEqual(cleanChatQuote({ id: "m1", name: "김하늘", text: " 안녕 " }), { id: "m1", name: "김하늘", text: "안녕" });
  assert.equal(cleanChatQuote({ id: "", text: "안녕" }), null);
  assert.equal(cleanChatQuote({ id: "m1", text: "x" }), null);
  assert.equal(cleanChatQuote(null), null);
});
