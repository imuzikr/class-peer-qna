// 파이썬 연계 활동의 셀(lib/pyCells.js) — 옛 카드를 셀로 풀고, 셀을 HTML로 적기.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCells, serializeCells, dedent, isBlankHtml, codeUsesInput } from "@/lib/pyCells";

const LABEL = "<p><strong>실행 결과</strong></p>";

test("옛 카드: 글 · 코드 · 결과 두 번 → 글 셀 + 결과가 붙은 코드 셀 하나(마지막 결과)", () => {
  const html =
    "<p>리스트를 출력해 봤다</p>" +
    "<pre><code>print(123)</code></pre>" +
    `${LABEL}<pre class="py-result"><code>123</code></pre>` +
    `${LABEL}<pre class="py-result"><code>123 두 번째</code></pre>`;
  assert.deepEqual(parseCells(html), [
    { type: "text", html: "<p>리스트를 출력해 봤다</p>" },
    { type: "code", code: "print(123)", output: "123 두 번째" },
  ]);
});

test("표시가 붙기 전의 결과 — 이름줄만으로도 결과로 읽습니다", () => {
  const html = `<pre><code>print(1)</code></pre>${LABEL}<pre><code>1</code></pre>`;
  assert.deepEqual(parseCells(html), [{ type: "code", code: "print(1)", output: "1" }]);
});

test("한 겹 싸인 코드 블록(<div><pre>)과 <br> 줄바꿈 · 글자 부호", () => {
  const html = "<p>앞</p><div><pre><code>if a &lt; b:<br>    print(&quot;x&quot;)</code></pre></div><p>뒤</p>";
  assert.deepEqual(parseCells(html), [
    { type: "text", html: "<p>앞</p>" },
    { type: "code", code: 'if a < b:\n    print("x")', output: null },
    { type: "text", html: "<p>뒤</p>" },
  ]);
});

test("옛 빈 블록의 공백 한 칸 — 공통 들여쓰기를 걷습니다(상대 들여쓰기는 그대로)", () => {
  const html = "<pre><code> for i in range(3):\n     print(i)\n</code></pre>";
  assert.deepEqual(parseCells(html), [
    { type: "code", code: "for i in range(3):\n    print(i)", output: null },
  ]);
  assert.equal(dedent("  a\n    b"), "a\n  b");
});

test("첫 줄에만 붙은 공백 한 칸도 걷습니다(첫 문장만 들여 쓴 코드는 늘 오류)", () => {
  const html = "<pre><code> print(1)\nprint(2)</code></pre>";
  assert.deepEqual(parseCells(html), [{ type: "code", code: "print(1)\nprint(2)", output: null }]);
});

test("빈 코드 블록 · 빈 글은 셀이 되지 않습니다(화면 끝의 검은 띠)", () => {
  const html = "<p>나머지 공부</p><pre><code> </code></pre><p><br></p>";
  assert.deepEqual(parseCells(html), [{ type: "text", html: "<p>나머지 공부</p>" }]);
});

test("짝 없는 결과(앞에 코드가 없거나 사이에 글) — 버리지 않고 글 속에 둡니다", () => {
  const html = `<pre><code>print(1)</code></pre><p>설명</p><pre class="py-result"><code>1</code></pre>`;
  const cells = parseCells(html);
  assert.equal(cells.length, 2);
  assert.deepEqual(cells[0], { type: "code", code: "print(1)", output: null });
  assert.equal(cells[1].type, "text");
  assert.match(cells[1].html, /설명/);
  assert.match(cells[1].html, /py-result/);
});

test("적기: 코드는 py-code, 결과는 바로 뒤 py-result · 부호는 이스케이프", () => {
  const html = serializeCells([
    { type: "text", html: "<p>설명</p>" },
    { type: "code", code: "print(1 < 2)", output: "True" },
    { type: "code", code: "x = 1", output: null },
  ]);
  assert.equal(
    html,
    "<p>설명</p>" +
      '<pre class="py-code"><code>print(1 &lt; 2)</code></pre>' +
      '<pre class="py-result"><code>True</code></pre>' +
      '<pre class="py-code"><code>x = 1</code></pre>'
  );
});

test("적기: 빈 셀은 빠지고, 코드 없는 결과는 적지 않습니다", () => {
  assert.equal(
    serializeCells([
      { type: "text", html: "<p><br></p>" },
      { type: "code", code: "   ", output: "남은 결과" },
      { type: "text", html: "<p>남음</p>" },
    ]),
    "<p>남음</p>"
  );
});

test("적고 다시 풀면 같은 셀 목록(되읽기가 어긋나지 않음)", () => {
  const cells = [
    { type: "text", html: "<p>첫 글</p><ul><li>목록</li></ul>" },
    { type: "code", code: "name = input()\nprint(name)", output: "홍길동\n홍길동" },
    { type: "code", code: "print('<b>')", output: null },
    { type: "text", html: "<p>끝 & 마무리</p>" },
  ];
  assert.deepEqual(parseCells(serializeCells(cells)), cells);
});

test("도우미 — 빈 HTML 판정 · input() 판정", () => {
  assert.equal(isBlankHtml("<p>&nbsp;<br></p>"), true);
  assert.equal(isBlankHtml('<p><img src="https://x/y.png"></p>'), false);
  assert.equal(codeUsesInput("a = input('이름: ')"), true);
  assert.equal(codeUsesInput("print('inputs')"), false);
});

test("오류 글 — Pyodide 자신의 줄은 걷고 학생 코드의 줄만(lib/pyRun.js의 tidyTraceback)", async () => {
  const { tidyTraceback } = await import("@/lib/pyRun");
  const raw = [
    "PythonError: Traceback (most recent call last):",
    '  File "/lib/python312.zip/_pyodide/_base.py", line 597, in eval_code_async',
    "    await CodeRunner(",
    '  File "/lib/python312.zip/_pyodide/_base.py", line 411, in run_async',
    "    coroutine = eval(self.code, globals, locals)",
    "                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^",
    '  File "<exec>", line 2, in <module>',
    "    print(x)",
    "          ^",
    "NameError: name 'x' is not defined",
    "",
  ].join("\n");
  assert.equal(
    tidyTraceback(raw),
    [
      "Traceback (most recent call last):",
      '  File "<exec>", line 2, in <module>',
      "    print(x)",
      "          ^",
      "NameError: name 'x' is not defined",
    ].join("\n")
  );
  // 설치본 줄이 없으면 머리말만 걷습니다
  assert.equal(tidyTraceback("PythonError: EOFError: 입력값이 부족합니다"), "EOFError: 입력값이 부족합니다");
});
