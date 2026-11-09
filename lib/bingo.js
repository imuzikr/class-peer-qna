// =============================================================
// 낱말 빙고 — 셈 (독서 활동 '낱말 빙고', type: 'bingo')
// -------------------------------------------------------------
// 닿소리 채우기에 나온 낱말로 4×4 · 5×5 빙고를 합니다. 화면(BingoBoard · BingoStudent)과
// 데이터 함수(lib/data/books.js)는 여기 셈만 부릅니다 — JSX · Firebase를 안 가져와
// 단위 시험이 그대로 읽습니다(tests/unit/bingo.test.mjs).
//
// 자료
//   bookActivities/{aId}.bingo   — 반 전체가 읽는 활동 문서
//     { stage: 'fill' | 'play', size: 4 | 5, lead: 'teacher' | 'student',
//       words: [낱말], called: [부른 낱말 차례대로], by: [그 낱말이 누구 차례였나 — uid · '' = 선생님],
//       goal: 줄 수, order: [부르는 차례 — 학생 uid, 학번순], turn: order에서 지금 차례 }
//     교사가 씁니다. '학생이 진행'(lead: 'student')이면 **제 차례인 학생도** called · by · turn
//     세 칸만 이어 씁니다(낱말 하나를 붙이고 차례를 하나 넘김 — 규칙이 그 모양을 못 박음).
//   bookActivities/{aId}/bingoBoards/{판 id}  — 판 하나(모둠 · 학생)
//     { groupId, cells: { "0": 낱말, … }, updatedAt } — 칸 열쇠는 "0" ~ (size² − 1)
//     칸 하나씩 merge로 써서 모둠원이 동시에 다른 칸을 채워도 서로 덮지 않습니다.
//
// 빙고에는 숨길 정답이 없어 판을 반 전체가 읽습니다(가장 앞선 친구 · 모둠의 판).
// =============================================================
import { byStudentId } from "./roster";

// 판 크기 — 만들 때 고릅니다(선생님 요청). 만든 뒤에는 바꾸지 않습니다: 칸 번호가
// r * size + c라, 크기가 바뀌면 이미 채운 칸의 자리가 뒤섞입니다.
export const BINGO_SIZES = [4, 5];
export const BINGO_DEFAULT_SIZE = 5; // 크기가 적히기 전에 만든 활동도 5×5
// 칸 하나에 들어갈 낱말 길이 — 규칙(firestore.rules의 bingoBoards)과 같아야 합니다
export const BINGO_WORD_MAX = 20;
// 낱말 상자의 천장 — 활동 문서가 커지지 않게(닿소리 판 스물몇 장 × 14칸 남짓)
export const BINGO_POOL_MAX = 400;
// 빙고 목표(몇 줄이면 빙고인가) — 4×4는 10줄, 5×5는 12줄 가운데
export const BINGO_GOALS = [1, 2, 3, 4, 5];
export const BINGO_DEFAULT_GOAL = 3;
// 누가 부르나 — 선생님이 진행(교사가 부름) / 학생이 진행(학번 차례대로 학생이 제 판에서 고름)
export const BINGO_LEADS = ["teacher", "student"];
export const BINGO_DEFAULT_LEAD = "teacher";

// 판의 칸 열쇠 — 규칙이 이 목록으로 칸 맵의 모양을 못 박습니다("0" ~ "24", 가장 큰 판).
// 4×4 판은 그 앞 열여섯 칸만 씁니다.
export const BINGO_CELL_KEYS = Array.from({ length: 25 }, (_, i) => String(i));

export function normalizeBingoSize(size) {
  const n = Math.round(Number(size));
  return BINGO_SIZES.includes(n) ? n : BINGO_DEFAULT_SIZE;
}
export function normalizeBingoLead(lead) {
  return lead === "student" ? "student" : "teacher";
}
export function bingoCellCount(size) {
  const n = normalizeBingoSize(size);
  return n * n;
}

// 줄 — 가로 n · 세로 n · 대각선 둘. 칸 번호는 r * n + c.
const LINES = new Map();
export function bingoLines(size) {
  const n = normalizeBingoSize(size);
  if (!LINES.has(n)) {
    const out = [];
    for (let r = 0; r < n; r++) out.push({ key: `r${r}`, cells: Array.from({ length: n }, (_, c) => r * n + c) });
    for (let c = 0; c < n; c++) out.push({ key: `c${c}`, cells: Array.from({ length: n }, (_, r) => r * n + c) });
    out.push({ key: "d0", cells: Array.from({ length: n }, (_, i) => i * n + i) });
    out.push({ key: "d1", cells: Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)) });
    LINES.set(n, out);
  }
  return LINES.get(n);
}
export function bingoLineCount(size) {
  return bingoLines(size).length;
}

