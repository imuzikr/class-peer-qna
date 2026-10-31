import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { isSafeImageSrc, prepareSecureHtml, sanitizeHtml } from "@/lib/html";
import { safeImageUrl, hashtagPostForSave } from "@/lib/hashtag";
import { normalizeMindmap, safeNodeImage } from "@/lib/mindmap";

const ref = "attachment:550e8400-e29b-41d4-a716-446655440000";

test("본문과 마인드맵은 같은 보호 첨부 식별자를 손실 없이 보존합니다", () => {
  assert.equal(isSafeImageSrc(ref), true);
  assert.equal(safeNodeImage(ref), ref);
  assert.equal(safeImageUrl(ref), ref);
  assert.equal(hashtagPostForSave({ image: { url: ref } }).image.url, ref);
  const map = normalizeMindmap({ nodes: [{ id: "root", parentId: null, text: "내 그림", image: ref }] });
  assert.equal(map.nodes[0].image, ref);
  assert.equal(map.nodes[0].text, "내 그림");
});

test("잘못된 첨부 식별자와 실행 가능한 주소는 이미지로 허용하지 않습니다", () => {
  for (const bad of ["attachment:", "attachment:short", `${ref}/other`, `${ref}?token=x`,
    `${ref}\" onerror=\"alert(1)`, "javascript:alert(1)", "file:///tmp/a.jpg"]) {
    assert.equal(isSafeImageSrc(bad), false, bad);
    assert.equal(safeNodeImage(bad), "", bad);
    assert.equal(safeImageUrl(bad), null, bad);
  }
});

test("기존 HTTPS 그림과 체험 모드의 이미지 자료는 계속 표시할 수 있습니다", () => {
  for (const src of ["https://example.com/figure.png", "data:image/png;base64,AAAA"]) {
    assert.equal(isSafeImageSrc(src), true);
    assert.equal(safeNodeImage(src), src);
  }
});

test("본문 화면은 식별자를 src로 요청하지 않고 저장할 때는 원래 식별자로 되돌립니다", () => {
  // 실제 HTML 파서를 쓰고, 브라우저 DOM 속성의 모양만 맞춥니다.
  const { parse } = createRequire(import.meta.url)("next/dist/compiled/node-html-parser");
  const wrappers = new WeakMap();
  function dom(element) {
    if (!element || element.nodeType !== 1) return element;
    if (wrappers.has(element)) return wrappers.get(element);
    const wrapped = new Proxy(element, {
      get(target, key) {
        if (key === "children") return target.childNodes.filter((n) => n.nodeType === 1).map(dom);
        if (key === "attributes") return Object.keys(target.attributes).map((name) => ({ name }));
        if (key === "firstChild") return dom(target.firstChild);
        if (key === "classList") return { contains: (name) => target.classNames.split(" ").includes(name) };
        if (key === "querySelectorAll") return (selector) => target.querySelectorAll(selector).map(dom);
        const value = target[key];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    wrappers.set(element, wrapped);
    return wrapped;
  }
  const oldWindow = globalThis.window;
  const oldParser = globalThis.DOMParser;
  globalThis.window = {};
  globalThis.DOMParser = class { parseFromString(html) { return { body: { firstChild: dom(parse(html).firstChild) } }; } };
  try {
    const saved = `<p>내 그림</p><img src="${ref}" alt="그림" onerror="alert(1)">`;
    const safe = sanitizeHtml(saved);
    assert.ok(safe.includes(`src="${ref}"`));
    assert.ok(!safe.includes("onerror"));
    const display = prepareSecureHtml(safe);
    assert.ok(display.includes(`data-attachment-ref="${ref}"`));
    assert.ok(!display.includes(`src="${ref}"`));
    const hydrated = display.replace("<img ", '<img src="blob:https://example.com/temporary" ');
    const roundTrip = sanitizeHtml(hydrated);
    assert.ok(roundTrip.includes(`src="${ref}"`));
    assert.ok(!roundTrip.includes("blob:"));
    assert.ok(!roundTrip.includes("data-attachment-ref"));
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldParser === undefined) delete globalThis.DOMParser; else globalThis.DOMParser = oldParser;
  }
});
