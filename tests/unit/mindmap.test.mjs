// 마인드맵(lib/mindmap.js) — 노드 이미지와 계층형 배치.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MINDMAP_VERTICAL_GAP,
  computeTreeLayout,
  addChild,
  emptyMindmap,
  getNodeVerticalOffset,
  layoutPositions,
  levelMap,
  mindmapImages,
  mindmapNodeSize,
  moveSubtreeTo,
  normalizeMindmap,
  normalizeVerticalGap,
  safeNodeImage,
  setNodeVerticalOffset,
  settleNodeVerticalPositions,
  updateNodeImage,
  updateNodeText,
  updateVerticalGap,
  withRadialPositions,
} from "@/lib/mindmap";

const IMG = "https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg";
const node = (id, parentId, extra = {}) => ({ id, parentId, text: id, edgeLabel: "", ...extra });

function boxesOf(nodes, positions, nodeSizes) {
  const levels = levelMap(nodes);
  return nodes.map((n) => {
    const p = positions.get(n.id);
    assert.ok(Number.isFinite(p?.x) && Number.isFinite(p?.y), `${n.id} has a finite position`);
    const size = mindmapNodeSize(n, levels.get(n.id), nodeSizes);
    return { id: n.id, left: p.x - size.width / 2, right: p.x + size.width / 2,
      top: p.y - size.height / 2, bottom: p.y + size.height / 2 };
  });
}

function assertDisjoint(nodes, positions, nodeSizes) {
  const boxes = boxesOf(nodes, positions, nodeSizes);
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
        `${a.id} overlaps ${b.id}: ${JSON.stringify([a, b])}`);
    }
  }
}

function freezeMap(map) {
  for (const n of map.nodes) Object.freeze(n);
  Object.freeze(map.nodes);
  return Object.freeze(map);
}

test("세로 끌기는 두 형태의 모든 깊이에서 해당 가지를 정확히 옮기고 나머지 자리는 유지합니다", () => {
  const nodes = [node("root", null, { x: 0, y: 0 }), node("p", "root", { x: 260, y: 0 }),
    node("a", "p", { x: 430, y: 80 }), node("b", "p", { x: 430, y: 190 }),
    node("a1", "a", { x: 600, y: 10 }), node("a2", "a", { x: 600, y: 80 })];
  const cases = [["p", 40, ["p", "a", "b", "a1", "a2"]],
    ["a", -40, ["a", "a1", "a2"]], ["a1", -40, ["a1"]], ["b", 40, ["b"]]];
  for (const layout of ["radial", "tree"]) {
    const map = freezeMap(normalizeMindmap({ layout, nodes }));
    const before = layoutPositions(map);
    for (const [id, delta, moving] of cases) {
      const moved = setNodeVerticalOffset(map, id, delta);
      const after = layoutPositions(moved);
      for (const n of nodes) {
        assert.equal(after.get(n.id).x, before.get(n.id).x, `${layout}: ${n.id} keeps its column`);
        assert.equal(after.get(n.id).y - before.get(n.id).y, moving.includes(n.id) ? delta : 0,
          `${layout}: moving ${id} changes only its branch (${n.id})`);
        if (n.id !== id) assert.equal(moved.nodes.find((next) => next.id === n.id), map.nodes.find((old) => old.id === n.id));
      }
      assertDisjoint(moved.nodes, after);
    }
  }
});

test("하위 가지가 다른 열의 빈 공간으로 이동하면 겹치지 않는 부모와 이웃 가지를 밀지 않습니다", () => {
  const nodes = [node("root", null, { x: 0, y: 0 }),
    node("a", "root", { x: 260, y: 0 }), node("a1", "a", { x: 430, y: 0 }),
    node("b", "root", { x: 260, y: 62 })];
  for (const layout of ["radial", "tree"]) {
    const map = normalizeMindmap({ layout, nodes });
    const before = layoutPositions(map);
    const moved = setNodeVerticalOffset(map, "a1", 60);
    const after = layoutPositions(moved);
    assert.equal(after.get("a1").y, before.get("a1").y + 60);
    assert.equal(after.get("a1").x, before.get("a1").x);
    for (const id of ["root", "a", "b"]) assert.deepEqual(after.get(id), before.get(id));
    assertDisjoint(nodes, after);
  }
});

test("여러 뿌리 사이에도 다른 열의 하위 가지만 이동하면 겹치지 않는 다음 나무는 그대로 둡니다", () => {
  const nodes = [node("root", null, { x: 0, y: 0 }),
    node("a", "root", { x: 260, y: 0 }), node("other", null, { x: 2000, y: 0 })];
  for (const layout of ["radial", "tree"]) {
    const map = normalizeMindmap({ layout, nodes });
    const before = layoutPositions(map);
    const after = layoutPositions(setNodeVerticalOffset(map, "a", 1000));
    assert.equal(after.get("a").y, before.get("a").y + 1000);
    for (const id of ["root", "other"]) assert.deepEqual(after.get(id), before.get(id));
    assertDisjoint(nodes, after);
  }
});

