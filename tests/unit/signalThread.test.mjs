import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  threadEntries, lastTeacherEntry, awaitsTeacher, seenLast, studentLight,
  threadKeyOf, groupHistory, SIGNAL_MESSAGE_MAX,
} from "@/lib/signalThread";

const ts = (n) => ({ toMillis: () => n });
const sig = (extra = {}) => ({ createdAt: ts(100), tag: "ask", note: "3번이 어려워요", threadId: "tA", ...extra });
const msg = (id, from, at, text = id, extra = {}) => ({ id, from, at: at == null ? null : ts(at), text, threadId: "tA", ...extra });

describe("손들기 대화", () => {
  it("줄기 열쇠 — threadId가 있으면 그것, 없으면 손든 시각", () => {
    assert.equal(threadKeyOf(sig()), "tA");
    assert.equal(threadKeyOf({ createdAt: ts(500) }), "t500");
    assert.equal(threadKeyOf({ createdAt: null }), null);
    assert.equal(threadKeyOf(null), null);
  });

  it("손이 있으면 첫 줄은 손들기 문서 · 이력의 첫 물음 줄은 건너뜀 · 시간순 · 서버 시각 전은 맨 뒤", () => {
    const e = threadEntries(sig(), [
      msg("f", "student", 100, "옛 메모", { kind: "first", tag: "ask" }),
      msg("t2", "teacher", 300), msg("s1", "student", 200), msg("p", "student", null), msg("t1", "teacher", 150),
    ]);
    assert.deepEqual(e.map((x) => x.id), ["first", "t1", "s1", "t2", "p"]);
    assert.equal(e[0].text, "3번이 어려워요");
    assert.equal(e[0].tag, "ask");
  });

  it("손이 없으면(닫힌 대화 · 이력) 첫 물음 줄이 첫 줄", () => {
    const e = threadEntries(null, [msg("t", "teacher", 300), msg("f", "student", 100, "", { kind: "first", tag: "bug" })]);
    assert.deepEqual(e.map((x) => x.id), ["f", "t"]);
    assert.equal(e[0].tag, "bug");
    assert.equal(e[0].first, true);
  });

  it("교사가 답을 기다리나 — 마지막 말이 학생", () => {
    assert.equal(awaitsTeacher(threadEntries(sig(), [])), true);
    assert.equal(awaitsTeacher(threadEntries(sig(), [msg("t", "teacher", 200)])), false);
    assert.equal(awaitsTeacher(threadEntries(sig(), [msg("t", "teacher", 200), msg("s", "student", 300)])), true);
    assert.equal(awaitsTeacher([]), false);
  });

  it("마지막 말을 봤나 — 서버 본 시각 · 이 기기에서 방금 본 말", () => {
    const e = threadEntries(sig(), [msg("t", "teacher", 200)]);
    assert.equal(lastTeacherEntry(e).id, "t");
    assert.equal(seenLast(e, null), false);
    assert.equal(seenLast(e, ts(250)), true);
    assert.equal(seenLast(e, ts(150)), false);
    assert.equal(seenLast(e, null, "t"), true);
  });

  it("학생 불 — 창을 열어 보면 빨강·초록 모두 꺼짐 · 새 말이 오면 다시", () => {
    const s = sig();
    // 손을 막 듦 → 빨강, 손바닥을 눌러 보면 꺼짐
    assert.equal(studentLight({ signal: s, entries: threadEntries(s, []) }), "red");
    assert.equal(studentLight({ signal: { ...s, seenAt: ts(120) }, entries: threadEntries(s, []) }), null);
    // 선생님 답 → 초록, 보면 꺼짐(빨강으로 안 돌아감)
    const answered = threadEntries(s, [msg("t", "teacher", 200)]);
    assert.equal(studentLight({ signal: { ...s, seenAt: ts(120) }, entries: answered }), "green");
    assert.equal(studentLight({ signal: { ...s, seenAt: ts(250) }, entries: answered }), null);
    assert.equal(studentLight({ signal: s, entries: answered, seenLocal: "t" }), null);
    // 이어 물음(본 뒤에 새 말) → 빨강
    const again = threadEntries(s, [msg("t", "teacher", 200), msg("s2", "student", 300)]);
    assert.equal(studentLight({ signal: { ...s, seenAt: ts(250) }, entries: again }), "red");
    assert.equal(studentLight({ signal: null, entries: [] }), null);
    // 닫힌 대화
    assert.equal(studentLight({ signal: null, entries: threadEntries(null, [msg("t", "teacher", 200)]), closed: true }), "green");
    assert.equal(studentLight({ signal: null, entries: threadEntries(null, [msg("s", "student", 200)]), closed: true }), null);
    assert.equal(SIGNAL_MESSAGE_MAX, 1000);
  });

  it("이력 — 줄기로 묶어 최근 것부터, 줄기 안은 시간순 · threadId 없는 말은 뺌", () => {
    const h = groupHistory([
      { id: "a1", threadId: "A", kind: "first", from: "student", text: "첫 질문", at: ts(100) },
      { id: "a2", threadId: "A", from: "teacher", text: "답", at: ts(150) },
      { id: "b1", threadId: "B", kind: "first", from: "student", text: "둘째 질문", at: ts(500) },
      { id: "b3", threadId: "B", from: "teacher", text: "둘째 답2", at: ts(700) },
      { id: "b2", threadId: "B", from: "student", text: "또", at: ts(600) },
      { id: "x", from: "student", text: "옛 말", at: ts(50) },
    ]);
    assert.deepEqual(h.map((t) => t.threadId), ["B", "A"]);
    assert.deepEqual(h[0].entries.map((e) => e.id), ["b1", "b2", "b3"]);
    assert.equal(h[1].startAt, 100);
  });
});
