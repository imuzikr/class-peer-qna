// =============================================================
// 수업 중에 학생 서랍으로 **보낼 수 있는 독서 활동의 칸**
// -------------------------------------------------------------
// 교사 화면(수업 모드의 고르개)과 학생 화면(서랍의 '오늘의 활동')이 **같은
// 목록**을 봐야 합니다 — 교사가 보낼 수 있는데 서랍이 못 그리는 칸이 하나라도
// 있으면, 학생 화면이 빈 채로 뜨고 까닭도 안 적힙니다. 그래서 '무엇을 보낼 수
// 있나'를 여기 한 곳에 둡니다.
//
// 닿소리 채우기는 없습니다. 판이 열네 칸 격자라 서랍 폭(380px)에 안 들어가고,
// 빠른 입력 칸만 떼어 오면 모둠 판이 채워지는 모습을 학생이 못 봅니다 — 그게
// 그 활동의 절반입니다.
// =============================================================
import { PARATEXT_SECTIONS } from "./paratext";
import { RAFT_COLUMNS, RAFT_WRITING } from "./raft";

// 서랍으로 보낼 수 있는 활동 종류
export const PUSHABLE_BOOK_TYPES = ["paratext", "raft"];

export function isPushableBookActivity(activity) {
  return (
    !!activity &&
    PUSHABLE_BOOK_TYPES.includes(activity.type) &&
    !activity.deleted &&
    activity.locked !== true // 활동 전체 잠금은 '수업 끝' — 규칙이 저장을 막습니다
  );
}

// 고르개에 적는 짧은 종류 이름 — 한 묶음에 두 종류가 섞여 서므로,
// 활동 이름만으로는 곁텍스트인지 RAFT인지 알 수 없습니다.
export function bookKindLabel(activity) {
  if (activity?.type === "paratext") return "곁텍스트";
  if (activity?.type === "raft") return "RAFT";
  return "";
}

// 그 활동에서 보낼 수 있는 칸들 — [{ key, ko }]
// 곁텍스트는 여덟 단계, RAFT는 네 요소 + 글쓰기입니다.
export function bookPushSteps(activity) {
  if (!activity) return [];
  if (activity.type === "paratext") {
    return PARATEXT_SECTIONS.map((s) => ({ key: s.key, ko: s.ko }));
  }
  if (activity.type === "raft") {
    return [
      ...RAFT_COLUMNS.map((c) => ({ key: c.key, ko: c.ko })),
      { key: RAFT_WRITING.key, ko: RAFT_WRITING.ko },
    ];
  }
  return [];
}
