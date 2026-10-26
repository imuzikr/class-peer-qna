"use client";

// =============================================================
// 투표 — 교사 창 · 학생 창이 함께 쓰는 조각
// -------------------------------------------------------------
// 결과 막대는 **한 곳**에서 그립니다 — 교사가 보는 막대와 학생이 공유받아
// 보는 막대가 다른 모양이면, 같은 결과가 두 얼굴이 됩니다.
// =============================================================
import { pollKindLabel, pollKindOf, pollRows } from "@/lib/poll";

export function IconPoll({ size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="4.2" width="16" height="15.6" rx="2.4" fill="#FFF7ED" stroke="#3A312E" strokeWidth="1.55" />
      <rect x="7" y="7.6" width="7.6" height="2.4" rx="1.2" fill="#F2A27B" />
      <rect x="7" y="11" width="10" height="2.4" rx="1.2" fill="#8FC9A3" />
      <rect x="7" y="14.4" width="4.6" height="2.4" rx="1.2" fill="#B9A6E0" />
    </svg>
  );
}

export function PollKindPill({ kind }) {
  return (
    <span className={`poll-kind${pollKindOf(kind) === "multi" ? " poll-kind--multi" : ""}`}>
      {pollKindLabel(kind)}
    </span>
  );
}

// 결과 막대 — mine(내가 고른 key들)이 있으면 그 줄에 '내 선택'을 답니다.
// whoOf(key) → 이름 배열을 주면(교사) 막대 아래에 이름을 늘어놓습니다.
export function PollResultBars({ poll, counts, voters, mine = null, whoOf = null }) {
  const rows = pollRows(poll, counts, voters);
  const picked = new Set(mine ?? []);
  return (
    <ul className="poll-bars">
      {rows.map((r) => {
        const names = whoOf ? whoOf(r.key) : null;
        return (
          <li
            key={r.key}
            className={[
              "poll-bar",
              r.top ? "is-top" : "",
              picked.has(r.key) ? "is-mine" : "",
            ].filter(Boolean).join(" ")}
          >
            <div className="poll-bar-head">
              <span className="poll-bar-text">
                {r.text}
                {picked.has(r.key) && <span className="poll-bar-mine">내 선택</span>}
              </span>
              <span className="poll-bar-num">
                {r.n}표 <span className="poll-bar-pct">· {r.pct}%</span>
              </span>
            </div>
            <div className="poll-bar-track" aria-hidden="true">
              <span className="poll-bar-fill" style={{ width: `${r.pct}%` }} />
            </div>
            {names && names.length > 0 && (
              <p className="poll-bar-who">{names.join(" · ")}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
