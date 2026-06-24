"use client";

// ── 학습 균형 레이더 차트 ──
// 5개 축: 질문·답변·해결·회고·공감
// values: [질문, 답변, 해결, 회고, 공감] 각 0~1 정규화 값

const AXES = 5;
const CX = 110, CY = 105, R = 65;
const LABEL_R = 84;
const LABELS = ["질문", "답변", "해결", "회고", "공감"];
const COLORS = {
  fill: "rgba(217,119,87,0.18)",
  stroke: "#d97757",
  grid: "#ebe9e2",
  gridOuter: "#d0cdc6",
  axis: "#e8e5dd",
  label: "#3d3d3a",
  bar: "#d97757",
};

function angle(i) {
  return (i / AXES) * 2 * Math.PI - Math.PI / 2;
}

function pt(i, fraction) {
  const a = angle(i);
  return [
    CX + fraction * R * Math.cos(a),
    CY + fraction * R * Math.sin(a),
  ];
}

function polyPoints(fractions) {
  return fractions
    .map((f, i) => pt(i, Math.max(f, 0)).map((v) => v.toFixed(1)).join(","))
    .join(" ");
}

const GRID_LEVELS = [0.25, 0.5, 0.75, 1.0];

export default function ActivityOverview({ values = [0, 0, 0, 0, 0] }) {
  const hasActivity = values.some((v) => v > 0);

  return (
    <div className="activity-overview">
      <p className="overview-heading">학습 균형</p>

      {hasActivity ? (
        <svg viewBox="0 0 220 200" width="200" height="182" aria-hidden="true">
          {/* 배경 오각형 그리드 */}
          {GRID_LEVELS.map((g, gi) => (
            <polygon
              key={gi}
              points={polyPoints(Array(AXES).fill(g))}
              fill="none"
              stroke={g === 1 ? COLORS.gridOuter : COLORS.grid}
              strokeWidth="1"
            />
          ))}

          {/* 축 선 */}
          {LABELS.map((_, i) => {
            const [x, y] = pt(i, 1.0);
            return (
              <line
                key={i}
                x1={CX} y1={CY}
                x2={x.toFixed(1)} y2={y.toFixed(1)}
                stroke={COLORS.axis}
                strokeWidth="1"
              />
            );
          })}

          {/* 학생 점수 다각형 */}
          <polygon
            points={polyPoints(values)}
            fill={COLORS.fill}
            stroke={COLORS.stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />

          {/* 꼭짓점 원 */}
          {values.map((v, i) => {
            const [x, y] = pt(i, Math.max(v, 0.04));
            return (
              <circle
                key={i}
                cx={x.toFixed(1)} cy={y.toFixed(1)}
                r="3.5"
                fill={COLORS.stroke}
              />
            );
          })}

          {/* 축 레이블 */}
          {LABELS.map((label, i) => {
            const a = angle(i);
            const lx = CX + LABEL_R * Math.cos(a);
            const ly = CY + LABEL_R * Math.sin(a);
            const cosA = Math.cos(a);
            const anchor =
              Math.abs(cosA) < 0.15 ? "middle" : cosA > 0 ? "start" : "end";
            return (
              <text
                key={i}
                x={lx.toFixed(1)} y={ly.toFixed(1)}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize="11.5"
                fontWeight="700"
                fill={COLORS.label}
                fontFamily="inherit"
              >
                {label}
              </text>
            );
          })}
        </svg>
      ) : (
        <div className="overview-empty">아직 활동이 없어요</div>
      )}

      {/* 미니 막대 요약 */}
      <div className="overview-bars">
        {LABELS.map((label, i) => (
          <div key={i} className="overview-bar-row">
            <span className="overview-bar-label">{label}</span>
            <div className="overview-bar-track">
              <div
                className="overview-bar-fill"
                style={{ width: `${Math.round(values[i] * 100)}%` }}
              />
            </div>
            <span className="overview-bar-pct">
              {Math.round(values[i] * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
