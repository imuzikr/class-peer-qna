"use client";

// 1단: 키워드(과목) 사이드바 — 클릭하면 가운데 게시판이 필터링됩니다.
// 키워드 목록은 데이터(keywords 컬렉션)에서 내려받아 props로 받습니다.
export default function KeywordSidebar({ keywords, selected, onSelect, counts }) {
  const items = ["전체", ...keywords];
  return (
    <aside className="keyword-col">
      <h2>키워드</h2>
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
    </aside>
  );
}
