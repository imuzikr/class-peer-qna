"use client";

// =============================================================
// 변화 — 달라지고 있나 (앞 4주 → 최근 4주)
// -------------------------------------------------------------
// 쏠림이 '지금 고른가'를 본다면, 이 칸은 '움직이고 있나'를 봅니다.
// 절대량은 이미 다른 화면에 다 있습니다. 여기서 알고 싶은 것은 **바뀐 쪽**
// 입니다 — 조용하지만 꾸준히 오르는 학생, 그리고 식어 가는 학생.
//
// [왜 줄어든 쪽이 먼저인가] 늘어난 학생은 수업 중에도 눈에 띕니다. 반대로
// 한동안 안 보이게 된 학생은 어느 화면에도 나타나지 않습니다. 그래서 목록을
// 감소 순으로 세웁니다.
//
// [4주씩 묶는 이유] 한 반이 주 두세 시간이라 주별 값은 크게 출렁입니다.
// 주 단위로 견주면 2개→0개가 늘 벌어져 매번 '급감'처럼 보입니다.
//
// [기회 대비] 결석이 잦아 견줄 수 없는 학생은 표시만 하고 숫자를 해석하지
// 않습니다. 출석일로 나누는 방법도 있지만 '0.125개/일' 같은 값은 정밀해
// 보이기만 하고 교사가 할 일이 없습니다. 그보다 '이 학생은 절반도 못 나와
// 견주기 어렵다'가 훨씬 정직하고 쓸모 있습니다.
//
// [구독] 과일 이력은 부모(ClassRewardTrend)가 이미 받아 둔 것을 그대로
// 받습니다. 출석만 여기서 따로 구독합니다 — 대시보드는 교사가 가끔 여는
// 화면이고, 한 반의 출석 기록이라 크지 않습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeClassStudyAttendance, toDate } from "@/lib/store";

const WEEKS = 4;
const DAY = 24 * 60 * 60 * 1000;
// 한쪽 목록에 세울 최대 인원 — 다 늘어놓으면 '바뀐 쪽'이라는 요점이 묻힙니다.
const SHOW = 6;
// 이 창에서 반 수업일의 이만큼도 못 나왔으면 견주지 않습니다.
const THIN = 0.5;

