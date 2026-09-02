"use client";

// =============================================================
// 반 전체 과일 흐름 (교사 대시보드) — 학생 × 날짜 격자
// -------------------------------------------------------------
// 학생 한 명씩 여는 '과일 받은 흐름'은 그 아이가 어떻게 달라졌는지를 보여
// 주지만, 반 전체가 살아나는 중인지 식어 가는 중인지는 보이지 않습니다.
// 같은 이력을 학생(행) × 수업일(열)로 펼치면 두 가지가 한 판에 드러납니다.
//  · 가로로 읽으면 — 그 학생이 꾸준한지, 한동안 비어 있는지
//  · 세로로 읽으면 — 그날 반 전체가 활발했는지
//
// [왜 격자(칸 색)인가]
// 학생마다 막대 그래프를 세우면 30명이면 30개라 서로 견줄 수가 없습니다.
// 크기를 색 하나로 접으면 같은 자리에 다 들어가고, 빈 칸이 그대로 '그날
// 아무것도 없었다'는 신호가 됩니다. 칸 색은 한 가지 색의 진하기만 씁니다
// (많고 적음은 순서가 있는 값이라 여러 색을 섞으면 오히려 못 읽습니다).
//
// [회수한 날]
// 칸 안에 사선을 넣고 값을 음수로 적습니다 — 색만 다르게 하면 색을 구분
// 못 하는 사람에게는 그냥 '조금 받은 날'로 보입니다.
//
// 읽기는 담당 교사·관리자만 됩니다(규칙: classes/{id}/rewardEvents).
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeClassRewardEvents, toDate, todayDateKey } from "@/lib/store";
import RewardSkew from "./RewardSkew";
import RewardDelta from "./RewardDelta";

// 격자에 세우는 최대 수업일 — 넘으면 최근 것부터 남깁니다.
const MAX_DAYS = 20;

// 진하기 4단계 — 한 가지 색(과일 색)의 밝기만 바꿉니다. 값이 클수록
// 진해지도록 순서가 있어야 해서 임의의 색을 섞지 않습니다.
// 네 단계 모두 칸 안 숫자가 4.5:1 이상으로 읽히도록 잡았습니다(마지막 단계만
// 흰 글자 — 아래 stepTextLight). 밝기는 단조 감소합니다.
const STEPS = ["#f9e6dc", "#f2c4ab", "#e59a74", "#a94a21"];
// 이 단계부터는 칸이 어두워 흰 글자를 씁니다.
const LIGHT_TEXT_FROM = 3;

