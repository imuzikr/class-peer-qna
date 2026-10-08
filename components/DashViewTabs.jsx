"use client";

// =============================================================
// 닿소리 '전체 보기'의 보는 방법 — 잔디 / 격자 / 낱말 구름 / 가로세로
// -------------------------------------------------------------
// 머리말에서 '수업 시작' 바로 뒤에 섭니다(선생님 요청). 집계 화면
// (ConsonantDashboard)과 가로세로 화면(CrosswordBoard · CrosswordGroupBoard)이
// **같은 알약 줄**을 써서, 넷 사이를 오갈 때 같은 자리를 누릅니다.
// 앞의 셋은 같은 집계를 달리 보는 것이고, 가로세로는 그 낱말로 만든 퀴즈
// 화면입니다(page.js의 crossView).
// =============================================================

const TABS = [
  { key: "grass", label: "잔디", title: "누가 어느 닿소리를 채웠는지 한 격자로 — 학생 화면에는 나가지 않습니다" },
  { key: "grid", label: "격자" },
  { key: "cloud", label: "낱말 구름" },
  { key: "crossword", label: "가로세로", title: "이 활동의 낱말로 가로세로 낱말퀴즈를 만듭니다" },
];

export default function DashViewTabs({ view, onPick, crossword = true }) {
  const tabs = crossword ? TABS : TABS.filter((t) => t.key !== "crossword");
  return (
    <div className="dash-view-tabs" role="tablist" aria-label="보는 방법">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={view === t.key}
          className={`dash-view-tab${view === t.key ? " on" : ""}`}
          onClick={() => view !== t.key && onPick(t.key)}
          title={t.title}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
