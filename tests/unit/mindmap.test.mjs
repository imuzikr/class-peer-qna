// 마인드맵(lib/mindmap.js) — 노드 이미지와 계층형 배치.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeTreeLayout,
  mindmapImages,
  normalizeMindmap,
  safeNodeImage,
  updateNodeImage,
} from "@/lib/mindmap";

const IMG = "https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg";
const node = (id, parentId, extra = {}) => ({ id, parentId, text: id, edgeLabel: "", ...extra });

test("이미지 주소는 https와 데모의 이미지 data URL만 받습니다", () => {
  assert.equal(safeNodeImage(IMG), IMG);
  assert.equal(safeNodeImage("data:image/jpeg;base64,AAAA"), "data:image/jpeg;base64,AAAA");
  assert.equal(safeNodeImage("javascript:alert(1)"), "");
  assert.equal(safeNodeImage("http://example.com/a.png"), "");
  assert.equal(safeNodeImage("data:text/html;base64,AAAA"), "");
  assert.equal(safeNodeImage(undefined), "");
});

test("옛 기록(이미지 칸 없음)도 그대로 읽히고, 나쁜 주소는 걷힙니다", () => {
  const map = normalizeMindmap({
    nodes: [node("root", null), node("a", "root"), node("b", "root", { image: "javascript:x" })],
  });
  assert.deepEqual(map.nodes.map((n) => n.image), ["", "", ""]);
});

test("이미지 넣기·빼기와, 판에 붙은 이미지 모으기", () => {
  let map = normalizeMindmap({ nodes: [node("root", null), node("a", "root")] });
  map = updateNodeImage(map, "a", IMG);
  assert.deepEqual([...mindmapImages(map)], [IMG]);
  map = updateNodeImage(map, "a", "");
  assert.equal(mindmapImages(map).size, 0);
});

test("계층형: 글자만 있으면 예전과 같은 62px 간격", () => {
  const pos = computeTreeLayout([node("root", null), node("a", "root"), node("b", "root"), node("c", "root")]);
  assert.deepEqual(["a", "b", "c"].map((id) => pos.get(id).y), [-62, 0, 62]);
  assert.equal(pos.get("root").y, 0);
});

test("계층형: 이미지가 든 노드는 그 키만큼 더 띄워 위아래를 덮지 않습니다", () => {
  const pos = computeTreeLayout([
    node("root", null),
    node("a", "root"),
    node("b", "root", { image: IMG }),
    node("c", "root"),
  ]);
  const [a, b, c] = ["a", "b", "c"].map((id) => pos.get(id).y);
  // 글자 노드 높이 40 · 이미지 노드 136 · 틈 22
  assert.equal(b - a, 20 + 22 + 68);
  assert.equal(c - b, 68 + 22 + 20);
});

test("계층형: 이미지가 든 부모가 자식보다 크면 가지를 통째로 내려 앞 가지와 안 겹칩니다", () => {
  const pos = computeTreeLayout([
    node("root", null),
    node("a", "root"),
    node("p", "root", { image: IMG }),
    node("p1", "p"),
  ]);
  const a = pos.get("a").y;
  const p = pos.get("p").y;
  assert.ok(p - 68 >= a + 20 + 22, `부모 위 끝(${p - 68})이 앞 노드 아래 끝+틈(${a + 42})보다 아래`);
  assert.equal(pos.get("p1").y, p); // 자식 하나면 부모와 같은 줄
});
