import { toDate } from "./store";

export function getMeTooCount(question) {
  return question.meTooIds?.length ?? 0;
}

// 상단 고정 — 교사가 수동으로 고정한 글만(question.pinned). 예전에는
// '나도 궁금해요' 개수가 기준을 넘으면 자동으로 고정됐지만, 인기와
// 무관하게 교사가 짚어 주고 싶은 질문을 고를 수 있도록 바꿨습니다.
export function isPinnedQuestion(question) {
  return question.pinned === true;
}

function newestFirst(a, b) {
  return toDate(b.createdAt) - toDate(a.createdAt);
}

export function sortPinnedQuestions(list) {
  const pinned = [];
  const regular = [];

  list.forEach((question) => {
    if (isPinnedQuestion(question)) {
      pinned.push(question);
    } else {
      regular.push(question);
    }
  });

  // 최근에 고정한 글이 위로 — pinnedAt이 없는 옛 고정 글은 작성일로 대체.
  pinned.sort((a, b) => {
    const at = toDate(a.pinnedAt ?? a.createdAt);
    const bt = toDate(b.pinnedAt ?? b.createdAt);
    return bt - at;
  });

  return [...pinned, ...regular];
}