// 낱말 하나를 칸에 넣을 모양으로 — 앞뒤 빈칸을 걷고, 너무 길면 버립니다.
export function cleanBingoWord(raw) {
  const t = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!t || t.length > BINGO_WORD_MAX) return "";
  return t;
}

// 닿소리 낱말 문서들 → 낱말 상자(겹치지 않게, 처음 나온 차례 그대로).
export function bingoWordPool(words) {
  const seen = new Set();
  const out = [];
  for (const w of words ?? []) {
    const t = cleanBingoWord(typeof w === "string" ? w : w?.text ?? w?.word);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= BINGO_POOL_MAX) break;
  }
  return out;
}

export function normalizeBingoGoal(goal) {
  const n = Math.round(Number(goal));
  return BINGO_GOALS.includes(n) ? n : BINGO_DEFAULT_GOAL;
}

// 활동 문서의 bingo → 화면이 쓰는 모양. 없으면 null.
//   called는 겹친 것 · 상자에 없는 것을 버리고, by는 called와 같은 길이로 맞춥니다
//   (by가 생기기 전에 부른 낱말은 '' — 선생님이 부른 것).
export function normalizeBingo(raw) {
  if (!raw || typeof raw !== "object") return null;
  const words = bingoWordPool(Array.isArray(raw.words) ? raw.words : []);
  const inPool = new Set(words);
  const rawBy = Array.isArray(raw.by) ? raw.by : [];
  const seen = new Set();
  const called = [];
  const by = [];
  (Array.isArray(raw.called) ? raw.called : []).forEach((w, i) => {
    const t = cleanBingoWord(w);
    if (!t || seen.has(t) || !inPool.has(t)) return;
    seen.add(t);
    called.push(t);
    by.push(typeof rawBy[i] === "string" ? rawBy[i] : "");
  });
  const order = [...new Set((Array.isArray(raw.order) ? raw.order : []).filter((u) => typeof u === "string" && u))];
  // `|| 0` — -0 · NaN을 0으로. Firestore SDK는 -0을 소수(double)로 적는데, 규칙은 정수 차례만
  // 받으므로 교사가 상태를 고쳐 쓸 때 이 값이 정수 0으로 되돌아가야 합니다.
  const t = Number(raw.turn) || 0;
  return {
    stage: raw.stage === "play" ? "play" : "fill",
    size: normalizeBingoSize(raw.size),
    lead: normalizeBingoLead(raw.lead),
    words,
    called,
    by,
    goal: normalizeBingoGoal(raw.goal),
    order,
    turn: Number.isInteger(t) && t >= 0 && t < order.length ? t : 0,
  };
}

// 판 문서의 칸 맵(또는 칸 배열) → 길이 size²의 배열(빈칸은 "").
export function normalizeBingoCells(cells, size = BINGO_DEFAULT_SIZE) {
  const n = bingoCellCount(size);
  const out = Array(n).fill("");
  if (!cells || typeof cells !== "object") return out;
  for (let i = 0; i < n; i++) out[i] = cleanBingoWord(cells[i] ?? cells[String(i)]);
  return out;
}

export function bingoFilledCount(cells) {
  return (cells ?? []).filter(Boolean).length;
}

// 판에 이미 놓인 낱말(겹친 것 포함 한 번씩)
export function bingoUsedWords(cells) {
  return new Set((cells ?? []).filter(Boolean));
}

// 가로 · 세로로 이어진 불린 칸 가운데 가장 긴 것(대각선은 안 셈 — 선생님 요청).
// 아직 아무도 줄을 못 채웠을 때 누가 빙고에 가까운지 가르는 데 씁니다.
export function bingoLongestRun(marked, size = BINGO_DEFAULT_SIZE) {
  const n = normalizeBingoSize(size);
  const has = (i) => !!marked?.has(i);
  let best = 0;
  for (let a = 0; a < n; a++) {
    let row = 0;
    let col = 0;
    for (let b = 0; b < n; b++) {
      row = has(a * n + b) ? row + 1 : 0;
      col = has(b * n + a) ? col + 1 : 0;
      best = Math.max(best, row, col);
    }
  }
  return best;
}

