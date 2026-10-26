// =============================================================
// 투표 — 셈만 모은 곳(순수 함수)
// -------------------------------------------------------------
// 교사가 물음 하나와 항목을 정해 투표를 열면, 학생이 떠 있는 동그라미의
// '투표'에서 고릅니다. 교사는 결과를 지켜보다가 **'결과 공유'**를 누르면
// 학생들도 같은 막대를 봅니다. 반마다 **열린 투표는 하나**이고, 새로 열면
// 앞의 것이 닫힙니다(돌발 퀴즈와 같은 약속).
//
// 종류는 둘 — 'single'(하나만 고르기) · 'multi'(여러 개 고르기).
// 항목은 처음 셋(POLL_DEFAULT_OPTIONS), 둘에서 열까지.
//
// 자료(lib/data/polls.js)
//   classes/{cId}/polls/{pId}
//     = { classId, kind, title, options:[{ key, text }], byUid, open, shared,
//         results:{ [key]: n }, voters, createdAt, closedAt, sharedAt }
//   classes/{cId}/polls/{pId}/votes/{uid}
//     = { classId, pollId, uid, picks:[key…], at }
//
// [학생은 남의 표를 못 읽습니다] 표 문서는 그 학생과 담당 교사만 읽습니다 —
// 누가 무엇을 골랐는지가 드러나지 않게. 학생이 보는 결과는 **교사 화면이
// 센 수를 투표 문서에 적어 둔 것**(results · voters)입니다. 공유하는 순간
// 적고, 공유한 채 표가 바뀌면 교사 화면(components/PollCenter.jsx)이 다시
// 적습니다(pollResultsChanged).
//
// 규칙(firestore.rules)의 천장 값은 여기 상수와 같아야 합니다.
// =============================================================

export const POLL_KINDS = [
  { key: "single", label: "하나만 고르기" },
  { key: "multi", label: "여러 개 고르기" },
];
export const POLL_TITLE_MAX = 200;
export const POLL_OPTION_MAX = 60;
export const POLL_OPTIONS_MIN = 2;
export const POLL_OPTIONS_MAX = 10;
export const POLL_DEFAULT_OPTIONS = 3;

export function pollKindOf(kind) {
  return kind === "multi" ? "multi" : "single";
}
export function pollKindLabel(kind) {
  return pollKindOf(kind) === "multi" ? "여러 개 고르기" : "하나만 고르기";
}

// 만들기 창의 항목 글 → 저장 모양. 빈 칸은 건너뛰고 key는 차례대로 o1, o2 …
// (빈 칸을 건너뛴 뒤에 매겨 번호가 비지 않습니다).
export function buildPollOptions(texts) {
  return (Array.isArray(texts) ? texts : [])
    .map((t) => String(t ?? "").trim().slice(0, POLL_OPTION_MAX))
    .filter(Boolean)
    .slice(0, POLL_OPTIONS_MAX)
    .map((text, i) => ({ key: `o${i + 1}`, text }));
}

// 같은 글의 항목이 둘이면 막습니다(대소문자 · 앞뒤 공백 무시) — 결과 막대에서
// 둘을 가를 수 없습니다.
export function pollOptionsProblem(texts) {
  const opts = buildPollOptions(texts);
  if (opts.length < POLL_OPTIONS_MIN) return `항목을 ${POLL_OPTIONS_MIN}개 이상 적어 주세요.`;
  const seen = new Set();
  for (const o of opts) {
    const k = o.text.toLowerCase();
    if (seen.has(k)) return `같은 항목이 두 번 있어요 — ‘${o.text}’`;
    seen.add(k);
  }
  return null;
}

export function pollOptions(poll) {
  return (Array.isArray(poll?.options) ? poll.options : []).filter(
    (o) => o && typeof o.key === "string" && typeof o.text === "string"
  );
}

