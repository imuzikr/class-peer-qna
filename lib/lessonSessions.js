// =============================================================
// 출석 기록 → 수업 시간대(세션) 나누기
// -------------------------------------------------------------
// '과일을 수업 어느 대목에 주는가'를 보려면 그날 수업이 몇 시에 시작했는지를
// 알아야 합니다. 그런데 **교사가 '출석 시작'을 누른 시각은 어디에도 저장되지
// 않습니다** — classes/{id}.attendanceOpenDate는 날짜 문자열이고, 시각이 남는
// 것은 학생 한 명 한 명의 attendedAt뿐입니다. 그래서 한 무리의 첫 출석을
// 수업 시작으로 봅니다(교사가 누른 뒤 첫 학생이 찍기까지의 몇 초~1분이 곧
// 오차입니다).
//
// 나누는 규칙
//   · 첫 출석 = 수업 시작
//   · 그 뒤 CLUSTER_MIN(40분) 안의 출석은 같은 수업 — 지각한 학생입니다.
//     기준을 '직전 출석과의 간격'이 아니라 '수업 시작으로부터'로 잡습니다.
//     간격으로 재면 지각생이 드문드문 들어올 때 수업이 끝없이 늘어납니다.
//   · 수업 시작으로부터 40분을 넘겨 시작된 출석 = 새 수업
//   · 수업 끝 = 다음 수업 시작 10분 전.
//     다만 두 곳을 손봅니다.
//       - 아래로: 40분보다 짧아지지 않게 합니다. 안 그러면 같은 수업으로
//         묶은 지각 출석(최대 40분)이 정작 그 수업이 끝난 뒤가 됩니다.
//         (다음 수업 시작은 정의상 40분보다 뒤이므로 겹치지 않습니다)
//       - 위로: MAX_LESSON_MIN(45분)을 넘지 않게 합니다. 다음 수업이 세 시간
//         뒤면 '세 시간짜리 수업'이 되어 버립니다.
//   · 그날 마지막 수업은 다음이 없으므로 시작 + 45분.
//
// 반환한 세션에 속하지 않는 시각(쉬는 시간, 수업 전후)은 버리지 않고 부르는
// 쪽에서 '수업 시간 밖'으로 따로 셉니다 — 조용히 빼면 합이 안 맞습니다.
// =============================================================
import { toDate } from "./store";

const MIN = 60 * 1000;
// 이 안에 들어온 출석은 지각으로 봅니다(새 수업이 아님)
export const CLUSTER_MIN = 40;
// 다음 수업 시작 몇 분 전에 앞 수업이 끝나는가
export const GAP_BEFORE_NEXT = 10;
// 수업 한 차시의 최대 길이 — 마지막 수업의 끝이자, 긴 공백일 때의 상한
export const MAX_LESSON_MIN = 45;

function timeOf(rec) {
  const d = toDate(rec?.attendedAt ?? rec?.createdAt);
  const t = d?.getTime?.();
  return t != null && !Number.isNaN(t) ? t : null;
}

// 출석 기록 배열 → [{ start, end }] (시작 시각 오름차순, 밀리초)
export function buildLessonSessions(attendance = []) {
  const times = attendance
    .map(timeOf)
    .filter((t) => t != null)
    .sort((a, b) => a - b);
  if (times.length === 0) return [];

  // 40분 창으로 묶기 — 창의 기준은 늘 그 무리의 첫 출석입니다.
  const starts = [];
  let anchor = null;
  for (const t of times) {
    if (anchor == null || t > anchor + CLUSTER_MIN * MIN) {
      anchor = t;
      starts.push(t);
    }
  }

  return starts.map((start, i) => {
    const next = starts[i + 1];
    const byNext = next != null ? next - GAP_BEFORE_NEXT * MIN : Infinity;
    const end = Math.min(
      Math.max(byNext, start + CLUSTER_MIN * MIN),
      start + MAX_LESSON_MIN * MIN
    );
    return { start, end };
  });
}

// 어느 세션에 속하는가 → { index, elapsedMin } | null(수업 시간 밖)
export function sessionAt(sessions, time) {
  const t = typeof time === "number" ? time : timeOf({ attendedAt: time });
  if (t == null) return null;
  for (let i = 0; i < sessions.length; i += 1) {
    const s = sessions[i];
    if (t >= s.start && t <= s.end) {
      return { index: i, elapsedMin: Math.floor((t - s.start) / MIN) };
    }
  }
  return null;
}

// 지난 시간을 세 토막으로 — 한 차시 45분을 15분씩 나눕니다.
export const TIME_BANDS = [
  { key: "early", ko: "앞 15분", from: 0, to: 15 },
  { key: "mid", ko: "가운데 15분", from: 15, to: 30 },
  { key: "late", ko: "뒤 15분", from: 30, to: Infinity },
];

export function bandOf(elapsedMin) {
  return TIME_BANDS.findIndex((b) => elapsedMin >= b.from && elapsedMin < b.to);
}