test("조상과 자식의 세로 이동량은 더해지며 확대 배율과 드래그 중간 횟수에 좌우되지 않습니다", () => {
  const nodes = [node("root", null, { x: 0, y: 0 }), node("p", "root", { x: 260, y: 0 }),
    node("a", "p", { x: 430, y: 0 }), node("leaf", "a", { x: 600, y: 0 })];
  for (const layout of ["radial", "tree"]) {
    const map = normalizeMindmap({ layout, nodes });
    const before = layoutPositions(map);
    let moved = setNodeVerticalOffset(map, "p", 80);
    moved = setNodeVerticalOffset(moved, "a", -25);
    moved = setNodeVerticalOffset(moved, "leaf", -12.5);
    const after = layoutPositions(moved);
    for (const [id, delta] of [["root", 0], ["p", 80], ["a", 55], ["leaf", 42.5]]) {
      assert.equal(after.get(id).y - before.get(id).y, delta);
      assert.equal(after.get(id).x, before.get(id).x);
    }
    for (const zoom of [0.5, 1, 1.75, 2]) {
      const startOffset = getNodeVerticalOffset(moved, "leaf");
      const screenDy = 40 * zoom;
      const direct = setNodeVerticalOffset(moved, "leaf", startOffset + screenDy / zoom);
      let intermediate = moved;
      for (const fraction of [0.1, 0.25, 0.5, 1]) {
        intermediate = setNodeVerticalOffset(intermediate, "leaf", startOffset + screenDy * fraction / zoom);
      }
      assert.deepEqual(layoutPositions(intermediate), layoutPositions(direct));
      assert.equal(layoutPositions(direct).get("leaf").y - after.get("leaf").y, 40);
    }
    if (layout === "tree") assert.deepEqual(computeTreeLayout(moved.nodes), after);
  }
});

test("큰 옛 세로 여백도 한 쌍씩 12px까지 줄이고 겹칠 때만 이웃을 밀며 위아래 순서를 바꿀 수 있습니다", () => {
  for (const layout of ["radial", "tree"]) {
    for (const deep of [false, true]) {
      const parentId = deep ? "p" : "root";
      const nodes = [node("root", null, { x: 0, y: 0 }),
        ...(deep ? [node("p", "root", { x: 260, y: 0 })] : []),
        node("a", parentId, { x: 440, y: 0 }), node("b", parentId, { x: 440, y: 0 })];
      const map = normalizeMindmap({ layout, verticalGap: 72, nodes });
      const before = layoutPositions(map);
      assert.equal(before.get("b").y - before.get("a").y, 42 + 72);
      const tightened = setNodeVerticalOffset(map, "a", 60);
      const tightPositions = layoutPositions(tightened);
      assert.equal(tightPositions.get("a").y - before.get("a").y, 60);
      assert.equal(tightPositions.get("b").y, before.get("b").y);
      assert.equal(tightPositions.get("b").y - tightPositions.get("a").y, 42 + 12);
      assert.equal(tightened.verticalGap, 72);
      const collision = setNodeVerticalOffset(map, "a", 80);
      const collisionPositions = layoutPositions(collision);
      assert.equal(collisionPositions.get("b").y - collisionPositions.get("a").y, 42 + 12);
      assertDisjoint(nodes, collisionPositions);
      const crossed = setNodeVerticalOffset(map, "a", 200);
      const crossedPositions = layoutPositions(crossed);
      assert.equal(crossedPositions.get("a").y - before.get("a").y, 200);
      assert.equal(crossedPositions.get("b").y, before.get("b").y);
      assert.ok(crossedPositions.get("a").y > crossedPositions.get("b").y);
      assert.equal(crossedPositions.get("a").x, crossedPositions.get("b").x);
      assertDisjoint(nodes, crossedPositions);
      assert.deepEqual(layoutPositions(setNodeVerticalOffset(tightened, "a", 0)), before);
    }
  }
});

