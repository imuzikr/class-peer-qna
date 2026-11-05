// '한 눈에 보기' 통째 방송 꾸러미 — 방송 문서에 실리는 값이라 모양 · 길이 제한을 지킵니다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { OVERVIEW_CAST_KEY, buildOverviewCast, cleanOverviewSections } from "../../lib/overviewCast.js";

test("영역 열쇠는 보드의 영역 열쇠와 겹치지 않습니다", () => {
  assert.equal(OVERVIEW_CAST_KEY, "__overview");
});

test("꾸러미는 mode overview와 모든 영역을 싣습니다", () => {
  const p = buildOverviewCast({
    activityTitle: "KWLS",
    card: { uid: "u1", name: "가나", studentId: "10101", entry: { topic: "숲" } },
    sections: ["k", "w", "l", "s"].map((key) => ({ key, letter: key.toUpperCase(), label: key, fields: [{ label: "", text: key + "글" }] })),
    summary: "4/4",
    gridCols: 4,
  });
  assert.equal(p.mode, "overview");
  assert.equal(p.writerName, "가나");
  assert.equal(p.topic, "숲");
  assert.equal(p.gridCols, 4);
  assert.equal(p.lead, null);
  assert.equal(p.sections.length, 4);
  assert.deepEqual(p.sections[0].fields, [{ label: "", text: "k글" }]);
  assert.ok(!("peers" in p));
});

test("gridCols는 2 또는 4, lead는 글이 있을 때만, peers는 배열일 때만", () => {
  const p = buildOverviewCast({ card: {}, sections: [], gridCols: 3, lead: { text: "" }, peers: [] });
  assert.equal(p.gridCols, 2);
  assert.equal(p.lead, null);
  assert.deepEqual(p.peers, []);
  const q = buildOverviewCast({ card: {}, sections: [], lead: { text: "문장", done: 1 } });
  assert.deepEqual(q.lead, { text: "문장", done: true });
});

test("영역 · 칸 수와 글 길이를 자릅니다(방송 문서 크기)", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    key: "s" + i, columns: 2, wide: 1,
    fields: Array.from({ length: 20 }, () => ({ text: "가".repeat(7000) })),
  }));
  const out = cleanOverviewSections(many);
  assert.equal(out.length, 12);
  assert.equal(out[0].fields.length, 12);
  assert.equal(out[0].fields[0].text.length, 6000);
  assert.equal(out[0].columns, 2);
  assert.equal(out[0].wide, true);
  assert.deepEqual(cleanOverviewSections(null), []);
});
