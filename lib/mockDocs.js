// =============================================================
// 데모 모드(mock) 문서 고치기 — 제자리에서 고치지 않고 갈아 끼웁니다.
// -------------------------------------------------------------
// Firestore는 스냅샷마다 새 객체를 줍니다. mock이 `Object.assign(doc, patch)`
// 처럼 같은 객체를 그 자리에서 고치면, 그 문서를 들고 있는 쪽(구독 콜백 ·
// React state)은 늘 **같은 참조**를 받아 바뀐 줄 모르고 다시 그리지 않습니다.
// 데모 모드에서만 '교사 화면은 바뀌는데 학생 화면은 그대로'가 나는 까닭이
// 이것이었고, 반 문서 · 독서 활동 · 수업 노트 · 답변에서 따로따로 네 번
// 겪었습니다(CLAUDE.md에 '갈아 끼웁니다'가 네 군데 적혀 있습니다).
//
// 그래서 mock의 쓰기는 전부 이 함수를 거칩니다. 받는 인자가 Object.assign과
// 같아(`replaceDoc(목록, 문서, 고칠 값…)`), 앞에 목록 하나만 붙이면 됩니다.
// **mock 쓰기를 새로 짤 때 Object.assign이나 `doc.필드 = 값`을 쓰지 마세요.**
//
// 새 객체는 **목록의 같은 자리**에 들어갑니다 — 순서가 곧 화면 차례인
// 목록이 있어서, 빼고 뒤에 다시 넣으면 안 됩니다.
// =============================================================

// list 안의 doc을 { ...doc, ...patches }로 갈아 끼우고 새 객체를 돌려줍니다.
// patch 자리에 함수를 주면 지금 문서를 받아 고칠 값을 돌려줍니다.
// doc이 목록에 없으면(이미 빠진 문서) 예전처럼 그 객체를 고치고 돌려줍니다 —
// 고친 내용을 조용히 잃는 것보다 낫습니다.
export function replaceDoc(list, doc, ...patches) {
  if (!doc) return doc ?? null;
  const merged = {};
  for (const p of patches) Object.assign(merged, typeof p === "function" ? p(doc) : p);
  const i = Array.isArray(list) ? list.indexOf(doc) : -1;
  if (i < 0) return Object.assign(doc, merged);
  const next = { ...doc, ...merged };
  list[i] = next;
  return next;
}
