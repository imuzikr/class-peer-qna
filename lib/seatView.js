"use client";

// =============================================================
// 자리표를 어느 쪽에서 보는가 — 학생 보기 / 선생님 보기
// -------------------------------------------------------------
// 학생 보기(기본)는 학생이 앉아 칠판을 보는 방향, 선생님 보기는 교탁에서
// 본 방향이라 좌우·앞뒤가 뒤집힙니다.
//
// 값을 여기 한 곳에 모아 두는 이유: 자리표가 나오는 화면이 넷입니다
// ('멋진 순간' 패널 · 수업 중 자리표 · 자리 배정 창 · 기록 관리).
// 화면마다 따로 기억하면 한 화면에서 뒤집어 놓고 다른 화면으로 갔을 때
// 방향이 달라, 같은 반의 자리표가 두 얼굴이 됩니다.
//
// 개인 화면 설정이라 localStorage에 둡니다(한 선생님은 대개 늘 같은 쪽에서
// 봅니다). 같은 탭 안의 다른 패널도 곧바로 따라오도록 창 이벤트로 알립니다 —
// storage 이벤트는 **다른 탭에만** 오기 때문입니다.
// =============================================================
import { useEffect, useState } from "react";

export const SEATVIEW_KEY = "reward_seat_view";
const GRID_NARROW = "(max-width: 768px)";
const EVENT = "seat-view-change";

export function getSeatView() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SEATVIEW_KEY) === "teacher";
  } catch {
    return false;
  }
}

export function setSeatView(teacherView) {
  try {
    localStorage.setItem(SEATVIEW_KEY, teacherView ? "teacher" : "student");
  } catch {
    /* 저장이 막혀 있어도 이번 화면에서는 바뀌어야 하므로 무시합니다 */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

// [teacherView, toggle] — 서버에서는 늘 false(학생 보기)로 시작해,
// 하이드레이션이 끝난 뒤 저장된 값으로 맞춥니다(서버·브라우저 첫 그림 일치).
export function useSeatView() {
  const [teacherView, setTeacherView] = useState(false);

  useEffect(() => {
    const sync = () => setTeacherView(getSeatView());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return [teacherView, () => setSeatView(!getSeatView())];
}

// ── 명단 격자를 선생님 보기로 돌리기 ────────────────────────────
// 자리표(빈 칸이 섞인 격자)는 그림을 180도 돌립니다. 기록 관리의 명단
// 격자는 그러면 안 돼서(안쪽이 구르는 칸이라 그림을 돌리면 **스크롤이
// 거꾸로** 됩니다) 배열을 뒤집어 왔는데, **그냥 뒤집으면 180도가 아닙니다.**
//
// 마지막 줄이 덜 차 있으면 줄 경계가 그만큼 밀립니다 — 22명·6칸이면
// 셋째 줄에 있던 두 사람(김민경·최윤)이 첫 줄로 올라와, 같은 반을 자리표와
// 견줄 때 줄이 어긋납니다(실측). 뒤에 비어 있던 칸 수만큼 **앞을 빈 칸으로
// 채워** 뒤집어야 자리표를 돌린 그림과 같아집니다.
//
//   학생 보기      선생님 보기(지금)        선생님 보기(맞는 것)
//   a1 … a6        a22 a21 a20 a19 a18 a17   ·   ·   a22 a21 a20 a19
//   a7 … a12       a16 …                     a18 a17 a16 a15 a14 a13
//   a13 … a18      a10 …                     a12 …
//   a19 … a22      a4 a3 a2 a1               a6 …
//
// 빈 칸은 `null`로 옵니다 — 부르는 쪽이 자리만 차지하는 칸을 그립니다.
export function flipRoster(list, cols) {
  const back = [...list].reverse();
  if (!cols || cols < 1 || list.length === 0) return back;
  const pad = (cols - (list.length % cols)) % cols;
  return [...Array(pad).fill(null), ...back];
}

// 격자가 한 줄에 몇 칸인가 — **CSS의 @media와 같은 값이어야** 합니다.
// 위 셈이 칸 수를 알아야 하는데 그 값은 화면 폭에 따라 바뀝니다
// (`.notes-mgr-grid`가 768px 아래에서 6칸 → 3칸). 한쪽만 고치면 좁은
// 화면에서만 줄이 어긋나 찾기 어렵습니다.
export function useGridCols(wide, narrow) {
  const [cols, setCols] = useState(wide);

  useEffect(() => {
    const mq = window.matchMedia(GRID_NARROW);
    const sync = () => setCols(mq.matches ? narrow : wide);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [wide, narrow]);

  return cols;
}
