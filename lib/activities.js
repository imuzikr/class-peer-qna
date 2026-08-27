// =============================================================
// 수업 보드의 '활동' 공용 헬퍼
// -------------------------------------------------------------
// 보드(studyBoards) 문서는 활동을 두 개의 나란한 배열로 들고 있습니다.
//   activities    : string[]   활동 이름
//   activityLocks : boolean[]  같은 자리의 활동이 잠겨 있는지
//
// [왜 배열 두 개인가]
// activities를 객체 배열({name, locked})로 바꾸면 이미 저장된 보드·카드를
// 전부 옮겨야 합니다. 나란한 배열이면 예전 보드(activityLocks 없음)도
// 그대로 읽히고, 없는 값은 '잠기지 않음'으로 봅니다 — 이 기능이 생기기
// 전에 만든 활동이 어느 날 갑자기 잠겨 버리는 일이 없게.
//
// [잠금의 성격]
// 잠금은 '화면에서 입력을 막는' 수업 진행 도구입니다. 카드 내용은 활동
// 여러 개가 한 덩어리 HTML로 저장되므로, 보안 규칙이 "몇 번째 활동이
// 바뀌었는지"를 판별할 수 없습니다(규칙은 HTML을 해석하지 못함).
// 보드 전체 잠금(editMode: 'locked')은 규칙으로도 막히지만, 활동별
// 잠금은 서버에서 강제되지 않습니다.
// =============================================================

import { stripHtml } from "@/lib/html";

// 교사가 올린 예시·자료 카드인지 (데모는 "teacher_" 접두, 실서비스는 작성자명)
export function isTeacherAuthoredCard(card) {
  return card?.authorId?.startsWith?.("teacher_") || card?.authorName === "선생님";
}

// '썼다'(제출)로 볼 최소 글자 수 — 공백·문장부호를 포함합니다.
// 한두 글자만 눌러 둔 것을 완료로 세지 않기 위한 기준이며, 공부중 전광판의
// 판정과 학생 카드 상단 안내가 같은 값을 쓰도록 여기에 둡니다.
export const DONE_MIN_CHARS = 10;

// 활동 목록 → 학생 카드의 작성 틀(제목 + 빈 줄)
export function buildActivityTemplate(activities) {
  if (!activities?.length) return "";
  return activities
    .map(
      (act) =>
        `<div class="activity-section"><h4 class="activity-title">${act}</h4><p><br></p></div>`
    )
    .join("");
}

// 카드 HTML → [{ title, content }] — buildActivityTemplate이 만든 구조를
// 되읽습니다. 구조가 아니면(옛 자유형 카드) 빈 배열을 돌려주므로, 호출부는
// 그걸 보고 예전 단일 편집기로 물러설 수 있습니다.
export function parseActivitySections(html) {
  if (!html || typeof DOMParser === "undefined") return [];
  try {
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    return Array.from(doc.querySelectorAll(".activity-section")).map((sec) => {
      const h = sec.querySelector(".activity-title");
      const title = h ? h.textContent.trim() : "";
      // 제목을 뺀 나머지가 학생이 쓴 내용
      const rest = Array.from(sec.childNodes)
        .filter((n) => n !== h)
        .map((n) => (n.nodeType === 1 ? n.outerHTML : n.textContent))
        .join("");
      return { title, content: rest };
    });
  } catch {
    return [];
  }
}

