"use client";

// =============================================================
// KWL 전체 화면 (교사 전용) — 오늘 학생들의 K·W·L을 3컬럼으로 크게
// -------------------------------------------------------------
// · 한 행 = 학생 한 명. K / W / L 세 컬럼을 나란히 보며 성찰 나눔.
// · 스크롤하며 전체 학생 기록을 훑을 수 있음. Esc로 닫기.
// · 학생 이름은 디렉터리의 실명(교사 화면)으로 표시.
// · 컬럼(학생·K·W·L) 전체에 은은한 배경 띠를 깔아 한눈에 구분되게 합니다.
//   (CSS Grid에 컬럼 전체를 관통하는 배경 레이어를 먼저 깔고, 그 위에
//    헤더·셀을 명시적 grid-row/column으로 겹쳐 올리는 방식)
// =============================================================
import { Fragment, useEffect } from "react";
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
            <div
              className="kwlfs-table"
              style={{ gridTemplateRows: `repeat(${rows.length + 1}, auto)` }}
            >
              {/* 컬럼 배경 띠 — 헤더부터 마지막 행까지 관통 (먼저 그려 셀 아래 깔림) */}
              <div className="kwlfs-colbg kwlfs-colbg--name" />
              <div className="kwlfs-colbg kwlfs-colbg--k" />
              <div className="kwlfs-colbg kwlfs-colbg--w" />
              <div className="kwlfs-colbg kwlfs-colbg--l" />

              {/* 컬럼 헤더 */}
              <div className="kwlfs-cell kwlfs-head kwlfs-head--name" style={{ gridRow: 1, gridColumn: 1 }}>
                학생
              </div>
              <div className="kwlfs-cell kwlfs-head kwlfs-head--k" style={{ gridRow: 1, gridColumn: 2 }}>
                <IconKwlK size={22} /> 알고 있었던 것
              </div>
              <div className="kwlfs-cell kwlfs-head kwlfs-head--w" style={{ gridRow: 1, gridColumn: 3 }}>
                <IconKwlW size={22} /> 알고 싶은 것
              </div>
              <div className="kwlfs-cell kwlfs-head kwlfs-head--l" style={{ gridRow: 1, gridColumn: 4 }}>
                <IconKwlL size={22} /> 새롭게 알게 된 것
              </div>

              {rows.map((r, i) => {
                const rowNum = i + 2; // 1행은 헤더
                return (
                  <Fragment key={r.id}>
                    <div className="kwlfs-cell kwlfs-cell--name" style={{ gridRow: rowNum, gridColumn: 1 }}>
                      <span className="kwlfs-avatar" aria-hidden="true">{r.authorEmoji || "🙂"}</span>
                      {r.displayName}
                    </div>
                    <div className="kwlfs-cell kwlfs-text" style={{ gridRow: rowNum, gridColumn: 2 }}>
                      {r.K || <span className="kwlfs-none">—</span>}
                    </div>
                    <div className="kwlfs-cell kwlfs-text" style={{ gridRow: rowNum, gridColumn: 3 }}>
                      {r.W || <span className="kwlfs-none">—</span>}
                    </div>
                    <div className="kwlfs-cell kwlfs-text" style={{ gridRow: rowNum, gridColumn: 4 }}>
                      {r.L || <span className="kwlfs-none">—</span>}
                    </div>
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