function shortDate(key) {
  const [, m, d] = key.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// 이력 → { dates, rows } — rows는 학생 한 명당 한 줄.
// -------------------------------------------------------------
// 행은 명단이 아니라 '이력에 실제로 등장한 학생'으로 만듭니다. 대시보드가
// 갖고 있는 명단(overviewStudents)은 공부방·KWL에 참여한 학생만 걸러진
// 목록이라, 카드는 안 썼지만 수업 중 과일은 받은 학생이 통째로 빠집니다.
// 이력에서 뽑으면 그런 누락이 원천적으로 없습니다. roster는 uid를 이름·학번으로
// 바꾸는 조회용으로만 씁니다(admin의 학생 항목은 uid가 아니라 id 필드입니다).
export function buildRewardGrid(events, roster) {
  const byUid = new Map(
    (roster || []).map((s) => [
      s.uid ?? s.id,
      {
        name: s.realName || s.name || "이름 미설정",
        studentId: s.studentId || null,
      },
    ])
  );
  const dates = [...new Set(events.map((e) => {
    const d = toDate(e.at);
    return d && !Number.isNaN(d.getTime()) ? todayDateKey(d) : null;
  }).filter(Boolean))].sort();

  const cells = new Map(); // `${uid}|${date}` → 그날 순증감
  events.forEach((e) => {
    const d = toDate(e.at);
    if (!d || Number.isNaN(d.getTime())) return;
    const key = `${e.uid}|${todayDateKey(d)}`;
    cells.set(key, (cells.get(key) ?? 0) + (typeof e.delta === "number" ? e.delta : 0));
  });

  const shownDates = dates.slice(-MAX_DAYS);
  const uids = [...new Set(events.map((e) => e.uid).filter(Boolean))];
  const rows = uids.map((uid) => {
    const who = byUid.get(uid);
    const values = shownDates.map((date) => cells.get(`${uid}|${date}`) ?? 0);
    return {
      uid,
      // 명단에 없는 uid(전학 등)도 줄은 남깁니다 — 그날의 지급 자체는 있었던 일입니다
      name: who?.name ?? "(명단에 없음)",
      studentId: who?.studentId ?? null,
      values,
      // 화면에 보이는 구간에서 실제로 받은 양 — 정렬·요약에 씁니다.
      gained: values.reduce((sum, v) => sum + Math.max(0, v), 0),
      activeDays: values.filter((v) => v > 0).length,
    };
  });
  // 학번순 — 교사가 반 명부를 읽는 순서와 같아야 특정 학생을 눈으로 찾습니다
  // (학번이 없는 사람은 뒤로).
  rows.sort((a, b) => {
    if (!a.studentId) return b.studentId ? 1 : 0;
    if (!b.studentId) return -1;
    return String(a.studentId).localeCompare(String(b.studentId), "ko", { numeric: true });
  });
  return { dates: shownDates, rows, totalDates: dates.length };
}

export default function ClassRewardTrend({ classId, roster = [], rewards = [] }) {
  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setEvents([]);
    if (!classId) return;
    return subscribeClassRewardEvents(classId, (list) => {
      setEvents(list);
      setLoaded(true);
    });
  }, [classId]);

  const { dates, rows, totalDates } = useMemo(
    () => buildRewardGrid(events, roster),
    [events, roster]
  );

  if (!classId) return null;

  // 그날 반 전체가 받은 양 — 격자 아래 합계 줄.
  const dayTotals = dates.map((_, i) =>
    rows.reduce((sum, r) => sum + Math.max(0, r.values[i]), 0)
  );
  const peak = Math.max(1, ...rows.flatMap((r) => r.values.map((v) => Math.abs(v))));

  // 진하기 단계 — 0은 빈 칸, 나머지는 최댓값을 4등분합니다.
  function stepOf(v) {
    const n = Math.abs(v);
    if (n === 0) return -1;
    return Math.min(STEPS.length - 1, Math.floor(((n - 1) / peak) * STEPS.length));
  }

  return (
    <section className="admin-chart-panel crtrend">
      <div className="admin-panel-head">
        <h2>🍎 반 전체 과일 흐름</h2>
        <span className="crtrend-sub">
          {loaded && dates.length > 0
            ? `최근 ${dates.length}개 수업일${totalDates > dates.length ? ` (전체 ${totalDates}일)` : ""}`
            : ""}
        </span>
      </div>

      {/* 쏠림 — 격자가 '언제 누가'라면 이쪽은 '지금 누가 갖고 있나'입니다.
          그래서 이력이 아니라 총계(rewards)를 봅니다 — 회수가 이미 반영돼
          있고 기록 시작일 이전 것도 들어 있어, 자리 카드의 숫자와 어긋나지
          않습니다. 이력은 '주고 거둔 양' 한 줄에만 씁니다.
          둘 다 부모가 받아 둔 배열이라 리스너가 늘지 않습니다. */}
      <RewardSkew rewards={rewards} events={events} roster={roster} loaded={loaded} />
      {/* 변화 — 쏠림이 '지금 고른가'라면 이쪽은 '움직이고 있나'입니다.
          과일 이력은 여기서 받은 것을 그대로 넘기고, 출석만 따로 구독합니다. */}
      <RewardDelta classId={classId} events={events} roster={roster} loaded={loaded} />

      {!loaded ? (
        <div className="admin-empty">불러오는 중…</div>
      ) : dates.length === 0 ? (
        <div className="admin-empty">아직 과일을 준 기록이 없어요.</div>
      ) : (
        <>
          <div className="crtrend-scroll">
            <table className="crtrend-table">
              <caption className="sr-only">
                학생별·수업일별 과일 지급 격자. 칸이 진할수록 그날 많이 받았습니다.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="crtrend-name-head">학생</th>
                  {dates.map((d) => (
                    <th scope="col" key={d} className="crtrend-date-head">
                      <span>{shortDate(d)}</span>
                    </th>
                  ))}
                  <th scope="col" className="crtrend-sum-head">합계</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.uid}>
                    <th scope="row" className="crtrend-name">
                      <span className="crtrend-no">{r.studentId || "-"}</span>
                      <span className="crtrend-nm">{r.name}</span>
                    </th>
                    {r.values.map((v, i) => {
                      const step = stepOf(v);
                      return (
                        <td key={dates[i]} className="crtrend-cell-wrap">
                          <span
                            className={`crtrend-cell${v < 0 ? " crtrend-cell--minus" : ""}${
                              step >= LIGHT_TEXT_FROM ? " crtrend-cell--ontop" : ""
                            }`}
                            style={step >= 0 ? { background: STEPS[step] } : undefined}
                            title={`${r.name} · ${dates[i]} · ${v > 0 ? "+" : ""}${v}개`}
                          >
                            {v !== 0 ? (v > 0 ? v : `−${Math.abs(v)}`) : ""}
                          </span>
                        </td>
                      );
                    })}
                    <td className="crtrend-sum">{r.gained}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="crtrend-name crtrend-name--foot">그날 합계</th>
                  {dayTotals.map((n, i) => (
                    <td key={dates[i]} className="crtrend-daytotal">{n || ""}</td>
                  ))}
                  <td className="crtrend-sum">
                    {rows.reduce((sum, r) => sum + r.gained, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="crtrend-legend">
            <span className="crtrend-legend-label">적게</span>
            {STEPS.map((c) => (
              <i key={c} className="crtrend-swatch" style={{ background: c }} />
            ))}
            {/* 진하기도 막대와 같이 '보이는 기간의 최댓값' 기준이라, 가장
                진한 칸이 몇 개인지 적어 둡니다 — 안 적으면 다른 반·다른
                기간의 격자와 색을 그대로 견주게 됩니다. */}
            <span className="crtrend-legend-label">많이({peak}개)</span>
          </div>
        </>
      )}
    </section>
  );
}
