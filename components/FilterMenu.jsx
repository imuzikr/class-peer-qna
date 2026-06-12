"use client";

// =============================================================
// 피드 필터 드롭다운
// -------------------------------------------------------------
// 깔때기 버튼을 누르면 패널이 열리고, 항목을 고르면 닫힙니다.
// 필터 적용 로직(applyFilter)도 여기서 함께 내보내 board 페이지가
// 가져다 씁니다.
// =============================================================
import { useState } from "react";

export const FILTERS = [
  { id: "all", label: "모든 글", icon: "📄" },
  { id: "open", label: "미해결 질문", icon: "🙋" },
  { id: "resolved", label: "해결된 질문", icon: "✅" },
  { id: "mine", label: "내 글", icon: "✍️" },
  { id: "metoo", label: "나도 궁금한 글", icon: "🤔" },
  { id: "popular", label: "인기글", icon: "⭐" },
];

// 선택된 필터를 질문 목록에 적용합니다 (uid: 현재 사용자)
export function applyFilter(list, filter, uid) {
  switch (filter) {
    case "open":
      return list.filter((q) => !q.resolved);
    case "resolved":
      return list.filter((q) => q.resolved);
    case "mine":
      return list.filter((q) => q.authorId === uid);
    case "metoo":
      return list.filter((q) => (q.meTooIds ?? []).includes(uid));
    case "popular":
      // "나도 궁금해요"가 많은 순으로 정렬 (필터가 아닌 정렬)
      return [...list].sort(
        (a, b) => (b.meTooIds?.length ?? 0) - (a.meTooIds?.length ?? 0)
      );
    default:
      return list;
  }
}

export default function FilterMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = FILTERS.find((f) => f.id === value) ?? FILTERS[0];
  const active = value !== "all"; // 기본값이 아니면 버튼을 강조

  return (
    <div className="filter-wrap">
      <button
        type="button"
        className={`btn-ghost filter-btn ${active ? "filter-on" : ""}`}
        onClick={() => setOpen(!open)}
        title="질문 목록 필터"
      >
        {/* 깔때기 아이콘 */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3" />
        </svg>
        {active ? current.label : "필터"}
      </button>

      {open && (
        <>
          {/* 바깥을 누르면 닫히는 투명 배경 */}
          <div className="filter-backdrop" onClick={() => setOpen(false)} />
          <div className="filter-panel" role="menu">
            <div className="filter-title">필터</div>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`filter-item ${f.id === value ? "active" : ""}`}
                onClick={() => {
                  onChange(f.id);
                  setOpen(false);
                }}
              >
                <span className="filter-icon" aria-hidden="true">
                  {f.icon}
                </span>
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
