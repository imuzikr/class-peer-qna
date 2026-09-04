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
