// =============================================================
// 물음표로 책 읽기 — 한 학생의 답 모양과 셈 (순수 함수)
// -------------------------------------------------------------
// 책을 읽으며 궁금한 곳에 물음표(?)를 붙여 두고, 그 가운데 **중요한 물음을
// 몇 개든**(QMARK_ASK_MAX까지) 골라 궁금증과 그 이유를 짝지어 적습니다.
// 그다음 아래 다섯 물음 가운데 **두 개 이상**을 체크하고, 그 물음들을 길잡이
// 삼아 **나의 생각을 한 칸에** 정리해 씁니다.
//
// 곁텍스트 · RAFT · KWLS와 같은 개인 활동이라 저장 자리도 같습니다
// (bookActivities/{id}/entries/{uid}.answers) — 규칙을 안 건드립니다.
//
//   answers = {
//     asks: [{ question, reason }],  // 궁금증 · 이유는 — 한 쌍이 물음 하나
//     picks: [],                     // 체크한 물음의 key(차례는 QMARK_PROMPTS 그대로)
//     thought: "",                   // 나의 생각 — 체크한 물음을 길잡이로 정리한 글
//   }
//
// **처음 모양(물음 하나 · 물음마다 따로 쓰는 칸)도 읽습니다.** 그때는
// `question`·`reason` 한 쌍과, 체크한 물음마다 `knowledge`·`use`… 칸이
// 따로 있었습니다(선생님 요청으로 바꿈 — 물음표를 여럿 적고, 생각은 한
// 곳에서 정리하도록). 옛 기록은
//   · `asks`가 없으면 `question`·`reason`을 첫 쌍으로,
//   · `thought`가 없으면 체크한 물음마다 쓴 글을 '물음 + 글'로 이어
// 읽습니다. 저장은 merge라 옛 칸은 문서에 남지만, 한 번 저장하면 `asks`와
// `thought`가 생겨 그 뒤로는 옛 칸을 보지 않습니다(자료를 미리 옮기지 않음).
//
// 이 파일은 Firebase를 모릅니다 — 단위 시험(tests/unit/qmark.test.mjs)이
// 그대로 읽습니다.
// =============================================================

// 적어도 몇 개를 체크하나 — 활동지의 '2개 이상'
export const QMARK_MIN_PICKS = 2;
// 물음표(궁금증 · 이유 한 쌍)를 몇 개까지 — 한 권에서 '중요한 물음'으로
// 추리는 자리라 넉넉히 다섯. 더 늘리면 왼쪽 칸이 한없이 길어집니다.
export const QMARK_ASK_MAX = 5;

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
// '나의 생각'은 다섯 물음을 한 칸에 모아 쓰는 자리라 그 몇 배.
export const QMARK_TEXT_MAX = 2000;
export const QMARK_THOUGHT_MAX = 6000;

const clip = (max) => (v) => String(v ?? "").replace(/\r\n?/g, "\n").slice(0, max);
const str = clip(QMARK_TEXT_MAX);
const strLong = clip(QMARK_THOUGHT_MAX);
const has = (v) => String(v ?? "").trim().length > 0;

const emptyAsk = () => ({ question: "", reason: "" });

export function emptyQmarkAnswers() {
  return { asks: [emptyAsk()], picks: [], thought: "" };
}

// 옛 기록의 '물음마다 쓴 글'을 한 칸으로 — 체크해 둔 물음만(풀어 둔 물음의
// 글은 그때도 화면에 안 보이던 글입니다).
function legacyThought(a, picks) {
  return picks
    .filter((k) => has(a[k]))
    .map((k) => `${QMARK_PROMPTS.find((p) => p.key === k).text}\n${String(a[k]).trim()}`)
    .join("\n\n");
}

// 저장된 값(또는 빈 값)을 늘 같은 모양으로. 체크한 물음은 **정해 둔 차례로**
// 다시 세우고 모르는 key·겹친 key는 걷습니다 — 누른 차례대로 두면 같은
// 학생의 글이 화면마다 다른 차례로 섭니다. 물음표는 **늘 한 쌍 이상**입니다
// (쓰는 칸이 하나도 없으면 화면이 빕니다).
export function normalizeQmarkAnswers(raw) {
  const a = raw && typeof raw === "object" ? raw : {};
  const picked = new Set(Array.isArray(a.picks) ? a.picks.filter((k) => PROMPT_KEY_SET.has(k)) : []);
  const picks = PROMPT_KEYS.filter((k) => picked.has(k));
  let asks = Array.isArray(a.asks)
    ? a.asks
        .filter((x) => x && typeof x === "object")
        .slice(0, QMARK_ASK_MAX)
        .map((x) => ({ question: str(x.question), reason: str(x.reason) }))
    : [{ question: str(a.question), reason: str(a.reason) }];
  if (asks.length === 0) asks = [emptyAsk()];
  const thought = typeof a.thought === "string" ? strLong(a.thought) : strLong(legacyThought(a, picks));
  return { asks, picks, thought };
}

// ── 물음표 더하기 · 빼기 · 고치기 ─────────────────────────────
export function addQmarkAsk(answers) {
  const a = normalizeQmarkAnswers(answers);
  if (a.asks.length >= QMARK_ASK_MAX) return a;
  return { ...a, asks: [...a.asks, emptyAsk()] };
}

// 하나뿐이면 빼지 않고 비웁니다 — 쓰는 칸이 사라지면 안 됩니다.
export function removeQmarkAsk(answers, index) {
  const a = normalizeQmarkAnswers(answers);
  if (index < 0 || index >= a.asks.length) return a;
  if (a.asks.length === 1) return { ...a, asks: [emptyAsk()] };
  return { ...a, asks: a.asks.filter((_, i) => i !== index) };
}

