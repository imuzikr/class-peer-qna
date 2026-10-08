"use client";

// 떠 있는 패널 — 화면 위에 떠서 뒤 화면을 막지 않는 창(모달 아님).
// 머리줄을 끌어 옮기고, ▾ 단추로 접고 폅니다. 자리와 접힘은 이 기기에 기억합니다
// (`storageKey` — 한 선생님은 대개 늘 같은 자리에 둡니다).
// 처음 쓰는 곳: 가로세로 교사 화면의 '낱말 힌트'(선생님 요청).
//
// - 모달처럼 뒤를 덮지 않습니다 — 판과 미니맵을 그대로 누르며 힌트를 봅니다.
// - body에 포털로 띄웁니다. 책방 화면은 안쪽 칸이 구르고 transform이 걸린 조상이
//   있을 수 있어, 그 안의 fixed는 화면이 아니라 그 조상 기준이 됩니다.
// - z-index 90 — 보통 모달 배경(100) · 되묻는 창(200) 아래. 창이 뜨면 그 아래로 깔립니다.
// - 화면 밖으로 끌려 나가지 않게 늘 붙잡습니다(머리줄이 화면 안에 남아야 다시 끌 수 있음).
//   창 크기가 바뀔 때도 다시 붙잡습니다.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MARGIN = 8;
const HEAD_H = 46;
// 펼쳐 둔 채 화면 바닥에 끌어다 놓으면 몸통이 화면 밖으로 나갑니다 — 펼친 동안은 몸통이
// 이만큼은 보이게 위로 붙잡습니다(접어 두면 머리줄만 남기면 됨)
const MIN_BODY = 200;

function readSaved(key) {
  if (!key) return null;
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}
function writeSaved(key, value) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 못 해도 화면은 그대로 */
  }
}

function clampPos(x, y, w, open = true) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(w, vw - MARGIN * 2);
  return {
    x: Math.min(Math.max(MARGIN, x), Math.max(MARGIN, vw - width - MARGIN)),
    y: Math.min(Math.max(MARGIN, y), Math.max(MARGIN, vh - HEAD_H - MARGIN - (open ? MIN_BODY : 0))),
  };
}

export default function FloatingPanel({
  title,
  badge = null,
  storageKey,
  width = 340,
  defaultTop = 132,
  maxBody = null,
  className = "",
  children,
}) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState(null);
  const [open, setOpen] = useState(true);
  const [vh, setVh] = useState(0);
  const dragRef = useRef(null);

  // 처음 자리 — 기억해 둔 자리, 없으면 화면 오른쪽 위
  useEffect(() => {
    const saved = readSaved(storageKey);
    const x = Number.isFinite(saved?.x) ? saved.x : window.innerWidth - width - 24;
    const y = Number.isFinite(saved?.y) ? saved.y : defaultTop;
    const wasOpen = typeof saved?.open === "boolean" ? saved.open : true;
    setPos(clampPos(x, y, width, wasOpen));
    setOpen(wasOpen);
    setVh(window.innerHeight);
    setMounted(true);
  }, [storageKey, width, defaultTop]);

  useEffect(() => {
    if (!mounted) return undefined;
    const onResize = () => {
      setVh(window.innerHeight);
      setPos((p) => (p ? clampPos(p.x, p.y, width, open) : p));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mounted, width, open]);

  // 자리 · 접힘을 기억 — 끄는 동안은 놓을 때 한 번만
  useEffect(() => {
    if (!mounted || !pos || dragRef.current) return;
    writeSaved(storageKey, { x: pos.x, y: pos.y, open });
  }, [mounted, pos, open, storageKey]);

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== 0 || !pos) return;
      if (e.target.closest("button")) return; // 접기 단추는 끌기가 아님
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    },
    [pos]
  );
  const onPointerMove = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d) return;
      setPos(clampPos(e.clientX - d.dx, e.clientY - d.dy, width, open));
    },
    [width, open]
  );
  const onPointerUp = useCallback(
    (e) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      setPos((p) => (p ? { ...p } : p)); // 놓은 자리를 기억하도록 한 번 더 그림
    },
    []
  );

  if (!mounted || !pos) return null;

  // 몸통은 화면 바닥까지(그리고 `maxBody`가 있으면 그 천장까지) — 넘치면 몸통 안에서 구릅니다.
  // 어차피 구르는 창이라 화면을 위아래로 다 덮을 까닭이 없어 천장을 줄 수 있게 했습니다
  const roomBelow = Math.max(MIN_BODY, vh - pos.y - HEAD_H - MARGIN * 2);
  const bodyMax = maxBody ? Math.min(maxBody, roomBelow) : roomBelow;

  return createPortal(
    <section
      className={`float-panel${open ? "" : " is-closed"} ${className}`.trim()}
      style={{ left: pos.x, top: pos.y, width: `min(${width}px, calc(100vw - ${MARGIN * 2}px))` }}
      aria-label={title}
    >
      <header
        className="float-panel-head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="끌어서 옮길 수 있어요"
      >
        <span className="float-panel-grip" aria-hidden="true">⠿</span>
        <h3>{title}</h3>
        {badge}
        <button
          type="button"
          className="float-panel-toggle"
          onClick={() => {
            const next = !open;
            setOpen(next);
            // 바닥에 접어 둔 것을 펴면 몸통이 보이게 위로 올림
            setPos((p) => (p ? clampPos(p.x, p.y, width, next) : p));
          }}
          aria-expanded={open}
          aria-label={open ? `${title} 접기` : `${title} 펼치기`}
          title={open ? "접기" : "펼치기"}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>
      {open && (
        <div className="float-panel-body" style={{ maxHeight: bodyMax }}>
          {children}
        </div>
      )}
    </section>,
    document.body
  );
}
