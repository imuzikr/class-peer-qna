// 투표 — lib/poll.js의 셈
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPollOptions,
  cleanPicks,
  currentPoll,
  pollAutoOpenMark,
  pollOptionsProblem,
  pollResultsChanged,
  pollRows,
  studentPollLight,
  tallyVotes,
} from "@/lib/poll";

const OPTS = [{ key: "o1", text: "사과" }, { key: "o2", text: "배" }, { key: "o3", text: "감" }];
const single = { id: "p1", kind: "single", options: OPTS, open: true, shared: false };
const multi = { ...single, id: "p2", kind: "multi" };

describe("투표 항목", () => {
  it("빈 칸을 건너뛰고 차례대로 key를 매김", () => {
    assert.deepEqual(buildPollOptions([" 사과 ", "", "배"]), [
      { key: "o1", text: "사과" },
      { key: "o2", text: "배" },
    ]);
  });
  it("둘 미만 · 같은 글이면 막음", () => {
    assert.match(pollOptionsProblem(["사과", ""]), /2개 이상/);
    assert.match(pollOptionsProblem(["사과", " 사과", "배"]), /같은 항목/);
    assert.equal(pollOptionsProblem(["사과", "배"]), null);
  });
});

describe("고르기 · 세기", () => {
  it("하나만 고르기는 첫 하나만, 없는 key는 뺌, 항목 차례대로", () => {
    assert.deepEqual(cleanPicks(single, ["o2", "o1"]), ["o1"]);
    assert.deepEqual(cleanPicks(multi, ["o3", "x", "o1", "o3"]), ["o1", "o3"]);
  });
  it("표를 세고 빈 표 · 명단 밖은 뺌", () => {
    const votes = [
      { uid: "a", picks: ["o1", "o2"] },
      { uid: "b", picks: ["o2"] },
      { uid: "c", picks: [] },
      { uid: "z", picks: ["o3"] },
    ];
    assert.deepEqual(tallyVotes(multi, votes), { counts: { o1: 1, o2: 2, o3: 1 }, voters: 3 });
    assert.deepEqual(tallyVotes(multi, votes, ["a", "b", "c"]), { counts: { o1: 1, o2: 2, o3: 0 }, voters: 2 });
  });
  it("막대 몫은 투표한 사람 가운데 — 여러 개 고르기는 합이 100을 넘을 수 있음", () => {
    const rows = pollRows(multi, { o1: 1, o2: 2, o3: 1 }, 2);
    assert.deepEqual(rows.map((r) => r.pct), [50, 100, 50]);
    assert.deepEqual(rows.map((r) => r.top), [false, true, false]);
    assert.deepEqual(pollRows(single, {}, 0).map((r) => r.pct), [0, 0, 0]);
  });
  it("적어 둔 결과와 다르면 다시 적음", () => {
    const tally = { counts: { o1: 1, o2: 0, o3: 0 }, voters: 1 };
    assert.equal(pollResultsChanged({ ...single, results: {}, voters: 0 }, tally), true);
    assert.equal(pollResultsChanged({ ...single, results: { o1: 1, o2: 0, o3: 0 }, voters: 1 }, tally), false);
  });
});

describe("학생 화면", () => {
  it("지금 투표는 열린 것, 없으면 가장 최근에 공유된 것", () => {
    const polls = [
      { id: "old", open: false, shared: true, createdAt: new Date(1000) },
      { id: "mid", open: false, shared: false, createdAt: new Date(2000) },
    ];
    assert.equal(currentPoll(polls).id, "old");
    assert.equal(currentPoll([...polls, { id: "new", open: true, createdAt: null }]).id, "new");
    assert.equal(currentPoll([]), null);
  });
  it("불 — 안 했으면 빨강, 공유된 결과를 안 봤으면 초록", () => {
    assert.equal(studentPollLight(single, null, new Set()), "red");
    assert.equal(studentPollLight(single, { picks: ["o1"] }, new Set()), null);
    const shared = { ...single, open: false, shared: true };
    assert.equal(studentPollLight(shared, null, new Set()), "green");
    assert.equal(studentPollLight(shared, null, new Set(["p1:shared"])), null);
  });
  it("저절로 열기 — 새 투표 · 새로 공유된 결과에 저마다 한 번", () => {
    assert.equal(pollAutoOpenMark(single, null, new Set()), "p1:open");
    assert.equal(pollAutoOpenMark(single, null, new Set(["p1:open"])), null);
    assert.equal(pollAutoOpenMark(single, { picks: ["o1"] }, new Set()), null);
    const shared = { ...single, shared: true };
    assert.equal(pollAutoOpenMark(shared, { picks: ["o1"] }, new Set()), "p1:shared");
  });
});