// 판 하나의 진행 — 부른 낱말(차례 목록)로 칸을 표시하고 줄을 셉니다.
//   marked   Set(칸 번호) — 부른 낱말이 든 칸
//   lines    완성된 줄의 key 목록 · lineCells Set(완성된 줄에 든 칸)
//   count    완성된 줄 수 · filled 채운 칸 수 · run 가로 · 세로로 이어진 불린 칸(가장 긴 것)
//   bingoAt  목표 줄 수에 닿은 것이 몇 번째 부른 낱말에서인가(1부터, 못 닿으면 null)
export function bingoProgress(cells, called = [], goal = BINGO_DEFAULT_GOAL, size = BINGO_DEFAULT_SIZE) {
  const n = normalizeBingoSize(size);
  const list = normalizeBingoCells(cells, n);
  const lines = bingoLines(n);
  const at = new Map(); // 낱말 → 그 낱말이 든 칸들
  list.forEach((w, i) => {
    if (!w) return;
    if (!at.has(w)) at.set(w, []);
    at.get(w).push(i);
  });
  const need = normalizeBingoGoal(goal);
  const marked = new Set();
  let bingoAt = null;
  const countLines = () => lines.filter((l) => l.cells.every((i) => marked.has(i))).length;
  (called ?? []).forEach((w, k) => {
    const hit = at.get(w);
    if (!hit) return;
    hit.forEach((i) => marked.add(i));
    if (bingoAt == null && countLines() >= need) bingoAt = k + 1;
  });
  const done = lines.filter((l) => l.cells.every((i) => marked.has(i)));
  return {
    cells: list,
    size: n,
    marked,
    lines: done.map((l) => l.key),
    lineCells: new Set(done.flatMap((l) => l.cells)),
    count: done.length,
    filled: bingoFilledCount(list),
    run: bingoLongestRun(marked, n),
    bingoAt,
    bingo: done.length >= need,
  };
}

// 같은 성적이면 학번순 — rows의 sortKey(학번, 없으면 이름 · 모둠 판은 '')로, 그것도 없거나
// 같으면 원래 차례(order). 학번 비교는 반 명단(lib/roster.js의 byStudentId)과 같은 기준입니다.
export function compareBingoSortKey(a, b) {
  const ka = a?.sortKey || "";
  const kb = b?.sortKey || "";
  if (ka && kb && ka !== kb) return ka.localeCompare(kb, "ko");
  return (a?.order ?? 0) - (b?.order ?? 0);
}

// 순위(선생님 요청) — 완성한 줄이 많은 차례. 줄 수가 같으면 학번순인데, 둘 다 0줄이면 먼저
// 가로 · 세로로 이어진 불린 칸(run)이 긴 차례로 가르고, 그것도 같으면 학번순입니다.
//   rows: [{ ...bingoProgress, sortKey, order }]
export function compareBingoRank(a, b) {
  if (b.count !== a.count) return b.count - a.count;
  if (a.count === 0 && (b.run ?? 0) !== (a.run ?? 0)) return (b.run ?? 0) - (a.run ?? 0);
  return compareBingoSortKey(a, b);
}
export function rankBingo(rows) {
  return [...(rows ?? [])].sort(compareBingoRank);
}
// 판 채우기 단계 — 많이 채운 차례, 같으면 학번순
export function rankBingoFill(rows) {
  return [...(rows ?? [])].sort((a, b) => b.filled - a.filled || compareBingoSortKey(a, b));
}
// a가 b보다 '실제로' 앞서는가(줄 수, 둘 다 0줄이면 이어진 칸) — 학번으로 가른 차례는 앞섬이 아님
export function bingoAhead(a, b) {
  if (!a || !b) return false;
  if (a.count !== b.count) return a.count > b.count;
  return a.count === 0 && (a.run ?? 0) > (b.run ?? 0);
}

function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 빈칸을 낱말 상자에서 무작위로 채웁니다 — 이미 놓인 낱말은 다시 안 씁니다.
// 돌려주는 값: { "칸 번호": 낱말 } (새로 채울 칸만). 낱말이 모자라면 남는 칸은 그대로.
export function bingoRandomFill(cells, pool, rng = Math.random, size = BINGO_DEFAULT_SIZE) {
  const list = normalizeBingoCells(cells, size);
  const used = bingoUsedWords(list);
  const left = shuffle(bingoWordPool(pool).filter((w) => !used.has(w)), rng);
  const set = {};
  list.forEach((w, i) => {
    if (w || left.length === 0) return;
    set[String(i)] = left.shift();
  });
  return set;
}