test("충돌 보정 뒤 손을 놓으면 다음 끌기는 보이는 자리에서 즉시 움직이고 다른 형태와 원문은 그대로입니다", () => {
  const nodeSizes = new Map([["root", { width: 100, height: 48 }],
    ["a", { width: 100, height: 42 }], ["b", { width: 100, height: 42 }]]);
  for (const layout of ["radial", "tree"]) {
    const field = layout === "tree" ? "treeOffsetY" : "radialOffsetY";
    const other = layout === "tree" ? "radialOffsetY" : "treeOffsetY";
    const map = freezeMap(normalizeMindmap({ layout, verticalGap: 20, nodes: [
      node("root", null, { x: 0, y: 0, image: IMG }),
      node("a", "root", { x: 260, y: 0, text: "내  생각", edgeLabel: "관계", [other]: 37 }),
      node("b", "root", { x: 260, y: 0, text: "다른  생각", [other]: -14 }),
    ] }));
    // 아래 노드를 위로 끌어 최소 간격에 막힌 뒤 아래로 다시 끕니다.
    const collision = setNodeVerticalOffset(map, "b", -20);
    const actual = layoutPositions(collision, { nodeSizes });
    const settled = settleNodeVerticalPositions(collision, { nodeSizes });
    assert.deepEqual(layoutPositions(settled, { nodeSizes }), actual);
    assert.equal(getNodeVerticalOffset(settled, "b"), -8);
    assert.equal(settleNodeVerticalPositions(settled, { nodeSizes }), settled);
    const next = setNodeVerticalOffset(settled, "b", getNodeVerticalOffset(settled, "b") + 5);
    const nextPositions = layoutPositions(next, { nodeSizes });
    assert.equal(nextPositions.get("b").y, actual.get("b").y + 5);
    assert.deepEqual(nextPositions.get("a"), actual.get("a"));
    assert.deepEqual(layoutPositions(setNodeVerticalOffset(next, "b", getNodeVerticalOffset(next, "b") - 5), { nodeSizes }), actual);
    assert.equal(settled.nodes[0], collision.nodes[0]);
    assert.equal(settled.nodes[1], collision.nodes[1]);
    for (let i = 0; i < settled.nodes.length; i += 1) {
      assert.deepEqual({ ...settled.nodes[i], [field]: collision.nodes[i][field] }, collision.nodes[i]);
    }
    // 위 노드를 아래로 끌어 이웃이 밀렸을 때도 그 이웃의 보이는 자리를 저장합니다.
    const peerCollision = setNodeVerticalOffset(map, "a", 20);
    const peerActual = layoutPositions(peerCollision, { nodeSizes });
    const peerSettled = settleNodeVerticalPositions(peerCollision, { nodeSizes });
    assert.deepEqual(layoutPositions(peerSettled, { nodeSizes }), peerActual);
    assert.equal(getNodeVerticalOffset(peerSettled, "b"), 12);
    for (const [id, delta] of [["a", -5], ["b", 5]]) {
      const moved = setNodeVerticalOffset(peerSettled, id, getNodeVerticalOffset(peerSettled, id) + delta);
      const positions = layoutPositions(moved, { nodeSizes });
      assert.equal(positions.get(id).y, peerActual.get(id).y + delta);
      const peer = id === "a" ? "b" : "a";
      assert.deepEqual(positions.get(peer), peerActual.get(peer));
    }
    assert.deepEqual(normalizeMindmap(JSON.parse(JSON.stringify(peerSettled))), peerSettled);
  }
});

test("세로 위치 확정은 끊어진 부모·순환 관계·큰 이동 값에서도 화면을 바꾸지 않습니다", () => {
  for (const layout of ["radial", "tree"]) {
    const field = layout === "tree" ? "treeOffsetY" : "radialOffsetY";
    const map = normalizeMindmap({ layout, nodes: [node("root", null, { x: 0, y: 0 }),
      node("a", "root", { x: 260, y: 0, [field]: 68 }),
      node("other", null, { x: 260, y: 0 }), node("orphan", "missing", { [field]: NaN }),
      node("cycle-a", "cycle-b", { [field]: 1e308 }), node("cycle-b", "cycle-a", { [field]: -40 })] });
    const before = layoutPositions(map);
    const settled = settleNodeVerticalPositions(map);
    assert.deepEqual(layoutPositions(settled), before);
    assertDisjoint(settled.nodes, before);
    for (const n of settled.nodes) assert.ok(Number.isFinite(n[field]));
  }
});

