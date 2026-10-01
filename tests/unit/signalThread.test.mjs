import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  threadEntries, lastTeacherEntry, awaitsTeacher, unreadByStudent, studentLight,
  SIGNAL_MESSAGE_MAX,
} from "@/lib/signalThread";

const ts = (n) => ({ toMillis: () => n });
const sig = (extra = {}) => ({ createdAt: ts(100), tag: "ask", note: "3번이 어려워요", ...extra });
const msg = (id, from, at, text = id) => ({ id, from, at: at == null ? null : ts(at), text });

describe("손들기 대화", () => {
  it("첫 물음 + 오간 말을 시간순으로, 서버 시각 전은 맨 뒤", () => {
    const e = threadEntries(sig(), [
      msg("t2", "teacher", 300), msg("s1", "student", 200), msg("p", "student", null), msg("t1", "teacher", 150),
    ]);
    assert.deepEqual(e.map((x) => x.id), ["first", "t1", "s1", "t2", "p"]);
    assert.equal(e[0].text, "3번이 어려워요");
    assert.equal(e[0].tag, "ask");
  });

  it("지난 손의 말(손든 시각보다 앞)은 섞지 않음 · 손이 없으면 남은 말만", () => {
    const e = threadEntries(sig({ createdAt: ts(500) }), [msg("old", "teacher", 300), msg("new", "teacher", 600)]);
    assert.deepEqual(e.map((x) => x.id), ["first", "new"]);
    assert.deepEqual(threadEntries(null, [msg("a", "teacher", 300)]).map((x) => x.id), ["a"]);
  });

  it("교사가 답을 기다리나 — 마지막 말이 학생", () => {
    assert.equal(awaitsTeacher(threadEntries(sig(), [])), true);
    assert.equal(awaitsTeacher(threadEntries(sig(), [msg("t", "teacher", 200)])), false);
    assert.equal(awaitsTeacher(threadEntries(sig(), [msg("t", "teacher", 200), msg("s", "student", 300)])), true);
    assert.equal(awaitsTeacher([]), false);
  });

  it("학생이 안 읽었나 — 서버 읽음 시각 · 이 기기에서 방금 읽은 말", () => {
    const e = threadEntries(sig(), [msg("t", "teacher", 200)]);
    assert.equal(lastTeacherEntry(e).id, "t");
    assert.equal(unreadByStudent(e, null), true);
    assert.equal(unreadByStudent(e, ts(250)), false);
    assert.equal(unreadByStudent(e, ts(150)), true); // 읽은 뒤에 새 말
    assert.equal(unreadByStudent(e, null, "t"), false);
    assert.equal(unreadByStudent(threadEntries(sig(), []), null), false);
  });

  it("학생 불 — 안 읽은 답 초록 · 기다림 빨강 · 읽으면 모두 꺼짐 · 닫힌 대화", () => {
    const s = sig();
    assert.equal(studentLight({ signal: s, entries: threadEntries(s, []) }), "red");
    const answered = threadEntries(s, [msg("t", "teacher", 200)]);
    assert.equal(studentLight({ signal: s, entries: answered }), "green");
    assert.equal(studentLight({ signal: { ...s, seenAt: ts(250) }, entries: answered }), null);
    assert.equal(studentLight({ signal: s, entries: answered, seenLocal: "t" }), null);
    const again = threadEntries(s, [msg("t", "teacher", 200), msg("s2", "student", 300)]);
    assert.equal(studentLight({ signal: { ...s, seenAt: ts(250) }, entries: again }), "red");
    assert.equal(studentLight({ signal: null, entries: [] }), null);
    assert.equal(studentLight({ signal: null, entries: threadEntries(null, [msg("t", "teacher", 200)]), closed: true }), "green");
    assert.equal(studentLight({ signal: null, entries: threadEntries(null, [msg("s", "student", 200)]), closed: true }), null);
    assert.equal(SIGNAL_MESSAGE_MAX, 1000);
  });
});
