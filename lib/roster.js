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

// '✍️ 공부중' 단추의 숫자 — 공부방 카드 격자 · 학생 카드 머리 · 수업 모드가 함께 씁니다.
//   오늘 출석 기록이 있으면 `쓴 학생 / 출석(전체)` — `27/28(29)`
//   없으면                    `쓴 학생 / 전체`          — `27/29`
// 출석을 받은 날은 분모가 '오늘 온 학생'이라야 '온 학생 중 몇 명이 손을 움직이나'가
// 읽히고, 괄호의 전체 인원과 견주면 결석이 몇 명인지가 보입니다(선생님 제안).
// 그때는 **분자도 출석한 학생 가운데서** 셉니다 — 지난 시간에 써 둔 결석 학생까지
// 세면 분자가 분모를 넘을 수 있습니다(`29/28`).
// 세는 대상은 **지금 명단에 있는 학생**뿐입니다 — 반에서 빠진 학생의 옛 출석 기록이
// 섞이면 출석 수가 전체를 넘습니다('멋진 순간'의 '출석 n/N'과 같은 기준).
//
// roster:   [{ uid, … }]
// wrote:    (uid) => boolean — 활동을 하나라도 썼나
// records:  출석 기록 [{ uid, date }]
// todayKey: 오늘 날짜 열쇠(`2026-10-08`)
export function studyingSummary(roster, wrote, records, todayKey) {
  const total = roster.length;
  const presentSet = new Set(
    (records ?? []).filter((r) => r?.date === todayKey && r.uid).map((r) => r.uid)
  );
  const present = roster.filter((s) => presentSet.has(s.uid));
  const known = present.length > 0;
  const pool = known ? present : roster;
  const count = pool.filter((s) => wrote(s.uid)).length;
  const label = known ? `${count}/${present.length}(${total})` : `${count}/${total}`;
  const title = known
    ? `출석한 ${present.length}명 가운데 ${count}명이 활동을 쓰는 중 · 전체 ${total}명` +
      (total > present.length ? ` (결석 ${total - present.length}명)` : "")
    : `전체 ${total}명 가운데 ${count}명이 활동을 쓰는 중 · 오늘 출석 기록 없음`;
  return { count, present: known ? present.length : null, total, label, title };
}