test("각 형태의 세로 이동만 해당 노드에 저장하고 다시 열어도 원문·그림·관계·자리를 보존합니다", () => {
  const map = freezeMap(normalizeMindmap({ layout: "radial", verticalGap: 72, nodes: [
    node("root", null, { x: 90, y: 40, text: "우리의 주제" }),
    node("a", "root", { x: 330, y: 80, text: "내 생각에  어떤 편향이 있었을까", image: IMG, edgeLabel: "내가 적은 관계" }),
    node("b", "a", { x: 500, y: 190, text: "또 다른  생각" }),
  ] }));
  const radial = setNodeVerticalOffset(map, "a", 37.5);
  assert.deepEqual(radial.nodes[1], { ...map.nodes[1], radialOffsetY: 37.5 });
  assert.equal(radial.nodes[0], map.nodes[0]);
  assert.equal(radial.nodes[2], map.nodes[2]);
  const edited = setNodeVerticalOffset({ ...radial, layout: "tree" }, "a", -63.25);
  assert.equal(getNodeVerticalOffset(edited, "a"), -63.25);
  assert.equal(getNodeVerticalOffset({ ...edited, layout: "radial" }, edited.nodes[1]), 37.5);
  const restored = normalizeMindmap(JSON.parse(JSON.stringify(edited)));
  assert.deepEqual(restored, edited);
  for (const layout of ["radial", "tree"]) {
    assert.deepEqual(layoutPositions({ ...restored, layout }), layoutPositions({ ...edited, layout }));
    assertDisjoint(restored.nodes, layoutPositions({ ...restored, layout }));
  }
  assert.equal(setNodeVerticalOffset(map, "missing", 40), map);
  assert.equal(setNodeVerticalOffset(map, "root", 40), map);
  assert.equal(map.nodes[1].radialOffsetY, 0);
});

test("방사형의 좌우 가지는 독립적으로 움직이고 큰 글·그림이 있는 하위 가지도 충돌을 피합니다", () => {
  const nodes = [node("root", null, { x: 0, y: 0 }),
    node("right", "root", { x: 260, y: 0 }), node("left", "root", { x: -260, y: 0 }),
    node("a", "right", { x: 430, y: 0, image: IMG }), node("b", "right", { x: 430, y: 100 }),
    node("a1", "a", { x: 600, y: 0, text: "친구의 생각을 듣고 새로 알게 된 것을 함께 나누어요 ".repeat(4) }),
    node("a2", "a", { x: 600, y: 100 }), node("left1", "left", { x: -430, y: 0, image: IMG })];
  const nodeSizes = new Map([["a1", { width: 168, height: 270 }], ["b", { width: 168, height: 320 }]]);
  const map = normalizeMindmap({ layout: "radial", nodes });
  const before = layoutPositions(map, { nodeSizes });
  const moved = setNodeVerticalOffset(map, "right", 40);
  const after = layoutPositions(moved, { nodeSizes });
  for (const id of ["root", "left", "left1"]) assert.deepEqual(after.get(id), before.get(id));
  for (const id of ["right", "a", "b", "a1", "a2"]) {
    assert.equal(after.get(id).y - before.get(id).y, 40);
    assert.equal(after.get(id).x, before.get(id).x);
  }
  for (const layout of ["radial", "tree"]) {
    let colliding = { ...map, layout };
    colliding = setNodeVerticalOffset(colliding, "a", 80);
    colliding = setNodeVerticalOffset(colliding, "a1", 160);
    colliding = setNodeVerticalOffset(colliding, "b", -110);
    assertDisjoint(nodes, layoutPositions(colliding, { nodeSizes }), nodeSizes);
  }
});

test("오래된 하위 y 좌표의 큰 간격은 되살리지 않으며 새 세로 이동은 연속적으로 반영합니다", () => {
  const nodes = [node("root", null, { x: 0, y: 0 }), node("p", "root", { x: 260, y: 0 }),
    node("a", "p", { x: 330, y: -10000 }), node("b", "p", { x: 330, y: 10000 })];
  for (const layout of ["radial", "tree"]) {
    const map = normalizeMindmap({ layout, nodes });
    const before = layoutPositions(map);
    assert.equal(before.get("b").y - before.get("a").y, 62);
    for (const delta of [-0.25, -10, -40]) {
      const after = layoutPositions(setNodeVerticalOffset(map, "a", delta));
      assert.equal(after.get("a").y - before.get("a").y, delta);
      assert.deepEqual(after.get("b"), before.get("b"));
      assertDisjoint(nodes, after);
    }
  }
});

test("좌표 없는 옛 기록에 방사형 기준점을 채워도 저장한 세로 이동을 두 번 적용하지 않습니다", () => {
  const map = normalizeMindmap({ layout: "tree", nodes: [node("root", null),
    node("p", "root", { radialOffsetY: 40 }), node("a", "p", { radialOffsetY: -25 }), node("b", "p")] });
  const radial = { ...map, layout: "radial" };
  const before = layoutPositions(radial);
  const repaired = withRadialPositions(radial);
  assert.deepEqual(layoutPositions(repaired), before);
  assert.equal(getNodeVerticalOffset(repaired, "p"), 40);
  assert.equal(getNodeVerticalOffset(repaired, "a"), -25);
  assert.equal(withRadialPositions(repaired), repaired);
});

