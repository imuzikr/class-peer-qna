import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

// 기존 UI 시험과 같이 실제 이벤트 처리기를 꺼내 실행합니다. JSX 변환 없이
// 입력칸 → 노드로 전달되는 키 이벤트와 한글 조합의 기본 동작을 확인합니다.
const source = readFileSync(new URL("../../components/MindmapCanvas.jsx", import.meta.url), "utf8");
const composing = source.match(/const isComposingKey = [^;]+;/)?.[0] ?? "";

function inputHandler(className, close) {
  const inputAt = source.indexOf(`className="${className}"`);
  const start = source.indexOf("onKeyDown={(e) => {", inputAt) + "onKeyDown={(e) => {".length;
  const end = source.indexOf("\n                    }}", start);
  assert.ok(inputAt >= 0 && end > start, `${className} has a keyboard handler`);
  return runInNewContext(`${composing}\n(e) => {${source.slice(start, end)}\n}`, {
    setEditingId: close,
    setEditingEdgeId: close,
  });
}

function keyEvent(key, nativeEvent = {}) {
  return {
    key, nativeEvent, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
}

for (const className of ["mm-node-input", "mm-edge-input"]) {
  test(`${className}: 공백 입력을 막거나 노드 선택으로 전달하지 않습니다`, () => {
    let closed = 0;
    const handle = inputHandler(className, () => { closed++; });
    const event = keyEvent(" ");
    handle(event);
    assert.equal(event.prevented, false);
    assert.equal(event.stopped, true);
    assert.equal(closed, 0);
  });

  test(`${className}: 한글 조합 키는 편집을 끝내지 않고 일반 Enter/Escape만 끝냅니다`, () => {
    let closed = 0;
    const handle = inputHandler(className, () => { closed++; });
    for (const key of ["Enter", "Escape"]) {
      for (const nativeEvent of [{ isComposing: true }, { keyCode: 229 }]) {
        const event = keyEvent(key, nativeEvent);
        handle(event);
        assert.equal(event.prevented, false);
        assert.equal(closed, 0);
      }
    }
    for (const key of ["Enter", "Escape"]) {
      const event = keyEvent(key);
      handle(event);
      assert.equal(event.prevented, true);
    }
    assert.equal(closed, 2);
  });
}
