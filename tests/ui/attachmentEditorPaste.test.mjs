import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

// 실제 비동기 붙여넣기 처리기를 실행합니다. 업로드를 기다리던 편집기가
// 사라지거나 포커스를 얻지 못했을 때 다른 입력칸을 건드리지 않아야 합니다.
const source = readFileSync(new URL("../../components/RichTextEditor.jsx", import.meta.url), "utf8");
const start = source.indexOf("  async function handlePaste(e)");
const end = source.indexOf("\n  // ── '- '", start);
assert.ok(start >= 0 && end > start);

function fixture() {
  let finishUpload;
  const calls = [];
  const ownerDocument = { activeElement: null, execCommand: (...args) => calls.push(["insert", ...args]) };
  const editor = {
    isConnected: true, ownerDocument,
    focus() { ownerDocument.activeElement = editor; },
    contains: () => false,
  };
  const ref = { current: editor };
  const paste = runInNewContext(source.slice(start, end) + "\nhandlePaste;", {
    ref, imageRefs: { current: [] },
    uploadImage: () => new Promise((resolve) => { finishUpload = resolve; }),
    prepareSecureHtml: (html) => html, sanitizeHtml: (html) => html, escapeHtml: (value) => value,
    hydrateSecureImages: (element) => calls.push(["hydrate", element]),
    serializeSecureHtml: () => "stable attachment reference",
    onChange: (html) => calls.push(["save", html]),
    document: { execCommand() { throw new Error("global document must not receive paste"); } },
    alert: (message) => calls.push(["alert", message]),
  });
  const event = { preventDefault() {}, clipboardData: { items: [{ type: "image/png", getAsFile: () => ({ type: "image/png" }) }] } };
  return { editor, ref, ownerDocument, calls, run: () => paste(event), finish: () => finishUpload("attachment:550e8400-e29b-41d4-a716-446655440000") };
}

test("업로드 중 편집기가 닫히거나 교체되면 다른 편집기에 붙여넣지 않습니다", async () => {
  for (const change of [
    (f) => { f.ref.current = null; },
    (f) => { f.ref.current = {}; },
    (f) => { f.editor.isConnected = false; },
  ]) {
    const f = fixture();
    const pending = f.run();
    change(f);
    f.finish();
    await pending;
    assert.equal(f.calls.length, 0);
  }
});

test("숨겨진 편집기가 포커스를 얻지 못하면 현재 입력칸을 건드리지 않습니다", async () => {
  const f = fixture();
  f.editor.focus = () => {};
  f.ownerDocument.activeElement = {};
  const pending = f.run();
  f.finish();
  await pending;
  assert.equal(f.calls.length, 0);
});

test("원래 편집기가 유지되면 그 문서에 붙이고 안정적인 식별자를 저장합니다", async () => {
  const f = fixture();
  const pending = f.run();
  f.finish();
  await pending;
  assert.deepEqual(f.calls.map((call) => call[0]), ["insert", "hydrate", "save"]);
  assert.equal(f.calls.at(-1)[1], "stable attachment reference");
  assert.ok(f.calls[0][3].includes("attachment:550e8400-e29b-41d4-a716-446655440000"));
});