test("없거나 잘못된 세로 이동 값과 끊어진 옛 기록도 유한한 자리에 안전하게 그립니다", () => {
  for (const invalid of [undefined, null, NaN, Infinity, -Infinity, "40", true, {}, []]) {
    const map = normalizeMindmap({ nodes: [node("root", null),
      node("a", "root", { radialOffsetY: invalid, treeOffsetY: invalid })] });
    assert.equal(getNodeVerticalOffset(map, "a"), 0);
    assert.equal(getNodeVerticalOffset({ ...map, layout: "tree" }, "a"), 0);
    assert.equal(getNodeVerticalOffset(map, "missing"), 0);
    assert.equal(setNodeVerticalOffset(map, "a", invalid).nodes[1].radialOffsetY, 0);
  }
  for (const layout of ["radial", "tree"]) {
    const map = normalizeMindmap({ layout, nodes: [node("root", null), node("a", "root", { radialOffsetY: 1e308, treeOffsetY: 1e308 }),
      node("a1", "a", { radialOffsetY: 1e308, treeOffsetY: 1e308 }), node("orphan", "missing"),
      node("cycle-a", "cycle-b", { radialOffsetY: -90, treeOffsetY: -90 }), node("cycle-b", "cycle-a")] });
    assertDisjoint(map.nodes, layoutPositions(map));
  }
});

test("세로 간격은 숫자만 받아 범위 안에 두고, 옛 기록은 기본 20px로 읽습니다", () => {
  assert.deepEqual(MINDMAP_VERTICAL_GAP, { min: 12, max: 120, default: 20, step: 4 });
  for (const invalid of [undefined, null, NaN, Infinity, -Infinity, "64", "", true, {}, []]) {
    assert.equal(normalizeVerticalGap(invalid), 20);
    assert.equal(normalizeMindmap({ verticalGap: invalid }).verticalGap, 20);
  }
  for (const [raw, expected] of [[-50, 12], [0, 12], [12, 12], [37.5, 37.5], [120, 120], [500, 120]]) {
    assert.equal(normalizeVerticalGap(raw), expected);
    assert.equal(normalizeMindmap({ verticalGap: raw }).verticalGap, expected);
  }
  assert.equal(emptyMindmap("주제").verticalGap, 20);
  assert.equal(emptyMindmap("주제", 84).verticalGap, 84);
  assert.equal(emptyMindmap("주제", Infinity).verticalGap, 20);
  assert.equal(normalizeMindmap({ verticalGap: 84, nodes: [] }).verticalGap, 84);
  assert.equal(normalizeMindmap({ nodes: [node("root", null)] }).verticalGap, 20);
});

test("세로 간격만 고쳐 저장하고 다시 읽어도 원문·좌표·노드 순서는 그대로입니다", () => {
  const text = "내 생각에  어떤 편향이 있었을까";
  const map = freezeMap(normalizeMindmap({ layout: "radial", verticalGap: 20, nodes: [
    node("root", null, { x: 90, y: 40 }),
    node("a", "root", { x: 330, y: 80, text, image: IMG, edgeLabel: "관계" }),
    node("b", "a", { x: 410, y: 190, text: "또 다른 생각" }),
  ] }));
  const before = JSON.stringify(map);
  const spaced = updateVerticalGap(map, 84);
  assert.equal(spaced.verticalGap, 84);
  assert.equal(spaced.nodes, map.nodes);
  assert.deepEqual(spaced, { ...map, verticalGap: 84 });
  const edited = updateNodeText(spaced, "b", text);
  const restored = normalizeMindmap(JSON.parse(JSON.stringify(edited)));
  assert.deepEqual(restored, edited);
  assert.equal(restored.nodes.find((n) => n.id === "a").text, text);
  assert.equal(restored.nodes.find((n) => n.id === "b").text, text);
  for (const layout of ["radial", "tree"]) {
    assertDisjoint(restored.nodes, layoutPositions({ ...restored, layout }));
  }
  assert.equal(addChild(restored, "a", "새 가지").verticalGap, 84);
  assert.equal(updateNodeImage(restored, "b", IMG).verticalGap, 84);
  assert.equal(moveSubtreeTo(restored, "a", 340, 100).verticalGap, 84);
  assert.equal(withRadialPositions(restored).verticalGap, 84);
  assert.equal(updateVerticalGap(map, 900).verticalGap, 120);
  assert.equal(updateVerticalGap(map, "84").verticalGap, 20);
  assert.equal(JSON.stringify(map), before);
});

