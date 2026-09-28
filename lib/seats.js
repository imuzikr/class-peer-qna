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

// ── 선생님 보기 — 자리표를 그리는 차례 ─────────────────────────
// 자리 번호(index)를 **화면에 서는 차례**로 늘어놓습니다. 학생 보기는
// 0, 1, 2 … 그대로이고, 선생님 보기는 통째로 거꾸로입니다 — 한 줄에
// `cols`칸씩 왼쪽→오른쪽으로 채우는 격자에서 배열을 거꾸로 세우면 곧
// 180도 돌린 그림입니다(앞뒤도 좌우도 뒤집힘).
//
// **예전에는 CSS로 그림을 돌렸습니다**(격자 `rotate(180deg)` + 칸마다 도로
// 180도). 모양은 같았지만 돌린 층의 글자를 브라우저가 흐리게 그렸습니다 —
// 격자 크기가 소수점 픽셀이면 늘 흐렸고(반마다 명단 수·패널 폭이 달라 한
// 반은 늘, 다른 반은 멀쩡), 멀쩡한 반도 마우스를 얹어 칸이 움직이는 동안
// 흐려졌습니다(실제 신고). 차례만 바꾸면 돌리는 층이 없어 글자가 늘 또렷합니다.
//
// 배열을 거꾸로 세워도 괜찮은 까닭: 되돌려 주는 것은 **자리 번호**라 빈
// 칸은 제자리를 지키고, 끌어 옮기기·자리 누르기는 그 번호를 그대로 씁니다.
// 마지막 줄이 덜 차 있으면 모자란 칸을 `null`로 채워 돌립니다 — 돌린
// 그림에서 그 줄은 맨 위 오른쪽에 붙습니다(그림을 돌리던 때와 같은 자리).
// 부르는 쪽은 `null`에 자리만 차지하는 빈 칸을 그립니다.
export function seatOrder(count, flipped, cols = 6) {
  const order = Array.from({ length: count }, (_, i) => i);
  if (!flipped || !cols || cols < 1 || count === 0) return order;
  const total = Math.ceil(count / cols) * cols;
  const padded = Array.from({ length: total }, (_, i) => (i < count ? i : null));
  return padded.reverse();
}

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
