"use client";

// =============================================================
// KWL 전체 화면 (교사 전용) — 오늘 학생들의 K·W·L을 3컬럼으로 크게
// -------------------------------------------------------------
// · 한 행 = 학생 한 명. K / W / L 세 컬럼을 나란히 보며 성찰 나눔.
// · 스크롤하며 전체 학생 기록을 훑을 수 있음. Esc로 닫기.
// · 학생 이름은 디렉터리의 실명(교사 화면)으로 표시.
// =============================================================
import { useEffect } from "react";
import { getDirectoryRealName } from "@/lib/store";
import { IconKwlK, IconKwlW, IconKwlL } from "./StatusIcons";

export default function KwlFullscreenModal({ entries = [], dateLabel = "", onClose }) {
  // Esc 닫기
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 학생별로 정리 — 실명(가나다) 순 정렬
  const rows = entries
    .map((e) => ({
      ...e,
      displayName: getDirectoryRealName(e.userId) || e.authorName || "익명",
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"));

  return (
    <div className="modal-backdrop present-backdrop" onClick={onClose}>
      <div className="present-modal kwlfs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="present-head">
          <div className="present-who">
            <strong className="present-name">📝 오늘의 KWL</strong>
            <span className="present-progress">{rows.length}명</span>
            <span className="present-board">{dateLabel}</span>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="kwlfs-body">
          {rows.length === 0 ? (
            <p className="present-empty">오늘 저장된 KWL이 아직 없어요.</p>
          ) : (
            <div className="kwlfs-table">
              {/* 컬럼 헤더 — 각 영역의 아이콘 색과 어울리는 은은한 틴트 */}
              <div className="kwlfs-row kwlfs-row--head">
                <div className="kwlfs-cell kwlfs-head kwlfs-head--name">학생</div>
                <div className="kwlfs-cell kwlfs-head kwlfs-head--k"><IconKwlK size={22} /> 알고 있었던 것</div>
                <div className="kwlfs-cell kwlfs-head kwlfs-head--w"><IconKwlW size={22} /> 알고 싶은 것</div>
                <div className="kwlfs-cell kwlfs-head kwlfs-head--l"><IconKwlL size={22} /> 새롭게 알게 된 것</div>
              </div>
              {rows.map((r) => (
                <div className="kwlfs-row" key={r.id}>
                  <div className="kwlfs-cell kwlfs-cell--name">
                    <span className="kwlfs-avatar" aria-hidden="true">{r.authorEmoji || "🙂"}</span>
                    {r.displayName}
                  </div>
                  <div className="kwlfs-cell kwlfs-text kwlfs-text--k">{r.K || <span className="kwlfs-none">—</span>}</div>
                  <div className="kwlfs-cell kwlfs-text kwlfs-text--w">{r.W || <span className="kwlfs-none">—</span>}</div>
                  <div className="kwlfs-cell kwlfs-text kwlfs-text--l">{r.L || <span className="kwlfs-none">—</span>}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
