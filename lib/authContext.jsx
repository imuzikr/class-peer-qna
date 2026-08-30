"use client";

// =============================================================
// 인증 상태 — 앱 전체에서 한 번만 판정합니다
// -------------------------------------------------------------
// [왜 컨텍스트로 모았나]
// 예전에는 useCurrentUser()·useRequireAuth()가 각자 onAuthChange를
// 구독했습니다. 두 훅이 QuestionCard·MeTooButton 안에도 들어 있어서, 질문
// 카드가 늘어나면 인증 구독도 그만큼 늘고 각자 따로 buildAppUser(토큰 조회 +
// users 문서 읽기)를 돌렸습니다. 판정은 어차피 하나인데 값을 여러 번 치렀고,
// 그중 하나만 실패해도 화면이 로그인 상태를 달리 보는 일이 생겼습니다.
//
// [status가 세 가지인 이유 — 이게 핵심입니다]
// 예전에는 사용자 값 하나(null이냐 아니냐)로 모든 걸 판단했는데, null이
// '아직 모름'과 '로그인 안 됨' 두 가지를 겸했습니다. Firebase는 세션을
// IndexedDB에서 비동기로 복원하므로 첫 순간은 언제나 '아직 모름'인데, 그걸
// '로그인 안 됨'과 구분하지 못해 보호 페이지가 먼저 그려졌다가 랜딩으로
// 튕겼습니다(질문방이 잠깐 보이던 원인). 그래서 셋으로 나눕니다.
//
//   "loading" — 아직 모름. 보호 페이지는 이 동안 본문을 그리지 않습니다.
//   "in"      — 로그인됨
//   "out"     — 로그인 안 됨. 보호 페이지는 랜딩으로 보냅니다.
//
// 첫 상태가 "loading"이라, 정적으로 미리 만들어지는 HTML에도 본문 대신
// 로딩 화면이 담깁니다 — 브라우저가 받자마자 그려도 남의 화면이 보이지
// 않습니다.
//
// 데모 모드(Firebase 미설정)에는 로그인이라는 게 없으므로 곧바로 "in"입니다.
// =============================================================
import { createContext, useContext, useEffect, useState } from "react";
import { getCurrentUser } from "./user";
import { isFirebaseConfigured } from "./firebase";
import { onAuthChange } from "./auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, status: "loading" });

  useEffect(() => {
    if (isFirebaseConfigured) {
      return onAuthChange((u) => setState({ user: u, status: u ? "in" : "out" }));
    }
    // 데모 모드 — 역할 전환(RoleSwitcher)에도 따라갑니다
    const sync = () => setState({ user: getCurrentUser(), status: "in" });
    sync();
    window.addEventListener("role-change", sync);
    return () => window.removeEventListener("role-change", sync);
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

// 공급자 밖에서 불려도 터지지 않게 — '아직 모름'으로 답합니다.
const OUTSIDE = { user: null, status: "loading" };

export function useAuth() {
  return useContext(AuthContext) ?? OUTSIDE;
}
