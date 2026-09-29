// =============================================================
// 활동 예시 코드 — 파이썬 연계 프로젝트에서 교사가 활동마다 적어 두는 코드
// -------------------------------------------------------------
// 만들기 창 · 원본 편집 창의 활동 줄마다 '예시 코드' 단추가 있고, 적어 둔
// 코드는 학생 카드의 빈 활동 칸에 희미하게 보이며 셀 창(PyCellModal)의
// 왼쪽 열에 그대로 섭니다.
//
// [활동 **이름**으로 짚습니다] 원본·보드 문서의 `activityExamples`는
// `{ [활동 이름]: 코드 }` 맵입니다. 활동은 여러 자리(수업 편집 · 활동 패널 ·
// 순서 바꾸기 · 파이썬 실행기)에서 지워지고 옮겨지는데, 활동 목록과 나란한
// 배열로 두면 그 자리를 전부 함께 고쳐야 하고 하나만 빠져도 예시가 엉뚱한
// 활동에 붙습니다. 이름으로 짚으면 순서가 바뀌어도 제 활동을 따라가고,
// 이름을 고친 활동은 예시를 잃을 뿐 남의 활동에 붙지 않습니다(어긋나면
// '사라지는' 쪽으로만 무너집니다 — 수업 노트 하이라이트와 같은 생각).
//
// 이름은 앞뒤 공백을 걷어 짚습니다 — 저장되는 활동 이름도 걷은 값입니다.
// 예시는 **글자 그대로**(HTML 아님) 다루고 화면도 글자로만 그립니다.
// =============================================================

// 한 활동의 예시 코드 천장 — 셀 한 칸(코드)과 같은 몫
export const EXAMPLE_MAX = 5000;

const keyOf = (name) => String(name ?? "").trim();

// 끝 공백·빈 줄만 걷습니다 — 앞 들여쓰기는 코드의 일부입니다.
export function cleanExample(code) {
  return String(code ?? "").replace(/\s+$/, "").slice(0, EXAMPLE_MAX);
}

// 보드(또는 원본)에서 그 활동의 예시 — 없으면 빈 글
export function exampleOf(doc, activityName) {
  const map = doc?.activityExamples;
  if (!map || typeof map !== "object") return "";
  const key = keyOf(activityName);
  if (!key) return "";
  const v = map[key];
  return typeof v === "string" ? v : "";
}

// 창의 활동 줄(배열)과 나란한 예시(배열) → 저장할 맵.
// 이름이 빈 줄 · 예시가 빈 줄은 뺍니다. 같은 이름이 둘이면 앞의 것이 남습니다.
export function examplesToMap(activities, examples) {
  const out = {};
  (activities ?? []).forEach((name, i) => {
    const key = keyOf(name);
    const code = cleanExample(examples?.[i]);
    if (!key || !code.trim() || key in out) return;
    out[key] = code;
  });
  return out;
}

// 저장된 맵 → 창의 활동 줄과 나란한 배열(없는 것은 빈 글)
export function examplesFromMap(activities, map) {
  return (activities ?? []).map((name) => exampleOf({ activityExamples: map }, name));
}

// 맵에서 지금 활동 목록에 있는 이름만 남깁니다 — 복사본에 옮길 때
// 쓰지 않는 예시까지 실어 보내지 않게.
export function examplesFor(activities, map) {
  return examplesToMap(activities, examplesFromMap(activities, map));
}
