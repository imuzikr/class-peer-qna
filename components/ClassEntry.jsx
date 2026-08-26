"use client";

// =============================================================
// 반 입장 화면 (학생) — 공부방은 반별 공간이라 입장 코드가 필요합니다.
// -------------------------------------------------------------
// 코드를 맞게 입력하면 그 반 id를 세션에 저장하고 공부방을 보여줍니다.
// 실명/명부 없이 "어느 반인지"만 기억하므로 익명성은 그대로 유지됩니다.
// =============================================================
import { useEffect, useState } from "react";
import { findClassByCode, joinClass } from "@/lib/store";
import { setSelectedClassId } from "@/lib/classroom";
import { getCurrentUser } from "@/lib/user";
import { isFirebaseConfigured } from "@/lib/firebase";

export default function ClassEntry() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  // 손님 계정(등록 코드가 반을 지정한 계정)은 입장 코드를 묻지 않습니다 —
  // 어차피 그 반 말고는 들어갈 수 없으므로(보안 규칙), 코드를 받아 봐야
  // 거부만 됩니다. 가입 직후 자동 소속이 네트워크 오류 등으로 실패했더라도
  // 이 화면에 닿으면 여기서 다시 시도해 스스로 회복합니다.
  const homeClassId = getCurrentUser()?.homeClassId ?? null;
  const [homeError, setHomeError] = useState("");
  useEffect(() => {
    if (!homeClassId) return;
    let cancelled = false;
    (async () => {
      try {
        const user = getCurrentUser();
        if (user) await joinClass(homeClassId, user);
        if (!cancelled) setSelectedClassId(homeClassId);
      } catch (err) {
        console.error("[반 입장] 손님방 소속 실패:", err?.code, err?.message);
        if (!cancelled) setHomeError("손님방에 들어가지 못했어요. 새로고침하고, 계속 안 되면 선생님께 알려 주세요.");
      }
    })();
    return () => { cancelled = true; };
  }, [homeClassId]);

  if (homeClassId) {
    return (
      <div className="class-entry">
        <div className="class-entry-card">
          <div className="class-entry-emoji" aria-hidden="true">🧩</div>
          <h2>손님방으로 들어가는 중…</h2>
          <p>손님 계정은 정해진 방으로 바로 입장합니다.</p>
          {homeError && <p className="class-entry-error">{homeError}</p>}
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setChecking(true);
    setError("");
    try {
      const found = await findClassByCode(code);
      if (!found) {
        setError("입장 코드를 찾을 수 없어요. 코드를 다시 확인해 주세요.");
        return;
      }
      if (found.expired) {
        setError("만료된 입장 코드예요. 선생님께 새 코드를 요청해 주세요.");
        return;
      }
      // 서버에 소속을 기록 → 기기를 바꿔도 로그인하면 그대로 입장 상태 유지
      // 코드를 함께 보내 보안 규칙이 코드 유효성·만료를 서버에서 재검증합니다
      const user = getCurrentUser();
      if (user) await joinClass(found.id, user, code);
      setSelectedClassId(found.id);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="class-entry">
      <div className="class-entry-card">
        <div className="class-entry-emoji" aria-hidden="true">🧩</div>
        <h2>공부방에 입장하기</h2>
        <p>선생님이 알려 준 우리 반 입장 코드를 입력해 주세요.</p>
        <form onSubmit={handleSubmit} className="class-entry-form">
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError("");
            }}
            placeholder="예: MATH31"
            maxLength={10}
            autoFocus
            className="class-entry-input"
            aria-label="반 입장 코드"
          />
          <button type="submit" className="btn-primary" disabled={checking}>
            {checking ? "확인 중..." : "입장"}
          </button>
        </form>
        {error && <p className="class-entry-error">{error}</p>}
        {!isFirebaseConfigured && (
          <p className="class-entry-hint">
            데모 코드 — <code>MATH31</code> (3학년 1반) · <code>INFO32</code>{" "}
            (3학년 2반) · <code>BOND33</code> (3학년 3반)
          </p>
        )}
      </div>
    </div>
  );
}
