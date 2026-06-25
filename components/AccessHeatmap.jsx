"use client";

// =============================================================
// 접속 시간대 히트맵 — 세로축=시간(1시간), 가로축=일(1/1~12/31).
// -------------------------------------------------------------
// 1년 달력 위에 "하루 중 몇 시에 접속했는가"를 시간(행) × 날짜(열)로
// 펼칩니다. 셀 = 1시간. 해당 시간에 한 번이라도 접속했으면 색칠.
// pings: { bucket }[] (subscribeMyPresence 결과)
// =============================================================
import { toDate } from "@/lib/store";

const PRESENT_COLOR = "#5c9e68";
const EMPTY_COLOR = "#ebe9e2";
const MONTH_NAMES = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

function cellKey(month, date, hour) {
  return `${month}-${date}_${hour}`;
}

// 데모 모드에서 디자인을 미리 볼 수 있게 하는 샘플 접속 핑.
// 최근 ~150일에 걸쳐 요일/시간대별로 자연스러운 접속 패턴을 생성.
export function demoAccessPings() {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const profile = [
    [19, 20, 21],       // 일
    [8, 13, 20, 21],    // 월
    [8, 20, 22],        // 화
    [13, 19, 20, 21],   // 수
    [8, 9, 20],         // 목
    [13, 21, 22],       // 금
    [10, 11, 15, 16],   // 토
  ];
  for (let back = 150; back >= 0; back--) {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    if ((back * 7 + d.getDay()) % 3 === 0) continue; // 가끔 접속 안 한 날
    const hours = profile[d.getDay()] ?? [20, 21];
    hours.forEach((h, i) => {
      if ((back + i) % 4 === 0) return; // 시간대별로도 가끔 건너뜀
      const t = new Date(d);
      t.setHours(h, 0, 0, 0);
      out.push({ id: `demo_${back}_${h}`, bucket: t.toISOString() });
    });
  }
  return out;
}

export default function AccessHeatmap({ pings = [] }) {
  const year = new Date().getFullYear();

  // 접속한 (월-일, 시) 집합
  const present = new Set();
  const dayHourCount = new Set(); // 통계용 (날짜+시 유니크)
  pings.forEach((p) => {
    const d = toDate(p.bucket ?? p.lastSeen);
    if (d.getFullYear() !== year) return;
    const k = cellKey(d.getMonth(), d.getDate(), d.getHours());
    present.add(k);
    dayHourCount.add(k);
  });

  // 가로축 — 1/1 ~ 12/31 (해당 연도)
  const days = [];
  const cur = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  while (cur <= end) {
    days.push({ month: cur.getMonth(), date: cur.getDate() });
    cur.setDate(cur.getDate() + 1);
  }

  // 월 라벨 — 각 월의 첫 열에 표시 (colSpan = 그 달의 일수)
  const monthSpans = [];
  for (let m = 0; m < 12; m++) {
    monthSpans.push({ m, count: new Date(year, m + 1, 0).getDate() });
  }

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const totalHours = present.size;
  const activeDays = new Set([...present].map((k) => k.split("_")[0])).size;

  return (
    <div className="access-panel">
      <div className="admin-panel-head">
        <h2>접속 시간대</h2>
        <span>
          {totalHours > 0 ? `${activeDays}일 · ${totalHours}시간 접속` : "접속 기록 없음"}
        </span>
      </div>

      <div className="access-grid-wrap">
        <table className="access-grid">
          <thead>
            <tr>
              <th className="access-corner" />
              {monthSpans.map(({ m, count }) => (
                <th key={m} colSpan={count} className="access-month">
                  {MONTH_NAMES[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h}>
                <td className="access-hour-label">
                  {h % 2 === 0 ? `${h}시` : ""}
                </td>
                {days.map((d) => {
                  const on = present.has(cellKey(d.month, d.date, h));
                  return (
                    <td
                      key={`${d.month}-${d.date}`}
                      className="access-cell"
                      style={{ background: on ? PRESENT_COLOR : EMPTY_COLOR }}
                      title={on ? `${d.month + 1}/${d.date} ${h}시 접속` : ""}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="access-legend">
        <span><i style={{ background: EMPTY_COLOR }} />미접속</span>
        <span><i style={{ background: PRESENT_COLOR }} />접속 (1시간)</span>
      </div>
    </div>
  );
}
