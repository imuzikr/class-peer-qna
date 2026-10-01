// =============================================================
// 손들기 답변 — 교사가 손든 학생에게 남기는 한 마디
// -------------------------------------------------------------
// 자료는 classes/{classId}/signalReplies/{학생 uid} — 학생마다 **가장 최근
// 답변 한 장**입니다. 손들기 문서(questionSignals)에 적지 않는 까닭: 그 문서는
// 교사가 '확인'·'닫기'를 누르는 순간 지워져, 학생이 읽기도 전에 답이 함께
// 사라집니다. 저장은 lib/data/signals.js, 규칙은 firestore.rules의 signalReplies.
//
// 여기는 화면이 쓰는 순수한 셈뿐입니다(시험 tests/unit/signalReplies.test.mjs).
// =============================================================

// 답변 길이 — 규칙(firestore.rules의 signalReplyOk)과 같은 값이어야 합니다.
export const SIGNAL_REPLY_MAX = 1000;

// Firestore Timestamp · Date · 숫자 → 밀리초(없으면 0)
function ms(v) {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

// 이 답변이 **지금 든 손**에 대한 것인가 — 답변에 손든 시각(raisedAt)을 함께
// 적어 두고 견줍니다. 학생이 손을 내렸다 다시 들면 시각이 바뀌어, 지난 손에
// 단 답이 새 손에 '답변함'으로 붙지 않습니다.
export function replyMatchesSignal(reply, signal) {
  if (!reply || !signal) return false;
  const a = ms(reply.raisedAt);
  return a > 0 && a === ms(signal.createdAt);
}

// 학생이 아직 안 읽은 답변인가 — 손바닥의 빨간 불.
//   seenLocal  이 기기에서 방금 읽은 답의 시각(ms). 읽음은 서버 시각
//              (serverTimestamp)으로 적어, 서버가 답하기 전까지 seenAt이 null로
//              옵니다 — 그 사이 불이 한 번 더 켜지지 않게 따로 듭니다.
export function isSignalReplyUnread(reply, seenLocal = null) {
  if (!reply || !String(reply.text ?? "").trim()) return false;
  if (reply.seenAt) return false;
  const at = ms(reply.at);
  if (seenLocal != null && at > 0 && seenLocal === at) return false;
  return true;
}

// 답변이 가리키는 답의 시각(ms) — 읽음 표시(seenLocal)에 씁니다.
export function signalReplyTime(reply) {
  return ms(reply?.at);
}

// 같은 날인가(기기 시각 기준) — '다시 질문'은 그날 안에서만 잇습니다.
// 어제 받은 답에 오늘 새로 든 손을 '다시 질문'이라 부르면 엉뚱한 맥락이 붙습니다.
function sameDay(a, b) {
  if (!a || !b) return false;
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear()
    && x.getMonth() === y.getMonth()
    && x.getDate() === y.getDate();
}

// [학생] 지금 '다시 질문하기'를 보여 줄 답인가 — 오늘 받은 답이 있고,
// 손이 내려가 있거나 **그 답이 지금 든 손에 대한 것**일 때(아직 다시 묻지 않음).
// 이미 다시 물어 새 손이 올라가 있으면 그 손을 고치는 것이 맞습니다.
export function canFollowUp(reply, signal, now = Date.now()) {
  if (!reply || !String(reply.text ?? "").trim()) return false;
  const at = ms(reply.at) || now; // 서버 시각 전(null)이면 방금 온 답
  if (!sameDay(at, now)) return false;
  return !signal || replyMatchesSignal(reply, signal);
}

// [교사] 이 손이 **다시 질문**인가 — 같은 날 먼저 단 답이 있고, 그 답이 지금
// 손보다 앞선 것. 그 답을 '지난 답변'으로 함께 보여 줘 무엇에 이어 묻는지 알게
// 합니다. 손든 시각이 서버 시각 전(null)이면 방금 든 손으로 봅니다.
export function isFollowUpSignal(reply, signal, now = Date.now()) {
  if (!reply || !signal || !String(reply.text ?? "").trim()) return false;
  if (replyMatchesSignal(reply, signal)) return false;
  const raised = ms(signal.createdAt) || now;
  const at = ms(reply.at);
  return at > 0 && at <= raised && sameDay(at, raised);
}