export default function RewardDelta({ classId = null, events = [], roster = [], loaded = false }) {
  const [attendance, setAttendance] = useState([]);

  useEffect(() => {
    setAttendance([]);
    if (!classId) return;
    return subscribeClassStudyAttendance(classId, setAttendance);
  }, [classId]);

  const stat = useMemo(() => {
    const now = Date.now();
    const midAt = now - WEEKS * 7 * DAY;      // 최근 창의 시작
    const fromAt = now - WEEKS * 2 * 7 * DAY; // 앞 창의 시작

    // 회수(음수)는 빼고 '준 것'만 셉니다 — 쏠림과 같은 기준입니다.
    const given = events.filter((e) => (e.delta ?? 0) > 0);
    const sum = (from, to) => {
      const m = new Map();
      given.forEach((e) => {
        const t = toDate(e.at).getTime();
        if (t >= from && t < to) m.set(e.uid, (m.get(e.uid) ?? 0) + (e.delta ?? 0));
      });
      return m;
    };
    const before = sum(fromAt, midAt);
    const after = sum(midAt, now + DAY);

    // 창마다 반이 실제로 모인 날 — 출석 기록이 있는 날짜의 가짓수입니다.
    const daysIn = (from, to) =>
      new Set(
        attendance
          .filter((r) => {
            const t = toDate(r.attendedAt ?? r.createdAt).getTime();
            return t >= from && t < to;
          })
          .map((r) => r.date)
          .filter(Boolean)
      );
    const afterDays = daysIn(midAt, now + DAY);
    const attendedBy = new Map();
    attendance.forEach((r) => {
      const t = toDate(r.attendedAt ?? r.createdAt).getTime();
      if (t >= midAt && r.uid) attendedBy.set(r.uid, (attendedBy.get(r.uid) ?? 0) + 1);
    });

    const rows = roster.map((s) => {
      const uid = s.uid ?? s.id;
      const b = before.get(uid) ?? 0;
      const a = after.get(uid) ?? 0;
      const came = attendedBy.get(uid) ?? 0;
      return {
        uid,
        name: s.realName || s.name || "이름 미설정",
        before: b,
        after: a,
        delta: a - b,
        // 반이 모인 날의 절반도 못 나왔으면 숫자를 견주지 않습니다.
        thin: afterDays.size > 0 && came < afterDays.size * THIN,
        came,
        days: afterDays.size,
      };
    });

    const totalBefore = [...before.values()].reduce((x, y) => x + y, 0);
    const totalAfter = [...after.values()].reduce((x, y) => x + y, 0);
    const moved = rows.filter((r) => r.delta !== 0);

    return {
      rows,
      totalBefore,
      totalAfter,
      // 감소 순 — 식어 가는 학생이 먼저입니다.
      down: moved.filter((r) => r.delta < 0).sort((x, y) => x.delta - y.delta),
      up: moved.filter((r) => r.delta > 0).sort((x, y) => y.delta - x.delta),
      same: rows.length - moved.length,
      peak: Math.max(1, ...rows.map((r) => Math.max(r.before, r.after))),
      hasWindow: totalBefore + totalAfter > 0,
    };
  }, [events, roster, attendance]);

  if (!loaded || !stat.hasWindow) return null;

  const diff = stat.totalAfter - stat.totalBefore;
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

  const list = (rows, label) =>
    rows.length === 0 ? null : (
      <div className="rdelta-group">
        <p className="rdelta-group-title">{label}</p>
        <ol className="rdelta-list">
          {rows.slice(0, SHOW).map((r) => (
            <li
              key={r.uid}
              className="rdelta-row"
              title={`${r.name} — 앞 4주 ${r.before}개, 최근 4주 ${r.after}개${
                r.thin ? ` · 최근 4주 ${r.days}일 중 ${r.came}일 출석` : ""
              }`}
            >
              <span className="rdelta-name">{r.name}</span>
              <span className="rdelta-bars">
                {/* 앞 4주는 테두리만, 최근 4주는 채움 — 두 계열을 밝기로만
                    가르면 색을 못 가리는 눈에서 겹칩니다(재 보니 1.30:1).
                    모양이 다르면 색과 무관하게 갈립니다. */}
                {/* 0이면 요소를 아예 그리지 않습니다. width: 0으로만 두면
                    테두리 3px이 그대로 남아(box-sizing: border-box) '아주 조금
                    받았다'로 읽힙니다 — 재 보고 알았습니다. */}
                {r.before > 0 && (
                  <span
                    className="rdelta-before"
                    style={{ width: `${(r.before / stat.peak) * 100}%` }}
                  />
                )}
                {r.after > 0 && (
                  <span
                    className="rdelta-after"
                    style={{ width: `${(r.after / stat.peak) * 100}%` }}
                  />
                )}
              </span>
              {r.thin && (
                <span className="rdelta-thin" title={`최근 4주 ${r.days}일 중 ${r.came}일만 출석`}>
                  결석 잦음
                </span>
              )}
              <span className={`rdelta-val${r.delta < 0 ? " down" : " up"}`}>{sign(r.delta)}</span>
            </li>
          ))}
        </ol>
        {rows.length > SHOW && (
          <p className="rdelta-more">그 밖 {rows.length - SHOW}명</p>
        )}
      </div>
    );

  return (
    <div className="rdelta">
      <p className="rdelta-lead">
        <span className="rdelta-head-title">변화</span>
        앞 4주 <strong>{stat.totalBefore}개</strong> → 최근 4주{" "}
        <strong>{stat.totalAfter}개</strong>
        <em className={`rdelta-diff${diff < 0 ? " down" : diff > 0 ? " up" : ""}`}>
          {diff === 0 ? "그대로" : sign(diff)}
        </em>
        {/* 계열이 둘이라 범례를 둡니다 — 막대 두 개가 무엇인지 표시가
            없으면 어느 쪽이 '지금'인지 알 수 없습니다. */}
        <span className="rdelta-legend">
          <i className="rdelta-key before" /> 앞 4주
          <i className="rdelta-key after" /> 최근 4주
        </span>
      </p>

      <div className="rdelta-groups">
        {list(stat.down, "줄어든 학생")}
        {list(stat.up, "늘어난 학생")}
      </div>

      {stat.same > 0 && (
        <p className="rdelta-same">변화 없음 {stat.same}명</p>
      )}
    </div>
  );
}
