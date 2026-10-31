import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAttachmentRef } from "@/lib/attachmentRefs";

const source = readFileSync(new URL("../../lib/secureImage.js", import.meta.url), "utf8");
const body = source.slice(source.indexOf("const requests ="), source.indexOf("export function useSecureHtml")).replace(/^export /gm, "");
const REF = "attachment:12345678-1234-1234-1234-123456789abc";
const tick = () => new Promise((resolve) => setImmediate(resolve));
class Image {
  constructor(attrs) { this.attrs = { ...attrs }; }
  getAttribute(key) { return this.attrs[key] ?? null; }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  removeAttribute(key) { delete this.attrs[key]; }
}
function root(images) {
  return {
    images,
    contains: (img) => images.includes(img),
    querySelectorAll(selector) {
      if (selector === 'img[src^="attachment:"], img[data-attachment-ref]') return images.filter((img) => img.getAttribute("src")?.startsWith("attachment:") || img.getAttribute("data-attachment-ref"));
      if (selector === "img[data-attachment-ref]") return images.filter((img) => img.getAttribute("data-attachment-ref"));
      throw new Error(selector);
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; },
    cloneNode() { return root(images.map((img) => new Image(img.attrs))); },
    get innerHTML() { return images.map((img) => `<img ${Object.entries(img.attrs).map(([key, value]) => `${key}="${value}"`).join(" ")}>`).join(""); },
  };
}
function setup(result = { status: "ready", url: "blob:private" }) {
  const acquired = [], released = [];
  const cache = {
    acquire(ref) { acquired.push(ref); return Object.assign(Promise.resolve(result), { release: () => released.push(ref) }); },
    release: (ref) => released.push(ref),
  };
  const api = runInNewContext(body + "\n({ hydrateSecureImages, releaseSecureImages, serializeSecureHtml })", {
    isAttachmentRef, cache, getSecureImageCache: () => cache,
  });
  return { ...api, acquired, released };
}

test("HTML의 식별자/안전한 marker 양쪽을 인증 Blob으로 채우고 실제 주소는 저장하지 않습니다", async () => {
  const api = setup(), held = [];
  const a = new Image({ src: REF }), b = new Image({ "data-attachment-ref": REF }), external = new Image({ src: "https://example.com/public.jpg" });
  const element = root([a, b, external]);
  api.hydrateSecureImages(element, held);
  assert.equal(a.getAttribute("src"), null);
  assert.equal(b.getAttribute("src"), null);
  await tick();
  assert.equal(a.getAttribute("src"), "blob:private");
  assert.equal(b.getAttribute("src"), "blob:private");
  assert.equal(external.getAttribute("src"), "https://example.com/public.jpg");
  const stored = api.serializeSecureHtml(element);
  assert.equal(stored.includes("blob:"), false);
  assert.equal(stored.includes("data-attachment-ref"), false);
  assert.equal(stored.match(/attachment:/g).length, 2);
  assert.equal(a.getAttribute("src"), "blob:private", "serialization leaves rendered DOM unchanged");
});

test("편집기에서 반복 hydrate해도 같은 그림의 사용 수가 늘지 않고 제거한 그림은 해제합니다", async () => {
  const api = setup(), held = [];
  const a = new Image({ src: REF }), element = root([a]);
  api.hydrateSecureImages(element, held); await tick();
  api.hydrateSecureImages(element, held); await tick();
  assert.equal(api.acquired.length, 1);
  element.images.splice(0, 1);
  api.hydrateSecureImages(element, held);
  assert.deepEqual(api.released, [REF]);
  assert.equal(held.length, 0);
});

test("화면 정리 뒤 도착한 결과는 사라진 그림이나 다른 사용자의 화면에 반영되지 않습니다", async () => {
  const api = setup(), held = [], a = new Image({ src: REF });
  api.hydrateSecureImages(root([a]), held);
  api.releaseSecureImages(held);
  await tick();
  assert.equal(a.getAttribute("src"), null);
  assert.deepEqual(api.released, [REF]);
});

test("권한 거부는 그림 대신 안내를 남기고, 잘못된 marker는 실행 주소로 바꾸지 않습니다", async () => {
  const api = setup({ status: "error", reason: "denied" });
  const denied = new Image({ src: REF }), invalid = new Image({ "data-attachment-ref": "javascript:alert(1)", src: "blob:old" });
  api.hydrateSecureImages(root([denied, invalid]), []); await tick();
  assert.equal(denied.getAttribute("src"), null);
  assert.equal(denied.getAttribute("data-secure-image-error"), "denied");
  assert.match(denied.getAttribute("alt"), /권한/);
  assert.equal(invalid.getAttribute("src"), null);
  assert.equal(invalid.getAttribute("data-secure-image-error"), "invalid");
});