// 고른 항목 정리 — 없는 key는 빼고, 겹치면 하나로, 하나만 고르기면 첫 하나만.
// 항목 차례대로 둡니다(누른 차례가 아니라).
export function cleanPicks(poll, picks) {
  const want = new Set(Array.isArray(picks) ? picks : []);
  const keys = pollOptions(poll).map((o) => o.key).filter((k) => want.has(k));
  return pollKindOf(poll?.kind) === "single" ? keys.slice(0, 1) : keys;
}

// 표를 셉니다 — { counts: { key: n }, voters }. 고른 것이 하나도 없는 표는
// 안 셉니다. onlyUids를 주면 그 학생들의 표만(지금 명단 — 반에서 빠진 학생 제외).
export function tallyVotes(poll, votes, onlyUids = null) {
  const counts = {};
  for (const o of pollOptions(poll)) counts[o.key] = 0;
  const allow = onlyUids ? new Set(onlyUids) : null;
  let voters = 0;
  for (const v of votes ?? []) {
    if (!v?.uid || (allow && !allow.has(v.uid))) continue;
    const picks = cleanPicks(poll, v.picks);
    if (!picks.length) continue;
    voters++;
    for (const k of picks) counts[k]++;
  }
  return { counts, voters };
}

// 투표 문서에 적어 둔 결과와 지금 센 결과가 다른가(공유한 채 표가 바뀌었나).
export function pollResultsChanged(poll, tally) {
  const saved = poll?.results ?? {};
  if ((poll?.voters ?? 0) !== tally.voters) return true;
  return Object.keys(tally.counts).some((k) => (saved[k] ?? 0) !== tally.counts[k]);
}

// 막대 한 줄의 몫(%) — 하나만 고르기는 '표를 던진 사람' 가운데, 여러 개
// 고르기도 같은 분모입니다('몇 명이 이 항목을 골랐나'). 그래서 여러 개 고르기는
// 합이 100을 넘을 수 있습니다.
export function pollRows(poll, counts, voters) {
  const max = Math.max(0, ...pollOptions(poll).map((o) => counts?.[o.key] ?? 0));
  return pollOptions(poll).map((o) => {
    const n = counts?.[o.key] ?? 0;
    return {
      key: o.key,
      text: o.text,
      n,
      pct: voters > 0 ? Math.round((n / voters) * 100) : 0,
      top: n > 0 && n === max,
    };
  });
}

function stampMs(v) {
  if (!v) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  if (typeof v === "number") return v;
  return null;
}

// 최근 것이 위. 방금 만든 것은 서버 시각 전이라 null — 맨 위로.
export function sortPolls(polls) {
  return [...(polls ?? [])].sort((a, b) => {
    const ta = stampMs(a.createdAt) ?? Infinity;
    const tb = stampMs(b.createdAt) ?? Infinity;
    return tb - ta;
  });
}

// 학생 창의 '지금 투표' — 열린 것, 없으면 가장 최근에 공유된 것.
export function currentPoll(polls) {
  const sorted = sortPolls(polls);
  return sorted.find((p) => p.open) ?? sorted.find((p) => p.shared) ?? null;
}

export function hasVoted(vote) {
  return Array.isArray(vote?.picks) && vote.picks.length > 0;
}

// 학생 불 — 'red'(열린 투표에 아직 안 함) · 'green'(공유된 결과를 아직 안 봄) · null.
// seen은 이 기기에 적어 둔 '본 것' 표시들(Set).
export function studentPollLight(poll, vote, seen) {
  if (!poll) return null;
  if (poll.open && !hasVoted(vote)) return "red";
  if (poll.shared && !seen?.has(`${poll.id}:shared`)) return "green";
  return null;
}

// 창을 저절로 열 때 — 새로 열린 투표 · 새로 공유된 결과, 저마다 한 번씩.
// 돌려주는 것은 적어 둘 표시(없으면 null).
export function pollAutoOpenMark(poll, vote, seen) {
  if (!poll) return null;
  if (poll.open && !hasVoted(vote) && !seen?.has(`${poll.id}:open`)) return `${poll.id}:open`;
  if (poll.shared && !seen?.has(`${poll.id}:shared`)) return `${poll.id}:shared`;
  return null;
}
