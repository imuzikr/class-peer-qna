// =============================================================
// 파이썬 연계 활동의 셀 — 글 셀 · 코드 셀 (코랩과 같은 생각)
// -------------------------------------------------------------
// 파이썬 실행기와 연계한 프로젝트에서는 활동 칸 하나가 **셀 목록**입니다.
//   { type: "text", html }                    — 서식 있는 글
//   { type: "code", code, output }            — 코드 한 벌과 **그 코드가 낸** 결과
//
// [왜 셀인가]
// 예전에는 활동 칸이 서식 에디터 한 칸이라 글과 코드 블록이 섞여 있었고,
// '결과 붙이기'는 칸 끝에 결과 블록을 **덧붙이기만** 했습니다. 어느 코드가
// 어느 결과의 짝인지 저장된 곳이 없어, ▶ 실행이 돌릴 블록을 추측하고(커서가
// 든 블록 · 마지막 블록 · 결과 블록 건너뛰기) 같은 결과가 두 번 붙곤 했습니다.
// 셀은 코드와 결과를 **한 덩이**로 들고 있어 그 추측이 없어집니다.
//
// [저장은 지금과 같은 HTML 한 덩이]
// 새 필드를 두지 않고 셀 목록을 HTML로 적어 카드의 `content`에 넣습니다.
//   · 보안 규칙이 카드 필드를 못 박아 두어(`changedOnly([...'content'...])`)
//     새 필드는 규칙 배포가 필요합니다 — HTML이면 그대로입니다.
//   · 카드를 **읽는** 화면 일곱 곳(미리보기 · 모아보기 · 활동보기 · 발표 모드 ·
//     카드 창 · 전광판 · 내보내기)이 이 HTML을 그리므로 그대로 돕니다.
// 코드 셀은 `<pre class="py-code">`, 결과는 **바로 뒤의** `<pre class="py-result">`
// 입니다 — 짝이 저장된 모양 안에 들어 있습니다.
//
// [옛 카드도 그대로 읽습니다 — 옮기지 않습니다]
// 표시 없는 `<pre>`는 코드 셀, 그 바로 뒤의 결과 블록(표시가 있거나 '실행 결과'
// 이름줄이 앞에 선 것)은 그 셀의 결과로 읽습니다. 결과가 두 번 붙은 칸은
// **마지막 결과 하나**만 남습니다. 옛 '실행 결과' 이름줄은 버립니다(새
// 모양에서는 CSS가 그 이름을 그립니다).
//
// **브라우저 없이 도는 순수 함수**입니다(DOMParser를 안 씁니다) — 단위 시험이
// Node에서 곧바로 읽습니다(tests/unit/pyCells.test.mjs).
// =============================================================
import { escapeHtml } from "./html";

const PRE_RE = /<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi;
// 결과 블록 앞의 옛 이름줄 — `<p><strong>실행 결과</strong></p>`(lib/pyShare.js)
const LABEL_TAIL_RE = /<p>\s*(?:<(?:strong|b)>)?\s*실행 결과\s*(?:<\/(?:strong|b)>)?\s*<\/p>\s*$/i;

// ── HTML 안의 글자 ↔ 코드 글자 ──────────────────────────────
function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

