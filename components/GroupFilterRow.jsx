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
//
// [trailing — 마지막 모둠 뒤에 붙는 단추]
// 이 줄은 '어느 모둠을 볼까'를 고르는 자리라, 그 끝은 '모둠을 다 지나온
// 자리'입니다. 반 전체를 한눈에 보는 단추(전광판)가 서기에 알맞습니다.
// 모둠이 없는 활동(개인 활동)에서는 칩 줄 없이 그 단추만 섭니다 — 전광판은
// 모둠과 상관없이 쓸 수 있어야 하니까요.
//
// 칩은 `role="tablist"` 안에 그대로 두고 단추는 그 **밖**에 둡니다. 탭 목록
// 안에 탭이 아닌 것이 섞이면 보조기기가 그것도 탭으로 읽습니다.
// =============================================================
export default function GroupFilterRow({
  groups = [],
  value = null, // 고른 모둠 id (null = 전체)
  onChange,
  counts = null, // { [groupId]: 시작한 인원 } — 없으면 인원 수만 적습니다
  trailing = null, // 마지막 모둠 뒤에 붙일 것 (없으면 안 그립니다)
}) {
  if (groups.length === 0 && !trailing) return null;

  const tabs = groups.length > 0 && (
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

  // 붙일 것이 없으면 지금까지처럼 칩 줄 하나만 — 감싸는 상자를 늘리지
  // 않으려고요(그 상자의 아래 여백이 칩 줄의 것과 겹칩니다).
  if (!trailing) return tabs;

  return (
    <div className="group-filter-row">
      {tabs}
      {trailing}
    </div>
  );
}
