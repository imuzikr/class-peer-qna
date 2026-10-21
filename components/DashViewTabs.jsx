"use client";

// =============================================================
// 닿소리 '전체 보기'의 보는 방법 — 잔디 / 격자 / 낱말 구름
// -------------------------------------------------------------
// 머리말에서 '수업 시작' 바로 뒤에 섭니다(선생님 요청). 셋은 같은 집계를
// 달리 보는 것입니다. 한때 넷째로 '가로세로'가 있었는데, 가로세로 낱말
// 퀴즈가 제 독서 활동이 되면서 걷었습니다.
// =============================================================

const TABS = [
  { key: "grass", label: "잔디", title: "누가 어느 닿소리를 채웠는지 한 격자로 — 학생 화면에는 나가지 않습니다" },
  { key: "grid", label: "격자" },
  { key: "cloud", label: "낱말 구름" },
];

export default function DashViewTabs({ view, onPick }) {
  return (
    <div className="dash-view-tabs" role="tablist" aria-label="보는 방법">
      {TABS.map((t) => (
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
