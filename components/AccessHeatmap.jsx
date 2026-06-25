"use client";

// =============================================================
// 접속 시간대 히트맵 — 행=날짜, 열=하루 시간대(10분 슬롯).
// -------------------------------------------------------------
// 잔디 히트맵이 "어느 날" 활동했는지를 본다면, 이 차트는 "하루 중
// 언제(몇 시쯤)" 접속했는지 패턴을 봅니다. 각 칸 = 10분.
// pings: { bucket }[] (subscribeMyPresence 결과, bucket=10분 버킷 시각)
// =============================================================
import { toDate } from "@/lib/store";

const PRESENT_COLOR = "#5c9e68";
const EMPTY_COLOR = "#ebe9e2";
const DAYS = 14;
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// 데모 모드에서 디자인을 미리 볼 수 있게 하는 샘플 접속 핑(최근 날짜·저녁 위주).
export function demoAccessPings() {
  const out = [];
  const today = startOfDay(new Date());
  // 요일별로 접속 시간대가 조금씩 다른, 자연스러운 패턴을 생성
  const profile = [
    [19, 20, 21], // 일
    [8, 13, 20, 21],
    [8, 20],
    [13, 19, 20, 21, 22],
    [8, 9, 20],
    [13, 21, 22],
    [10, 11, 15, 16], // 토
  ];
  for (let back = DAYS - 1; back >= 0; back--) {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    if (back % 5 === 2) continue; // 가끔 접속 안 한 날
    const hours = profile[d.getDay()] ?? [20, 21];
    hours.forEach((h) => {
      const sessionLen = 1 + ((h + back) % 4); // 10분 슬롯 1~4개(=10~40분)
      for (let s = 0; s < sessionLen; s++) {
        const t = new Date(d);
        t.setHours(h, (((back + s) % 5) + s) * 10 % 60, 0, 0);
        out.push({ id: `demo_${back}_${h}_${s}`, bucket: t.toISOString() });
      }
    });
  }
  return out;
}

export default function AccessHeatmap({ pings = [] }) {
  // 접속한 (날짜, 10분 슬롯) 집합 + 시간 범위 계산
  const present = new Set(); // `${dayKey}_${slot}`  (slot = 0..143)
  const dayCount = new Map();
  let minSlot = 24 * 6;
  let maxSlot = 0;

  pings.forEach((p) => {
    const d = toDate(p.bucket ?? p.lastSeen);
    const slot = d.getHours() * 6 + Math.floor(d.getMinutes() / 10);
    const dk = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    present.add(`${dk}_${slot}`);
    dayCount.set(dk, (dayCount.get(dk) ?? 0) + 1);
    minSlot = Math.min(minSlot, slot);
    maxSlot = Math.max(maxSlot, slot);
  });

  // 표시할 시간 범위 — 데이터가 있으면 그 범위, 없으면 8~22시
  let fromHour = present.size > 0 ? Math.floor(minSlot / 6) : 8;
  let toHour = present.size > 0 ? Math.ceil((maxSlot + 1) / 6) : 22;
  fromHour = Math.max(0, fromHour - 1); // 양옆 여유 1시간
  toHour = Math.min(24, toHour + 1);

  const slots = [];
  for (let s = fromHour * 6; s < toHour * 6; s++) slots.push(s);

  const today = startOfDay(new Date());
  const days = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  const activeDays = dayCount.size;
  const totalSlots = present.size;

  return (
    <div className="access-panel">
      <div className="admin-panel-head">
        <h2>접속 시간대</h2>
        <span>
          {activeDays > 0 ? `${activeDays}일 접속 · ${totalSlots}× 10분` : "접속 기록 없음"}
        </span>
      </div>

      <div className="access-grid-wrap">
        <table className="access-grid">
          <thead>
            <tr>
              <th className="access-corner" />
              {slots.map((s) =>
                s % 6 === 0 ? (
                  <th key={s} colSpan={6} className="access-hour">
                    {Math.floor(s / 6)}시
                  </th>
                ) : null
              )}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const dk = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
              return (
                <tr key={dk}>
                  <td className="access-day">
                    {d.getMonth() + 1}/{d.getDate()}
                    <span className="access-dow">({DAY_LABELS[d.getDay()]})</span>
                  </td>
                  {slots.map((s) => {
                    const on = present.has(`${dk}_${s}`);
                    const hh = Math.floor(s / 6);
                    const mm = String((s % 6) * 10).padStart(2, "0");
                    return (
                      <td
                        key={s}
                        className={`access-cell${s % 6 === 0 ? " hour-start" : ""}`}
                        style={{ background: on ? PRESENT_COLOR : EMPTY_COLOR }}
                        title={on ? `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm} 접속` : ""}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="access-legend">
        <span><i style={{ background: EMPTY_COLOR }} />미접속</span>
        <span><i style={{ background: PRESENT_COLOR }} />접속 (10분)</span>
      </div>
    </div>
  );
}