test("세로 간격 기본값은 두 형태의 기존 배치를 유지하며 rowGap 호출도 보존합니다", () => {
  const nodes = [node("root", null, { x: 0, y: 0 }),
    node("a", "root", { x: 240, y: 0 }), node("b", "root", { x: 240, y: 0 })];
  for (const layout of ["radial", "tree"]) {
    assert.deepEqual(layoutPositions({ layout, nodes, verticalGap: 20 }), layoutPositions({ layout, nodes }));
  }
  const radial = layoutPositions({ layout: "radial", nodes });
  assert.deepEqual([...radial], [["root", { x: 0, y: 0 }], ["a", { x: 240, y: -31 }], ["b", { x: 240, y: 31 }]]);
  assert.equal(computeTreeLayout(nodes, { rowGap: 102 }).get("b").y - computeTreeLayout(nodes, { rowGap: 102 }).get("a").y, 102);
  const explicit = computeTreeLayout(nodes, { rowGap: 102, verticalGap: 44 });
  assert.equal(explicit.get("b").y - explicit.get("a").y, 42 + 44);
  assert.deepEqual(computeTreeLayout(nodes, { verticalGap: 20 }), computeTreeLayout(nodes));
});

test("두 형태 모두 큰 세로 간격을 첫 가지·다층 형제의 실제 테두리 사이에 적용합니다", () => {
  const nodes = [
    node("root", null, { x: 0, y: 0 }),
    node("a", "root", { x: 260, y: 0, image: IMG }),
    node("b", "root", { x: 260, y: 0, text: "다른 사람의 생각을 듣고 함께 읽으며 배운 점을 나누어요 ".repeat(3) }),
    node("a1", "a", { x: 330, y: 0, image: IMG }), node("a2", "a", { x: 330, y: 0 }),
    node("b1", "b", { x: 330, y: 0 }), node("b2", "b", { x: 330, y: 0, image: IMG }),
    node("a11", "a1", { x: 400, y: 0, image: IMG }), node("a12", "a1", { x: 400, y: 0 }),
  ];
  const nodeSizes = new Map([["a1", { width: 168, height: 270 }], ["b2", { width: 168, height: 320 }]]);
  const levels = levelMap(nodes);
  for (const layout of ["radial", "tree"]) {
    const minGaps = [];
    for (const verticalGap of [20, 100]) {
      const map = freezeMap({ layout, verticalGap, nodes: [...nodes] });
      const before = JSON.stringify(map);
      const positions = layoutPositions(map, { nodeSizes });
      assertDisjoint(nodes, positions, nodeSizes);
      const boxes = boxesOf(nodes, positions, nodeSizes);
      minGaps.push([1, 2, 3].map((depth) => {
        const peers = boxes.filter((b) => levels.get(b.id) === depth).sort((a, b) => a.top - b.top);
        const gaps = peers.slice(1).map((b, i) => b.top - peers[i].bottom);
        assert.ok(gaps.every((gap) => gap >= verticalGap - 0.001), `${layout}, depth ${depth}, gap ${verticalGap}: ${gaps}`);
        return Math.min(...gaps);
      }));
      assert.equal(JSON.stringify(map), before);
    }
    minGaps[0].forEach((gap, i) => assert.ok(minGaps[1][i] >= gap + 80 - 0.001,
      `${layout}, depth ${i + 1}: ${gap} -> ${minGaps[1][i]}`));
  }
});

test("여러 뿌리와 부모를 잃은 숲 사이에도 설정한 세로 간격을 둡니다", () => {
  const nodes = [node("root", null, { x: 0, y: 0 }),
    node("other", null, { x: 0, y: 0, image: IMG }), node("orphan", "lost", { x: 0, y: 0 })];
  for (const layout of ["radial", "tree"]) {
    for (const verticalGap of [12, 76, 120]) {
      const positions = layoutPositions({ layout, verticalGap, nodes });
      assertDisjoint(nodes, positions);
      const boxes = boxesOf(nodes, positions);
      for (let i = 1; i < boxes.length; i += 1) {
        assert.equal(boxes[i].top - boxes[i - 1].bottom, verticalGap);
      }
    }
  }
});

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
  // CSS border-box 높이: 글자 42 · 글자+이미지 138 · 틈 20
  assert.equal(b - a, 21 + 20 + 69);
  assert.equal(c - b, 69 + 20 + 21);
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
  assert.ok(p - 69 >= a + 21 + 20, `부모 위 끝(${p - 69})이 앞 노드 아래 끝+틈(${a + 41})보다 아래`);
  assert.equal(pos.get("p1").y, p); // 자식 하나면 부모와 같은 줄
});

