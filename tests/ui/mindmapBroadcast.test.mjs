import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  branchCount, layoutPositions, maxDepth, normalizeMindmap, normalizeVerticalGap,
} from "@/lib/mindmap";

const source = readFileSync(new URL("../../components/MindmapBoard.jsx", import.meta.url), "utf8");
const payloadOf = runInNewContext(source.slice(source.indexOf("function buildPayload(")) + "\nbuildPayload;", {
  branchCount, maxDepth, normalizeVerticalGap,
});

test("수업 화면으로 보내고 다시 읽어도 세로 간격과 개별 가지 위치·원문이 유지됩니다", () => {
  for (const layout of ["radial", "tree"]) {
    const map = normalizeMindmap({ layout, verticalGap: 44, nodes: [
      { id: "root", parentId: null, text: "우리 책", x: 0, y: 0 },
      { id: "a", parentId: "root", text: "기억에 남은 장면", edgeLabel: "이유", x: 240, y: 0,
        radialOffsetY: -80, treeOffsetY: 120, image: "https://example.com/scene.png" },
      { id: "b", parentId: "a", text: "내 생각", radialOffsetY: 90, treeOffsetY: -40 },
    ] });
    const payload = JSON.parse(JSON.stringify(payloadOf({ title: "마인드맵" }, { name: "학생", map })));
    assert.equal(payload.mode, "mindmap");
    const received = normalizeMindmap(payload);
    assert.deepEqual(received, map);
    assert.deepEqual(layoutPositions(received), layoutPositions(map));
  }
});
