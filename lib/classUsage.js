// =============================================================
// 반별 현황 — 수업 관리 창의 오른쪽 열
// -------------------------------------------------------------
// 수업 자료와 프로젝트 원본은 반이 아니라 선생님에게 붙은 설계도라, 목록만
// 봐서는 '어느 반에서 쓰는 중인가'가 안 보입니다. 이미 구독해 둔 자료
// (수업 자료 · 반의 프로젝트)를 반마다 다시 묶기만 합니다 — 읽는 문서가
// 하나도 안 늡니다.
//
// 반은 **이름순**입니다(수업 메모의 반 버튼 줄과 같은 기준 — 'A · B · J',
// '1반 · 2반 · 10반'). 지금 보는 반을 맨 앞으로 올리지 않습니다: 반을 옮길
// 때마다 열이 통째로 다시 짜이면 어제 보던 반이 매번 다른 자리에 있습니다.
// =============================================================
import { isActivityLocked } from "@/lib/activities";
import { toDate } from "@/lib/dates";

export function byClassName(a, b) {
  return (a.name ?? "").localeCompare(b.name ?? "", "ko", { numeric: true });
}

// 이 반에 연결된 프로젝트 id — LessonMode의 boardId 판정과 같습니다
// (이 반 키가 있으면 그 값, 없으면 옛 boardId가 이 반 프로젝트일 때만).
function linkedBoardId(lesson, classId, boardsHere) {
  const map = lesson.boardIds ?? null;
  if (map && Object.prototype.hasOwnProperty.call(map, classId)) return map[classId] ?? null;
  return boardsHere.has(lesson.boardId) ? lesson.boardId : null;
}

// 수업 탭 — 반마다 '이 반에서 한 수업'.
//  · 한 줄 = 수업 자료 하나. `days`는 그 반에서 수업한 날(중복 없음, 오름차순).
//  · 수업한 날이 없어도 이 반에 프로젝트를 연결해 둔 자료는 '준비됨'으로
//    함께 섭니다 — 기록(taughtDays)이 생기기 전에 쓴 자료가 여기로 옵니다.
//  · 차례는 최근에 한 것부터, 준비만 한 것은 그 뒤(만든 차례).
export function lessonUsageByClass(classes = [], lessons = [], boards = []) {
  return [...classes].sort(byClassName).map((c) => {
    const here = new Map(
      boards.filter((b) => b.classId === c.id).map((b) => [b.id, b])
    );
    const rows = [];
    for (const l of lessons) {
      const days = [...new Set(l.taughtDays?.[c.id] ?? [])].sort();
      const boardId = linkedBoardId(l, c.id, here);
      const board = boardId ? here.get(boardId) ?? null : null;
      if (days.length === 0 && !board) continue;
      rows.push({
        lessonId: l.id,
        title: l.title || "제목 없는 수업",
        days,
        lastDay: days[days.length - 1] ?? null,
        boardTitle: board?.title ?? null,
        createdAt: toDate(l.createdAt).getTime(),
      });
    }
    rows.sort((a, b) => {
      if (a.lastDay && b.lastDay) return a.lastDay < b.lastDay ? 1 : a.lastDay > b.lastDay ? -1 : 0;
      if (a.lastDay) return -1;
      if (b.lastDay) return 1;
      return a.createdAt - b.createdAt;
    });
    return { classId: c.id, name: c.name ?? "", rows };
  });
}

// 프로젝트 탭 — 반마다 '이 반에 열어 둔 프로젝트'.
//  · 수업 자료(type 'notice')와 휴지통에 든 것은 뺍니다.
//  · 활동은 '열린 수 / 전체'(activityLocks), 프로젝트 통째 잠금은 `locked`.
//  · `fromTemplate` — 내 원본에서 가져온 복사본인가(원본을 지웠거나 원본이
//    생기기 전에 만든 옛 프로젝트는 false).
//  · 차례는 만든 차례(오래된 것이 앞) — 원본 목록과 같습니다.
export function projectUsageByClass(classes = [], boards = [], templates = []) {
  const tplIds = new Set(templates.map((t) => t.id));
  return [...classes].sort(byClassName).map((c) => {
    const rows = boards
      .filter((b) => b.classId === c.id && b.type !== "notice" && b.deleted !== true)
      .map((b) => {
        const total = b.activities?.length ?? 0;
        let open = 0;
        for (let i = 0; i < total; i++) if (!isActivityLocked(b, i)) open++;
        return {
          boardId: b.id,
          title: b.title || "제목 없는 프로젝트",
          locked: b.editMode === "locked",
          openActs: open,
          totalActs: total,
          fromTemplate: !!b.templateId && tplIds.has(b.templateId),
          createdAt: toDate(b.createdAt).getTime(),
        };
      })
      .sort((a, b) => a.createdAt - b.createdAt);
    return { classId: c.id, name: c.name ?? "", rows };
  });
}
