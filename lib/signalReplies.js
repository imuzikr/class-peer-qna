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
