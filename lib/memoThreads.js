// =============================================================
// 모둠 메모를 대화(스레드)로 묶기 — 순수 계산
// -------------------------------------------------------------
// 메모 문서에는 `replyToId` 하나뿐입니다(누구에게 답했는가). 스레드는
// 저장하지 않고 **화면에서 이어 붙입니다** — 문서에 threadId를 따로 두면
// 답장을 쓸 때마다 그 값을 옳게 넣어야 하고, 한 번 어긋나면 대화가 둘로
// 갈라진 채 되돌릴 길이 없습니다. 링크는 이미 있으니 그것만 따라갑니다.
//
// [뿌리 찾기] `replyToId`를 따라 위로 올라가다 없어지면 그것이 뿌리입니다.
// 답장의 답장도 같은 스레드로 모입니다. 중간 글을 보낸 사람이 '거두기'로
// 지우면 링크가 끊기는데(가리키는 문서가 없음), 그때는 **거기서 멈춰**
// 그 글이 새 뿌리가 됩니다 — 남은 대화가 통째로 사라지는 것보다 낫습니다.
// =============================================================

// Firestore Timestamp · Date · 문자열을 밀리초로. (lib/store.js의 toDate를
// 쓰지 않는 이유: 이 파일은 계산만 하는 곳이라 store를 끌어오지 않습니다)
//
// **값이 없으면 0이 아니라 '지금'입니다.** 방금 보낸 메모는 서버가 답하기
// 전까지 `createdAt`이 null로 옵니다(`serverTimestamp()`) — 0으로 치면 그
// 글이 **대화 맨 위로 튀었다가** 서버 시각이 도착하는 순간 맨 아래로
// 내려앉습니다. 실제로 보이던 증상입니다. 아직 안 정해진 시각은 늘
// '가장 최근'으로 봅니다(lib/store.js의 toDate도 없는 값을 지금으로 봅니다 —
// 두 곳이 같은 규칙이어야 목록과 대화가 따로 놀지 않습니다).
function ms(value) {
  if (!value) return Date.now();
  if (typeof value.toMillis === "function") return value.toMillis();
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? Date.now() : t;
}

export function memoTime(value) {
  return ms(value);
}

// memos: 내가 주고받은 메모 전부(순서 무관). myUid: 나.
// → 스레드 배열, **마지막 글이 최근인 순서**(내림차순).
//
// 목록을 '뿌리가 쓰인 때'가 아니라 '마지막 글'로 세우는 까닭: 어제 시작한
// 대화에 방금 답이 오면 그것이 지금 볼 것입니다. 뿌리 기준으로 세우면 새
// 답장이 목록 아래에 묻혀, 스레드로 묶은 뜻이 없어집니다.
export function buildMemoThreads(memos = [], myUid = null) {
  const byId = new Map(memos.map((m) => [m.id, m]));
  const rootCache = new Map();

  function rootIdOf(memo) {
    if (rootCache.has(memo.id)) return rootCache.get(memo.id);
    const path = [];
    let cur = memo;
    const seen = new Set();
    // seen은 고리(서로가 서로의 답장) 방어입니다 — 앱이 만들 수 없는
    // 모양이지만, 여기서 무한 반복이 나면 화면이 통째로 멈춥니다.
    while (cur.replyToId && byId.has(cur.replyToId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      path.push(cur.id);
      cur = byId.get(cur.replyToId);
    }
    path.forEach((id) => rootCache.set(id, cur.id));
    rootCache.set(cur.id, cur.id);
    return cur.id;
  }

  const groups = new Map();
  memos.forEach((m) => {
    const rid = rootIdOf(m);
    if (!groups.has(rid)) groups.set(rid, []);
    groups.get(rid).push(m);
  });

  return [...groups.entries()]
    .map(([rootId, list]) => {
      const items = [...list].sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
      const root = items.find((m) => m.id === rootId) ?? items[0];
      const last = items[items.length - 1];
      // 상대 — 이 대화에서 나 아닌 사람. 나만 보낸 대화(아직 답이 없음)면
      // 받는 사람이 상대입니다.
      const other =
        items.find((m) => m.fromUid !== myUid)?.fromUid ?? root.toUid ?? null;
      return {
        id: rootId,
        root,
        last,
        items,
        otherUid: other,
        lastAt: last.createdAt,
        unread: items.filter((m) => m.toUid === myUid && !m.read).length,
      };
    })
    .sort((a, b) => ms(b.lastAt) - ms(a.lastAt));
}
