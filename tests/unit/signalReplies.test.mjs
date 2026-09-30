import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  replyMatchesSignal, isSignalReplyUnread, signalReplyTime, SIGNAL_REPLY_MAX,
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

  it("시각 · 길이 천장", () => {
    assert.equal(signalReplyTime({ at: ts(42) }), 42);
    assert.equal(signalReplyTime(null), 0);
    assert.equal(SIGNAL_REPLY_MAX, 1000);
  });
});
