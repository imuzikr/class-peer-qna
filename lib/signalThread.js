// =============================================================
// 손들기 대화(스레드) — 손든 학생과 교사가 주고받는 말
// -------------------------------------------------------------
// 대화 한 줄기 = 같은 `threadId`의 말들(classes/{cId}/signalMessages) —
// 손을 새로 들 때 첫 물음(태그·메모)이 `kind: 'first'`로 먼저 적히고, 그 뒤에
// 오간 말이 쌓입니다. 손이 올라가 있는 동안은 손들기 문서(questionSignals)가
// 첫 물음의 지금 값을 들고 있습니다. 말은 **지우지 않아** 교사가 자리표에서
// '손들고 대화한 이력'으로 다시 봅니다. 저장은 lib/data/signals.js, 규칙은
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

// 손들기 문서 → 그 대화 줄기의 id. 새 손은 `threadId`를 들고 있고, 그 값이
// 생기기 전에 든 손은 손든 시각으로 짓습니다(교사·학생이 같은 값을 얻도록
// 서버 시각만 씀). 손든 시각이 아직 안 왔으면 null.
export function threadKeyOf(signal) {
  if (!signal) return null;
  if (signal.threadId) return signal.threadId;
  const t = ms(signal.createdAt);
  return t ? `t${t}` : null;
}

// 대화 한 줄기를 시간순으로 — [{ id, from: 'student'|'teacher', text, tag, at }]
//   signal    손이 올라가 있으면 그 손들기 문서 — 첫 줄은 그 문서의 지금 값
//             (이력의 첫 물음 줄은 건너뜀). 없으면(닫힌 대화 · 이력) 첫 물음 줄.
//   messages  그 줄기의 말들(부르는 쪽이 threadId로 걸러 넘김)
//   at이 없는 말(서버 시각 전)은 방금 쓴 것이라 맨 뒤.
export function threadEntries(signal, messages = []) {
  const out = [];
  const firstMsg = messages.find((m) => m?.kind === "first");
  if (signal) {
    out.push({
      id: "first",
      from: "student",
      text: String(signal.note ?? "").trim(),
      tag: signal.tag || "",
      at: ms(signal.createdAt),
    });
  } else if (firstMsg) {
    out.push({
      id: firstMsg.id ?? "first",
      from: "student",
      text: String(firstMsg.text ?? "").trim(),
      tag: firstMsg.tag || "",
      at: ms(firstMsg.at),
      first: true,
    });
  }
  messages
    .filter((m) => m && m.kind !== "first")
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
  if (out[0] && !out[0].first && out[0].id === "first") out[0].first = true;
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

// [학생] 마지막 말을 이미 봤나 — 손바닥을 눌러 창을 연 뒤로 새 말이 없으면 봤다.
//   seenAt     손들기 문서에 적어 둔 본 시각(서버 시각)
//   seenLocal  이 기기에서 방금 본 마지막 말의 id — 서버 시각이 돌아오기
//              전(null)에도 불이 한 번 더 켜지지 않게 따로 듭니다.
export function seenLast(entries, seenAt, seenLocal = null) {
  const last = entries[entries.length - 1];
  if (!last) return true;
  if (seenLocal && seenLocal === last.id) return true;
  const seen = ms(seenAt);
  return !!(seen && last.at && seen >= last.at);
}

// [학생] 손바닥 불 — 'green'(안 본 선생님 말) · 'red'(내 말이 답을 기다림) · null.
// **손바닥을 눌러 창을 열면 불이 모두 꺼집니다**(선생님 요청) — 빨강이든
// 초록이든 그 뒤로 새 말이 오기 전까지는 아무 불도 없습니다. 대화는 '닫기'
// 전까지 열려 있어 손바닥을 누르면 다시 봅니다.
//   closed  손은 내려갔는데(교사가 닫음) 아직 못 본 선생님 말이 남은 대화
export function studentLight({ signal, entries, seenLocal, closed = false }) {
  if (closed) return lastTeacherEntry(entries) ? "green" : null;
  if (!signal) return null;
  if (seenLast(entries, signal.seenAt, seenLocal)) return null;
  const last = entries[entries.length - 1];
  return last.from === "teacher" ? "green" : "red";
}

// [교사] 한 학생의 이력 — 말들을 줄기로 묶어 **최근 줄기부터**, 줄기 안은 시간순.
//   [{ threadId, startAt, entries }]
// 첫 물음 줄이 없는 줄기(그 기능이 생기기 전 · 쓰기 실패)도 남은 말만으로 섭니다.
export function groupHistory(messages = []) {
  const byThread = new Map();
  for (const m of messages) {
    if (!m?.threadId) continue;
    if (!byThread.has(m.threadId)) byThread.set(m.threadId, []);
    byThread.get(m.threadId).push(m);
  }
  return [...byThread.entries()]
    .map(([threadId, list]) => {
      const entries = threadEntries(null, list);
      const startAt = entries.reduce((min, e) => (e.at && (!min || e.at < min) ? e.at : min), 0);
      return { threadId, startAt, entries };
    })
    .sort((a, b) => (b.startAt || Infinity) - (a.startAt || Infinity));
}
