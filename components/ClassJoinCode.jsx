"use client";

// =============================================================
// 반별 입장 코드 — 카드 안 한 줄 + 전체 화면(칠판 투사)
// -------------------------------------------------------------
// 반 관리하기의 카드에서는 '입장 코드 · 코드 · 유효기간 · 전체 화면'이
// 한 줄로 섭니다(반이 여섯이면 그만큼 되풀이되는 줄이라 짧아야 합니다).
// '코드 재발급'은 이 줄이 아니라 카드 머리줄의 편집(✏) 옆에 있습니다 —
// 반에 하는 일끼리 한자리에 모으고, 여기는 보기만 하는 줄로 둡니다.
// 칠판에 띄우는 전체 화면은 지금까지대로 크게 쌓아 보여 주고, 거기서도
// 재발급할 수 있게 단추를 함께 둡니다(그 화면만 보고 있을 때가 있어서).
// =============================================================
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toDate } from "@/lib/store";

export default function ClassJoinCode({
  classroom,
  codeInfo,
  onRegenerate,
  regenerating = false,
  disabled = false,
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const titleId = useId();
  const expired = codeInfo?.expiresAt && toDate(codeInfo.expiresAt) < new Date();
  const expiry = codeInfo?.expiresAt
    ? (expired
      ? "⚠️ 만료된 코드예요 — 재발급해 주세요"
      : `${toDate(codeInfo.expiresAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}까지 유효`)
    : "";

  useEffect(() => {
    if (!fullscreen) return;
    const trigger = triggerRef.current;
    const manager = trigger?.closest(".modal-class-manager");
    const wasInert = manager?.inert;
    const previousOverflow = document.body.style.overflow;
    if (manager) manager.inert = true;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("button")?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setFullscreen(false);
      } else if (event.key === "Tab") {
        const buttons = [...dialogRef.current.querySelectorAll("button:not(:disabled)")];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!buttons.includes(document.activeElement)) {
          event.preventDefault();
          first?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (manager) manager.inert = wasInert;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [fullscreen]);

  return (
    <div className="class-joincode" onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}>
      <span className="joincode-label">입장 코드</span>
      <span className="joincode-value" aria-live="polite">{codeInfo?.code ?? "—"}</span>
      {expiry && <span className={`joincode-expiry${expired ? " expired" : ""}`}>{expiry}</span>}
      <button ref={triggerRef} type="button" className="btn-ghost joincode-expand" onClick={() => setFullscreen(true)} aria-haspopup="dialog">
        전체 화면
      </button>
      {fullscreen && createPortal(
        <div className="joincode-fullscreen" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="btn-ghost joincode-close" onClick={() => setFullscreen(false)} aria-label="전체 화면 닫기">닫기 ×</button>
          <div className="joincode-fullscreen-content">
            <h2 id={titleId} className="joincode-class">{classroom.name}</h2>
            <p className="joincode-label">입장 코드</p>
            <p className="joincode-value" aria-live="polite">{codeInfo?.code ?? "—"}</p>
            <p className="joincode-hint">공부방 입장 화면에서 이 코드를 입력하세요</p>
            {expiry && <p className={`joincode-expiry${expired ? " expired" : ""}`}>{expiry}</p>}
            <div className="joincode-actions">
              <button type="button" className="joincode-regen" onClick={onRegenerate} disabled={regenerating || disabled}>
                {regenerating ? "재발급 중…" : "🔄 코드 재발급"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
