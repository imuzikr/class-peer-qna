import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../../lib/popover.js", import.meta.url), "utf8");
const start = source.indexOf("export function popoverPos(");
const end = source.indexOf("\nexport function usePopoverAnchor", start);
const pos = runInNewContext(
  source.slice(start, end).replace("export function", "function") + "\npopoverPos;",
  { window: { innerWidth: 1280, innerHeight: 900 } },
);
const rect = { left: 500, right: 590, top: 240, bottom: 320, width: 90 };

test("a popup card uses its own window width instead of the presentation window", () => {
  const el = { ownerDocument: { defaultView: { innerWidth: 600, innerHeight: 500 } }, getBoundingClientRect: () => rect };
  const result = pos(el);
  assert.equal(result.x, 190);
  assert.ok(result.x + 300 <= 600);
  assert.equal(result.maxH, 260);
});

test("an ordinary card continues to use the main viewport", () => {
  const result = pos({ getBoundingClientRect: () => rect });
  assert.equal(result.x, 600);
  assert.equal(result.y, 232);
});

test("popover dismissal listens and cleans up in the popup document", () => {
  const registrations = [];
  const removals = [];
  const target = (name) => ({
    addEventListener: (type, listener) => registrations.push({ name, type, listener }),
    removeEventListener: (type, listener) => removals.push({ name, type, listener }),
  });
  const mainWindow = target("main-window");
  const mainDocument = target("main-document");
  const childWindow = target("popup-window");
  const childDocument = { ...target("popup-document"), defaultView: childWindow };
  const effects = [];
  const hooks = runInNewContext(
    source.replace(/import[^;]+;/, "").replaceAll("export function", "function") + "\n({ usePopoverDismiss });",
    { window: mainWindow, document: mainDocument, useEffect: (fn) => effects.push(fn) },
  );
  let closed = 0;
  hooks.usePopoverDismiss(true, { current: { ownerDocument: childDocument, contains: () => false } }, () => { closed++; });
  const cleanup = effects[0]();
  assert.deepEqual(registrations.map(({ name, type }) => [name, type]), [
    ["popup-document", "pointerdown"], ["popup-window", "keydown"],
  ]);
  registrations[1].listener({ key: "Escape" });
  assert.equal(closed, 1);
  registrations[0].listener({ target: { isConnected: true } });
  assert.equal(closed, 2);
  cleanup();
  assert.deepEqual(removals, registrations);
});


test("popover repositions on its popup resize and scroll, then removes those listeners", () => {
  const registrations = [];
  const removals = [];
  const target = (name) => ({
    addEventListener: (type, listener, capture) => registrations.push({ name, type, listener, capture }),
    removeEventListener: (type, listener, capture) => removals.push({ name, type, listener, capture }),
  });
  const childWindow = { ...target("popup-window"), innerWidth: 600, innerHeight: 500 };
  const childDocument = { ...target("popup-document"), defaultView: childWindow };
  const effects = [];
  const positions = [];
  const hooks = runInNewContext(
    source.replace(/import[^;]+;/, "").replaceAll("export function", "function") + "; ({ usePopoverAnchor });",
    {
      window: { innerWidth: 1280, innerHeight: 900 },
      document: {},
      useEffect: (fn) => effects.push(fn),
      useState: (init) => [init(), (pos) => positions.push(pos)],
    },
  );
  hooks.usePopoverAnchor({ ownerDocument: childDocument, getBoundingClientRect: () => rect });
  const cleanup = effects[0]();
  assert.equal(positions.at(-1).x, 190);
  assert.deepEqual(registrations.map(({ name, type, capture }) => [name, type, capture]), [
    ["popup-window", "resize", undefined], ["popup-document", "scroll", true],
  ]);
  childWindow.innerWidth = 400;
  registrations[0].listener();
  assert.ok(positions.at(-1).x + 300 <= 400);
  cleanup();
  assert.deepEqual(removals, registrations);
});
