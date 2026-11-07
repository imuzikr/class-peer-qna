// =============================================================
// RAFT 글쓰기 — 교사 피드백 메모(형광펜 + 메모) 셈
// -------------------------------------------------------------
// 교사가 학생 글의 한 부분을 드래그하면 그 범위(글자 차례 start ~ end)에 형광펜을
// 칠하고 메모를 답니다. 자료는
//   bookActivities/{aId}/entries/{학생 uid}/raftFeedback/{메모 id}
//   { activityId, studentUid, start, end, quote, text, rev, seenRev, byUid, createdAt, updatedAt }
// · quote — 칠한 부분의 글 그대로(학생이 그 뒤 글을 고쳐 자리가 어긋나면 찾는 열쇠)
// · rev    — 교사가 저장할 때마다 1씩(처음 1). seenRev — 학생이 마지막으로 본 rev.
//            rev > seenRev면 '새 피드백'(학생 화면의 점 · 상단바 알림 벨).
// 피드백을 남길 때는 교사가 활동을 잠가 학생이 글을 못 고치게 하는 것이 약속이라,
// 자리 찾기는 '그대로 있으면 거기, 아니면 같은 글을 가장 가까운 데서' 한 번만 봅니다.
// 화면(RaftFeedbackText · RaftFeedbackPopover)과 데이터 함수가 여기 셈만 부릅니다.
// =============================================================

// 메모 글 · 칠한 부분의 천장 — 규칙(firestore.rules의 raftFeedback)과 같아야 합니다
export const RAFT_FEEDBACK_MAX = 500;
export const RAFT_QUOTE_MAX = 3000;
export const RAFT_OFFSET_MAX = 50000;

export function cleanFeedbackText(raw) {
  return String(raw ?? "").replace(/\r\n?/g, "\n").trim().slice(0, RAFT_FEEDBACK_MAX);
}

export function normalizeRaftFeedback(raw, id = raw?.id) {
  const start = Math.max(0, Math.floor(Number(raw?.start) || 0));
  const end = Math.max(start, Math.floor(Number(raw?.end) || 0));
  const rev = Math.max(1, Math.floor(Number(raw?.rev) || 1));
  const seenRev = Math.max(0, Math.floor(Number(raw?.seenRev) || 0));
  return {
    id: id ?? "",
    activityId: raw?.activityId ?? "",
    studentUid: raw?.studentUid ?? "",
    start,
    end,
    quote: String(raw?.quote ?? ""),
    text: String(raw?.text ?? ""),
    rev,
    seenRev,
    createdAt: raw?.createdAt ?? null,
    updatedAt: raw?.updatedAt ?? null,
  };
}

// 학생이 아직 못 본(또는 고친 뒤 다시 안 본) 메모인가
export function isRaftFeedbackNew(note) {
  return (Number(note?.rev) || 1) > (Number(note?.seenRev) || 0);
}

// 메모의 지금 자리 — 글에서 그 부분이 그대로면 [start, end], 아니면 같은 글을
// start에 가장 가까운 곳에서, 그래도 없으면 null(형광펜 없이 메모만).
export function locateFeedback(text, note) {
  const t = String(text ?? "");
  const { start, end, quote } = note ?? {};
  if (!quote) return null;
  if (t.slice(start, end) === quote) return [start, end];
  let best = -1;
  for (let i = t.indexOf(quote); i >= 0; i = t.indexOf(quote, i + 1)) {
    if (best < 0 || Math.abs(i - start) < Math.abs(best - start)) best = i;
  }
  return best >= 0 ? [best, best + quote.length] : null;
}

// 메모들을 글의 차례대로 놓고 번호를 붙입니다(1부터 — 아이콘의 숫자).
// 돌려주는 값: [{ ...note, range: [s, e] | null, no }]
export function placeFeedbackNotes(text, notes) {
  return (notes ?? [])
    .map((n) => ({ ...n, range: locateFeedback(text, n) }))
    .sort((a, b) => (a.range?.[0] ?? a.start) - (b.range?.[0] ?? b.start) || String(a.id).localeCompare(String(b.id)))
    .map((n, i) => ({ ...n, no: i + 1 }));
}

// 고른 범위가 이미 칠한 메모와 겹치는가(겹치게는 못 칠합니다 — 메모가 어느 형광펜의
// 것인지 헷갈림). ranges: [[s, e], …]
export function feedbackOverlaps(ranges, s, e) {
  return (ranges ?? []).some((r) => r && s < r[1] && r[0] < e);
}

// 드래그한 범위를 다듬습니다 — 앞뒤 빈칸 · 줄바꿈은 걷고, 빈 범위면 null.
export function trimFeedbackRange(text, s, e) {
  const t = String(text ?? "");
  let a = Math.max(0, Math.min(s, e));
  let b = Math.min(t.length, Math.max(s, e));
  while (a < b && /\s/.test(t[a])) a++;
  while (b > a && /\s/.test(t[b - 1])) b--;
  if (b <= a) return null;
  if (b - a > RAFT_QUOTE_MAX) b = a + RAFT_QUOTE_MAX;
  return [a, b];
}

// 글을 칠한 조각 · 안 칠한 조각으로 나눕니다(겹치지 않는 범위만 — 겹치면 뒤의 것을 버림).
//   marks: [{ id, range: [s, e] }]  →  [{ text, id | null }]
export function splitFeedbackSegments(text, marks) {
  const t = String(text ?? "");
  const list = (marks ?? [])
    .filter((m) => m?.range && m.range[1] > m.range[0])
    .sort((a, b) => a.range[0] - b.range[0]);
  const out = [];
  let at = 0;
  for (const m of list) {
    const [s, e] = m.range;
    if (s < at || e > t.length) continue;
    if (s > at) out.push({ text: t.slice(at, s), id: null });
    out.push({ text: t.slice(s, e), id: m.id });
    at = e;
  }
  if (at < t.length || out.length === 0) out.push({ text: t.slice(at), id: null });
  return out;
}
