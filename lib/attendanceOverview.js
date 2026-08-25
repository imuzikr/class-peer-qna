// =============================================================
// 출석 관리 '캘린더형'의 반별 목록 계산 — 순수 함수만 모아 둡니다
// -------------------------------------------------------------
// StudyAttendanceModal은 지금 보는 반 하나가 아니라 교사가 가진 반 전체를
// 반별 출석/결석으로 먼저 보여주고, 고른 반의 학생별 상세를 그 아래에
// 그립니다. 이 계산 자체엔 Firestore가 필요 없어(구독 결과를 인자로 받을
// 뿐) 컴포넌트 밖으로 뽑아 두면 테스트하기 쉽습니다.
// =============================================================

// 반 목록 + { [classId]: uid[] } + { [classId]: 출석기록[] } + 날짜
// → [{ id, name, total, present, absent }]
export function summarizeClassAttendance(classes, membersByClass, attendanceByClass, date) {
  if (!date) return [];
  return (classes ?? []).map((c) => {
    const uids = membersByClass?.[c.id] ?? [];
    const present = new Set(
      (attendanceByClass?.[c.id] ?? [])
        .filter((r) => r.date === date)
        .map((r) => r.uid)
    ).size;
    return { id: c.id, name: c.name, total: uids.length, present, absent: uids.length - present };
  });
}

// 한 반의 uid 목록 + 사용자 디렉터리 + 그 반의 출석기록 + 날짜
// → [{ uid, name, studentId, emoji, record }] (학번/이름순 정렬)
export function buildAttendanceDetailRows(uids, directory, records, date) {
  const dirMap = new Map((directory ?? []).map((d) => [d.uid, d]));
  const byUid = new Map(
    (records ?? []).filter((r) => r.date === date).map((r) => [r.uid, r])
  );
  return (uids ?? [])
    .map((uid) => {
      const d = dirMap.get(uid) ?? {};
      return {
        uid,
        name: d.realName || d.studentId || "이름 미설정",
        studentId: d.studentId || null,
        emoji: d.emoji || "🙂",
        record: byUid.get(uid) ?? null,
      };
    })
    .sort((a, b) => (a.studentId || a.name).localeCompare(b.studentId || b.name, "ko"));
}
