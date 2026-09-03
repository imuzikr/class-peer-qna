"use client";

// =============================================================
// 모둠 고르기 줄 (교사 화면) — 곁텍스트 읽기·RAFT 글쓰기 공용
// -------------------------------------------------------------
// 모둠으로 진행하는 활동에서, 학생 카드를 모둠으로 좁혀 봅니다.
// 닿소리의 왼쪽 모둠 목록과 같은 일을 하지만 세로 목록이 아니라 한 줄입니다 —
// 이 화면들은 카드 격자가 주인공이라, 왼쪽에 판을 두면 카드가 그만큼 좁아져
// 학생 이름이 잘립니다.
//
// '전체'가 기본입니다. 모둠은 보는 차례를 정하는 것이지 가르는 것이 아니라서,
// 처음 열었을 때는 반 전체가 보여야 합니다.
// =============================================================
export default function GroupFilterRow({
  groups = [],
  value = null, // 고른 모둠 id (null = 전체)
  onChange,
  counts = null, // { [groupId]: 시작한 인원 } — 없으면 인원 수만 적습니다
}) {
  if (groups.length === 0) return null;
  return (
    <div className="group-filter" role="tablist" aria-label="모둠 고르기">
      <button
        type="button"
        role="tab"
        aria-selected={value === null}
        className={`group-filter-btn${value === null ? " on" : ""}`}
        onClick={() => onChange?.(null)}
      >
        전체
      </button>
      {groups.map((g) => {
        const n = (g.members ?? []).length;
        return (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={value === g.id}
            className={`group-filter-btn${value === g.id ? " on" : ""}`}
            onClick={() => onChange?.(value === g.id ? null : g.id)}
            title={`${g.groupName || `${g.groupIndex}모둠`} · ${n}명`}
          >
            {g.groupName || `${g.groupIndex}모둠`}
            <em>{counts ? `${counts[g.id] ?? 0}/${n}` : `${n}명`}</em>
          </button>
        );
      })}
    </div>
  );
}