// 카드 HTML의 섹션들을 지금의 활동 목록에 짝짓습니다 — [활동 i] → 그 섹션(또는 null).
// -------------------------------------------------------------
// 활동은 교사가 수업 준비에서 언제든 이름을 바꾸거나 추가·삭제할 수 있는데,
// 학생 카드에는 '작성 당시의 활동 이름'이 섹션 제목으로 박혀 저장됩니다.
// 그래서 수업 도중 교사가 활동 제목을 고치면, 이미 낸 답의 섹션 제목이
// 현재 활동 이름과 달라집니다. 이때
//   · 제목으로만 찾으면  → 짝을 못 찾아 '작성 전'으로 보이고
//   · 위치로만 대조하면  → 활동 수가 줄어든 경우 엉뚱한(빈) 섹션을 집어
//                          역시 '작성 전'으로 보입니다
// 실제로 이 두 경우 모두 "학생은 분명히 냈는데 미제출로 표시"되는 신고로
// 이어졌습니다. 그래서 제목이 같은 것을 먼저 확정해 두고(1단계), 남은
// 활동에는 아직 짝이 없으면서 '내용이 있는' 섹션을 순서대로 이어 붙입니다
// (2단계). 이름이 바뀌었어도 학생이 쓴 내용은 그대로 살아남습니다.
export function matchActivitySections(card, activities) {
  let secs = card ? parseActivitySections(card.content) : [];
  // 활동 틀이 아예 없는 카드(활동이 생기기 전에 쓴 자유형 카드 등)는
  // 본문 전체를 섹션 하나로 봅니다 — 그래야 아래 2단계에서 첫 활동에
  // 이어 붙어 '작성함'으로 잡힙니다.
  if (secs.length === 0 && card) {
    secs = [{ title: "", content: card.content ?? "" }];
  }

  const paired = new Array(activities.length).fill(null);
  const used = new Set();

  // 1단계 — 제목이 정확히 같은 섹션을 먼저 확정 (가장 믿을 수 있는 근거)
  activities.forEach((name, i) => {
    const at = secs.findIndex(
      (s, j) => !used.has(j) && s.title && s.title === name
    );
    if (at >= 0) {
      used.add(at);
      paired[i] = secs[at];
    }
  });

  // 2단계 — 남은 활동에 '내용이 있는' 미사용 섹션을 순서대로 배정.
  // (빈 섹션은 건너뜁니다. 활동 수가 줄어든 카드에서 앞쪽 빈 섹션이
  //  실제 답이 든 뒤쪽 섹션을 가리는 일을 막기 위함)
  const leftovers = secs
    .map((s, j) => ({ s, j }))
    .filter(({ s, j }) => !used.has(j) && stripHtml(s.content ?? "").length > 0);
  let k = 0;
  for (let i = 0; i < activities.length && k < leftovers.length; i++) {
    if (paired[i]) continue;
    used.add(leftovers[k].j);
    paired[i] = leftovers[k].s;
    k += 1;
  }

  return paired;
}

// 카드 한 장 → 활동 칸이 몇 개 '제출 인정'됐는지 + 전체 글자 수.
// 학생 카드(보드 목록)에 진행 상태를 작게 미리 보여 줄 때 씁니다.
// '채워짐'은 공부중 전광판과 같은 기준(DONE_MIN_CHARS)입니다 — 한두 글자만
// 쓴 칸을 초록으로 보여주면 교사가 실제로는 미제출인 카드를 제출로 오인하니,
// 여기서도 "충분히 썼는가"를 기준으로 삼습니다.
export function cardActivitySummary(card, activities) {
  const paired = matchActivitySections(card, activities);
  const lengths = paired.map((sec) => stripHtml(sec?.content ?? "").length);
  return {
    total: activities.length,
    filled: lengths.filter((n) => n >= DONE_MIN_CHARS).length,
    chars: lengths.reduce((sum, n) => sum + n, 0),
    // 활동 순서대로 "제출 인정됐는가" — 카드 미리보기의 칸 색을 정확한
    // 자리에 칠하려면 개수만으론 부족해 순서 정보가 필요합니다.
    segments: lengths.map((n) => n >= DONE_MIN_CHARS),
    // 활동별 글자 수 — 카드 미리보기에서 칸마다 따로 보여 줄 때 씁니다
    // (칸 색이 이미 "썼는지"를 보여주므로, 합산 글자 수 대신 이쪽을 씁니다).
    lengths,
  };
}

// i번째 활동이 잠겨 있는가 (예전 보드엔 activityLocks가 없음 → 잠기지 않음)
export function isActivityLocked(board, i) {
  return board?.activityLocks?.[i] === true;
}

// 활동 목록을 바꿀 때 새 잠금 배열을 만듭니다.
//  · 이름이 그대로 남아 있는 활동은 잠금 상태를 그대로 이어받고
//  · 새로 추가된 활동은 잠긴 채로 시작합니다(교사가 풀어 줘야 학생이 입력)
export function nextActivityLocks(prevActivities, prevLocks, nextActivities) {
  const prev = prevActivities ?? [];
  return (nextActivities ?? []).map((name) => {
    const at = prev.indexOf(name);
    return at >= 0 ? prevLocks?.[at] === true : true;
  });
}
