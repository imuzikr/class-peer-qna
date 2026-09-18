"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { regenerateJoinCode, toDate } from "@/lib/store";

export default function ClassJoinCode({ classroom, codeInfo, user, disabled = false, onRegeneratingChange }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState("");
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const pendingRef = useRef(false);
  const titleId = useId();
  const expired = codeInfo?.expiresAt && toDate(codeInfo.expiresAt) < new Date();

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

  async function handleRegenerate() {
    if (pendingRef.current || disabled) return;
    pendingRef.current = true;
    setRegenerating(true);
    onRegeneratingChange?.(classroom.id, true);
    setError("");
    try {
      await regenerateJoinCode(classroom.id, user);
    } catch {
      setError("코드를 재발급하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      pendingRef.current = false;
      setRegenerating(false);
      onRegeneratingChange?.(classroom.id, false);
    }
  }

  function codeDetails() {
    return (
      <>
        <p className="joincode-label">입장 코드</p>
        <p className="joincode-value" aria-live="polite">{codeInfo?.code ?? "—"}</p>
        <p className="joincode-hint">공부방 입장 화면에서 이 코드를 입력하세요</p>
        {codeInfo?.expiresAt && (
          <p className={`joincode-expiry${expired ? " expired" : ""}`}>
            {expired
              ? "⚠️ 만료된 코드예요 — 재발급해 주세요"
              : `${toDate(codeInfo.expiresAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}까지 유효`}
          </p>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="joincode-actions">
          <button type="button" className="joincode-regen" onClick={handleRegenerate} disabled={regenerating || disabled}>
            {regenerating ? "재발급 중…" : "🔄 코드 재발급"}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="class-joincode" onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}>
      {codeDetails()}
      <button ref={triggerRef} type="button" className="btn-ghost joincode-expand" onClick={() => setFullscreen(true)} aria-haspopup="dialog">
        전체 화면
      </button>
      {fullscreen && createPortal(
        <div className="joincode-fullscreen" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="btn-ghost joincode-close" onClick={() => setFullscreen(false)} aria-label="전체 화면 닫기">닫기 ×</button>
          <div className="joincode-fullscreen-content">
            <h2 id={titleId} className="joincode-class">{classroom.name}</h2>
            {codeDetails()}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
