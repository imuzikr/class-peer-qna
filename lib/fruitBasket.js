// =============================================================
// 과일 바구니 — 반이 함께 모으는 과일 (순수 셈)
// -------------------------------------------------------------
// 학생이 받은 과일(rewards.count)에서 몇 개를 **내놓으면**(기부) 그만큼
// 제 과일이 줄고, 반의 바구니(classes/{cId}/fruitBasket/{uid}.donated)가
// 늡니다. **응모하기 전까지는 내놓은 것을 되돌려 받을 수 있습니다**(기부
// 취소) — 바구니가 줄고 그만큼 제 과일이 돌아옵니다. 바구니가
// FRUIT_GOAL(100)에 닿으면 학생마다 '이벤트 응모'를 누를 수 있고, 반 학생이
// 모두 누르면 교사 화면이 그 사실을 알립니다. 응모한 뒤로는 취소가 없습니다.
//
// 저장과 규칙은 lib/data/rewards.js · firestore.rules의 fruitBasket 절.
// 여기에는 화면이 함께 쓰는 셈만 둡니다(시험 tests/unit/fruitBasket.test.mjs).
// =============================================================

export const FRUIT_GOAL = 100;
// 한 번에 내놓을 수 있는 천장 — 과일 누적 천장(REWARD_MAX)과 같은 값입니다.
export const DONATE_MAX = 100;

// 입력칸의 글자 → 내놓을 개수. 가진 것보다 많거나 0 이하면 0(=못 냄).
export function donationAmount(raw, have) {
  const n = Math.floor(Number(String(raw ?? "").trim()));
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > Math.max(0, have | 0) || n > DONATE_MAX) return 0;
  return n;
}

// 입력칸의 글자 → 되돌려 받을 개수(기부 취소). 0이면 못 받음.
//   donated  지금까지 내놓은 것 — 그보다 많이는 못 받습니다.
//   have     지금 가진 과일 — 돌려받아 과일 천장(DONATE_MAX = REWARD_MAX)을
//            넘으면 규칙이 거부하므로 여기서 미리 막습니다.
//   entered  응모했으면 취소가 없습니다.
export function withdrawAmount(raw, donated, have, entered = false) {
  if (entered) return 0;
  const n = Math.floor(Number(String(raw ?? "").trim()));
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > Math.max(0, donated | 0)) return 0;
  if ((have | 0) + n > DONATE_MAX) return 0;
  return n;
}

// 바구니 문서 목록 → 화면이 쓰는 요약
//   entries   [{ uid, donated, entered }]
//   memberUids 지금 반 명단(교사 화면의 '모두 응모' 판정용 — 없으면 빈 배열)
export function basketSummary(entries = [], memberUids = []) {
  const byUid = new Map();
  for (const e of entries ?? []) {
    if (e && e.uid) byUid.set(e.uid, e);
  }
  // 합계는 반에서 빠진 학생이 낸 것까지 셉니다 — 이미 바구니에 들어간
  // 과일이라, 명단이 바뀌었다고 바구니가 줄면 이상합니다.
  let total = 0;
  for (const e of byUid.values()) total += Math.max(0, e.donated | 0);
  const goalReached = total >= FRUIT_GOAL;
  // 응모는 **지금 명단에 있는 학생**만 셉니다 — 빠진 학생의 응모가 섞이면
  // 분자가 분모를 넘습니다(출석 n/N과 같은 기준).
  const members = [...new Set(memberUids ?? [])];
  const entered = members.filter((u) => byUid.get(u)?.entered === true);
  const waiting = members.filter((u) => byUid.get(u)?.entered !== true);
  return {
    total,
    goal: FRUIT_GOAL,
    goalReached,
    percent: Math.min(100, Math.round((total / FRUIT_GOAL) * 100)),
    enteredCount: entered.length,
    memberCount: members.length,
    waitingUids: waiting,
    allEntered: members.length > 0 && waiting.length === 0,
  };
}

// 한 학생의 바구니 기록(없으면 0 · 미응모)
export function myBasketEntry(entries = [], uid) {
  const e = (entries ?? []).find((x) => x && x.uid === uid);
  return { donated: Math.max(0, e?.donated | 0), entered: e?.entered === true };
}
