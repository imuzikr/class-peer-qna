// =============================================================
// '프로젝트 활동' 열기 — 공부방 화면 → 수업 노트 서랍
// -------------------------------------------------------------
// 파이썬 실행기와 연계된 프로젝트에서 학생이 활동 칸의 '파이썬 실행기' 단추를
// 누르면, 실행기가 아니라 **오른쪽 수업 노트 서랍**이 열리고 그 활동 칸이
// 섭니다(수업 중 '오늘의 활동'과 같은 모습 — 코드 블록 · ▶ 실행 · 결과 붙이기).
//
// 서랍은 상단바(TopNav)가 그리고 단추는 페이지 깊숙이 있어 둘이 부모·자식이
// 아닙니다. 그 사이를 prop으로 잇자면 공부방 페이지 → 상단바를 거쳐야 하는데,
// 상단바는 다섯 화면이 함께 쓰는 것이라 이 한 가지를 위해 모든 페이지에
// 통로를 뚫을 수는 없습니다. 그래서 **창 이벤트 하나**로 잇습니다(자리표
// '선생님 보기'가 같은 탭의 다른 패널에 알리는 방식과 같습니다).
// =============================================================

const EVT = "open-project-task";

// 단추가 부릅니다 — 그 프로젝트의 그 활동을 서랍에 엽니다.
export function openProjectTask(boardId, actIndex) {
  if (typeof window === "undefined" || !boardId) return;
  window.dispatchEvent(
    new CustomEvent(EVT, { detail: { boardId, actIndex: Number(actIndex) || 0 } })
  );
}

// 서랍이 듣습니다. 돌려주는 함수로 끊습니다.
export function onOpenProjectTask(callback) {
  if (typeof window === "undefined") return () => {};
  const h = (e) => callback(e.detail);
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}
