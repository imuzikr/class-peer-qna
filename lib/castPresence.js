"use client";

// =============================================================
// 이 화면에 '수업 종료'가 이미 있나 — 상단바 방송 종료 알약을 비키게
// -------------------------------------------------------------
// 상단바(TopNav)는 교사의 반에 방송이 켜져 있으면 오른쪽 아래에 '방송 종료'
// 알약을 띄웁니다 — 어느 화면에 있든 학생 화면을 풀어 줄 수 있는 안전장치.
//
// 그런데 책방 네 활동(곁텍스트 · RAFT · KWLS · 해시태그)은 방송 중에 **수업
// 화면 창**(CastStageModal)이 있고, 그 창 오른쪽 아래에 '수업 종료'가 섭니다.
// 알약까지 뜨면 같은 일을 하는 단추가 한 화면에 둘이라(선생님 지적) 이 화면이
// 떠 있는 동안에는 알약을 감춥니다.
//
// **감추기만 합니다 — 없애지 않습니다.** 그 보드는 벗어나는 순간 방송을
// 끄므로(`useEntryCast`의 정리) 이 화면 밖에서는 늘 알약이 돌아옵니다. 수업
// 모드 · 발표 모드 · 닿소리 · 마인드맵은 지금까지 그대로 알약이 섭니다.
//
// 상단바와 보드는 부모·자식이 아니라 **값을 들고 있는 작은 저장소**로 잇습니다
// (`lib/projectTask.js`의 머무는 프로젝트와 같은 방식).
// =============================================================
import { useEffect, useSyncExternalStore } from "react";

let count = 0;
const listeners = new Set();
function emit() {
  listeners.forEach((fn) => fn());
}
function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// 수업 종료 단추를 가진 쪽이 부릅니다 — 붙어 있는 동안 '있다'로 셉니다.
// 여럿이 함께 붙어도 되게 개수로 셉니다(하나가 떨어져도 나머지가 남으면 그대로).
export function useCastStopHere(active = true) {
  useEffect(() => {
    if (!active) return;
    count += 1;
    emit();
    return () => {
      count -= 1;
      emit();
    };
  }, [active]);
}

// 상단바가 부릅니다 — 참이면 알약을 감춥니다.
export function useCastStopElsewhere() {
  return useSyncExternalStore(
    subscribe,
    () => count > 0,
    () => false
  );
}
