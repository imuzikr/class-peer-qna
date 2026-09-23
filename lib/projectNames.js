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
  addStudyTemplate,
  updateStudyTemplate,
  updateStudyBoard,
  toDate,
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

// =============================================================
// 옛 프로젝트를 원본으로 묶기 — 한 번만 하는 정리
// -------------------------------------------------------------
// 원본(studyTemplates)이 생기기 전에 만든 프로젝트는 반마다 따로 선 문서라,
// 같은 '파이썬 기초'를 세 반에서 쓰면 서로 모르는 문서가 셋입니다. 그래서
// 프로젝트 탭에 안 나오고, 활동을 고쳐도 원본에 안 적히고, 가져오면 통째로
// 복제됩니다. 여기서 **이름이 같은 것끼리 묶어 원본 하나에 잇습니다.**
//
// · 지우거나 옮기는 것은 없습니다. 각 반의 프로젝트에 `templateId` 한 칸만
//   적습니다 — 학생 카드·활동 목록·잠금은 그대로입니다.
// · 원본의 활동은 **활동이 가장 많은 사본**의 것(같으면 최근 것)입니다.
//   가져오기 목록이 같은 이름을 한 줄로 접을 때 고르는 기준과 같습니다.
// · 같은 이름의 원본이 **이미 있으면** 새로 만들지 않고 그것에 잇습니다 —
//   프로젝트 이름은 서로 달라야 합니다.
// · 이름만 같고 내용이 다른 프로젝트가 있을 수 있어, 화면이 묶음마다
//   체크를 두고 미리 보여 준 뒤 고른 것만 묶습니다.
// · **보관된 반은 뺍니다** — 규칙(ownsClassEditable)이 그 반 프로젝트에
//   쓰기를 막습니다.
// =============================================================
function actsOf(b) {
  return (b.activities ?? []).map((a) => String(a).trim()).filter(Boolean);
}

// 묶음 목록. classes는 **내가 쓸 수 있는 반**(보관 안 된 내 반)만 넘깁니다.
// 돌려주는 값: [{ key, title, boards, best, existing, diverge }] — 이름순
export function groupLegacyProjects({ boards = [], templates = [], classes = [] }) {
  const classIds = new Set(classes.map((c) => c.id));
  const live = new Set(templates.map((t) => t.id));
  const byKey = new Map();
  for (const b of boards) {
    if (!classIds.has(b.classId) || !isLiveProject(b)) continue;
    if (b.templateId && live.has(b.templateId)) continue; // 이미 원본에 이어짐
    const key = projectNameKey(b.title);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(b);
  }
  const stamp = (b) => (b.createdAt ? toDate(b.createdAt).getTime() : 0);
  const groups = [];
  for (const [key, list] of byKey) {
    let best = list[0];
    for (const b of list) {
      const n = actsOf(b).length;
      const bn = actsOf(best).length;
      if (n > bn || (n === bn && stamp(b) > stamp(best))) best = b;
    }
    const sig = (b) => actsOf(b).join("\u0001");
    groups.push({
      key,
      title: key,
      boards: list,
      best,
      existing: templates.find((t) => projectNameKey(t.title) === key) ?? null,
      // 반마다 활동 목록이 다르면 화면이 알립니다(이름만 같은 다른
      // 프로젝트일 수 있으니, 선생님이 묶을지 보고 고르게)
      diverge: new Set(list.map(sig)).size > 1,
    });
  }
  return groups.sort((a, b) => a.title.localeCompare(b.title, "ko", { numeric: true }));
}

// 한 묶음을 원본에 잇습니다. 돌려주는 값: 원본 id
export async function migrateLegacyGroup(group, user) {
  const best = group.best;
  const acts = actsOf(best);
  let templateId = group.existing?.id ?? null;
  if (templateId) {
    // 이미 있는 원본이 비어 있으면(수업 중에 이름만으로 만든 것) 채웁니다.
    if ((group.existing.activities?.length ?? 0) === 0 && acts.length > 0) {
      await updateStudyTemplate(templateId, { activities: acts });
    }
  } else {
    templateId = await addStudyTemplate(user, {
      title: projectNameKey(best.title),
      description: best.description ?? "",
      keywords: best.keywords ?? [],
      activityType: best.activityType ?? "individual",
      activities: acts,
    });
  }
  // 반마다 한 건씩 차례로 — 몇 건 안 되고, 중간에 멈춰도 앞의 것은 이어진
  // 채로 남아 다시 누르면 나머지만 묶입니다(이어진 것은 목록에서 빠지므로).
  for (const b of group.boards) {
    await updateStudyBoard(b.id, { templateId });
  }
  return templateId;
}
