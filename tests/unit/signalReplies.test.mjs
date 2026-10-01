import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  replyMatchesSignal, isSignalReplyUnread, signalReplyTime, SIGNAL_REPLY_MAX,
  canFollowUp, isFollowUpSignal,
} from "@/lib/signalReplies";

const ts = (n) => ({ toMillis: () => n });

describe("손들기 답변", () => {
  it("지금 든 손에 대한 답인지 — 손든 시각으로 견줌", () => {
    assert.equal(replyMatchesSignal({ raisedAt: ts(100) }, { createdAt: ts(100) }), true);
    assert.equal(replyMatchesSignal({ raisedAt: ts(100) }, { createdAt: ts(200) }), false);
    assert.equal(replyMatchesSignal({ raisedAt: null }, { createdAt: ts(100) }), false);
    assert.equal(replyMatchesSignal(null, { createdAt: ts(100) }), false);
    // Date(데모 모드)도 같은 셈
    const d = new Date(1000);
    assert.equal(replyMatchesSignal({ raisedAt: d }, { createdAt: new Date(1000) }), true);
  });

  it("안 읽은 답 — seenAt이 없고, 이 기기에서 방금 읽은 답도 아님", () => {
    assert.equal(isSignalReplyUnread({ text: "네", at: ts(5) }), true);
    assert.equal(isSignalReplyUnread({ text: "네", at: ts(5), seenAt: ts(6) }), false);
    assert.equal(isSignalReplyUnread({ text: "네", at: ts(5) }, 5), false);
    // 선생님이 새로 답하면(시각이 바뀜) 다시 켜짐
    assert.equal(isSignalReplyUnread({ text: "다시", at: ts(9) }, 5), true);
    assert.equal(isSignalReplyUnread({ text: "  ", at: ts(5) }), false);
    assert.equal(isSignalReplyUnread(null), false);
  });

  it("다시 질문 — 학생: 오늘 받은 답이고, 손이 없거나 그 답이 지금 손의 것", () => {
    const now = new Date(2026, 9, 1, 10, 0).getTime();
    const r = { text: "네", at: ts(now - 60_000), raisedAt: ts(now - 120_000) };
    assert.equal(canFollowUp(r, null, now), true);
    assert.equal(canFollowUp(r, { createdAt: ts(now - 120_000) }, now), true);
    // 이미 다시 물어 새 손이 올라감 → 그 손을 고치는 쪽
    assert.equal(canFollowUp(r, { createdAt: ts(now - 10_000) }, now), false);
    // 어제 받은 답
    assert.equal(canFollowUp({ ...r, at: ts(now - 86_400_000) }, null, now), false);
    // 서버 시각 전(null)은 방금 온 답
    assert.equal(canFollowUp({ ...r, at: null }, null, now), true);
    assert.equal(canFollowUp({ text: " ", at: ts(now) }, null, now), false);
  });

  it("다시 질문 — 교사: 같은 날 먼저 단 답이 있고 지금 손과 다름", () => {
    const now = new Date(2026, 9, 1, 10, 0).getTime();
    const r = { text: "네", at: ts(now - 60_000), raisedAt: ts(now - 120_000) };
    assert.equal(isFollowUpSignal(r, { createdAt: ts(now - 10_000) }, now), true);
    assert.equal(isFollowUpSignal(r, { createdAt: null }, now), true);
    // 지금 손에 단 답이면 다시 질문이 아님
    assert.equal(isFollowUpSignal(r, { createdAt: ts(now - 120_000) }, now), false);
    // 어제 답 · 답이 손보다 나중(시각이 어긋난 경우)
    assert.equal(isFollowUpSignal({ ...r, at: ts(now - 86_400_000) }, { createdAt: ts(now) }, now), false);
    assert.equal(isFollowUpSignal(r, { createdAt: ts(now - 90_000) }, now), false);
    assert.equal(isFollowUpSignal(null, { createdAt: ts(now) }, now), false);
  });

  it("시각 · 길이 천장", () => {
    assert.equal(signalReplyTime({ at: ts(42) }), 42);
    assert.equal(signalReplyTime(null), 0);
    assert.equal(SIGNAL_REPLY_MAX, 1000);
  });
});
