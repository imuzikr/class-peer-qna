"use client";

// 보호 페이지 가드 — 로그인하지 않은 사용자를 랜딩(/)으로 보냅니다.
// 인증 상태가 '확정된 뒤'에만 판단합니다(아직 모르는 동안에는 기다립니다).
// Firebase 미설정(데모) 시에는 아무것도 하지 않습니다.
//
// 지금 상태("loading" | "in" | "out")를 돌려줍니다 — 부르는 쪽이 이 값으로
// 본문을 그릴지 말지 정합니다(components/AuthGate.jsx). 리다이렉트만으로는
// 늦습니다: useEffect는 화면이 칠해진 뒤에 도는 터라, 그동안 로그인하지 않은
// 사람에게 질문방이 먼저 보였습니다.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "./firebase";
import { useAuth } from "./authContext";

export function useRequireAuth() {
  const router = useRouter();
  const { status } = useAuth();
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    if (status === "out") router.replace("/");
  }, [status, router]);
  return status;
}