export function editQmarkAsk(answers, index, field, value) {
  const a = normalizeQmarkAnswers(answers);
  if (index < 0 || index >= a.asks.length || (field !== "question" && field !== "reason")) return a;
  return { ...a, asks: a.asks.map((x, i) => (i === index ? { ...x, [field]: str(value) } : x)) };
}

// 물음 하나를 체크하거나 풉니다.
export function toggleQmarkPick(answers, key) {
  const a = normalizeQmarkAnswers(answers);
  if (!PROMPT_KEY_SET.has(key)) return a;
  const next = new Set(a.picks);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return { ...a, picks: PROMPT_KEYS.filter((k) => next.has(k)) };
}

// ── 판정 ─────────────────────────────────────────────────────
const askStarted = (x) => has(x.question) || has(x.reason);

// 글이 든 물음표 — 궁금증이나 이유 어느 한쪽이라도
export function qmarkStartedAsks(answers) {
  return normalizeQmarkAnswers(answers).asks.filter(askStarted);
}

// 물음표 다 씀 — 하나 이상 적었고, 적은 것마다 궁금증 · 이유가 **둘 다** 있을 때.
// 비워 둔 쌍(＋만 눌러 둔 것)은 세지 않습니다.
export function qmarkQuestionDone(answers) {
  const started = qmarkStartedAsks(answers);
  return started.length > 0 && started.every((x) => has(x.question) && has(x.reason));
}

// 나의 생각 다 씀 — 두 개 이상 체크하고 정리 글까지
export function qmarkThoughtDone(answers) {
  const a = normalizeQmarkAnswers(answers);
  return a.picks.length >= QMARK_MIN_PICKS && has(a.thought);
}

export function qmarkDone(answers) {
  return qmarkQuestionDone(answers) && qmarkThoughtDone(answers);
}

export function qmarkStarted(answers) {
  const a = normalizeQmarkAnswers(answers);
  return a.asks.some(askStarted) || a.picks.length > 0 || has(a.thought);
}

export function qmarkChars(answers) {
  const a = normalizeQmarkAnswers(answers);
  const t = (v) => String(v ?? "").trim().length;
  return a.asks.reduce((n, x) => n + t(x.question) + t(x.reason), 0) + t(a.thought);
}

// ── 전광판 · 학생 목록 · 진행 패널이 함께 쓰는 줄 ──────────────
// 줄은 셋 — 궁금증 · 이유 · 나의 생각. 물음표가 여러 개라도 줄은 늘리지
// 않습니다(학생마다 개수가 달라 격자가 맞지 않습니다).
export function qmarkRows() {
  return [
    { key: "question", letter: "?", label: "궁금증", hint: "중요하다고 생각하는 물음", locked: null },
    { key: "reason", letter: "!", label: "이유", hint: "그 물음이 궁금했던 까닭", locked: null },
    {
      key: "thoughts",
      letter: "✓",
      label: "나의 생각",
      hint: `다섯 물음 가운데 ${QMARK_MIN_PICKS}개 이상 체크하고 생각 정리하기`,
      locked: null,
    },
  ];
}

export function qmarkCellState(row, answers) {
  const a = normalizeQmarkAnswers(answers);
  if (row.key === "thoughts") {
    if (qmarkThoughtDone(a)) return "done";
    return a.picks.length > 0 || has(a.thought) ? "doing" : "empty";
  }
  const started = a.asks.filter(askStarted);
  const n = started.filter((x) => has(x[row.key])).length;
  if (n === 0) return "empty";
  return n === started.length ? "done" : "doing";
}

// ── 학급 화면에 띄울 영역 ─────────────────────────────────────
// 둘 — 물음표(궁금증 · 이유 모두) 한 장, 나의 생각(체크한 물음 + 정리 글)
// 한 장. 학생마다 물음표 개수가 달라도 '다음 학생 →'이 같은 자리를 짚도록
// 영역은 두 칸으로 못 박습니다.
export const QMARK_REGIONS = [
  {
    key: "question",
    letter: "?",
    ko: "나의 물음표",
    en: "My questions",
    prompt: "여백에 적은 물음 가운데 중요하다고 생각하는 물음과 그 이유",
  },
  {
    key: "thought",
    letter: "✓",
    ko: "나의 생각",
    en: "My thoughts",
    prompt: `다섯 물음 가운데 ${QMARK_MIN_PICKS}개 이상 골라 정리한 생각`,
  },
];

export function qmarkPickedPrompts(answers) {
  const a = normalizeQmarkAnswers(answers);
  return QMARK_PROMPTS.filter((p) => a.picks.includes(p.key));
}

export function qmarkRegionFields(answers, key) {
  const a = normalizeQmarkAnswers(answers);
  if (key === "question") {
    const started = a.asks.filter(askStarted);
    if (started.length === 0) {
      return [
        { label: "궁금증", text: "" },
        { label: "이유는", text: "" },
      ];
    }
    const many = started.length > 1;
    return started.flatMap((x, i) => [
      { label: many ? `궁금증 ${i + 1}` : "궁금증", text: x.question.trim() },
      { label: "이유는", text: x.reason.trim() },
    ]);
  }
  if (key === "thought") {
    return [
      { label: "고른 물음", text: qmarkPickedPrompts(a).map((p) => `· ${p.text}`).join("\n") },
      { label: "나의 생각", text: a.thought.trim() },
    ];
  }
  return [];
}