test("노드 크기는 CSS 줄바꿈·이미지를 반영하고 실측값을 우선합니다", () => {
  const short = mindmapNodeSize(node("a", "root"));
  const long = mindmapNodeSize(node("long", "root", { text: "다름을 판단하기 전에 이유를 듣고 친구의 입장에서 생각하는 방법을 함께 찾아보기" }));
  assert.equal(short.width, 62);
  assert.equal(short.height, 42);
  assert.equal(long.width, 168);
  assert.ok(long.height > short.height * 2);
  assert.equal(mindmapNodeSize(node("image", "root", { text: "", image: IMG })).height, 112);
  assert.ok(mindmapNodeSize(node("image", "root", { image: IMG })).height > 112);
  const measured = new Map([["a", { width: 137.5, height: 202.25 }]]);
  assert.deepEqual(mindmapNodeSize(node("a", "root"), 1, measured), measured.get("a"));
  measured.set("a", { width: NaN, height: 0 });
  assert.deepEqual(mindmapNodeSize(node("a", "root"), 1, measured), short);
});

test("계층형: 긴 글·큰 부모·실측 높이를 포함한 하위 가지 전체가 겹치지 않습니다", () => {
  const nodes = [
    node("root", null), node("a", "root"), node("b", "root", { image: IMG }), node("c", "root"),
    node("a1", "a", { text: "긴 문장을 여러 줄로 읽으며 친구의 다른 생각을 이해해요 ".repeat(5) }),
    node("a2", "a"), node("b1", "b"), node("c1", "c", { edgeLabel: "친구와 함께 읽은 뒤 달라진 생각" }),
    node("c2", "c"), node("c21", "c2"),
  ];
  const nodeSizes = new Map([["b", { width: 160, height: 310 }], ["c1", { width: 168, height: 270 }]]);
  const positions = computeTreeLayout(nodes, { nodeSizes });
  assertDisjoint(nodes, positions, nodeSizes);
  const levels = levelMap(nodes);
  for (const depth of new Set(levels.values())) {
    assert.equal(new Set(nodes.filter((n) => levels.get(n.id) === depth).map((n) => positions.get(n.id).x)).size, 1);
  }
  assert.ok(positions.get("a").y < positions.get("b").y && positions.get("b").y < positions.get("c").y);
  assert.equal(positions.get("root").y, 0);
  assert.ok(positions.get("c1").x - positions.get("c").x > 300, "long label reserves a wider shared column");
});

test("방사형: 기존 안쪽 좌표를 바깥 열로 고치고 형제는 세로로 쌓되 원본은 보존합니다", () => {
  const map = freezeMap({ layout: "radial", nodes: [
    node("root", null, { x: 90, y: 40 }),
    node("left", "root", { x: -240, y: -160 }),
    node("right", "root", { x: 420, y: 140 }),
    node("before", "left", { x: -420, y: 80, text: "먼저 판단했던 나의 생각을 돌아보며 친구와 대화해요" }),
    node("after", "left", { x: -160, y: 190, image: IMG }),
    node("action", "right", { x: 490, y: 160, edgeLabel: "생활 속 실천" }),
  ] });
  const before = JSON.stringify(map);
  const positions = layoutPositions(map);
  assert.deepEqual(positions.get("root"), { x: 90, y: 40 });
  assert.deepEqual(positions.get("left"), { x: -240, y: -160 });
  assert.deepEqual(positions.get("right"), { x: 420, y: 140 });
  assert.equal(positions.get("before").x, positions.get("after").x);
  assert.ok(positions.get("after").x < positions.get("left").x);
  assert.ok(positions.get("before").y < positions.get("after").y);
  const siblingBoxes = boxesOf(map.nodes, positions).filter((b) => ["before", "after"].includes(b.id));
  assert.equal((Math.min(...siblingBoxes.map((b) => b.top)) + Math.max(...siblingBoxes.map((b) => b.bottom))) / 2,
    positions.get("left").y, "the full sibling stack is centered on its parent");
  assert.ok(positions.get("action").x > positions.get("right").x + 150);
  assertDisjoint(map.nodes, positions);
  assert.equal(JSON.stringify(map), before);
});

test("방사형: 같은 위치에 저장된 형제와 이웃 가지도 실측된 하위 높이만큼 벌어집니다", () => {
  const map = { layout: "radial", nodes: [
    node("root", null, { x: 0, y: 0 }),
    node("a", "root", { x: 260, y: 0 }), node("b", "root", { x: 260, y: 0 }),
    node("a1", "a", { x: 330, y: 0 }), node("a2", "a", { x: 330, y: 0 }),
    node("a11", "a1", { x: 340, y: 0 }), node("a12", "a1", { x: 340, y: 0 }),
    node("b1", "b", { x: 330, y: 0 }),
  ] };
  const nodeSizes = new Map([["a1", { width: 168, height: 270 }], ["b1", { width: 168, height: 340 }]]);
  const positions = layoutPositions(map, { nodeSizes });
  assertDisjoint(map.nodes, positions, nodeSizes);
  assert.equal(positions.get("a1").x, positions.get("a2").x);
  assert.equal(positions.get("a11").x, positions.get("a12").x);
  assert.ok(positions.get("a1").y < positions.get("a2").y);
  assert.ok(positions.get("a11").y < positions.get("a12").y);
  assert.ok(positions.get("a").y < positions.get("b").y);
});

