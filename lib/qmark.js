// =============================================================
// 물음표로 책 읽기 — 한 학생의 답 모양과 셈 (순수 함수)
// -------------------------------------------------------------
// 책을 읽으며 궁금한 곳에 물음표(?)를 붙여 두고, 그중 **가장 중요한 물음
// 하나**를 골라 궁금증과 그 이유를 적습니다. 그다음 아래 다섯 물음 가운데
// **두 개 이상**을 골라(체크) 그 궁금증에 대한 내 생각을 씁니다 — 종이
// 활동지의 '1. 여백에 적은 질문 중 가장 중요한 질문 1가지'와 '4. 2개 이상의
// 항목에 v표시하고 답하기'를 그대로 옮긴 것입니다.
//
// 곁텍스트 · RAFT · KWLS와 같은 개인 활동이라 저장 자리도 같습니다
// (bookActivities/{id}/entries/{uid}.answers) — 규칙을 안 건드립니다.
//
//   answers = {
//     question: "",  // 궁금증 — 물음표를 붙인 곳의 물음
//     reason: "",    // 이유는 — 왜 그것이 궁금했나
//     picks: [],     // 고른 물음의 key(차례는 QMARK_PROMPTS 그대로)
//     knowledge · use · bias · interest · change: ""  // 물음마다 내 생각
//   }
//
// **고른 것을 풀어도 쓴 글은 지우지 않습니다** — 다시 고르면 돌아옵니다.
// 완성 판정과 화면은 고른 물음의 글만 봅니다.
//
// 이 파일은 Firebase를 모릅니다 — 단위 시험(tests/unit/qmark.test.mjs)이
// 그대로 읽습니다.
// =============================================================

// 적어도 몇 개를 골라 답하나 — 활동지의 '2개 이상'
export const QMARK_MIN_PICKS = 2;

export const QMARK_PROMPTS = [
  { key: "knowledge", no: "1", text: "나의 지식을 어떻게 넓혀 주었는가?" },
  { key: "use", no: "2", text: "읽은 내용을 어떻게 활용할 수 있을까?" },
  { key: "bias", no: "3", text: "텍스트를 읽고 깨달은 나의 편견은 무엇인가?" },
  { key: "interest", no: "4", text: "가장 흥미로운 점과 그 이유는 무엇인가?" },
  { key: "change", no: "5", text: "읽기 전·후를 비교할 때 나의 생각은 어떻게 달라졌는가?" },
];
const PROMPT_KEYS = QMARK_PROMPTS.map((p) => p.key);
const PROMPT_KEY_SET = new Set(PROMPT_KEYS);

// 칸마다 글자 천장 — 활동지 한 칸에 쓰는 분량을 넉넉히 넘는 값입니다.
export const QMARK_TEXT_MAX = 2000;

const str = (v) => String(v ?? "").replace(/\r\n?/g, "\n").slice(0, QMARK_TEXT_MAX);
const has = (v) => String(v ?? "").trim().length > 0;

export function emptyQmarkAnswers() {
  return {
    question: "",
    reason: "",
    picks: [],
    ...Object.fromEntries(PROMPT_KEYS.map((k) => [k, ""])),
  };
}

// 저장된 값(또는 빈 값)을 늘 같은 모양으로. 고른 물음은 **정해 둔 차례로**
// 다시 세우고 모르는 key·겹친 key는 걷습니다 — 누른 차례대로 두면 같은
// 학생의 글이 화면마다 다른 차례로 섭니다.
export function normalizeQmarkAnswers(raw) {
  const a = raw && typeof raw === "object" ? raw : {};
  const picked = new Set(Array.isArray(a.picks) ? a.picks.filter((k) => PROMPT_KEY_SET.has(k)) : []);
  return {
    question: str(a.question),
    reason: str(a.reason),
    picks: PROMPT_KEYS.filter((k) => picked.has(k)),
    ...Object.fromEntries(PROMPT_KEYS.map((k) => [k, str(a[k])])),
  };
}

// 물음 하나를 고르거나 풉니다. 푼다고 글을 지우지 않습니다(위 머리글).
export function toggleQmarkPick(answers, key) {
  const a = normalizeQmarkAnswers(answers);
  if (!PROMPT_KEY_SET.has(key)) return a;
  const on = a.picks.includes(key);
  const next = new Set(a.picks);
  if (on) next.delete(key);
  else next.add(key);
  return { ...a, picks: PROMPT_KEYS.filter((k) => next.has(k)) };
}

