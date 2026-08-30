"use client";

// 현재 로그인 사용자를 반환합니다(로그인 전/로딩 중에는 null).
//
// 판정은 AuthProvider가 앱 전체에서 한 번만 합니다 — 예전에는 이 훅이
// 불릴 때마다 onAuthChange를 따로 구독해서, 질문 카드가 늘어나면 인증
// 구독도 그만큼 늘었습니다(lib/authContext.jsx 설명 참고).
//
// '아직 모름'과 '로그인 안 됨'을 구분해야 하는 자리(보호 페이지의 관문)는
// 이 훅이 아니라 useAuth()의 status를 보세요 — 여기서는 둘 다 null입니다.
import { useAuth } from "./authContext";

export function useCurrentUser() {
  return useAuth().user;
}