// `<pre>` 안쪽 HTML → 글자. 서식 에디터가 줄바꿈을 `<br>`로 넣기도 합니다.
function textOfPre(inner) {
  return decodeEntities(
    String(inner ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
  ).replace(/\r\n?/g, "\n");
}

// 줄 전체에 **공통으로** 있는 들여쓰기를 걷어 냅니다(파이썬 textwrap.dedent).
// 옛 코드 블록은 빈 채로 만들면 공백 한 칸으로 시작해, 저장된 카드에는 그
// 칸이 줄 앞에 남아 있습니다 — 안 걷으면 IndentationError입니다. 공통
// 들여쓰기만 걷으므로 줄 사이의 상대 들여쓰기는 그대로입니다.
export function dedent(code) {
  const s = String(code ?? "");
  const lines = s.split("\n");
  const used = lines.filter((l) => l.trim());
  if (used.length === 0) return s;
  const min = Math.min(...used.map((l) => (l.match(/^[ \t]*/) ?? [""])[0].length));
  return min > 0 ? lines.map((l) => l.slice(min)).join("\n") : s;
}

// 코드 셀의 글자 — 앞뒤 빈 줄 · 공통 들여쓰기를 걷습니다.
// 공통 들여쓰기를 걷고도 **첫 줄만** 들여 써져 있으면(옛 빈 블록의 공백
// 한 칸이 첫 줄에만 붙은 경우) 그 앞 공백도 걷습니다 — 첫 문장만 들여 쓴
// 코드는 파이썬에서 늘 IndentationError라, 걷어서 틀어지는 코드는 없습니다.
function cleanCode(text) {
  const lines = dedent(String(text ?? "").replace(/^\s*\n/, "")).split("\n");
  const first = lines.findIndex((l) => l.trim());
  if (first >= 0) lines[first] = lines[first].replace(/^[ \t]+/, "");
  return lines.join("\n").replace(/\s+$/, "");
}

// 글 셀이 비었나 — 태그·빈칸을 걷고 글자도 그림도 없으면 빈 것.
export function isBlankHtml(html) {
  const s = String(html ?? "");
  if (/<img\b/i.test(s)) return false;
  return decodeEntities(s.replace(/<[^>]*>/g, "")).trim() === "";
}

// 코드 블록을 감싼 겹을 벗긴 조각의 앞뒤에 남는 **짝 없는 태그**를 걷습니다.
// (`<div><pre>…</pre></div>`처럼 한 겹 싸여 저장된 옛 칸에서, 앞 조각 끝에
// `<div>`, 뒤 조각 머리에 `</div>`가 남습니다.)
function tidyFragment(s) {
  return String(s ?? "")
    .replace(/^(\s*<\/[a-z0-9]+\s*>)+/i, "")
    .replace(/(<[a-z0-9]+(\s[^>]*)?>\s*)+$/i, "");
}

// ── 풀기: 활동 칸 HTML → 셀 목록 ────────────────────────────
export function parseCells(html) {
  const src = String(html ?? "").replace(/<div>\s*(<pre\b[\s\S]*?<\/pre>)\s*<\/div>/gi, "$1");
  const cells = [];
  let text = ""; // 아직 셀로 내보내지 않은 글
  let lastCode = null; // 바로 앞의 코드 셀 — 그 뒤 결과가 붙을 곳
  let last = 0;

  const flushText = () => {
    const t = tidyFragment(text);
    if (!isBlankHtml(t)) {
      const prev = cells[cells.length - 1];
      if (prev?.type === "text") prev.html += t;
      else cells.push({ type: "text", html: t });
    }
    text = "";
  };

  PRE_RE.lastIndex = 0;
  let m;
  while ((m = PRE_RE.exec(src))) {
    text += src.slice(last, m.index);
    last = PRE_RE.lastIndex;
    const labelled = LABEL_TAIL_RE.test(text);
    const isResult = /\bpy-result\b/.test(m[1]) || labelled;

    if (isResult) {
      const before = labelled ? text.replace(LABEL_TAIL_RE, "") : text;
      if (lastCode && isBlankHtml(tidyFragment(before))) {
        // 그 코드의 결과 — 여러 번 붙어 있으면 마지막 것이 남습니다.
        lastCode.output = textOfPre(m[2]).replace(/\s+$/, "") || null;
        text = "";
      } else {
        // 짝이 될 코드가 없는 결과 — 버리지 않고 글 속에 그대로 둡니다.
        text += m[0];
        lastCode = null;
      }
      continue;
    }

    flushText();
    lastCode = { type: "code", code: cleanCode(textOfPre(m[2])), output: null };
    cells.push(lastCode);
  }
  text += src.slice(last);
  flushText();
  return cells.filter((c) => c.type === "text" || c.code);
}

// ── 적기: 셀 목록 → 활동 칸 HTML ────────────────────────────
// 빈 글 셀 · 빈 코드 셀은 안 적습니다('＋'를 눌러 두고 안 쓴 셀이 남지 않게).
// 결과는 코드가 있을 때만 적습니다.
export function serializeCells(cells) {
  return (cells ?? [])
    .map((c) => {
      if (c?.type === "code") {
        const code = String(c.code ?? "").replace(/\s+$/, "");
        if (!code.trim()) return "";
        const out = String(c.output ?? "").replace(/\s+$/, "");
        return (
          `<pre class="py-code"><code>${escapeHtml(code)}</code></pre>` +
          (out ? `<pre class="py-result"><code>${escapeHtml(out)}</code></pre>` : "")
        );
      }
      const html = String(c?.html ?? "");
      return isBlankHtml(html) ? "" : html;
    })
    .join("");
}

// 이 코드가 input()을 쓰나 — 쓰면 그 셀 아래에 입력값 칸이 섭니다.
export function codeUsesInput(code) {
  return /\binput\s*\(/.test(String(code ?? ""));
}
