"use client";

// =============================================================
// 언제 주나 — 과일을 수업 어느 대목에 주는가 (교사 자기 점검)
// -------------------------------------------------------------
// 쏠림이 '누구에게' 가는가라면, 이 칸은 '언제' 가는가입니다. 둘 다 재는 것은
// 학생이 아니라 **교사의 눈길**입니다 — 수업 앞 15분에만 과일이 몰려 있다면,
// 뒤로 갈수록 관찰이 성기어졌다는 뜻일 수 있습니다(또는 뒷부분이 강의 위주로
// 흘러갔다는 뜻일 수도 있고요. 어느 쪽인지는 이 숫자가 정하지 않습니다).
//
// [수업 시작을 무엇으로 잡나] 교사가 '출석 시작'을 누른 시각은 저장되지
// 않습니다. 남는 것은 학생 한 명씩의 attendedAt뿐이라, 한 무리의 첫 출석을
// 시작으로 봅니다. 무리를 나누는 규칙은 lib/lessonSessions.js에 있습니다
// (40분 안은 지각, 그 뒤는 새 수업, 끝은 다음 시작 10분 전).
//
// [수업 시간 밖은 버리지 않습니다] 쉬는 시간이나 수업 전후에 준 과일은 세션에
// 안 들어갑니다. 조용히 빼면 위 '쏠림'의 총량과 합이 안 맞아, 따로 셉니다.
//
// [구독하지 않습니다] 이력도 출석도 부모(ClassRewardTrend)가 받아 둔 것을
// 그대로 받습니다.
// =============================================================
import { useMemo } from "react";
import { toDate } from "@/lib/store";
import {
  buildLessonSessions,
  sessionAt,
  bandOf,
  TIME_BANDS,
  MAX_LESSON_MIN,
} from "@/lib/lessonSessions";

// 한 가지 색의 진하기만 — 앞·가운데·뒤는 순서가 있는 값이라 다른 색을
// 섞으면 순서가 안 읽힙니다(쏠림 띠와 같은 생각).
const BANDS = ["#b85c3f", "#d98a63", "#eeba9e"];

export default function RewardTiming({ events = [], attendance = [], loaded = false }) {
  const stat = useMemo(() => {
    const sessions = buildLessonSessions(attendance);
    if (sessions.length === 0) return null;

    // 회수(음수)는 빼고 '준 것'만 — 쏠림과 같은 기준입니다.
    const given = events.filter((e) => (e.delta ?? 0) > 0);
    const counts = TIME_BANDS.map(() => 0);
    let outside = 0;
    given.forEach((e) => {
      const d = toDate(e.at);
      const t = d?.getTime?.();
      if (t == null || Number.isNaN(t)) return;
      const hit = sessionAt(sessions, t);
      if (!hit) { outside += e.delta ?? 0; return; }
      const b = bandOf(hit.elapsedMin);
      if (b >= 0) counts[b] += e.delta ?? 0;
    });

    const total = counts.reduce((a, b) => a + b, 0);
    return { sessions: sessions.length, counts, total, outside };
  }, [events, attendance]);

  if (!loaded || !stat) return null;
  if (stat.total === 0 && stat.outside === 0) return null;

  const pct = (n) => (stat.total > 0 ? Math.round((n / stat.total) * 100) : 0);
  // 가장 많이 몰린 토막 — 한 줄 요약에 씁니다.
  const topIdx = stat.counts.indexOf(Math.max(...stat.counts));

  return (
    <div className="rtime">
      <p className="rtime-lead">
        <span className="rtime-title">언제 주나</span>
        수업 {stat.sessions}번 · 한 차시 {MAX_LESSON_MIN}분 기준
      </p>

      {stat.total > 0 ? (
        <>
          <ul className="rtime-rows">
            {TIME_BANDS.map((b, i) => (
              <li key={b.key} className="rtime-row">
                <span className="rtime-name">{b.ko}</span>
                <span className="rtime-track">
                  {stat.counts[i] > 0 && (
                    <span
                      className="rtime-fill"
                      style={{ width: `${pct(stat.counts[i])}%`, background: BANDS[i] }}
                    />
                  )}
                </span>
                <span className="rtime-val">
                  {stat.counts[i]}
                  <em>{pct(stat.counts[i])}%</em>
                </span>
              </li>
            ))}
          </ul>

          {/* 한 토막에 몰려 있을 때만 말합니다 — 고르면 굳이 문장을 더하지
              않습니다(고른 것은 그림이 이미 보여 줍니다). */}
          {pct(stat.counts[topIdx]) >= 50 && (
            <p className="rtime-note">
              과일의 <strong>{pct(stat.counts[topIdx])}%</strong>가 수업{" "}
              <strong>{TIME_BANDS[topIdx].ko}</strong>에 몰려 있어요.
            </p>
          )}
        </>
      ) : (
        <p className="rtime-empty">수업 시간 안에 준 과일이 아직 없어요.</p>
      )}

      {/* 쉬는 시간·수업 전후 — 버리지 않고 밝혀 둡니다 */}
      {stat.outside > 0 && (
        <p className="rtime-outside">
          수업 시간 밖(쉬는 시간·수업 전후)에 준 {stat.outside}개는 위 셋에서
          뺐어요.
        </p>
      )}
    </div>
  );
}
