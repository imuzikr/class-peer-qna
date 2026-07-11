"use client";

// =============================================================
// KWL 전체 화면 (교사 전용) — 학생들의 K·W·L을 3컬럼으로 크게
// -------------------------------------------------------------
// · 한 행 = 학생 한 명. K / W / L 세 컬럼을 나란히 보며 성찰 나눔.
// · 스크롤하며 전체 학생 기록을 훑을 수 있음. Esc로 닫기.
// · 학생 이름은 디렉터리의 실명(교사 화면)으로 표시.
// · 컬럼(학생·K·W·L) 전체에 은은한 배경 띠를 깔아 한눈에 구분되게 합니다.
// · 날짜 이동: 좌우 화살표(하루씩) + 달력 아이콘(직접 선택) 두 가지 방법.
//   날짜가 바뀔 때마다 그 날짜의 기록을 실시간 구독합니다.
// =============================================================
import { Fragment, useEffect, useRef, useState } from "react";
import { subscribeAllKwl, fetchAllKwlOnce, getDirectoryRealName } from "@/lib/store";
import { IconKwlK, IconKwlW, IconKwlL } from "./StatusIcons";

function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(dateStr, delta) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return toYMD(d);
}
function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}
const TODAY = toYMD(new Date());

export default function KwlFullscreenModal({ classId, initialDate, onClose }) {
  const [date, setDate] = useState(initialDate || TODAY);
  const [entries, setEntries] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const dateInputRef = useRef(null);

  // 날짜가 바뀔 때마다 그 날짜의 기록을 실시간 구독
  useEffect(() => {
    if (!classId) return;
    return subscribeAllKwl(classId, date, setEntries);
  }, [classId, date]);

  // Esc 닫기, ←/→ 날짜 이동 (입력 필드에 포커스 중일 땐 방향키 그대로 사용하게 제외)
  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if (e.key === "Escape") onClose();
      else if (!typing && e.key === "ArrowLeft") setDate((d) => addDays(d, -1));
      else if (!typing && e.key === "ArrowRight") {
        setDate((d) => (d < TODAY ? addDays(d, 1) : d));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      setEntries(await fetchAllKwlOnce(classId, date));
    } finally {
      setRefreshing(false);
    }
  }

  function openCalendar() {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  }

  // 학생별로 정리 — 실명(가나다) 순 정렬
  const rows = entries
    .map((e) => ({
      ...e,
      displayName: getDirectoryRealName(e.userId) || e.authorName || "익명",
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"));

  const isToday = date === TODAY;

  return (
    <div className="modal-backdrop present-backdrop" onClick={onClose}>
      <div className="present-modal kwlfs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="present-head">
          <div className="present-who">
            <strong className="present-name">📝 KWL</strong>
            <span className="present-progress">{rows.length}명</span>

            {/* 날짜 이동 — 좌우 화살표 + 달력 선택 */}
            <div className="kwlfs-date-nav">
              <button
                type="button"
                className="kwlfs-date-arrow"
                onClick={() => setDate((d) => addDays(d, -1))}
                aria-label="전날"
                title="전날 (←)"
              >
                ‹
              </button>
              <button
                type="button"
                className="kwlfs-date-label"
                onClick={openCalendar}
                title="날짜 선택"
              >
                📅 {formatDateLabel(date)}{isToday && <span className="kwlfs-date-today"> · 오늘</span>}
              </button>
              <input
                ref={dateInputRef}
                type="date"
                className="kwlfs-date-input"
                value={date}
                max={TODAY}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                aria-label="날짜 직접 선택"
              />
              <button
                type="button"
                className="kwlfs-date-arrow"
                onClick={() => setDate((d) => addDays(d, 1))}
                disabled={isToday}
                aria-label="다음날"
                title="다음날 (→)"
              >
                ›
              </button>
              {!isToday && (
                <button type="button" className="kwlfs-date-today-btn" onClick={() => setDate(TODAY)}>
                  오늘로
                </button>
              )}
            </div>
          </div>
          <div className="kwlfs-head-actions">
            <button
              type="button"
              className={`kwlfs-refresh-btn${refreshing ? " spinning" : ""}`}
              onClick={handleRefresh}
              disabled={refreshing}
              title="새로고침 — 보는 동안 새로 추가된 기록도 불러옵니다"
            >
              🔄 {refreshing ? "새로고침 중…" : "새로고침"}
            </button>
            <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
          </div>
        </div>

        <div className="kwlfs-body">
          {rows.length === 0 ? (
            <p className="present-empty">{formatDateLabel(date)}에 저장된 KWL이 없어요.</p>
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
