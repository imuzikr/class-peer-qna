// =============================================================
// 프로젝트 이름은 서로 달라야 합니다 — 같은 이름 찾기 · 그것 불러오기
// -------------------------------------------------------------
// 새 프로젝트는 어디서 만들든 원본이 됩니다(lib/store.js의 studyTemplates
// 절). 같은 이름의 원본이 둘이면 가져오기 목록·프로젝트 탭에서 무엇이 무엇인지
// 알 수 없어, 만드는 세 자리(공부방 '＋ 프로젝트 만들기' · 수업 편집의
// '+ 새 프로젝트' · 파이썬 실행기의 '＋ 새 프로젝트')가 모두 **만들기 전에**
// 이 함수로 같은 이름을 찾고, 있으면 만들지 않고 '이전 프로젝트 불러오기'를
// 권합니다(ProjectNameDupModal). 한때 '그래도 만들기'가 있었는데 걷었습니다.
//
// 세 자리가 **같은 판정**을 써야 합니다 — 한 자리에서만 막으면 다른 자리로
// 같은 이름이 새어 들어옵니다.
// =============================================================
import {
  startStudyTemplateInClass,
  duplicateStudyBoard,
} from "./store";

// 앞뒤 공백을 걷고 안쪽 공백을 하나로 — '반복문  연습'과 '반복문 연습'은 같은
// 이름으로 봅니다(눈으로는 구분이 안 됩니다).
export function projectNameKey(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

function isLiveProject(b) {
  return b && b.type !== "notice" && b.deleted !== true;
}

// 같은 이름의 프로젝트를 찾습니다. 찾는 차례:
//   1. 이 반의 프로젝트 — 이미 여기 있으니 연결만 하면 됩니다.
//   2. 내 원본 — 이 반에 불러옵니다(복사본이 이미 있으면 그것).
//   3. 다른 반의 원본 없는 옛 프로젝트 — 이 반에 통째로 복제합니다.
//      (원본이 살아 있는 복사본은 2가 대신하므로 뺍니다. 같은 이름이 여럿이면
//       활동이 가장 많은 것 — 가져오기 목록과 같은 고르기입니다.)
// 돌려주는 값: { kind: 'board'|'template'|'old', item, acts } 또는 null
export function findSameNameProject(name, { classId, boards = [], templates = [] }) {
  const key = projectNameKey(name);
  if (!key) return null;
  const same = (t) => projectNameKey(t) === key;

  const here = boards.find(
    (b) => b.classId === classId && isLiveProject(b) && same(b.title)
  );
  if (here) return { kind: "board", item: here, acts: here.activities?.length ?? 0 };

  const tpl = templates.find((t) => same(t.title));
  if (tpl) return { kind: "template", item: tpl, acts: tpl.activities?.length ?? 0 };

  const live = new Set(templates.map((t) => t.id));
  let old = null;
  for (const b of boards) {
    if (b.classId === classId || !isLiveProject(b) || !same(b.title)) continue;
    if (b.templateId && live.has(b.templateId)) continue;
    if (!old || (b.activities?.length ?? 0) > (old.activities?.length ?? 0)) old = b;
  }
  if (old) return { kind: "old", item: old, acts: old.activities?.length ?? 0 };
  return null;
}

// 찾은 것을 이 반에 불러오고, 이 반의 프로젝트 id를 돌려줍니다.
export async function loadSameNameProject(hit, { classId, boards = [], user }) {
  if (!hit || !classId) return null;
  if (hit.kind === "board") return hit.item.id;
  if (hit.kind === "template") {
    // 이 반에 이미 열어 둔 복사본이 있으면 그것 — 한 반에 같은 원본을 두 번
    // 열지 않습니다(이름을 고친 복사본이라 1에서 안 걸린 경우).
    const inst = boards.find(
      (b) => b.classId === classId && isLiveProject(b) && b.templateId === hit.item.id
    );
    if (inst) return inst.id;
    return startStudyTemplateInClass(hit.item, classId, user);
  }
  return duplicateStudyBoard(hit.item, classId, user);
}
