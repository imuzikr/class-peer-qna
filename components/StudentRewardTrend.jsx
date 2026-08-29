"use client";

// =============================================================
// 과일 받은 흐름 — 학생 한 명이 수업마다 받은 과일을 날짜별로 보여 줍니다
// -------------------------------------------------------------
// 자리표의 🍎 숫자는 '지금 몇 개'라는 총계뿐이라, 그 학생이 어떻게 달라지고
// 있는지는 보이지 않습니다. 총계가 20개인 학생이 초반에 몰아 받고 요즘은
// 조용한 것인지, 최근 들어 살아나고 있는 것인지가 같은 숫자로 보입니다.
// 그 차이를 보려고 날짜별로 끊어 그립니다.
//
// [왜 막대이고, 왜 선이 아닌가]
// 수업은 띄엄띄엄 있는 사건이라 수업과 수업 사이에는 값이 없습니다. 선으로
// 이으면 그 사이를 이어진 변화처럼 읽히므로, 하루를 막대 하나로 세웁니다.
//
// [회수(-)는 색이 아니라 방향으로]
// 과일을 도로 뺀 날은 기준선 아래로 내려갑니다. 색만으로 나누면 색을 구분
// 못 하는 사람에게는 사라지는 정보라, 방향과 부호(−)를 먼저 쓰고 색은
// 거들기만 합니다.
//
// 누가기록(StudentNotesThread) 맨 위에 놓입니다 — 교사가 한 학생을 들여다보는
// 자리가 거기라, 정성 기록(무슨 일이 있었나)과 정량 기록(얼마나 받았나)을
// 나란히 놓고 대조할 수 있게 합니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeStudentRewardEvents, toDate, todayDateKey } from "@/lib/store";

// 한 화면에 세우는 최대 수업일 수 — 넘으면 최근 것부터 남깁니다.
// (막대가 너무 얇아지면 날짜를 짚어 읽을 수 없어집니다)
const MAX_DAYS = 14;

// 이력을 날짜별로 합칩니다 → [{ date, delta, total }] (오래된 순).
// total은 그날 수업이 끝났을 때의 누적 총계입니다 — 그날 마지막 기록의
// count를 그대로 씁니다(지급할 때 총계를 함께 적어 두므로 다시 세지 않습니다).
export function groupRewardsByDate(events) {
  const byDate = new Map();
  events.forEach((e) => {
    const d = toDate(e.at);
    if (!d || Number.isNaN(d.getTime())) return;
    const key = todayDateKey(d);
    const prev = byDate.get(key);
    byDate.set(key, {
      date: key,
      delta: (prev?.delta ?? 0) + (typeof e.delta === "number" ? e.delta : 0),
      total: typeof e.count === "number" ? e.count : (prev?.total ?? 0),
    });
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function shortDate(key) {
  const [, m, d] = key.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export default function StudentRewardTrend({ studentUid, classId = null }) {
  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setEvents([]);
    if (!classId || !studentUid) return;
    return subscribeStudentRewardEvents(classId, studentUid, (list) => {
      setEvents(list);
      setLoaded(true);
    });
  }, [classId, studentUid]);

  const days = useMemo(() => groupRewardsByDate(events), [events]);

  // 이 반에서 아직 한 번도 안 준 학생이면 자리만 차지하므로 아예 접습니다.
  if (!classId || (loaded && days.length === 0)) return null;
  if (!loaded) return null;

  const shown = days.slice(-MAX_DAYS);
  const gained = days.reduce((sum, d) => sum + Math.max(0, d.delta), 0);
  const total = days[days.length - 1]?.total ?? 0;
  // 막대 높이는 그날 움직인 양의 절댓값 기준 — 하루 1개씩 주는 반에서도
  // 막대가 보이도록 최소 1로 잡습니다.
  const peak = Math.max(1, ...shown.map((d) => Math.abs(d.delta)));
  const hasWithdrawal = shown.some((d) => d.delta < 0);

  return (
    <section className="rwtrend" aria-label="과일 받은 흐름">
      <div className="rwtrend-head">
        <h4 className="rwtrend-title">🍎 과일 받은 흐름</h4>
        <p className="rwtrend-summary">
          지금 <b>{total}</b>개 · 받은 날 <b>{days.length}</b>일
          {gained !== total && <> · 누적 <b>{gained}</b>개</>}
        </p>
      </div>

      <div className="rwtrend-plot" role="img"
           aria-label={`최근 ${shown.length}개 수업일의 과일 변화. ` +
             shown.map((d) => `${shortDate(d.date)} ${d.delta > 0 ? "+" : ""}${d.delta}개`).join(", ")}>
        {shown.map((d) => {
          const h = Math.round((Math.abs(d.delta) / peak) * 100);
          const down = d.delta < 0;
          return (
            <div
              key={d.date}
              className="rwtrend-col"
              title={`${d.date} · ${d.delta > 0 ? "+" : ""}${d.delta}개 · 그날까지 ${d.total}개`}
            >
              <div className="rwtrend-slot">
                {!down && (
                  <span
                    className="rwtrend-bar rwtrend-bar--up"
                    style={{ height: `${h}%` }}
                  />
                )}
              </div>
              <span className="rwtrend-base" aria-hidden="true" />
              <div className="rwtrend-slot rwtrend-slot--down">
                {down && (
                  <span
                    className="rwtrend-bar rwtrend-bar--down"
                    style={{ height: `${h}%` }}
                  />
                )}
              </div>
              <span className="rwtrend-val">
                {d.delta > 0 ? "+" : ""}{d.delta}
              </span>
              <span className="rwtrend-date">{shortDate(d.date)}</span>
            </div>
          );
        })}
      </div>

      {hasWithdrawal && (
        <p className="rwtrend-note">아래로 내려간 날(−)은 과일을 도로 뺀 날입니다.</p>
      )}
      {days.length > MAX_DAYS && (
        <p className="rwtrend-note">최근 {MAX_DAYS}개 수업일만 보여 줍니다.</p>
      )}
    </section>
  );
}
