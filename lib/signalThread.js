// =============================================================
// 손들기 대화(스레드) — 손든 학생과 교사가 주고받는 말
// -------------------------------------------------------------
// 대화 한 줄기 = 손들기 문서(classes/{cId}/questionSignals/{학생 uid})의 첫
// 물음(태그·메모) + 그 뒤에 오간 말(classes/{cId}/signalMessages/{자동 id},
// `uid` = 그 학생). 교사가 '확인'·'닫기'로 손을 내릴 때까지 학생·교사 모두
// 이 줄기 전체를 **시간순**으로 봅니다. 저장은 lib/data/signals.js, 규칙은
// firestore.rules의 signalMessages.
//
// 여기는 화면이 쓰는 순수한 셈뿐입니다(시험 tests/unit/signalThread.test.mjs).
// =============================================================

// 한 마디의 길이 — 규칙(signalMessageOk)과 같은 값이어야 합니다.
export const SIGNAL_MESSAGE_MAX = 1000;

// Firestore Timestamp · Date · 숫자 → 밀리초(없으면 0)
export function ms(v) {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

// 이 말이 지금 손(signal)의 대화에 속하나 — 손든 시각 이후에 적힌 것.
// 지난 대화의 말이 남아 있어도(학생이 아직 못 읽은 채 닫힌 대화 등) 새 손에
// 섞이지 않게 거릅니다. 서버 시각 전(null)인 말은 방금 쓴 것이라 넣습니다.
function belongs(msg, signal) {
  if (!signal) return true;
  const start = ms(signal.createdAt);
  const at = ms(msg.at);
  return !start || !at || at >= start;
}

// 대화 한 줄기를 시간순으로 — [{ id, from: 'student'|'teacher', text, tag, at }]
//   첫 줄은 손들기 문서의 물음(id 'first'). 손이 없으면(닫힌 대화) 남은 말만.
//   at이 없는 말(서버 시각 전)은 방금 쓴 것이라 맨 뒤.
export function threadEntries(signal, messages = []) {
  const out = [];
  if (signal) {
    out.push({
      id: "first",
      from: "student",
      text: String(signal.note ?? "").trim(),
      tag: signal.tag || "",
      at: ms(signal.createdAt),
    });
  }
  messages
    .filter((m) => m && belongs(m, signal))
    .map((m, i) => ({
      id: m.id ?? `m${i}`,
      from: m.from === "teacher" ? "teacher" : "student",
      text: String(m.text ?? ""),
      tag: "",
      at: ms(m.at),
      _i: i,
    }))
    .sort((a, b) => (a.at || Infinity) - (b.at || Infinity) || a._i - b._i)
    .forEach(({ _i, ...m }) => out.push(m));
  return out;
}

// 마지막 교사의 말(없으면 null)
export function lastTeacherEntry(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].from === "teacher") return entries[i];
  }
  return null;
}

// [교사] 이 대화가 교사의 답을 기다리나 — 마지막 말이 학생의 것.
export function awaitsTeacher(entries) {
  return entries.length > 0 && entries[entries.length - 1].from === "student";
}

// [학생] 마지막 교사의 말을 아직 안 읽었나.
//   seenAt     손들기 문서에 적어 둔 읽은 시각(서버 시각)
//   seenLocal  이 기기에서 방금 읽은 교사 말의 id — 서버 시각이 돌아오기
//              전(null)에도 불이 한 번 더 켜지지 않게 따로 듭니다.
export function unreadByStudent(entries, seenAt, seenLocal = null) {
  const last = lastTeacherEntry(entries);
  if (!last) return false;
  if (seenLocal && seenLocal === last.id) return false;
  const seen = ms(seenAt);
  return !(seen && last.at && seen >= last.at);
}

// [학생] 손바닥 불 — 'green'(안 읽은 선생님 말) · 'red'(내 말이 답을 기다림) · null.
// 선생님 말을 읽고 나면 **불이 모두 꺼집니다**(대화는 열린 채) — 선생님 요청.
//   closed  손은 내려갔는데(교사가 닫음) 아직 못 읽은 선생님 말이 남은 대화
export function studentLight({ signal, entries, seenLocal, closed = false }) {
  if (closed) return lastTeacherEntry(entries) ? "green" : null;
  if (!signal) return null;
  if (unreadByStudent(entries, signal.seenAt, seenLocal)) return "green";
  if (awaitsTeacher(entries)) return "red";
  return null;
}
