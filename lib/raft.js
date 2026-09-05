// =============================================================
// RAFT 글쓰기 활동 — 네 요소 정의
// -------------------------------------------------------------
// 책을 읽은 뒤 '누가(Role) · 누구에게(Audience) · 어떤 글로(Format) ·
// 무엇에 대해(Topic)'를 정하고 그대로 글을 써 보는 독서 후 쓰기 전략입니다.
// 역할을 사람이 아닌 것(구름·빗물 한 방울 등)으로 잡으면 관점이 바뀌면서
// 읽은 내용을 더 깊이 풀어내게 됩니다.
//
// 곁텍스트 읽기와 같은 개인 활동이라 저장 위치도 같습니다
// (bookActivities/{actId}/entries/{uid}). 다만 항목이 넷뿐이라
// 모달을 거치지 않고 4열 화면에서 곧바로 씁니다.
// =============================================================

import { iGa } from "./korean";
import { DONE_MIN_CHARS } from "./activities";

// 글쓰기 칸이 '충분히 썼다'가 되는 선. 공부방 활동 칸의 기준을 그대로
// 씁니다 — 이 앱에서 그 선은 한 곳에만 있어야 합니다.
export const RAFT_WRITING_MIN = DONE_MIN_CHARS;

export const RAFT_COLUMNS = [
  {
    key: "role",
    letter: "R",
    en: "Role",
    ko: "역할",
    prompt: "누가 쓰나요?",
    hint: "책 속 인물, 또는 사물·현상이 되어 봐도 좋아요",
    placeholder: "예: 구름 / 빗물 한 방울 / 과학자 선생님",
  },
  {
    key: "audience",
    letter: "A",
    en: "Audience",
    ko: "청중",
    prompt: "누구에게 쓰나요?",
    hint: "읽을 사람에 따라 말투가 달라집니다",
    placeholder: "예: 초등학생 친구들 / 시장님 / 미래의 나",
  },
  {
    key: "format",
    letter: "F",
    en: "Format",
    ko: "형식",
    prompt: "어떤 글로 쓰나요?",
    hint: "아래에서 골라도 되고 직접 적어도 됩니다",
    placeholder: "예: 일기 / 편지 / 뉴스 기사",
  },
  {
    key: "topic",
    letter: "T",
    en: "Topic",
    ko: "주제",
    prompt: "무엇에 대해 쓰나요?",
    hint: "책에서 고른 내용 한 가지",
    placeholder: "예: 내가 하늘에서 땅으로 내려오는 여행(물의 순환)",
  },
];

// 형식은 학생이 떠올리기 어려워해서 자주 쓰는 것을 눌러 넣게 합니다.
export const RAFT_FORMATS = [
  "일기", "편지", "뉴스 기사", "인터뷰", "광고",
  "연설문", "시", "안내문", "일지", "만화 대본",
];

// 네 요소를 정한 뒤 실제로 쓰는 글 — 이 활동의 결과물입니다.
export const RAFT_WRITING = {
  key: "writing",
  ko: "글쓰기",
  prompt: "위에서 정한 대로 글을 써 보세요.",
  placeholder:
    "예) 오늘은 내가 구름이 되어 하늘을 떠다녔어. 초등학생 친구들에게 일기처럼 적어 볼게…",
};

export const RAFT_COLUMN_COUNT = RAFT_COLUMNS.length; // 4

export const RAFT_FIELD_KEYS = [
  ...RAFT_COLUMNS.map((c) => c.key),
  RAFT_WRITING.key,
];

export function emptyRaftAnswers() {
  return Object.fromEntries(RAFT_FIELD_KEYS.map((k) => [k, ""]));
}

function val(answers, key) {
  return String(answers?.[key] ?? "").trim();
}

// 네 요소 중 몇 개를 채웠는지 (계획 진행률)
export function raftPlanCount(answers = {}) {
  return RAFT_COLUMNS.filter((c) => val(answers, c.key).length > 0).length;
}

export function raftPlanDone(answers = {}) {
  return raftPlanCount(answers) === RAFT_COLUMN_COUNT;
}

export function raftWritingChars(answers = {}) {
  return val(answers, RAFT_WRITING.key).length;
}

// 네 요소를 다 정하고 글까지 썼을 때만 '다 함'으로 봅니다.
export function raftDone(answers = {}) {
  return raftPlanDone(answers) && raftWritingChars(answers) > 0;
}

export function raftStarted(answers = {}) {
  return RAFT_FIELD_KEYS.some((k) => val(answers, k).length > 0);
}

// 정한 네 요소를 한 문장으로 이어 붙입니다 — 학생이 'RAFT가 뭘 하는 건지'를
// 눈으로 바로 알게 해 주는 장치입니다. 아직 안 정한 칸은 밑줄로 남겨 둡니다.
export function raftSentence(answers = {}) {
  const blank = "____";
  const role = val(answers, "role") || blank;
  const audience = val(answers, "audience") || blank;
  const format = val(answers, "format") || blank;
  const topic = val(answers, "topic") || blank;
  return `나는 ${iGa(role)} 되어, ${audience}에게, ${format} 형식으로, ${topic}에 대해 씁니다.`;
}

// ── 전광판·진행 패널이 함께 쓰는 줄 정의 ──────────────────────
// **다섯 줄입니다** — 네 요소는 계획이고 글쓰기가 결과물이라, 넷만 보여 주면
// '다 정해 놓고 아직 안 쓴 학생'이 다 한 것처럼 보입니다.
// 잠금 개념이 없는 활동이라 `locked`는 null입니다(배지 칸을 통째로 뺍니다).
export function raftRows() {
  return [
    ...RAFT_COLUMNS.map((c) => ({
      key: c.key,
      letter: c.letter,
      label: c.ko,
      hint: c.prompt,
      locked: null,
      writing: false,
    })),
    {
      key: RAFT_WRITING.key,
      // 글쓰기에는 RAFT 글자가 없습니다. 억지로 한 글자를 만들어 넣으면
      // 네 요소의 R·A·F·T와 같은 무게로 읽혀 다섯 요소처럼 보입니다.
      letter: "",
      label: RAFT_WRITING.ko,
      hint: RAFT_WRITING.prompt,
      locked: null,
      writing: true,
    },
  ];
}

// R·A·F·T는 짧은 한 칸이라 썼거나 안 썼거나 둘뿐입니다. 글쓰기만 '쓰는 중'이
// 있고, 기준은 공부방이 이미 쓰는 값을 그대로 씁니다 — 이 앱에서 '충분히
// 썼다'는 선은 한 곳에만 있어야 합니다.
export function raftCellState(row, answers = {}) {
  if (row.writing) {
    const n = raftWritingChars(answers);
    if (n >= RAFT_WRITING_MIN) return "done";
    return n > 0 ? "doing" : "empty";
  }
  return String(answers[row.key] ?? "").trim() ? "done" : "empty";
}
