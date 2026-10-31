import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAttachmentRef } from "@/lib/attachmentRefs";
import { createSecureImageCache, isPassthroughSrc } from "@/lib/secureImageCache";

const source = readFileSync(new URL("../../lib/secureImage.js", import.meta.url), "utf8")
  .replace(/^import[^;]+;\n/gm, "").replace(/^export /gm, "");
const REF = "attachment:12345678-1234-1234-1234-123456789abc";
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("React 효과 전에도 사용자·src가 바뀌면 이전 사용자의 ready 이미지를 반환하지 않습니다", async () => {
  let cursor = 0, callbacks = [], serial = 0;
  const memory = [], effectMemory = [];
  const auth = { currentUser: { uid: "alice" }, authStateReady: async () => {} };
  const effects = [];
  const api = runInNewContext(source + "\n({useSecureImage,clearSecureImageCache});", {
    auth, isFirebaseConfigured: true, isAttachmentRef, isPassthroughSrc, createSecureImageCache,
    fetchAttachmentBlob: async () => new Blob(["private"], { type: "image/jpeg" }),
    URL: { createObjectURL: () => `blob:private-${++serial}`, revokeObjectURL() {} },
    window: { addEventListener() {} },
    onAuthStateChanged: (_, callback) => { callbacks.push(callback); },
    useState(initial) {
      const index = cursor++;
      if (!(index in memory)) memory[index] = typeof initial === "function" ? initial() : initial;
      return [memory[index], (next) => { memory[index] = typeof next === "function" ? next(memory[index]) : next; }];
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const old = effectMemory[index];
      if (!old || deps.some((value, i) => value !== old.deps[i])) effects.push(() => {
        old?.cleanup?.(); effectMemory[index] = { deps, cleanup: fn() };
      });
    },
  });
  function render(src = REF) { cursor = 0; return api.useSecureImage(src); }
  function flush() { while (effects.length) effects.shift()(); }
  assert.equal(render().status, "loading"); flush(); await tick();
  const ready = render(); assert.equal(ready.status, "ready");
  auth.currentUser = { uid: "bob" };
  const beforeEffects = render();
  assert.equal(beforeEffects.status, "loading");
  assert.equal(beforeEffects.url, null);
  callbacks.forEach((callback) => callback(auth.currentUser));
  flush(); await tick();
  // 인증 구독의 setState가 만든 다음 commit도 실행합니다.
  render(); flush(); await tick();
  assert.equal(render().status, "ready");
  assert.equal(render("attachment:abcdefghijklmnop").url, null);
  auth.currentUser = null;
  assert.equal(render().url, null);
  callbacks.forEach((callback) => callback(null));
});
