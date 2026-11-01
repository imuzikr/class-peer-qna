// CSS 입구 지키기 — app/globals.css는 app/styles/의 파일을 **차례대로** 불러오기만 합니다.
// 같은 선택자가 여러 파일에 나뉜 곳이 있어 @import 차례가 곧 우선순위입니다(docs/ui.md
// 'CSS 파일 구조'). 차례가 어긋나거나, 파일이 빠지거나, 입구에 규칙이 섞이면 여기서 드러납니다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const entry = readFileSync(join(ROOT, "app/globals.css"), "utf8");
const imports = [...entry.matchAll(/@import\s+"\.\/styles\/([^"]+)";/g)].map((m) => m[1]);

test("입구 파일에는 주석과 @import만 있습니다", () => {
  const rest = entry.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@import\s+"[^"]+";/g, "").trim();
  assert.equal(rest, "", "규칙은 app/styles/의 파일에 적으세요.");
});

test("app/styles/의 모든 파일을 한 번씩, 번호 차례대로 불러옵니다", () => {
  const onDisk = readdirSync(join(ROOT, "app/styles")).filter((f) => f.endsWith(".css")).sort();
  assert.deepEqual([...imports].sort(), onDisk, "불러오지 않는 파일이나 없는 파일이 있습니다.");
  assert.equal(new Set(imports).size, imports.length, "같은 파일을 두 번 불러옵니다.");
  const nums = imports.map((f) => Number(f.match(/^(\d+)-/)?.[1]));
  assert.ok(nums.every(Number.isFinite), "파일 이름은 'NN-이름.css'입니다.");
  assert.deepEqual(nums, [...nums].sort((a, b) => a - b), "@import 차례가 번호 차례와 다릅니다.");
  for (const f of imports) assert.ok(existsSync(join(ROOT, "app/styles", f)));
});

test("나눈 파일 안에는 @import가 없습니다(차례는 입구 한 곳에서만)", () => {
  const nested = imports.filter((f) => /@import/.test(
    readFileSync(join(ROOT, "app/styles", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")));
  assert.deepEqual(nested, []);
});
