import { test } from "node:test";
import assert from "node:assert/strict";
import { mindmapEdgeGeometry } from "@/lib/mindmapEdges";
import { mindmapNodeSize } from "@/lib/mindmap";

const parentSize = { width: 160, height: 56 };
const childSize = { width: 120, height: 42 };
const options = { parentSize, childSize };
const near = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

function pointAt({ start, c1, c2, end }, t) {
  const u = 1 - t;
  return {
    x: u ** 3 * start.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * end.x,
    y: u ** 3 * start.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * end.y,
  };
}

function assertLabelAtHalfLength(geometry) {
  // An independent, finer polyline checks both arc length and the label's
  // distance from the rendered cubic, rather than copying its sample count.
  const points = Array.from({ length: 4001 }, (_, i) => pointAt(geometry, i / 4000));
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const nearest = points.reduce((best, point, i) => {
    const distance = Math.hypot(point.x - geometry.mid.x, point.y - geometry.mid.y);
    return distance < best.distance ? { distance, i } : best;
  }, { distance: Infinity, i: 0 });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const beforeLabel = lengths.slice(0, nearest.i).reduce((sum, length) => sum + length, 0);
  assert.ok(nearest.distance < 0.15, `label is ${nearest.distance}px from curve`);
  near(beforeLabel, total / 2, 0.15);
}

test("radial branches connect the exact facing side centers in both directions and at every depth", () => {
  for (const parent of [{ x: 0, y: 0 }, { x: -300, y: 220 }, { x: 300, y: -220 }]) {
    for (const side of [-1, 1]) {
      for (const dy of [-180, 0, 180]) {
        const child = { x: parent.x + side * 300, y: parent.y + dy };
        const g = mindmapEdgeGeometry(parent, child, options);
        assert.deepEqual(g.start, { x: parent.x + side * 80, y: parent.y });
        assert.deepEqual(g.end, { x: child.x - side * 60, y: child.y });
        assert.equal(g.c1.y, g.start.y);
        assert.equal(g.c2.y, g.end.y);
        assert.ok(side * (g.c1.x - g.start.x) > 0);
        assert.ok(side * (g.end.x - g.c2.x) > 0);
        assert.match(g.d, /^M [-\d.]+ [-\d.]+ C /);
        assert.doesNotMatch(g.d, / L /);
      }
    }
  }
});

test("tree branches consistently use the parent right and child left side centers", () => {
  for (const child of [{ x: 350, y: -220 }, { x: 350, y: 220 }, { x: -350, y: 20 }]) {
    const g = mindmapEdgeGeometry({ x: 0, y: 35 }, child, { ...options, layout: "tree" });
    assert.deepEqual(g.start, { x: 80, y: 35 });
    assert.deepEqual(g.end, { x: child.x - 60, y: child.y });
    assert.equal(g.c1.y, 35);
    assert.equal(g.c2.y, child.y);
    assert.match(g.d, / C /);
  }
});

test("sloped branches curve gently, with bounded handles and no overshoot", () => {
  for (const side of [-1, 1]) {
    for (const gap of [1, 20, 160, 1200]) {
      for (const dy of [-700, -15, 15, 700]) {
        const g = mindmapEdgeGeometry({ x: 0, y: 0 }, { x: side * (140 + gap), y: dy }, options);
        const handle = Math.abs(g.c1.x - g.start.x);
        assert.ok(handle > 0 && handle <= 48 && handle <= gap * 0.35 + 1e-7);
        assert.ok(Math.abs(g.c2.x - g.end.x) <= 48);
        const quarter = pointAt(g, 0.25);
        assert.ok(Math.abs(quarter.y - dy * 0.25) > 0.1, "a sloped branch is curved rather than diagonal");
        for (let i = 0; i <= 100; i += 1) {
          const p = pointAt(g, i / 100);
          assert.ok(p.x >= Math.min(g.start.x, g.end.x) - 1e-7 && p.x <= Math.max(g.start.x, g.end.x) + 1e-7);
          assert.ok(p.y >= Math.min(0, dy) - 1e-7 && p.y <= Math.max(0, dy) + 1e-7);
        }
      }
    }
  }
});

test("labels sit on the visible curve at half its length for left, right, up and down branches", () => {
  for (const layout of ["radial", "tree"]) {
    for (const side of layout === "tree" ? [1] : [-1, 1]) {
      for (const dy of [-480, -65, 0, 65, 480]) {
        const g = mindmapEdgeGeometry({ x: 30, y: -45 }, { x: 30 + side * 420, y: -45 + dy }, { ...options, layout });
        assertLabelAtHalfLength(g);
      }
    }
  }
});