// 판에 놓인 낱말(선생님 요청) — ㄱ~ㅎ 차례로, 낱말마다 몇 판에 놓였는지와 함께.
// 아무 판에도 없는 낱말은 불러도 아무 일이 없어 수업만 늘어지므로, 부르기 목록은
// 이것뿐입니다. pool(낱말 상자)을 주면 상자에 있는 것만 — 부를 수 있는 낱말만 남깁니다.
//   boards: [칸 배열(normalizeBingoCells)] → [{ word, boards }]
const KO = new Intl.Collator("ko");
export function bingoBoardWords(boards, pool = null) {
  const allow = pool ? new Set(pool) : null;
  const count = new Map();
  for (const cells of boards ?? []) {
    for (const w of new Set((cells ?? []).filter(Boolean))) {
      if (allow && !allow.has(w)) continue;
      count.set(w, (count.get(w) ?? 0) + 1);
    }
  }
  return [...count.keys()].sort(KO.compare).map((word) => ({ word, boards: count.get(word) }));
}

// '무작위로 부르기' — 판에 놓인 낱말(bingoBoardWords의 낱말) 가운데 아직 안 부른 것에서만.
// 다 불렀으면 null(상자의 남은 낱말로 넘어가지 않습니다 — 선생님 요청).
export function nextBingoCall(words, called, rng = Math.random) {
  const done = new Set(called ?? []);
  const left = (words ?? [])
    .map((w) => (typeof w === "string" ? w : w?.word))
    .filter((w) => w && !done.has(w));
  if (left.length === 0) return null;
  return left[Math.floor(rng() * left.length)] ?? null;
}

// ── 학생이 진행 — 부르는 차례 ───────────────────────────────────
// 학번 오름차순으로 한 번씩, 마지막 번호까지 부르면 처음부터 다시(turn이 order를 돕니다).
// 판(물리지 않은 모둠 문서)에 든 학생만 — 판이 없으면 고를 낱말이 없습니다. roster(반 명단)를
// 주면 거기 있는 학생만 남깁니다. 학번 · 이름은 **칸마다** 명단 것을 먼저, 비었으면 판의
// members(만들 때 베낀 것)로 — 페이지를 막 열어 사용자 디렉터리가 아직 안 왔으면 명단 줄이
// 학번 없이 '이름 미설정'이라, 그대로 견주면 학번순이 아니게 짜입니다.
//   boards: [{ memberUids, members }] · roster: [{ uid, name, studentId }] → [uid]
export function bingoTurnOrder(boards, roster = []) {
  const fromRoster = new Map((roster ?? []).filter((s) => s?.uid).map((s) => [s.uid, s]));
  const fromBoards = new Map();
  for (const g of boards ?? []) {
    for (const m of g?.members ?? []) if (m?.uid) fromBoards.set(m.uid, m);
  }
  const uids = [...new Set((boards ?? []).flatMap((g) => g?.memberUids ?? []).filter(Boolean))];
  return uids
    .filter((uid) => fromRoster.size === 0 || fromRoster.has(uid))
    .map((uid) => {
      const r = fromRoster.get(uid);
      const m = fromBoards.get(uid);
      return {
        uid,
        studentId: r?.studentId || m?.studentId || null,
        name: String((r?.studentId ? r.name : "") || m?.name || r?.name || ""),
      };
    })
    .sort(byStudentId)
    .map((p) => p.uid);
}

// 지금 차례인 학생의 uid — '학생이 진행'으로 빙고 중일 때만. 아니면 null.
export function bingoTurnUid(bingo) {
  if (!bingo || bingo.stage !== "play" || bingo.lead !== "student" || bingo.order.length === 0) return null;
  return bingo.order[bingo.turn] ?? null;
}

// uid의 차례까지 몇 번 남았나(0 = 지금 차례). 차례에 없으면 null.
export function bingoTurnsUntil(bingo, uid) {
  const n = bingo?.order?.length ?? 0;
  const at = n ? bingo.order.indexOf(uid) : -1;
  if (at < 0) return null;
  return (at - bingo.turn + n) % n;
}

