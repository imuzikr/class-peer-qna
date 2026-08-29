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
//
// [왜 기본이 접힘인가]
// 수업 중 교사 화면은 전자칠판에 그대로 비칩니다. 요즘 과일을 못 받은 학생의
// 빈 막대가 반 전체에 펼쳐지면 그 학생이 마음 상합니다. 이건 교사가 혼자
// 들여다보는 자료지 학생들과 함께 볼 자료가 아니므로, 펼치는 것을 교사의
// 의식적인 동작으로 둡니다. 요약 숫자까지 함께 감춥니다 — '받은 날 n일'만
// 봐도 최근에 못 받은 것이 드러나기 때문입니다.
// 학생을 바꾸면 다시 접힙니다(아래 useEffect) — 앞 학생을 보려고 펼쳐 둔
// 상태가 다음 학생에게 딸려가면 같은 사고가 납니다.
// 접힌 모습은 누구나 똑같습니다 — 기록이 없는 학생이라고 칸을 감추면 그
// '없음'이 곧 신호가 되어 버립니다(아래 return 앞 주석 참고).
// =============================================================
import { useEffect, useMemo, useState } from "react";
import {
  subscribeStudentRewardEvents,
  subscribeStudentRewardEventsForClasses,
  toDate,
  todayDateKey,
} from "@/lib/store";

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

export default function StudentRewardTrend({
  studentUid,
  classId = null,
  // 학생 리포트처럼 여러 반의 이력을 한 흐름으로 볼 때 씁니다(classId 대신).
  classIds = null,
  // 본인이 자기 리포트에서 볼 때는 펼친 채로 — 감출 이유가 없습니다.
  defaultOpen = false,
  title = "🍎 과일 받은 흐름",
  // 제목 없이 버튼만 — 과일 주기 모달처럼 바로 위에 이미 '🍎 과일 n'이 적혀
  // 있는 자리에서는 제목이 같은 말을 두 번 하는 셈이라 뺍니다.
  bare = false,
  // 흐름을 보려고 연 화면(과일 뱃지 모달)에서는 접는 버튼이 할 일이 없습니다.
  showToggle = true,
}) {
  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // 기본은 접힘 — 아래 [왜 기본이 접힘인가] 참고
  const [open, setOpen] = useState(defaultOpen);

  // 여러 반을 볼 때는 배열이 매 렌더 새로 만들어져도 구독이 다시 붙지 않도록
  // 내용으로 키를 잡습니다.
  const idsKey = classIds ? [...new Set(classIds.filter(Boolean))].sort().join(",") : "";

  useEffect(() => {
    setLoaded(false);
    setEvents([]);
    if (!studentUid) return;
    const done = (list) => {
      setEvents(list);
      setLoaded(true);
    };
    if (classIds) {
      if (!idsKey) return;
      return subscribeStudentRewardEventsForClasses(idsKey.split(","), studentUid, done);
    }
    if (!classId) return;
    return subscribeStudentRewardEvents(classId, studentUid, done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, idsKey, studentUid]);

  // 다른 학생으로 넘어가면 반드시 다시 접습니다 — 수업 중 교사 화면이 그대로
  // 비칠 때, 앞 학생을 보려고 펼쳐 둔 상태가 다음 학생에게 딸려가면 안 됩니다.
  useEffect(() => {
    setOpen(defaultOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentUid]);

  const days = useMemo(() => groupRewardsByDate(events), [events]);

  // 반이 없으면 조회할 대상 자체가 없습니다(그 밖에는 늘 자리를 지킵니다).
  //
  // [기록이 없는 학생에게도 이 칸을 남기는 이유]
  // 예전에는 기록이 없으면 이 영역을 통째로 감췄습니다. 그러면 학생마다 화면
  // 생김새가 달라져, 전자칠판에 비칠 때 '이 칸이 없는 아이 = 한 번도 못 받은
  // 아이'로 읽힙니다. 감추려던 것이 오히려 없다는 사실로 드러나는 셈이라,
  // 누구에게나 똑같이 접힌 칸을 두고 펼쳤을 때만 안내를 보여 줍니다.
  if (!classId && !idsKey) return null;

  const shown = days.slice(-MAX_DAYS);
  // 막대 높이는 그날 움직인 양의 절댓값 기준 — 하루 1개씩 주는 반에서도
  // 막대가 보이도록 최소 1로 잡습니다.
  const peak = Math.max(1, ...shown.map((d) => Math.abs(d.delta)));

  return (
    <section className="rwtrend" aria-label="과일 받은 흐름">
      {(!bare || showToggle) && (
      <div className={`rwtrend-head${bare ? " rwtrend-head--bare" : ""}`}>
        {!bare && <h4 className="rwtrend-title">{title}</h4>}
        <button
          type="button"
          className="rwtrend-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? "이력 접기" : "이력 보기"}
        </button>
      </div>
      )}

      {!open ? null : !loaded ? (
        <p className="rwtrend-note">불러오는 중…</p>
      ) : days.length === 0 ? (
        <p className="rwtrend-note">아직 과일을 받은 기록이 없어요.</p>
      ) : (
        <>
          {/* 총 개수 요약은 두지 않습니다 — 학생은 상단바에, 교사는 자리표와
              과일 주기 모달에 지금 몇 개인지가 이미 적혀 있어 같은 말이
              반복됩니다. 여기서 알고 싶은 것은 '언제 얼마나'입니다. */}
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

          {/* 막대 높이가 무엇에 견준 것인지 밝혀 둡니다. 높이는 '보이는 기간의
              최댓값'에 맞춰 늘리므로, 받은 날이 하루뿐이거나 매번 같은 개수를
              준 기간에는 모든 막대가 꽉 찹니다 — 그걸 '많이 받았다'로 오해하기
              쉬워서, 기준이 몇 개인지 그 자리에 적습니다. 학생끼리·기간끼리
              높이를 견주면 안 되는 이유이기도 합니다. */}
          <p className="rwtrend-note">
            막대 높이는 이 기간에서 가장 많은 날(<b>{peak}개</b>) 기준이에요.
          </p>
          {days.length > MAX_DAYS && (
            <p className="rwtrend-note">최근 {MAX_DAYS}개 수업일만 보여 줍니다.</p>
          )}
        </>
      )}
    </section>
  );
}
