"use client";

// 1단: 키워드(주제) 사이드바 — 클릭하면 가운데 게시판이 필터링됩니다.
// 키워드 목록은 데이터(keywords 컬렉션)에서 내려받아 props로 받습니다.
// isAdmin=true일 때 헤더에 "키워드 관리" 버튼을 표시합니다.
export default function KeywordSidebar({
  keywords,
  selected,
  onSelect,
  counts,
  isAdmin = false,
  onManage,
}) {
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
    </aside>
  );
}
