"use client";

// =============================================================
// 접속 시간 추이 — 선 그래프. x축=날짜, y축=하루 총 접속 시간.
// -------------------------------------------------------------
// presence(10분 버킷)를 하루 단위로 합산해 "그날 얼마나 오래 접속했나"를
// 시간 흐름에 따라 선으로 보여줍니다. 1버킷 = 10분.
// pings: { bucket }[] (subscribeMyPresence 결과)
// =============================================================
import { toDate } from "@/lib/store";

const MONTH_NAMES = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const BUCKET_MIN = 10;

// 데모 모드 미리보기용 — 최근 ~150일, 세션(연속 10분 버킷)으로 하루 총량에 변화.
export function demoAccessPings() {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const starts = [[19], [8, 20], [20], [13, 20], [8, 20], [21], [10, 15]]; // 요일별 세션 시작 시각
  for (let back = 150; back >= 0; back--) {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    if ((back * 7 + d.getDay()) % 3 === 0) continue; // 가끔 접속 안 한 날
    (starts[d.getDay()] ?? [20]).forEach((h, si) => {
      const lenBuckets = 2 + ((back + si * 3 + h) % 7); // 2~8버킷 = 20~80분
      for (let b = 0; b < lenBuckets; b++) {
        const t = new Date(d);
        t.setHours(h, b * 10, 0, 0);
        out.push({ id: `demo_${back}_${h}_${b}`, bucket: t.toISOString() });
      }
    });
  }
  return out;
}

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function fmtMinutes(m) {
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h}시간 ${r}분` : `${h}시간`;
  }
  return `${m}분`;
}

export default function AccessLineChart({ pings = [] }) {
  // 하루별 접속 버킷 수 → 분
  const byDay = new Map();
  let earliest = null;
  pings.forEach((p) => {
    const d = toDate(p.bucket ?? p.lastSeen);
    d.setHours(0, 0, 0, 0);
    const k = dayKey(d);
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
    if (!earliest || d < earliest) earliest = new Date(d);
  });

  // x축 범위: 가장 이른 접속일 ~ 오늘 (데이터 없으면 최근 30일)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let start = earliest ?? new Date(today);
  if (!earliest) start.setDate(start.getDate() - 29);

  const days = [];
  const cur = new Date(start);
  while (cur <= today) {
    const k = dayKey(cur);
    days.push({
      date: new Date(cur),
      minutes: (byDay.get(k) ?? 0) * BUCKET_MIN,
    });
    cur.setDate(cur.getDate() + 1);
  }

  const n = days.length;
  const totalMin = days.reduce((s, d) => s + d.minutes, 0);
  const activeDays = [...byDay.values()].filter(Boolean).length;
  const maxMin = Math.max(30, ...days.map((d) => d.minutes));
  // y축 눈금을 1시간 단위 정수로 (라벨이 짧아 잘리지 않음)
  const maxY = Math.max(60, Math.ceil(maxMin / 60) * 60);

  // SVG 좌표
  const W = 960, H = 240;
  const padL = 52, padR = 14, padT = 14, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i) => padL + (n > 1 ? (i * innerW) / (n - 1) : innerW / 2);
  const y = (m) => padT + innerH * (1 - m / maxY);

  const linePts = days.map((d, i) => `${x(i).toFixed(1)},${y(d.minutes).toFixed(1)}`).join(" ");
  const areaPts = `${padL},${y(0).toFixed(1)} ${linePts} ${x(n - 1).toFixed(1)},${y(0).toFixed(1)}`;

  const yTicks = [];
  for (let t = 0; t <= maxY; t += 60) yTicks.push(t);

  // 월 시작 위치 (라벨 + 세로 격자)
  const monthMarks = [];
  days.forEach((d, i) => {
    if (d.date.getDate() === 1 || i === 0) {
      monthMarks.push({ i, label: MONTH_NAMES[d.date.getMonth()] });
    }
  });

  return (
    <div className="access-panel">
      <div className="admin-panel-head">
        <h2>접속 시간 추이</h2>
        <span>
          {activeDays > 0 ? `${activeDays}일 · 총 ${fmtMinutes(totalMin)}` : "접속 기록 없음"}
        </span>
      </div>

      <svg className="access-line" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="일별 접속 시간 추이">
        {/* y 격자 + 눈금 */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} className="access-line-grid" />
            <text x={padL - 8} y={y(t) + 3} textAnchor="end" className="access-line-axis">
              {t === 0 ? "0" : `${t / 60}시간`}
            </text>
          </g>
        ))}

        {/* 월 라벨 + 세로 격자 */}
        {monthMarks.map(({ i, label }) => (
          <g key={i}>
            <line x1={x(i)} y1={padT} x2={x(i)} y2={padT + innerH} className="access-line-grid faint" />
            <text x={x(i)} y={H - 8} textAnchor="middle" className="access-line-axis">
              {label}
            </text>
          </g>
        ))}

        {/* 영역 + 선 */}
        <polygon points={areaPts} className="access-line-area" />
        <polyline points={linePts} className="access-line-path" />
      </svg>

      <div className="access-line-foot">
        <span>하루에 접속한 시간(10분 단위 합계)을 날짜순으로 표시합니다.</span>
      </div>
    </div>
  );
}
