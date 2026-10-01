// =============================================================
// 과일 바구니 — 반이 함께 모으는 과일 (순수 셈)
// -------------------------------------------------------------
// 학생은 −/＋로 개수를 정하고 **응모하기**를 누르면 그만큼 제 과일이 반의
// 바구니(classes/{cId}/fruitBasket/{uid}.donated)로 들어갑니다. **응모하지
// 않기**를 고르면 담아 둔 과일을 모두 돌려받습니다 — '내놓기 · 거두기' 단추는
// 따로 없습니다(선생님 요청: 개수는 −/＋가, 담고 돌려받는 것은 두 선택이 함).
// 반 바구니가 FRUIT_GOAL(100)에 닿았는지와 응모는 별개입니다. 응모한 동안은
// 개수를 **늘리기만** 할 수 있어 응모하기를 다시 누르면 더 담고(줄이려면
// 응모하지 않기로 돌려받은 뒤 다시), 선생님이 **이벤트 접수**를 하면 그 학생의
// 선택과 담은 과일이 최종 제출되어 더는 바뀌지 않습니다.
//
// 저장과 규칙은 lib/data/rewards.js · firestore.rules의 fruitBasket 절.
// 여기에는 화면이 함께 쓰는 셈만 둡니다(시험 tests/unit/fruitBasket.test.mjs).
// =============================================================

export const FRUIT_GOAL = 100;
// 한 번에 내놓을 수 있는 천장 — 과일 누적 천장(REWARD_MAX)과 같은 값입니다.
export const DONATE_MAX = 100;

// −/＋ 칸의 글자 → 응모하며 바구니에 담을 개수. 못 담으면 0.
//   have  지금 가진 과일(rewards.count)
//   mine  myBasketEntry — 이미 담아 둔 것(donated)은 다시 쓸 수 있어, 담을 수
//         있는 천장은 '가진 것 + 담아 둔 것'입니다.
// 담아 둔 것보다 적게 고르면 남는 만큼을 먼저 돌려받는데, 돌려받아 과일 천장
// (DONATE_MAX = REWARD_MAX)을 넘으면 규칙이 거부하므로 여기서 미리 막습니다.
// 응모한 동안에는 담아 둔 것보다 적게 못 고릅니다 — 규칙이 응모한 동안 바구니를
// 줄이는 쓰기를 막습니다(더 담기만 됨).
export function entryAmount(raw, mine, have) {
  const n = Math.floor(Number(String(raw ?? "").trim()));
  if (!Number.isFinite(n) || n < 1) return 0;
  const donated = Math.max(0, mine?.donated | 0);
  const own = Math.max(0, have | 0);
  if (n > own + donated) return 0;
  if (mine?.choice === "entered" && n < donated) return 0;
  if (n < donated && own + (donated - n) > DONATE_MAX) return 0;
  return n;
}

// −/＋ 칸의 천장 — 가진 것 + 이미 담아 둔 것.
export function entryMax(mine, have) {
  return Math.max(0, have | 0) + Math.max(0, mine?.donated | 0);
}

// 한 학생의 이벤트 선택 — "entered"(응모) · "declined"(응모 안 함) · null(아직)
export function eventChoiceOf(e) {
  if (e?.entered === true) return "entered";
  if (e?.declined === true) return "declined";
  return null;
}

// 응모 여부를 골랐는데 선생님이 아직 접수하지 않았나 — 자리표의 초록 점.
// **응모하기 · 응모하지 않기 어느 쪽이든** 켜집니다. 점이 꺼져 있으면 '아직
// 아무것도 안 고름'이고, 선생님이 접수하면(과일이 최종 제출됨) 꺼집니다.
// 한때 응모에만 켰다가 되돌렸습니다(선생님 — 점의 뜻은 '골랐나'라서).
// 접수 시각이 서버 답 전이라 null이어도 '접수함'으로 봅니다(receivedBy로 가림).
export function isEventPending(e) {
  return eventChoiceOf(e) !== null && !e?.receivedBy;
}

// 응모하기를 누를 수 있나 — 담을 과일을 1개 이상 정했고(entryAmount), 선생님이
// 아직 접수하지 않았을 때. 이미 응모했으면 **담아 둔 것보다 많이** 정했을 때만
// 다시 눌러 나머지를 더 담습니다(같은 수면 할 일이 없음 — 선생님 요청).
// **반 바구니가 100개에 닿았는지는 보지 않습니다**(선생님 요청 — 규칙도
// '1개 이상'만 봅니다. 여러 문서의 합이라 셀 수 없음).
export function canEnterEvent(mine, amount) {
  const n = amount | 0;
  if (n < 1 || mine?.received) return false;
  if (mine?.choice === "entered") return n > Math.max(0, mine?.donated | 0);
  return true;
}

// 이미 응모한 학생이 더 담는 개수 — 아니면 0(처음 응모 · 그대로).
export function entryAddition(mine, amount) {
  if (mine?.choice !== "entered") return 0;
  return Math.max(0, (amount | 0) - Math.max(0, mine?.donated | 0));
}

// 바구니 문서 목록 → 화면이 쓰는 요약
//   entries   [{ uid, donated, entered, declined, receivedBy }]
//   memberUids 지금 반 명단(교사 화면의 응모 현황용 — 없으면 빈 배열)
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
  const choice = (u) => eventChoiceOf(byUid.get(u));
  const entered = members.filter((u) => choice(u) === "entered");
  const declined = members.filter((u) => choice(u) === "declined");
  const waiting = members.filter((u) => choice(u) === null);
  // 접수할 것 — 골랐는데 아직 접수 안 한 학생(초록 점). 명단 밖 학생도
  // 넣습니다: 접수는 문서마다 하는 일이라 빠뜨리면 그 점만 영영 남습니다.
  const pendingEntries = [...byUid.values()].filter(isEventPending);
  const pending = pendingEntries.map((e) => e.uid);
  // 접수하면 최종 제출될 과일 — 고른 학생들이 지금 내놓은 것의 합
  const pendingFruit = pendingEntries.reduce((n, e) => n + Math.max(0, e.donated | 0), 0);
  return {
    total,
    goal: FRUIT_GOAL,
    goalReached,
    percent: Math.min(100, Math.round((total / FRUIT_GOAL) * 100)),
    enteredCount: entered.length,
    declinedCount: declined.length,
    memberCount: members.length,
    waitingUids: waiting,
    pendingUids: pending,
    pendingFruit,
    allEntered: members.length > 0 && entered.length === members.length,
    allResponded: members.length > 0 && waiting.length === 0,
  };
}

// 한 학생의 바구니 기록(없으면 0 · 미선택)
export function myBasketEntry(entries = [], uid) {
  const e = (entries ?? []).find((x) => x && x.uid === uid);
  return {
    donated: Math.max(0, e?.donated | 0),
    entered: e?.entered === true,
    declined: e?.declined === true,
    choice: eventChoiceOf(e),
    received: !!e?.receivedBy,
  };
}