// 고른 물음 중 글까지 쓴 것 — 차례는 정해 둔 그대로
export function qmarkAnsweredPicks(answers) {
  const a = normalizeQmarkAnswers(answers);
  return a.picks.filter((k) => has(a[k]));
}

export function qmarkQuestionDone(answers) {
  const a = normalizeQmarkAnswers(answers);
  return has(a.question) && has(a.reason);
}

// 완성 — 궁금증 · 이유를 다 쓰고, 두 개 이상 골라 **그 글까지** 썼을 때
export function qmarkDone(answers) {
  return qmarkQuestionDone(answers) && qmarkAnsweredPicks(answers).length >= QMARK_MIN_PICKS;
}

export function qmarkStarted(answers) {
  const a = normalizeQmarkAnswers(answers);
  return has(a.question) || has(a.reason) || a.picks.length > 0 || PROMPT_KEYS.some((k) => has(a[k]));
}

// 쓴 글자 수 — 고른 물음의 글만 셉니다(풀어 둔 물음의 글은 안 보이는 글).
export function qmarkChars(answers) {
  const a = normalizeQmarkAnswers(answers);
  const t = (v) => String(v ?? "").trim().length;
  return t(a.question) + t(a.reason) + a.picks.reduce((n, k) => n + t(a[k]), 0);
}

// ── 전광판 · 학생 목록 · 진행 패널이 함께 쓰는 줄 ──────────────
// 줄은 셋 — 궁금증 · 이유 · 나의 생각. 다섯 물음을 줄마다 세우면 고르지
// 않은 물음이 모두 '안 씀'으로 칠해져, 두 개만 골라 다 한 학생이 덜 한
// 것처럼 보입니다. '나의 생각' 한 줄이 '두 개 이상'을 셉니다.
export function qmarkRows() {
  return [
    { key: "question", letter: "?", label: "궁금증", hint: "가장 중요하다고 생각하는 물음 하나", locked: null },
    { key: "reason", letter: "!", label: "이유", hint: "그 물음이 궁금했던 까닭", locked: null },
    {
      key: "thoughts",
      letter: "✓",
      label: "나의 생각",
      hint: `다섯 물음 가운데 ${QMARK_MIN_PICKS}개 이상 골라 답하기`,
      locked: null,
    },
  ];
}

export function qmarkCellState(row, answers) {
  const a = normalizeQmarkAnswers(answers);
  if (row.key === "thoughts") {
    const n = qmarkAnsweredPicks(a).length;
    if (n >= QMARK_MIN_PICKS) return "done";
    return n > 0 || a.picks.length > 0 ? "doing" : "empty";
  }
  return has(a[row.key]) ? "done" : "empty";
}

// ── 학급 화면에 띄울 영역 ─────────────────────────────────────
// 궁금증 · 이유를 한 장, 다섯 물음을 한 장씩. 영역이 학생마다 달라지면
// '다음 학생 →'이 같은 자리를 못 짚으므로 여섯 칸으로 못 박습니다 — 그
// 학생이 고르지 않은 물음이면 그 사실을 적어 띄웁니다.
export const QMARK_REGIONS = [
  {
    key: "question",
    letter: "?",
    ko: "나의 물음표",
    en: "My question",
    prompt: "여백에 적은 물음 가운데 가장 중요하다고 생각하는 물음 하나",
  },
  // 이름은 짧게('나의 생각 1'), 물음은 prompt로 — 머리와 물음이 같은 글이면
  // 칠판에 같은 문장이 두 번 섭니다.
  ...QMARK_PROMPTS.map((p) => ({ key: p.key, letter: p.no, ko: `나의 생각 ${p.no}`, en: "", prompt: p.text })),
];

export function qmarkRegionFields(answers, key) {
  const a = normalizeQmarkAnswers(answers);
  if (key === "question") {
    return [
      { label: "궁금증", text: a.question.trim() },
      { label: "이유는", text: a.reason.trim() },
    ];
  }
  if (!PROMPT_KEY_SET.has(key)) return [];
  // 고르지 않은 물음 — 빈 칸('아직 쓰지 않았어요')으로 두면 덜 한 것처럼 읽혀
  // 그 사실을 글로 적어 띄웁니다.
  if (!a.picks.includes(key)) return [{ label: "", text: "(이 물음은 고르지 않았어요)" }];
  return [{ label: "", text: a[key].trim() }];
}