test("measured wide and tall image/root boxes supply the actual side anchors and visible label position", () => {
  const root = Object.freeze({ id: "root", text: "Root", image: "https://example.com/root.png" });
  const child = Object.freeze({ id: "image", text: "Tall image", image: "https://example.com/image.png" });
  const measurements = new Map([["root", { width: 238, height: 214 }], ["image", { width: 184, height: 310 }]]);
  for (const side of [-1, 1]) {
    const g = mindmapEdgeGeometry({ x: 80, y: -60 }, { x: 80 + side * 520, y: 360 }, {
      parentSize: mindmapNodeSize(root, 0, measurements),
      childSize: mindmapNodeSize(child, 2, measurements),
    });
    assert.deepEqual(g.start, { x: 80 + side * 119, y: -60 });
    assert.deepEqual(g.end, { x: 80 + side * (520 - 92), y: 360 });
    assertLabelAtHalfLength(g);
    assert.ok(Math.abs(g.mid.x - 80) > 119, "label clears the wide root");
    assert.ok(Math.abs(g.mid.x - (80 + side * 520)) > 92, "label clears the image box");
  }
  assert.deepEqual(measurements.get("image"), { width: 184, height: 310 });
});

test("dragging recomputes the label and path without mutating node positions or measurements", () => {
  const parent = Object.freeze({ x: -220, y: 15 });
  const child = Object.freeze({ x: -550, y: -100 });
  const frozenOptions = Object.freeze({ parentSize: Object.freeze({ ...parentSize }), childSize: Object.freeze({ ...childSize }) });
  const before = mindmapEdgeGeometry(parent, child, frozenOptions);
  const after = mindmapEdgeGeometry(parent, Object.freeze({ ...child, y: 210 }), frozenOptions);
  assert.notEqual(after.d, before.d);
  assert.notDeepEqual(after.mid, before.mid);
  near(after.mid.y - before.mid.y, 155);
  assert.deepEqual(after.start, before.start);
  assert.equal(after.end.y, 210);
  assertLabelAtHalfLength(after);
  assert.deepEqual(parent, { x: -220, y: 15 });
  assert.deepEqual(child, { x: -550, y: -100 });
  assert.deepEqual(frozenOptions, options);
});

test("aligned branches stay naturally horizontal while nearby and translated branches still use cubics", () => {
  for (const side of [-1, 1]) {
    const aligned = mindmapEdgeGeometry({ x: 15, y: 400 }, { x: 15 + side * 320, y: 400 }, options);
    for (let i = 0; i <= 20; i += 1) near(pointAt(aligned, i / 20).y, 400);
    assert.equal(aligned.mid.y, 400);
    assert.match(aligned.d, / C /);
    const nearAligned = mindmapEdgeGeometry({ x: 15, y: 400 }, { x: 15 + side * 320, y: 401 }, options);
    assert.match(nearAligned.d, / C /);
    near(nearAligned.mid.y, 400.5);
    const translated = mindmapEdgeGeometry({ x: 115, y: 600 }, { x: 115 + side * 320, y: 601 }, options);
    near(translated.mid.x, nearAligned.mid.x + 100);
    near(translated.mid.y, nearAligned.mid.y + 200);
  }
});

test("coincident, overlapping, inward and malformed inputs produce finite bounded geometry", () => {
  const cases = [
    [undefined, undefined, undefined],
    [{ x: NaN, y: Infinity }, { x: -Infinity, y: "invalid" }, { parentSize: { width: Infinity }, childSize: { width: -30 } }],
    [{ x: 0, y: 0 }, { x: 0, y: 0 }, options],
    [{ x: 0, y: 0 }, { x: 30, y: 90 }, options],
    [{ x: 0, y: 0 }, { x: -300, y: 120 }, { ...options, layout: "tree" }],
    [{ x: Number.MAX_VALUE, y: -Number.MAX_VALUE }, { x: -Number.MAX_VALUE, y: Number.MAX_VALUE },
      { parentSize: { width: Number.MAX_VALUE }, childSize: { width: Number.MAX_VALUE } }],
  ];
  for (const [parent, child, settings] of cases) {
    const g = mindmapEdgeGeometry(parent, child, settings);
    for (const name of ["start", "end", "c1", "c2", "mid"]) {
      assert.ok(Number.isFinite(g[name].x) && Number.isFinite(g[name].y), `${name} is finite`);
    }
    assert.doesNotMatch(g.d, /NaN|Infinity/);
    assert.ok(Math.abs(g.c1.x - g.start.x) <= 48);
    assert.ok(Math.abs(g.c2.x - g.end.x) <= 48);
  }
  const collapsed = mindmapEdgeGeometry({ x: 0, y: 0 }, { x: 0, y: 0 });
  assert.deepEqual(collapsed.mid, { x: 0, y: 0 });
  const inward = mindmapEdgeGeometry({ x: 0, y: 0 }, { x: -300, y: 120 }, { ...options, layout: "tree" });
  assert.deepEqual(inward.c1, inward.start);
  assert.deepEqual(inward.c2, inward.end);
});
