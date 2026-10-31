// 문서 지키기 — 루트 CLAUDE.md는 매 세션 읽히는 핵심 규칙과 길 안내만 둡니다.
// 6,532줄까지 불어나 핵심 규칙이 묻히고 서로 어긋난 일을 되풀이하지 않도록,
// 길이 천장과 '문서가 가리키는 것이 실제로 있는가'를 봅니다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const DOCS = readdirSync(join(ROOT, "docs")).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`);
const ALL = ["CLAUDE.md", ...DOCS];

// 문서가 '걷어 냈다'고 적어 둔 옛 파일 · 임시 파일. 여기 없는 경로가 사라졌으면
// 화면이나 파일을 걷은 사람이 문서도 함께 고쳐야 합니다.
const KNOWN_GONE = new Set([
  "app/tmpXX/page.js",        // 데모 확인용 임시 페이지(예시 이름)
  "lib/castPresence.js",      // books.md — 방송 종료 알약 감추기, 걷음
  "lib/exportHashtag.js",     // books-activities.md — 해시태그 보고서, 걷음
  "lib/projectTask.js",       // study.md · lesson.md — 서랍의 프로젝트 활동, 걷음
]);

test("루트 CLAUDE.md는 300줄을 넘지 않습니다", () => {
  const lines = read("CLAUDE.md").split("\n").length;
  assert.ok(lines <= 300, `CLAUDE.md가 ${lines}줄입니다 — 세부는 docs/의 주제 문서로 옮기세요.`);
});

test("문서 사이의 링크가 가리키는 파일이 있습니다", () => {
  const broken = [];
  for (const file of ALL) {
    for (const [, target] of read(file).matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
      if (/^https?:/.test(target)) continue;
      const path = join(ROOT, dirname(file), target);
      if (!existsSync(path)) broken.push(`${file} → ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});

test("문서에 적힌 파일 경로가 실제로 있습니다", () => {
  const missing = [];
  const pattern = /`((?:components|lib|app|functions|tests|scripts|public|docs|tools)\/[A-Za-z0-9_./[\]-]+?)`/g;
  for (const file of ALL) {
    read(file).split("\n").forEach((line, i) => {
      for (const [, raw] of line.matchAll(pattern)) {
        const path = raw.replace(/\/$/, "");
        if (KNOWN_GONE.has(path) || path.includes("*")) continue;
        if (!existsSync(join(ROOT, path))) missing.push(`${file}:${i + 1} ${path}`);
      }
    });
  }
  assert.deepEqual(missing, []);
});

test("주제 문서는 맨 위에 '먼저 지킬 것'을 둡니다", () => {
  const skip = new Set(["docs/README.md", "docs/protected-attachments-rollout.md", "docs/protected-attachments-validation.md"]);
  const lacking = DOCS.filter((f) => !skip.has(f))
    .filter((f) => !read(f).split("\n").slice(0, 12).some((l) => l.startsWith("## 먼저 지킬 것")));
  assert.deepEqual(lacking, []);
});

test("문서 지도가 모든 주제 문서를 가리킵니다", () => {
  const map = read("docs/README.md");
  const root = read("CLAUDE.md");
  const topics = DOCS.filter((f) => !/README|protected-attachments-validation/.test(f));
  const absent = topics.filter((f) => !map.includes(f.slice(5)) || !root.includes(f));
  assert.deepEqual(absent, []);
});
