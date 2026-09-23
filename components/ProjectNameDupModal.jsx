"use client";

// =============================================================
// 같은 이름의 프로젝트가 있을 때 — 만들지 않고 되묻는 창
// -------------------------------------------------------------
// 프로젝트 이름은 서로 달라야 합니다(lib/projectNames.js). 단추는 둘:
//   · 취소 — 이 창만 닫고 이름 칸으로 돌아갑니다(이름을 고쳐 다시 만들기).
//   · 이전 프로젝트 불러오기 — 그 프로젝트를 이 반에 불러옵니다.
// 두 단추는 **같은 크기 · 같은 색**입니다. 어느 쪽도 '위험한 쪽'이 아니라
// 둘 다 정상적인 다음 걸음이라, 한쪽만 채운 색이면 그쪽으로 떠미는 것처럼
// 읽힙니다. 크기는 격자(`1fr 1fr`)로 나눠 글자 길이와 무관하게 같습니다.
//
// 뜨는 자리가 셋입니다 — 공부방 만들기 창(모달 위) · 수업 편집(z 2900) ·
// 파이썬 실행기(서랍 안). 실행기 서랍은 transform이 걸려 있어 그 안에서
// position: fixed가 서랍 기준으로 바뀌므로, **body에 포털로** 띄웁니다.
// 배경이 `.modal-backdrop`이라 실행기의 '바깥 누르면 닫기'도 비켜 갑니다.
// =============================================================
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";

export default function ProjectNameDupModal({ name, hit, onCancel, onLoad }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 처음 초점은 단추가 아니라 창 자체에 둡니다. 단추에 두면 키보드로 연
  // 경우(이름 칸에서 Enter) 그 단추에만 초점 테두리가 생겨 두 단추가 달라
  // 보이고, Enter를 한 번 더 치면 그 단추가 눌립니다. Esc는 취소입니다.
  const boxRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Esc = 취소. 캡처 단계에서 받아 멈춥니다 — 뒤에 깔린 화면(수업 편집의
  // 이름 칸, 실행기)이 같은 키로 제 일을 하지 않게.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (!busy) onCancel?.();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onCancel]);

  useEffect(() => {
    if (mounted) boxRef.current?.focus();
  }, [mounted]);

  async function handleLoad() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onLoad?.();
    } catch (e) {
      setError(`불러오지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
      setBusy(false);
    }
  }

  if (!mounted) return null;

  const acts = hit?.acts ?? 0;
  const where =
    hit?.kind === "board"
      ? "이 반에 이미 있는 프로젝트예요."
      : hit?.kind === "template"
      ? "내가 만들어 둔 프로젝트예요. 불러오면 이 반에서 시작합니다."
      : "다른 반에서 쓰던 프로젝트예요. 불러오면 이 반에 같은 프로젝트를 엽니다.";

  return createPortal(
    <div
      className="modal-backdrop name-dup-backdrop"
      {...backdropClose(() => !busy && onCancel?.())}
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        className="name-dup-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="name-dup-title"
        aria-describedby="name-dup-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="name-dup-title" className="name-dup-title">
          동일한 이름의 프로젝트가 있어요
        </h3>
        <p className="name-dup-name">
          ‘{name}’ <span>· {acts > 0 ? `활동 ${acts}개` : "활동 없음"}</span>
        </p>
        <p id="name-dup-desc" className="name-dup-desc">
          프로젝트 이름은 서로 달라야 합니다. 이전 프로젝트를 불러올까요?
          <br />
          <small>{where}</small>
        </p>
        {error && <p className="form-error">{error}</p>}
        <div className="name-dup-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={onCancel}
            disabled={busy}
          >
            취소
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleLoad}
            disabled={busy}
          >
            {busy ? "불러오는 중…" : "이전 프로젝트 불러오기"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
