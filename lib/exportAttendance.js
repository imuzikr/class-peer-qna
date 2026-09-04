// =============================================================
// 출석부 내려받기 — 명단 × 날짜 표를 엑셀 한 장으로
// -------------------------------------------------------------
// 학교 시스템(NEIS 등)에 옮겨 적거나 학기말에 보관하려면 화면이 아니라
// 파일이 필요합니다. 공부방 '활동 자료 다운로드'와 같은 방식으로 만듭니다 —
// 라이브러리 없이 .xlsx를 짜서, 설치할 것 없이 바로 열립니다
// (lib/exportStudy.js의 downloadWorkbook).
//
// [표의 모양]
//   학번 · 이름 · (수업한 날짜들) … · 출석 · 결석 · 출석률
//   마지막 줄에 날짜별 출석 인원을 한 줄 더 답니다.
//
// [왜 '기록이 있는 날짜'만 열로 세우나]
//   출석 기록이 하나도 없는 날은 수업이 없었던 날입니다. 달력의 모든 날을
//   열로 세우면 빈 칸이 대부분이라 결석과 구분되지 않습니다.
// =============================================================
import { downloadWorkbook } from "./exportStudy";

export const PRESENT_MARK = "○";

// 2026-09-04 → 09-04 (열 머리는 좁아야 한 화면에 여러 날이 들어옵니다)
function shortDate(dateKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey ?? ""));
  return m ? `${m[2]}-${m[3]}` : String(dateKey ?? "");
}

// 명단·출석기록 → { headers, rows } (셀은 전부 문자열)
// roster: [{ uid, name, studentId }] · records: [{ uid, date }]
export function buildAttendanceSheet(roster = [], records = []) {
  // 수업한 날 = 기록이 하나라도 있는 날. 오래된 것부터 — 학기가 흘러온
  // 차례대로 읽는 것이 출석부의 쓰임입니다.
  const dates = [...new Set(records.map((r) => r.date).filter(Boolean))].sort();

  // 날짜별 출석 uid 집합
  const presentByDate = new Map(dates.map((d) => [d, new Set()]));
  records.forEach((r) => {
    if (r?.date && r?.uid) presentByDate.get(r.date)?.add(r.uid);
  });

  const students = [...roster].sort((a, b) =>
    String(a.studentId || a.name || "").localeCompare(
      String(b.studentId || b.name || ""),
      "ko"
    )
  );

  const headers = ["학번", "이름", ...dates.map(shortDate), "출석", "결석", "출석률"];

  const rows = students.map((s) => {
    const marks = dates.map((d) => (presentByDate.get(d).has(s.uid) ? PRESENT_MARK : ""));
    const present = marks.filter(Boolean).length;
    const absent = dates.length - present;
    const rate = dates.length > 0 ? Math.round((present / dates.length) * 100) : 0;
    return [
      String(s.studentId ?? ""),
      String(s.name ?? ""),
      ...marks,
      String(present),
      String(absent),
      dates.length > 0 ? `${rate}%` : "",
    ];
  });

  // 맨 아래 한 줄 — 그날 몇 명이 왔나. 세로로 훑으며 '적게 온 날'을 찾습니다.
  // **지금 명단에 있는 학생만** 셉니다 — 기록에는 반에서 빠진 학생도 남아
  // 있어, 그대로 세면 위 ○ 개수와 아래 합계가 어긋납니다.
  if (students.length > 0) {
    const alive = new Set(students.map((s) => s.uid));
    rows.push([
      "",
      "출석 인원",
      ...dates.map((d) => {
        let n = 0;
        presentByDate.get(d).forEach((uid) => { if (alive.has(uid)) n += 1; });
        return `${n}`;
      }),
      "",
      "",
      `${students.length}명`,
    ]);
  }

  return { headers, rows, dates };
}

// 파일 이름에 **실제로 담긴 범위**를 적습니다 — 하루면 그 날짜, 여러 날이면
// 처음~끝. 내려받은 파일이 여러 개 쌓였을 때 열어 보지 않고 고르려면
// 이름에 범위가 있어야 합니다.
export function attendanceFileName(className, dates = []) {
  const cls = String(className || "반").replace(/[\\/:*?"<>|]/g, "");
  if (dates.length === 0) return `출석부_${cls}.xlsx`;
  const first = dates[0];
  const last = dates[dates.length - 1];
  const span = first === last ? first : `${first}~${last}`;
  return `출석부_${cls}_${span}.xlsx`;
}

// 날짜 범위로 좁히기 — from·to는 'YYYY-MM-DD'이고 **양 끝을 포함**합니다.
// 비워 두면 그쪽 끝은 제한 없음(둘 다 비우면 전체 기간).
// ISO 날짜 문자열은 사전순 비교가 곧 시간순이라 그대로 견줍니다.
export function filterRecordsByRange(records = [], from = "", to = "") {
  const a = String(from || "");
  const b = String(to || "");
  return records.filter((r) => {
    const d = String(r?.date ?? "");
    if (!d) return false;
    if (a && d < a) return false;
    if (b && d > b) return false;
    return true;
  });
}

export function downloadAttendanceWorkbook({
  className = "",
  roster = [],
  records = [],
  from = "",
  to = "",
} = {}) {
  const picked = filterRecordsByRange(records, from, to);
  const { headers, rows, dates } = buildAttendanceSheet(roster, picked);
  downloadWorkbook(
    [{ name: className || "출석부", headers, rows }],
    attendanceFileName(className, dates)
  );
}
