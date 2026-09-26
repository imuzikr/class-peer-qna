// 내 생각은요...(lib/opinion.js) — 영역 손질 · 자리 셈 · 이름표.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OPINION_COLORS,
  canAddOpinionNote,
  opinionNoteMode,
  nextNoteSpot,
  noteAuthorLabel,
  noteStackTime,
  noteTilt,
  normalizeZones,
  opinionColor,
  opinionStats,
  pixelsFromPlace,
  placeFromPixels,
  renameZones,
  zoneOfNote,
  zonesFromNames,
} from "@/lib/opinion";

test("영역은 늘 2~4개 — 모자라면 채우고 넘치면 자릅니다", () => {
  assert.deepEqual(normalizeZones([]).map((z) => z.name), ["A 영역", "B 영역"]);
  assert.equal(normalizeZones(zonesFromNames(["가", "나", "다", "라", "마"])).length, 4);
  assert.deepEqual(zonesFromNames(["찬성", " ", "잘 모르겠음"]).map((z) => [z.key, z.name]), [
    ["z1", "찬성"], ["z2", "B 영역"], ["z3", "잘 모르겠음"],
  ]);
});

test("이름만 고칠 때 key는 그대로 — 붙은 메모가 제 영역에 남습니다", () => {
  const zones = zonesFromNames(["찬성", "반대"]);
  const next = renameZones(zones, ["동의해요", ""]);
  assert.deepEqual(next, [{ key: "z1", name: "동의해요" }, { key: "z2", name: "반대" }]);
});

test("없어진 영역을 가리키는 메모는 첫 영역으로 봅니다", () => {
  const zones = zonesFromNames(["찬성", "반대"]);
  assert.equal(zoneOfNote({ zone: "z2" }, zones), "z2");
  assert.equal(zoneOfNote({ zone: "z9" }, zones), "z1");
});

test("픽셀 ↔ 영역·비율은 서로 거꿀셈 — 가운데가 든 칸이 영역", () => {
  const zones = zonesFromNames(["찬성", "반대", "중립"]);
  const box = { boardW: 900, zoneH: 500, noteW: 180, noteH: 150, zones };
  const place = placeFromPixels({ ...box, px: 360, py: 175 });
  assert.equal(place.zone, "z2"); // 가운데 x=450 → 둘째 칸(300~600)
  const back = pixelsFromPlace({ ...box, ...place });
  assert.equal(Math.round(back.left), 360);
  assert.equal(Math.round(back.top), 175);
  // 경계를 살짝 넘겼어도 가운데가 아직 첫 칸이면 첫 영역
  assert.equal(placeFromPixels({ ...box, px: 200, py: 0 }).zone, "z1");
  // 판 밖으로 끌면 끝에 붙습니다
  const out = placeFromPixels({ ...box, px: 2000, py: -40 });
  assert.deepEqual([out.zone, out.x, out.y], ["z3", 1, 0]);
});

test("새 메모 자리는 계단식이고 늘 0~1", () => {
  const spots = Array.from({ length: 30 }, (_, i) => nextNoteSpot(i));
  assert.ok(spots.every((s) => s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1));
  assert.notDeepEqual(spots[0], spots[1]);
});

test("이름표: 학번 + 이름 · 학번 없으면 이름 · 교사는 '선생님'", () => {
  assert.equal(noteAuthorLabel({ studentId: "30105", authorName: "홍길동" }), "30105 홍길동");
  assert.equal(noteAuthorLabel({ authorName: "홍길동" }), "홍길동");
  assert.equal(noteAuthorLabel({ byTeacher: true, authorName: "선생님" }), "선생님");
});

test("색은 여섯 파스텔 — 모르는 값은 첫 색", () => {
  assert.equal(OPINION_COLORS.length, 6);
  assert.equal(opinionColor("mint").key, "mint");
  assert.equal(opinionColor("neon").key, "butter");
});

test("기울기는 id로 정해져 다시 그려도 같습니다(±2.4°)", () => {
  assert.equal(noteTilt("abc"), noteTilt("abc"));
  for (const id of ["a", "n1", "on12_m", "xYz9"]) assert.ok(Math.abs(noteTilt(id)) <= 2.4);
});

test("겹침 차례: 서버 시각 전(null)은 맨 위", () => {
  assert.equal(noteStackTime({ movedAt: null, createdAt: null }), Infinity);
  assert.equal(noteStackTime({ movedAt: new Date(5) }), 5);
});

test("영역별 메모 수 · 쓴 학생 수(교사 메모는 안 셈)", () => {
  const zones = zonesFromNames(["찬성", "반대"]);
  const { byZone, writers } = opinionStats(
    [
      { zone: "z1", authorId: "a" },
      { zone: "z1", authorId: "a" },
      { zone: "z2", authorId: "b" },
      { zone: "z2", authorId: "t", byTeacher: true },
    ],
    zones
  );
  assert.deepEqual([byZone.get("z1"), byZone.get("z2")], [2, 2]);
  assert.equal(writers.size, 2);
});

test("메모 수 — 표시가 없는 옛 활동은 여러 장, 한 장 모드는 한 장까지", () => {
  assert.equal(opinionNoteMode({}), "multi");
  assert.equal(opinionNoteMode({ noteMode: "single" }), "single");
  assert.equal(canAddOpinionNote({ mode: "single", myCount: 0 }), true);
  assert.equal(canAddOpinionNote({ mode: "single", myCount: 1 }), false);
  // 여러 장 모드에서 바꿔 둘 이상 가진 학생도 더는 못 붙임
  assert.equal(canAddOpinionNote({ mode: "single", myCount: 3 }), false);
  assert.equal(canAddOpinionNote({ mode: "multi", myCount: 5 }), true);
  // 교사는 모드와 상관없이 · 잠기면 학생은 못 붙임
  assert.equal(canAddOpinionNote({ mode: "single", myCount: 1, isTeacher: true }), true);
  assert.equal(canAddOpinionNote({ mode: "multi", myCount: 0, locked: true }), false);
});
