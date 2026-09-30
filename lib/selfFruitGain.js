// =============================================================
// 내가 스스로 되찾은 과일 — 축포에서 빼 둘 몫
// -------------------------------------------------------------
// 학생 화면의 축포(lib/useRewardCelebration.js)는 제 과일 수가 **늘어난
// 순간**을 잡아 터집니다. 교사가 준 것을 알아채려고 만든 것인데, 과일 바구니
// 에서 학생이 제 과일을 **거두거나**('과일 거두기') '응모하지 않기'로 되돌려
// 받아도 같은 값이 늘어, 선물을 받은 것처럼 축포가 터졌습니다.
//
// 그래서 되찾는 쪽(lib/data/rewards.js)이 쓰기 **전에** 몫을 적어 두고
// (`expectSelfGain`), 축포 쪽이 늘어난 만큼에서 그 몫을 먼저 덜어 냅니다
// (`takeSelfGain`). 같은 순간 교사가 1개를 주면 그 1개만 터집니다.
//  · 쓰기가 실패하면 몫을 거둡니다(`dropSelfGain`) — 남겨 두면 다음에 교사가
//    준 과일이 조용히 삼켜집니다.
//  · 30초가 지난 몫은 버립니다 — 구독 답이 끝내 안 온 몫도 같은 까닭으로.
//  · 같은 브라우저 안에서만 통합니다(다른 기기에서 되찾으면 그 기기가 아닌
//    곳의 축포는 터질 수 있습니다 — 드문 일이라 문서 칸을 늘리지 않았습니다).
// =============================================================

const TTL_MS = 30_000;
const pending = new Map(); // key → [{ n, at }]

const keyOf = (classId, uid) => `${classId}_${uid}`;

function live(key, now) {
  const list = (pending.get(key) ?? []).filter((x) => now - x.at < TTL_MS && x.n > 0);
  if (list.length) pending.set(key, list);
  else pending.delete(key);
  return list;
}

// 되찾기 전에 부릅니다 → 거둘 때 쓸 표(dropSelfGain에 넘김)
export function expectSelfGain(classId, uid, n, now = Date.now()) {
  const amount = Math.floor(Number(n));
  if (!classId || !uid || !(amount > 0)) return null;
  const key = keyOf(classId, uid);
  const item = { n: amount, at: now };
  pending.set(key, [...live(key, now), item]);
  return item;
}

// 쓰기가 실패했을 때 — 적어 둔 몫을 없앱니다.
export function dropSelfGain(classId, uid, item) {
  if (!item) return;
  const key = keyOf(classId, uid);
  const list = (pending.get(key) ?? []).filter((x) => x !== item);
  if (list.length) pending.set(key, list);
  else pending.delete(key);
}

// 늘어난 만큼(gain)에서 적어 둔 몫을 덜고, 축하할 나머지를 돌려줍니다.
export function takeSelfGain(classId, uid, gain, now = Date.now()) {
  let rest = Math.max(0, Math.floor(Number(gain)) || 0);
  if (!rest || !classId || !uid) return rest;
  const key = keyOf(classId, uid);
  for (const item of live(key, now)) {
    const used = Math.min(item.n, rest);
    item.n -= used;
    rest -= used;
    if (!rest) break;
  }
  live(key, now);
  return rest;
}
