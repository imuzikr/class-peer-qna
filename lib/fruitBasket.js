// =============================================================
// 과일 바구니 — 반이 함께 모으는 과일 (순수 셈)
// -------------------------------------------------------------
// 학생은 −/＋로 **이번에 담을 개수**를 정하고 **응모하기**를 누르면 그만큼 제
// 과일이 반의 바구니(classes/{cId}/fruitBasket/{uid}.donated)로 들어가고 칸은
// 0으로 돌아갑니다. 응모한 뒤에도 같은 길로 더 담습니다. **응모하지
// 않기**를 고르면 담아 둔 과일을 모두 돌려받습니다 — '내놓기 · 거두기' 단추는
// 따로 없습니다(선생님 요청: 개수는 −/＋가, 담고 돌려받는 것은 두 선택이 함).
// 반 바구니가 FRUIT_GOAL(100)에 닿았는지와 응모는 별개입니다. 담은 과일을
// 줄이는 길은 따로 없고(응모하지 않기로 모두 돌려받은 뒤 다시), 선생님이
// **이벤트 접수**를 하면 그 학생의 선택과 담은 과일이 최종 제출되어 더는
// 바뀌지 않습니다.
//
// 저장과 규칙은 lib/data/rewards.js · firestore.rules의 fruitBasket 절.
// 여기에는 화면이 함께 쓰는 셈만 둡니다(시험 tests/unit/fruitBasket.test.mjs).
// =============================================================

export const FRUIT_GOAL = 100;

// −/＋ 칸의 글자 → **이번에 더 담을 개수**. 못 담으면 0.
//   have  지금 가진 과일(rewards.count)
// 칸은 '바구니에 담긴 총수'가 아니라 '이번에 담을 수'입니다(선생님 요청) —
// 응모하기를 누를 때마다 그만큼 담고 칸은 0으로 돌아갑니다. 그래서 응모한 뒤
// 더 담기도 같은 단추 하나로 되고, 줄이는 길은 따로 없습니다(응모하지 않기로
// 모두 돌려받기 — 규칙도 응모한 동안 바구니가 주는 쓰기를 막습니다).
export function entryAmount(raw, have) {
  const n = Math.floor(Number(String(raw ?? "").trim()));
  if (!Number.isFinite(n) || n < 1) return 0;
  if (n > Math.max(0, have | 0)) return 0;
  return n;
}

// −/＋ 칸의 천장 — 가진 과일까지.
export function entryMax(have) {
  return Math.max(0, have | 0);
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

// 응모하기를 누를 수 있나 — 이번에 담을 과일을 1개 이상 정했고(entryAmount),
// 선생님이 아직 접수하지 않았을 때. 응모했든 안 했든 같습니다 — 응모한 뒤에
// 누르면 그만큼 **더 담습니다**(선생님 요청).
//  · 담을 수를 0으로 두어도 되는 때가 하나 있습니다 — 아직 응모하지 않았는데
//    바구니에 이미 과일이 든 학생(옛 화면에서 내놓기만 해 둔 경우). 그 과일
//    그대로 응모합니다.
// **반 바구니가 100개에 닿았는지는 보지 않습니다**(선생님 요청 — 규칙도
// '1개 이상'만 봅니다. 여러 문서의 합이라 셀 수 없음).
export function canEnterEvent(mine, add) {
  if (mine?.received) return false;
  if ((add | 0) >= 1) return true;
  return mine?.choice !== "entered" && Math.max(0, mine?.donated | 0) >= 1;
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
