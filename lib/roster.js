// =============================================================
// 반 명단 — 소속 uid × 사용자 디렉터리(실명·학번) × 과일 누적
// -------------------------------------------------------------
// 교사 화면의 자리표·과일 창·카드 격자가 받는 `roster`의 모양을 한 곳에서
// 정합니다. 같은 셈이 공부방·책방 페이지와 손든 학생 자리 확인 창에 따로
// 있었는데, 그중 자리 확인 창만 **학번순 정렬이 빠져** 있었습니다.
// 자리표에 아직 없는 학생을 빈자리에 채울 때(`normalizeSeats`) 명단 차례를
// 그대로 쓰므로, 같은 교실이 그 창에서만 다른 자리에 앉았습니다.
//
// 순수 함수라 tests/unit에서 곧바로 시험합니다. 구독까지 묶은 훅은
// lib/useClassRoster.js입니다.
// =============================================================

// 학번순(없으면 이름순) — 자리표·출석부와 같은 기준입니다.
export function byStudentId(a, b) {
  return (a.studentId || a.name).localeCompare(b.studentId || b.name, "ko");
}

// memberUids: 그 반 소속 uid 목록
// directory:  subscribeUserDirectory가 주는 [{ uid, realName, studentId, emoji, email }]
// rewards:    subscribeClassRewards가 주는 [{ uid, count }] — 누적 총계
//
// **`count`를 빠뜨리지 마세요** — '과일 주기' 창이 0으로 보고 '−1'을 잠급니다
// (책방에서 실제로 겪었습니다. CLAUDE.md '과일 주기' 절).
export function buildClassRoster(memberUids = [], directory = [], rewards = []) {
  const dir = new Map(directory.map((d) => [d.uid, d]));
  const countByUid = {};
  rewards.forEach((r) => { countByUid[r.uid] = r.count ?? 0; });
  return memberUids
    .map((uid) => {
      const d = dir.get(uid) ?? {};
      return {
        uid,
        name: d.realName || d.studentId || "이름 미설정",
        studentId: d.studentId || null,
        emoji: d.emoji || "🙂",
        email: d.email || null,
        count: countByUid[uid] ?? 0,
      };
    })
    .sort(byStudentId);
}
