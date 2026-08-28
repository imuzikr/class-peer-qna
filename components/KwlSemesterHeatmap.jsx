"use client";

// =============================================================
// KWLS 학기 히트맵 — 공부방 KWLS 패널 「기록」 탭 맨 위
// -------------------------------------------------------------
// 기록 탭은 날짜 카드를 세로로 쌓기만 해서, 스크롤을 끝까지 내려야
// '얼마나 꾸준히 썼는지'가 겨우 짐작됐습니다. 한 학기를 한 판에 깔아
// 그 흐름을 첫 화면에서 보이게 합니다.
//
// 농도 = 그날 채운 칸 수(0~4). KWLS는 하루 1건이라 건수를 셀 것이 없고,
// 네 칸 중 몇 칸을 채웠는가가 곧 그날의 밀도입니다. 그래서 질문·답변용
// ActivityHeatmap(건수 기준 1·2·3~4·5+)을 그대로 쓰지 않고 따로 뒀습니다.
// 사이드바는 폭이 300px뿐이라 52주 격자도 들어가지 않고요.
//
// 칸을 누르면 아래 목록에서 그 날짜가 펼쳐집니다 — 흐름을 눈으로 잡고
// 곧바로 그날 쓴 내용으로 넘어가는 것이 이 탭의 쓰임이라서.
// =============================================================
import { kwlsFilledKeysOf, KWLS_COLUMNS } from "@/lib/kwls";

const MONTH_NAMES = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// ── 학기 범위 ────────────────────────────────────────────────
// 2학기 = 8월 4주차 ~ 연말. '4주차'는 8월 첫 일요일에서 3주 뒤 일요일로
// 잡습니다(주 시작을 일요일로 두는 이 격자와 결이 맞습니다).
// 예) 2026년 8월 1일이 토요일 → 첫 일요일 8/2 → 4주차 시작 8/23.
function semesterStart(year) {
  const d = new Date(year, 7, 1); // 8월 1일
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); // 8월 첫 일요일
  d.setDate(d.getDate() + 21); // 그로부터 3주 뒤 = 4주차
  d.setHours(0, 0, 0, 0);
  return d;
}

// 마지막 칸이 될 주(12월 31일이 든 주)의 일요일
function lastWeekStart(year) {
  const d = new Date(year, 11, 31);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

// 오늘이 아직 학기 시작 전이면(1~8월 중순) 직전 학기를 보여줍니다 —
// 아직 오지 않은 학기를 텅 빈 채로 까는 것보다 낫습니다.
function semesterYearOf(today) {
  const y = today.getFullYear();
  return today >= semesterStart(y) ? y : y - 1;
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function KwlSemesterHeatmap({ entries = [], selectedDate, onPickDate }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = semesterYearOf(today);
  const start = semesterStart(year);
  const end = lastWeekStart(year);
  const weekCount = Math.round((end - start) / (7 * 86400000)) + 1;

  // 날짜별로 묶어 '그날 채운 칸'을 셉니다
  const byDate = {};
  entries.forEach((e) => {
    if (e?.date) (byDate[e.date] ??= []).push(e);
  });

  const weeks = Array.from({ length: weekCount }, (_, w) => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + w * 7 + i
      );
      const key = ymd(date);
      const dayEntries = byDate[key];
      const filled = dayEntries ? kwlsFilledKeysOf(dayEntries) : null;
      return {
        key,
        date,
        future: date > today,
        level: filled ? filled.size : 0,
        letters: filled
          ? KWLS_COLUMNS.filter((c) => filled.has(c.key)).map((c) => c.letter)
          : [],
      };
    });
    // 그 주에 달이 바뀌면 머리에 달 이름을 답니다
    const month = days[0].date.getMonth();
    const prev =
      w > 0
        ? new Date(
            start.getFullYear(),
            start.getMonth(),
            start.getDate() + (w - 1) * 7
          ).getMonth()
        : -1;
    return { days, monthLabel: month !== prev ? MONTH_NAMES[month] : null };
  });

  // 집계는 '깔아 놓은 학기 안'만 셉니다. history에는 지난 학기 기록도
  // 들어 있어(subscribeMyAllKwl은 전 기간), 전부 세면 격자에 보이는 것보다
  // 큰 숫자가 나와 화면과 말이 어긋납니다.
  const startKey = ymd(start);
  const endKey = ymd(
    new Date(end.getFullYear(), end.getMonth(), end.getDate() + 6)
  );
  const inSemester = Object.entries(byDate).filter(
    ([date]) => date >= startKey && date <= endKey
  );
  const writtenDays = inSemester.length;
  const fullDays = inSemester.filter(
    ([, list]) => kwlsFilledKeysOf(list).size === KWLS_COLUMNS.length
  ).length;

  return (
    <section className="kwls-hm">
      <div className="kwls-hm-head">
        <h4>
          {year}년 2학기
          <small>8월 4주 ~ 12월</small>
        </h4>
        <span className="kwls-hm-stat">
          {writtenDays}일 쓰고 <b>{fullDays}일</b> 네 칸 다 채움
        </span>
      </div>

      <div className="kwls-hm-grid">
        <div className="kwls-hm-days" aria-hidden="true">
          {/* 월·수·금만 — 일곱 줄을 다 적으면 좁은 폭에서 글자가 뭉갭니다 */}
          {DAY_LABELS.map((d, i) => (
            <span key={d}>{i % 2 === 1 ? d : ""}</span>
          ))}
        </div>

        <div className="kwls-hm-weeks">
          <div className="kwls-hm-months" aria-hidden="true">
            {weeks.map((wk, i) => (
              <span key={i}>{wk.monthLabel ?? ""}</span>
            ))}
          </div>
          <div className="kwls-hm-body">
            {weeks.map((wk, i) => (
              <div className="kwls-hm-week" key={i}>
                {wk.days.map((day) => {
                  const has = day.level > 0;
                  const label = `${day.date.getMonth() + 1}월 ${day.date.getDate()}일 — ${
                    has ? `${day.letters.join("·")} (${day.level}칸)` : "안 씀"
                  }`;
                  return (
                    <button
                      key={day.key}
                      type="button"
                      className={`kwls-hm-cell lv${day.level}${
                        day.future ? " future" : ""
                      }${selectedDate === day.key ? " on" : ""}`}
                      title={label}
                      aria-label={label}
                      disabled={!has}
                      onClick={() => has && onPickDate?.(day.key)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="kwls-hm-legend">
        <span>안 씀</span>
        {[0, 1, 2, 3, 4].map((lv) => (
          <i key={lv} className={`kwls-hm-swatch lv${lv}`} />
        ))}
        <span>네 칸</span>
      </div>
    </section>
  );
}
