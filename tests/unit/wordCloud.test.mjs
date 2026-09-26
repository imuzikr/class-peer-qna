// 낱말 구름 자리 잡기(lib/wordCloud.js) — 판 안에 들고, 묶음이 한가운데 서는가.
import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutCloud, estimateWidth } from "../../lib/wordCloud.js";

const box = (it) => ({ x0: it.x - it.w / 2, x1: it.x + it.w / 2, y0: it.y - it.h / 2, y1: it.y + it.h / 2 });

function bounds(items) {
  return items.map(box).reduce(
    (b, r) => ({ x0: Math.min(b.x0, r.x0), x1: Math.max(b.x1, r.x1), y0: Math.min(b.y0, r.y0), y1: Math.max(b.y1, r.y1) }),
    { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }
  );
}

const words = ["인공지능", "바둑", "대국", "로봇", "특이점"].map((text) => ({ text, count: 1 }));

for (const [W, H] of [[632, 552], [1200, 240], [312, 355]]) {
  test(`낱말 몇 개뿐이어도 묶음이 판 한가운데 — ${W}×${H}`, () => {
    const { items, dropped } = layoutCloud(words, { width: W, height: H, measure: estimateWidth });
    assert.equal(dropped, 0);
    assert.equal(items.length, words.length);
    const b = bounds(items);
    assert.ok(Math.abs((b.x0 + b.x1) / 2 - W / 2) < 1, "가로 가운데");
    assert.ok(Math.abs((b.y0 + b.y1) / 2 - H / 2) < 1, "세로 가운데");
    assert.ok(b.x0 >= -0.01 && b.y0 >= -0.01 && b.x1 <= W + 0.01 && b.y1 <= H + 0.01, "판 안");
  });
}

test("옮겨도 낱말끼리 겹치지 않음", () => {
  const { items } = layoutCloud(words, { width: 632, height: 552, measure: estimateWidth });
  const rs = items.map(box);
  for (let i = 0; i < rs.length; i++)
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], c = rs[j];
      assert.ok(!(a.x0 < c.x1 && a.x1 > c.x0 && a.y0 < c.y1 && a.y1 > c.y0), `${items[i].text}·${items[j].text}`);
    }
});
