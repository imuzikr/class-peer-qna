// =============================================================
// 자리표 공통 헬퍼
// -------------------------------------------------------------
// 참여 전광판(AttendanceBoard)과 출석 관리의 '자리 배정하기' 보기가 같은
// 자리 배열을 그리므로, 배열을 다듬는 규칙을 한곳에 둡니다.
// =============================================================
// 자리 수 — 이 파일이 주인입니다. 예전에는 store.js에 두고 여기서 가져왔는데,
// 그러면 이 순수 함수들을 시험하려 해도 Firebase까지 끌려왔습니다.
// lib/data/attendance.js와 lib/store.js가 여기서 가져갑니다.
export const STUDY_SEAT_COUNT = 30;

// 저장된 자리 배열(uid 문자열 또는 null이 섞인 길이 30 배열)을 다듬습니다.
//  · 중복 uid는 뒤엣것을 버리고
//  · 자리표에 아직 없는 학생은 앞쪽 빈자리부터 채워 넣습니다
//    (반에 새로 들어온 학생이 자리표에서 통째로 빠지지 않도록)
export function normalizeSeats(seats = [], roster = []) {
  const seen = new Set();
  const base = Array.from({ length: STUDY_SEAT_COUNT }, (_, i) => {
    const uid = typeof seats[i] === "string" && seats[i] ? seats[i] : null;
    if (!uid || seen.has(uid)) return null;
    seen.add(uid);
    return uid;
  });
  let cursor = 0;
  roster.forEach((s) => {
    if (seen.has(s.uid)) return;
    while (cursor < base.length && base[cursor]) cursor += 1;
    if (cursor < base.length) {
      base[cursor] = s.uid;
      seen.add(s.uid);
    }
  });
  return base;
}
