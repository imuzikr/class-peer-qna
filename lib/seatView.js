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

// ── 명단 격자를 선생님 보기로 돌리기 ────────────────────────────
// **줄 차례만 뒤집습니다 — 줄 안의 왼쪽→오른쪽은 그대로 둡니다.**
// 맞춰야 할 상대는 자리표(`.attend-seatmap-grid--flipped`)입니다. 교사는
// 자리표를 보며 이 격자에서 같은 학생을 짚으므로, 두 화면의 줄이 같은
// 차례로 서야 눈이 한 번에 갑니다.
//
// **'배열을 통째로 뒤집기'도 '진짜 180도'도 아닙니다.** 둘 다 줄 안의
// 좌우가 뒤집혀 자리표와 반대로 섭니다(실제 신고 — 자리표에서 왼쪽에 선
// 학생이 여기서는 오른쪽 끝에 있었습니다). 자리표가 그렇게 보이는 것은
// 선생님이 **교탁에서 봤을 때 학번이 왼쪽→오른쪽으로 올라가도록** 자리를
// 배정해 두었기 때문이고, 학번순으로 늘어놓는 이 격자도 선생님 보기에서
// 같은 방향이어야 합니다.
//
// 마지막 줄이 덜 차 있으면 **그 줄 뒤를 빈 칸으로 채웁니다** — 안 채우면
// 그 인원이 다음 줄로 흘러 들어가 줄 묶음이 통째로 밀립니다.
//
//   학생 보기                      선생님 보기
//   a1  a2  a3  a4  a5  a6         a19 a20 a21 a22  ·   ·
//   a7  a8  a9  a10 a11 a12        a13 a14 a15 a16 a17 a18
//   a13 a14 a15 a16 a17 a18        a7  a8  a9  a10 a11 a12
//   a19 a20 a21 a22                a1  a2  a3  a4  a5  a6
//
// 빈 칸은 `null`로 옵니다 — 부르는 쪽이 자리만 차지하는 칸을 그립니다.
export function flipRoster(list, cols) {
  if (!cols || cols < 1 || list.length === 0) return [...list];
  const rows = [];
  for (let i = 0; i < list.length; i += cols) rows.push(list.slice(i, i + cols));
  const last = rows[rows.length - 1];
  // 덜 찬 줄의 **뒤**를 채웁니다(앞이 아니라) — 그 줄은 학생 보기에서도
  // 왼쪽부터 차 있었고, 줄 안의 차례는 안 건드리는 것이 이 함수의 규칙입니다.
  while (last.length < cols) last.push(null);
  return rows.reverse().flat();
}