// 낱말 하나 부르기 → 바꿀 칸({ called, by[, turn] }) · 부를 수 없으면 null.
//   선생님이 진행 — 그대로 붙입니다(by는 '').
//   학생이 진행  — 지금 차례 학생의 몫으로 적고 차례를 하나 넘깁니다(마지막 다음은 처음).
//   uid를 주면 '그 학생의 차례일 때만'입니다 — 학생 자신이 부를 때, 선생님이 '이 학생 대신'
//   누른 사이 차례가 넘어갔거나 선생님이 진행으로 바뀌었을 때를 가립니다(null).
//   차례가 없으면(판에 든 학생이 없음) 선생님만 부를 수 있습니다.
export function bingoCall(bingo, word, uid = null) {
  if (!bingo || bingo.stage !== "play") return null;
  const w = cleanBingoWord(word);
  if (!w || !bingo.words.includes(w) || bingo.called.includes(w)) return null;
  if (bingo.lead !== "student") return uid ? null : { called: [...bingo.called, w], by: [...bingo.by, ""] };
  const who = bingoTurnUid(bingo);
  if (!who) return uid ? null : { called: [...bingo.called, w], by: [...bingo.by, ""] };
  if (uid && uid !== who) return null;
  return {
    called: [...bingo.called, w],
    by: [...bingo.by, who],
    turn: (bingo.turn + 1) % bingo.order.length,
  };
}

// 하나 되돌리기 — 마지막 부름을 지우고, 학생 차례의 부름이었으면 차례도 그 학생에게 돌려줍니다.
// expectWord(교사가 화면에서 본 마지막 낱말)를 주면 그 낱말이 아직 마지막일 때만 — 누르는 사이
// 다음 학생이 불렀으면 그 학생의 부름을 지우지 않고 null(학생이 진행에서 생기는 경합).
export function bingoUndo(bingo, expectWord = null) {
  if (!bingo?.called?.length) return null;
  if (expectWord && bingo.called.at(-1) !== expectWord) return null;
  const last = bingo.by.at(-1) || "";
  const back = last ? bingo.order.indexOf(last) : -1;
  return {
    called: bingo.called.slice(0, -1),
    by: bingo.by.slice(0, -1),
    ...(back >= 0 ? { turn: back } : {}),
  };
}

// 빙고 시작 — 부른 낱말을 비우고 차례를 학번순으로 새로 짭니다(선생님이 진행이어도 짜 두어,
// 진행 중에 '학생이 진행'으로 바꾸면 곧바로 첫 번호부터 돕니다).
export function bingoStartPatch(order) {
  return { stage: "play", called: [], by: [], order: [...(order ?? [])], turn: 0 };
}

// 누가 부를지 바꾸기 — 학생이 진행으로 바꿀 때는 차례를 새로 짜되, 지금 차례였던 학생이
// 그대로 있으면 그 학생부터 이어 갑니다(오가며 바꿔도 차례가 처음으로 돌아가지 않게).
// order가 null이면 '아직 모름'(판 목록 구독의 첫 답 전) — 저장된 차례를 그대로 둡니다.
// 빈 배열은 '판에 든 학생이 정말 없음'이라 그대로 적습니다(물러난 학생에게 차례가 남지 않게).
export function bingoLeadPatch(bingo, lead, order) {
  const next = normalizeBingoLead(lead);
  if (next !== "student" || order == null) return { lead: next };
  const list = [...(order ?? [])];
  const cur = bingo?.order?.[bingo?.turn ?? 0];
  const at = cur ? list.indexOf(cur) : -1;
  return { lead: next, order: list, turn: at >= 0 ? at : 0 };
}

// 한 판에서 아직 부를 수 있는 낱말 — 칸에 있고, 낱말 상자에 있고, 아직 안 불린 것(겹치지 않게,
// 칸 차례대로). 학생이 진행에서 학생 화면은 이것만 누르게 하고, 교사 화면은 지금 차례 학생의
// 판에 이것이 하나도 없으면(빈 판 · 다 불림) 결석처럼 대신 고르라고 알립니다.
export function bingoCallableWords(cells, bingo) {
  const pool = new Set(bingo?.words ?? []);
  const done = new Set(bingo?.called ?? []);
  return [...new Set((cells ?? []).filter((w) => w && pool.has(w) && !done.has(w)))];
}

// 학생마다 가장 최근에 제 차례로 부른 낱말 — Map(uid → { word, n(몇 번째) })
export function bingoPicksBy(bingo) {
  const out = new Map();
  (bingo?.called ?? []).forEach((w, i) => {
    const who = bingo.by?.[i];
    if (who) out.set(who, { word: w, n: i + 1 });
  });
  return out;
}
