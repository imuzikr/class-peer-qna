"use client";

// 곁텍스트·RAFT 모둠 목록 — 이름 알약으로 학생의 개인 활동판을 엽니다.
export default function BookEntryGroupRail({
  groups,
  pickedGroupId,
  pickedUid,
  onPickGroup,
  onPickStudent,
}) {
  return (
    <aside className="book-group-rail entry-group-rail" aria-label="모둠 목록">
      {groups.map((g) => (
        <section key={g.id} className={`book-rail-card${pickedGroupId === g.id ? " on" : ""}`}>
          <button type="button" className="book-rail-head entry-group-pick"
            aria-pressed={pickedGroupId === g.id}
            onClick={() => onPickGroup(g)}>
            <strong>{g.name}</strong>
            <span className="book-group-count">{g.cards.length}명</span>
          </button>
          <div className="book-rail-chips">
            {g.cards.map((c) => (
              <button key={c.uid} type="button"
                className={`book-rail-chip${pickedUid === c.uid ? " is-picked" : ""}`}
                aria-pressed={pickedUid === c.uid}
                onClick={() => onPickStudent(c.uid)}>
                {c.name}
              </button>
            ))}
          </div>
          {g.cards.length === 0 && <span className="book-group-empty">아직 모둠원이 없어요</span>}
        </section>
      ))}
    </aside>
  );
}
