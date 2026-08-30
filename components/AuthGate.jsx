"use client";

// =============================================================
// 보호 페이지 관문 — 로그인이 확정되기 전에는 본문을 그리지 않습니다
// -------------------------------------------------------------
// 자식을 element로만 받아 두고 status가 "in"일 때 비로소 렌더합니다.
// 그러면 그 안의 훅과 Firestore 구독이 아예 돌지 않습니다 — 로그인하지
// 않은 사람에게 질문방이 잠깐 보이던 문제가 여기서 끝나고, 덤으로 튕겨
// 나갈 사람 몫의 읽기와 permission-denied도 생기지 않습니다.
//
// "out"일 때도 로딩 화면을 그대로 둡니다. 곧 랜딩으로 넘어갈 참이라,
// 그 찰나에 본문을 보여 줄 이유가 없습니다.
// =============================================================
import { useRequireAuth } from "@/lib/useRequireAuth";

export default function AuthGate({ children }) {
  const status = useRequireAuth();
  if (status !== "in") {
    return (
      <div className="auth-gate" role="status" aria-live="polite">
        <span className="auth-gate-spinner" aria-hidden="true" />
        <span className="sr-only">불러오는 중</span>
      </div>
    );
  }
  return children;
}
