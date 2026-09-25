// =============================================================
// 실행 결과 → 프로젝트 활동 칸에 넣을 HTML 조각
// -------------------------------------------------------------
// 코드 블록 아래에 실행 결과를 함께 담습니다. 나중에 카드를
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

// 실행 결과 한 덩이 — '실행 결과' 이름줄 + 코드 블록.
// 수업 노트 서랍 활동 칸의 '결과 붙이기'가 씁니다. 예전에는 실행기의
// '활동으로 보내기'도 이것을 썼는데, 학생은 이제 서랍에서 곧바로 쓰고
// 돌리므로 그 길이 없어졌습니다(CornellNoteDrawer의 '프로젝트 활동').
export function pyResultHtml(out) {
  const text = String(out ?? "").replace(/\s+$/, "");
  if (!text) return "";
  // `class="py-result"`는 정화기가 남겨 줍니다(lib/html.js의 ALLOWED_CLASSES) —
  // 저장했다 다시 열어도 '이건 출력이지 코드가 아니다'가 남습니다.
  return `<p><strong>실행 결과</strong></p><pre class="py-result"><code>${escapeHtml(text)}</code></pre>`;
}
