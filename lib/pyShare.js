// =============================================================
// 파이썬 실행기 → 프로젝트 활동 칸에 넣을 HTML 조각
// -------------------------------------------------------------
// 코드는 코드 블록으로, 그 아래에 실행 결과를 함께 담습니다. 나중에 카드를
// 펴 봤을 때 '무엇을 짰고 무엇이 나왔나'가 한눈에 남아야 복습이 됩니다.
//
// [태그는 정화기가 허용하는 것만] lib/html.js의 ALLOWED_TAGS 안에서만
// 짭니다(PRE·CODE·P·STRONG·BR). 여기서 새 태그를 쓰면 저장될 때 조용히
// 걷혀, 화면에서는 멀쩡했는데 다시 열면 서식이 풀린 글이 됩니다.
//
// [값은 반드시 escapeHtml] 학생이 짠 코드에는 `<`, `>`, `&`가 예사로
// 들어갑니다(`if a < b:`, `print("<hr>")`). 그대로 넣으면 태그로 읽혀
// 코드가 사라지거나 카드가 깨집니다.
// =============================================================
import { escapeHtml } from "@/lib/html";

// 실행기의 출력 줄({type, text})을 사람이 읽는 한 덩이로.
// 안내 줄('── 실행 완료 ──' 등)은 빼고 실제 출력·오류만 남깁니다 —
// 카드에 남길 것은 프로그램이 낸 말이지 실행기가 낸 말이 아닙니다.
export function outputTextOf(lines) {
  return (lines ?? [])
    .filter((l) => l?.type === "out" || l?.type === "err" || l?.type === "result")
    .map((l) => String(l.text ?? ""))
    .join("")
    .replace(/\s+$/, "");
}

// 코드 + 실행 결과 → 활동 칸에 이어 붙일 HTML.
// 결과가 없으면(아직 안 돌렸거나 출력이 없으면) 코드 블록만 넣습니다 —
// 빈 '실행 결과' 칸이 남으면 안 돌린 것인지 출력이 없는 것인지 헷갈립니다.
//
// [결과는 **지금 코드가 낸 것일 때만**] 출력 칸은 마지막으로 돌린 결과를
// 그대로 들고 있어서, 코드를 고치고 다시 안 돌린 채 보내면 **바뀐 코드에
// 지난 결과**가 붙습니다(`print('hello world')`인데 결과는 `hello`). 카드에
// 남는 것은 두 달 뒤 복습할 기록이라, 짝이 안 맞는 결과를 붙이느니 코드만
// 넣습니다. `ranCode`는 그 출력을 낸 코드입니다 — 안 넘기면 지금까지처럼
// 그대로 붙입니다(그 자리에서는 견줄 것이 없으므로).
export function pyShareHtml(code, lines, ranCode) {
  const src = String(code ?? "").replace(/\s+$/, "");
  if (!src.trim()) return "";
  const stale =
    ranCode !== undefined &&
    ranCode !== null &&
    String(ranCode).replace(/\s+$/, "") !== src;
  const out = stale ? "" : outputTextOf(lines);
  let html = `<pre><code>${escapeHtml(src)}</code></pre>`;
  if (out) {
    html += `<p><strong>실행 결과</strong></p><pre><code>${escapeHtml(out)}</code></pre>`;
  }
  return html;
}
