"use client";

// 1단: 키워드(주제) 사이드바 — 클릭하면 가운데 게시판이 필터링됩니다.
// 키워드 목록은 데이터(keywords 컬렉션)에서 내려받아 props로 받습니다.
// isAdmin=true일 때 헤더에 "키워드 관리" 버튼을 표시합니다.
// reflections: 내 회고 배열 (question 객체, reflection 필드 포함)
import { useState } from "react";
import { formatTime } from "@/lib/store";

export default function KeywordSidebar({
  keywords,
  selected,
  onSelect,
  counts,
  isAdmin = false,
  onManage,
  reflections = [],
  onReflectionClick,
}) {
  const [reflectOpen, setReflectOpen] = useState(true);
  const items = ["전체", ...keywords];

  return (
    <aside className="keyword-col">
      <div className="keyword-col-head">
        <h2>키워드</h2>
        {isAdmin && (
          <button
            className="keyword-manage-btn"
            onClick={onManage}
            title="키워드 관리"
          >
            ⚙️
          </button>
        )}
      </div>
      {items.map((kw) => (
        <button
          key={kw}
          className={`keyword-item ${selected === kw ? "active" : ""}`}
          onClick={() => onSelect(kw)}
        >
          <span># {kw}</span>
          <span className="keyword-count">{counts[kw] ?? 0}</span>
        </button>
      ))}

      {/* ── 내 회고 모음 ── */}
      {reflections.length > 0 && (
        <div className="reflect-sidebar-section">
          <button
            className="reflect-sidebar-toggle"
            onClick={() => setReflectOpen((v) => !v)}
          >
            <span>📒 내 회고</span>
            <span className="reflect-sidebar-count">{reflections.length}</span>
            <span className="reflect-sidebar-chevron">{reflectOpen ? "▴" : "▾"}</span>
          </button>

          {reflectOpen && (
            <ul className="reflect-sidebar-list">
              {reflections.map((item) => (
                <li key={item.id}>
                  <button
                    className="reflect-sidebar-item"
                    onClick={() => onReflectionClick?.(item.id)}
                  >
                    {item.keyword && (
                      <span className="reflect-sidebar-kw"># {item.keyword}</span>
                    )}
                    <p className="reflect-sidebar-title">{item.title}</p>
                    <p className="reflect-sidebar-learned">
                      💡 {item.reflection.learned}
                    </p>
                    <time className="reflect-sidebar-time">
                      {formatTime(item.reflection.createdAt)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