test("방사형 새 가지와 좌표 없는 옛 기록도 서로 다른 세로 자리를 받습니다", () => {
  let map = { layout: "radial", nodes: [node("root", null, { x: 0, y: 0 }), node("a", "root", { x: 260, y: 0 })] };
  for (let i = 0; i < 4; i += 1) map = addChild(map, "a", `child ${i}`);
  const positions = layoutPositions(map);
  const children = map.nodes.filter((n) => n.parentId === "a");
  assert.equal(new Set(children.map((n) => positions.get(n.id).x)).size, 1);
  assert.equal(new Set(children.map((n) => n.y)).size, children.length);
  assertDisjoint(map.nodes, positions);

  const missing = freezeMap({ layout: "radial", nodes: [
    node("root", null), node("a", "root"), node("b", "root"), node("c", "root"),
    node("a1", "a"), node("a2", "a"), node("a21", "a2"),
  ] });
  const repaired = withRadialPositions(missing);
  assert.ok(repaired.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
  assertDisjoint(missing.nodes, layoutPositions(missing));
  assertDisjoint(repaired.nodes, layoutPositions(repaired));
  assert.equal(withRadialPositions(repaired), repaired);
  assert.ok(missing.nodes.every((n) => n.x === undefined && n.y === undefined));
});

test("원본 좌표로 하위 가지를 끌면 원문은 유지되고 형제의 세로 순서가 바뀝니다", () => {
  const map = freezeMap({ layout: "radial", nodes: [
    node("root", null, { x: 0, y: 0 }), node("p", "root", { x: 260, y: 0 }),
    node("a", "p", { x: 330, y: 0, image: IMG, edgeLabel: "내가 적은 관계" }),
    node("b", "p", { x: 330, y: 100 }), node("a1", "a", { x: 420, y: 10 }),
  ] });
  const moved = moveSubtreeTo(map, "a", 350, 300);
  for (const id of ["a", "a1"]) {
    const old = map.nodes.find((n) => n.id === id);
    assert.deepEqual(moved.nodes.find((n) => n.id === id), { ...old, x: old.x + 20, y: old.y + 300 });
  }
  assert.equal(moved.nodes.find((n) => n.id === "b"), map.nodes.find((n) => n.id === "b"));
  const positions = layoutPositions(moved);
  assert.ok(positions.get("a").y > positions.get("b").y);
  assert.equal(positions.get("a").x, positions.get("b").x);
  assertDisjoint(moved.nodes, positions);
  assert.equal(map.nodes.find((n) => n.id === "a").y, 0);
});

test("기존 좌표 기록은 어느 형태로 보아도 원문 손실이나 노드 겹침이 없습니다", () => {
  const maps = [normalizeMindmap({ layout: "radial", nodes: [
    node("root", null, { text: "책을 읽고 달라진 생각", x: 0, y: 0 }),
    node("theme", "root", { text: "인물의 마음", x: -240, y: -160 }),
    node("before", "theme", { text: "처음에는 이해하기 어려웠어요", x: -420, y: 80 }),
    node("after", "theme", { text: "이유를 듣고 이해했어요", x: -160, y: 190, image: IMG, edgeLabel: "달라진 생각" }),
    node("action", "root", { text: "친구의 이야기를 먼저 듣기", x: 420, y: 140 }),
  ] })];
  for (const map of maps) {
    const before = JSON.stringify(map);
    for (const layout of ["radial", "tree"]) assertDisjoint(map.nodes, layoutPositions({ ...map, layout }));
    assert.equal(JSON.stringify(map), before);
  }
  const added = addChild(maps[0], "theme", "새 생각");
  const positions = layoutPositions(added);
  const newId = added.nodes.at(-1).id;
  assert.ok(positions.get("before").y < positions.get("after").y);
  assert.ok(positions.get("after").y < positions.get(newId).y, "new child appends after saved y=80/190 siblings");
  assertDisjoint(added.nodes, positions);
});

test("부모 없는 노드와 순환 관계도 멈추지 않고 모든 노드를 겹침 없이 표시합니다", () => {
  const nodes = [node("root", null), node("normal", "root"), node("orphan", "lost"),
    node("cycle-a", "cycle-b"), node("cycle-b", "cycle-a"), node("self", "self")];
  for (const layout of ["radial", "tree"]) {
    const positions = layoutPositions({ layout, nodes });
    assert.equal(positions.size, nodes.length);
    assertDisjoint(nodes, positions);
  }
  assert.equal(layoutPositions({ layout: "radial", nodes: [] }).size, 0);
  assert.equal(computeTreeLayout([]).size, 0);
});
