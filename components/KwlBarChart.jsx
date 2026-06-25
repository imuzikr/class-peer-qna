"use client";

// =============================================================
// KWL 3단 막대 — 날짜별 K/W/L 작성량(글자 수)을 누적 막대로 표시.
// -------------------------------------------------------------
// 잔디 히트맵이 "언제 얼마나" 활동했는지 빈도를 보여준다면,
// 이 차트는 "안 것(K) / 궁금한 것(W) / 배운 것(L)"의 균형과
// 꾸준함을 한눈에 보여주는 학습 정리 습관 지표입니다.
// entries: { date, createdAt, K, W, L }[] (subscribeMyAllKwl 결과)
// =============================================================
import { toDate } from "@/lib/store";

const SEGMENTS = [
  { key: "L", label: "배운 것 L", color: "#6ea8d8" },
  { key: "W", label: "궁금한 것 W", color: "#f0b86e" },
  { key: "K", label: "안 것 K", color: "#8ec892" },
];
const MAX_BARS = 10;

function dayKey(value) {
  const d = toDate(value);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 데모 모드에서 디자인을 미리 볼 수 있도록 하는 샘플 데이터(최근 날짜 기준).
export function demoKwlEntries() {
  const today = new Date();
  const day = (back, K, W, L) => {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    return { id: `demo_${back}`, date: d, createdAt: d, K, W, L };
  };
  return [
    day(11, "원소 기호를 외웠다", "주기율표 규칙이 궁금", ""),
    day(9, "이온은 전하를 띤다", "이온식 쓰는 법?", "금속은 양이온이 되기 쉽다는 걸 배웠다"),
    day(7, "", "공유 결합이 헷갈림", "전자쌍을 함께 쓰는 게 공유 결합"),
    day(5, "산은 H+를 낸다", "중화 반응의 비율?", "산과 염기가 1:1로 반응해 물이 생긴다"),
    day(3, "", "", "반응 속도는 온도가 높을수록 빨라진다"),
    day(1, "촉매 개념을 안다", "촉매는 왜 안 변할까", "촉매는 자신은 변하지 않고 속도만 바꾼다는 걸 정리했다"),
  ];
}

export default function KwlBarChart({ entries = [] }) {
  const byDate = new Map();
  entries.forEach((e) => {
    const k = dayKey(e.date ?? e.createdAt);
    const cur = byDate.get(k) ?? { key: k, date: toDate(e.date ?? e.createdAt), K: 0, W: 0, L: 0 };
    cur.K += (e.K ?? "").trim().length;
    cur.W += (e.W ?? "").trim().length;
    cur.L += (e.L ?? "").trim().length;
    byDate.set(k, cur);
  });

  const days = [...byDate.values()]
    .sort((a, b) => a.date - b.date)
    .slice(-MAX_BARS);
  const max = Math.max(1, ...days.map((d) => d.K + d.W + d.L));
  const activeDays = days.length;
  const totalChars = days.reduce((s, d) => s + d.K + d.W + d.L, 0);

  return (
    <div className="kwl-chart-panel">
      <div className="admin-panel-head">
        <h2>KWL 작성 추이</h2>
        <span>{activeDays > 0 ? `${activeDays}일 · ${totalChars}자` : "기록 없음"}</span>
      </div>

      {days.length === 0 ? (
        <div className="admin-empty">아직 KWL 기록이 없어요. 공부방에서 오늘의 KWL을 남겨 보세요.</div>
      ) : (
        <>
          <div className="kwl-bars">
            {days.map((d) => {
              const total = d.K + d.W + d.L;
              return (
                <div
                  className="kwl-bar-col"
                  key={d.key}
                  title={`${d.date.getMonth() + 1}/${d.date.getDate()} · 안것 ${d.K}자 · 궁금 ${d.W}자 · 배움 ${d.L}자`}
                >
                  <div className="kwl-bar" style={{ height: `${(total / max) * 100}%` }}>
                    {SEGMENTS.map((s) =>
                      d[s.key] > 0 ? (
                        <div
                          key={s.key}
                          className="kwl-bar-seg"
                          style={{ height: `${(d[s.key] / total) * 100}%`, background: s.color }}
                        />
                      ) : null
                    )}
                  </div>
                  <span className="kwl-bar-label">
                    {d.date.getMonth() + 1}/{d.date.getDate()}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="kwl-legend">
            {SEGMENTS.map((s) => (
              <span key={s.key} className="kwl-legend-item">
                <i style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
