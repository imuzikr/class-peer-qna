// =============================================================
// 돌발 퀴즈 — 셈만 모은 곳(순수 함수)
// -------------------------------------------------------------
// 교사가 수업 중에 갑자기 묻는 한 문제. 반마다 **열린 퀴즈는 하나**이고,
// 새로 보내면 앞의 것이 닫힙니다. 학생은 글이나 코드로 답해 '선생님께
// 보내기'를 누르고, 교사는 자리표에서 그 답을 열어 과일을 주거나 '반송'
// 합니다. 반송된 학생은 다시 고쳐 보내고, 과일을 받으면 그 학생의 퀴즈는
// 끝납니다.
//
// 자료(lib/data/popQuiz.js)
//   classes/{cId}/popQuizzes/{qId}
//     = { classId, kind('text'|'code'), title, desc, boardId, boardTitle,
//         byUid, open, createdAt, closedAt }
//   classes/{cId}/popQuizzes/{qId}/submissions/{uid}
//     = { classId, quizId, uid, kind, text, output, status, submittedAt,
//         returnNote?, reviewedAt?, reviewedBy? }
//   status: 'submitted'(보냄 · 선생님 확인 전) · 'returned'(반송 — 다시 보낼 수
//   있음) · 'rewarded'(과일을 받음 — 끝)
//
// 이 파일에 둔 것은 **화면 두 곳이 같은 판정을 써야 하는 것**들입니다 —
// 학생 상단바의 불과 학생 창의 '보내기'가 다른 판정을 쓰면, 불은 꺼졌는데
// 보낼 수 있다고 하거나 그 반대가 됩니다. 규칙(firestore.rules)의 천장 값도
// 여기 상수와 같아야 합니다.
// =============================================================

export const QUIZ_KINDS = [
  { key: "text", label: "글" },
  { key: "code", label: "코드" },
];
export const QUIZ_TITLE_MAX = 200;
export const QUIZ_DESC_MAX = 5000;
export const QUIZ_ANSWER_MAX = 20000;
export const QUIZ_OUTPUT_MAX = 10000;
export const QUIZ_NOTE_MAX = 500;

export const quizKindOf = (kind) => (kind === "code" ? "code" : "text");
export const quizKindLabel = (kind) => (quizKindOf(kind) === "code" ? "코드" : "글");

// 학생이 지금 보낼 수 있는가 — 퀴즈가 열려 있고, 아직 안 보냈거나 반송됐을 때.
// 보낸 뒤(선생님 확인 전) · 과일을 받은 뒤에는 못 고칩니다.
export function canSubmitQuiz(quiz, answer) {
  if (!quiz?.open) return false;
  return !answer || answer.status === "returned";
}

// 학생 상단바 메모지의 불(선생님 요청).
//   빨강 — 퀴즈가 열려 있는데 아직 안 보냄
//   초록 — 퀴즈가 열려 있는데 반송됨(다시 보내 달라는 뜻)
//   그 밖(보냄 · 과일 받음 · 열린 퀴즈 없음)에는 불을 켜지 않습니다.
// 반송된 퀴즈가 닫혔으면 더 보낼 수 없으므로 초록도 끕니다.
export function studentQuizLight(quiz, answer) {
  if (!quiz?.open) return null;
  if (!answer) return "red";
  if (answer.status === "returned") return "green";
  return null;
}

// 처음 한 번만 저절로 엽니다 — 이 기기에서 아직 본 적 없는 열린 퀴즈이고,
// 아직 답하지 않았을 때. 반송은 초록 불로만 알립니다(선생님 요청).
export function shouldAutoOpenQuiz(quiz, answer, seenId) {
  return !!quiz?.open && quiz.id !== seenId && !answer;
}

// 교사 자리표의 칸 모습.
//   'memo' — 보냈는데 아직 확인 전(메모지 그림)
//   'done' — 과일을 줌(초록 바탕)
//   반송했거나 안 보낸 학생은 아무 표시가 없습니다(선생님 요청 — 반송은
//   '미제출처럼').
export function seatQuizState(answer) {
  if (answer?.status === "submitted") return "memo";
  if (answer?.status === "rewarded") return "done";
  return null;
}

// 지금 명단 기준의 셈 — 반에서 빠진 학생의 답은 세지 않습니다(분자가 분모를
// 넘지 않게). sent는 '보낸 적이 있고 반송 상태가 아닌' 학생입니다.
export function quizCounts(answers = [], rosterUids = []) {
  const inRoster = new Set(rosterUids);
  let pending = 0;
  let returned = 0;
  let rewarded = 0;
  for (const a of answers) {
    if (!inRoster.has(a.uid)) continue;
    if (a.status === "submitted") pending += 1;
    else if (a.status === "returned") returned += 1;
    else if (a.status === "rewarded") rewarded += 1;
  }
  return { total: inRoster.size, sent: pending + rewarded, pending, returned, rewarded };
}

// 열린 퀴즈 가운데 가장 최근 것 — 보낼 때 앞의 것을 닫지만, 그 쓰기가
// 엇갈려 둘이 열려 있어도 화면은 하나만 봅니다.
export function pickOpenQuiz(list = []) {
  const open = list.filter((q) => q?.open);
  if (!open.length) return null;
  return [...open].sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt))[0];
}

// 최근 것이 위 — 서버 시각이 아직 없으면(방금 보낸 것) '지금'으로 셉니다.
export function sortQuizzes(list = []) {
  return [...list].sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt));
}

function timeOf(v) {
  if (!v) return Date.now();
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : Date.now();
}

// 설명 글 — ``` 로 감싼 곳은 코드 블록으로 그립니다. 설명에 예시 코드를
// 붙여 묻는 일이 잦아(코드 퀴즈), 칸을 따로 두지 않고 마크다운 쓰는 손을
// 그대로 받습니다. 닫는 ```가 없으면 끝까지 코드로 봅니다.
export function splitQuizDesc(desc = "") {
  const text = String(desc ?? "");
  if (!text.trim()) return [];
  const parts = [];
  const re = /```[^\n]*\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ type: "text", text: text.slice(last, m.index) });
    parts.push({ type: "code", text: m[1].replace(/\n$/, "") });
    last = re.lastIndex;
    if (m[0].length === 0) break;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts
    .map((p) => (p.type === "text" ? { ...p, text: p.text.replace(/^\n+|\n+$/g, "") } : p))
    .filter((p) => p.text.trim() !== "");
}

// 보낼 만한 답인가 — 글은 태그를 걷고 글자가 있어야, 코드는 공백이 아니어야.
export function quizAnswerFilled(kind, text) {
  const raw = String(text ?? "");
  if (quizKindOf(kind) === "code") return raw.trim() !== "";
  return raw.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() !== ""
    || /<img\b/i.test(raw);
}
