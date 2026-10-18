// =============================================================
// 간편 메신저 — 순수 셈 (방 열쇠 · 정렬 · 안 읽은 수 · 시각 글자)
// -------------------------------------------------------------
// 읽고 쓰기는 lib/data/messenger.js, 그리기는 components/MessengerWindow.jsx.
// 여기는 Firebase를 안 가져와 tests/unit이 그대로 읽습니다.
//
// [방은 둘 — 선생님 ↔ 학생 1:1 · 기본 모둠]
//  · `dm_<학생 uid>` — 그 학생과 담당 선생님의 대화.
//  · `grp_<모둠 id>` — 반 기본 모둠(groupAssignments/default)의 모둠원과 선생님.
//    모둠 id(`group_1` …)는 모둠을 다시 짜도 그대로라 방이 안 섞입니다.
// 학생끼리의 1:1은 없습니다 — 그 자리는 '우리 모둠'의 모둠 메모입니다.
// 대화는 **선생님이 모두 볼 수 있습니다**(창에 그 사실을 적어 둡니다).
// =============================================================
import { memoTime } from "./memoThreads";

export const CHAT_TEXT_MAX = 1000; // 규칙의 text.size() 천장과 같아야 합니다
// 서식 글(굵게 · 목록 · 체크 · 코드 블록)의 HTML 천장 — 규칙의 html.size()와 같아야 합니다.
// 글자만 따진 `text`(미리보기 · 안 읽은 줄)는 위 천장을 따로 지킵니다.
export const CHAT_HTML_MAX = 4000;
export const CHAT_NOTICE_LIMIT = 3; // 메신저에 띄우는 최근 반 공지 수
export const CHAT_NAME_MAX = 40;
export const CHAT_TEACHER_LIMIT = 300; // 교사가 반 전체에서 받는 최근 말 수

export const dmRoom = (studentUid) => `dm_${studentUid}`;
export const groupRoom = (groupId) => `grp_${groupId}`;
export const isDmRoom = (room) => typeof room === "string" && room.startsWith("dm_");
export const isGroupRoom = (room) => typeof room === "string" && room.startsWith("grp_");

// 서버 시각 전(null)은 '지금' — 방금 보낸 말이 맨 아래에 섭니다(모둠 메모와 같은 약속).
export const chatTime = (at) => memoTime(at);

// 한 방의 말 — 오래된 것이 앞.
export function roomMessages(messages = [], room) {
  return messages
    .filter((m) => m.room === room)
    .sort((a, b) => chatTime(a.at) - chatTime(b.at));
}

// 그 방의 가장 최근 말(없으면 null).
export function lastMessage(messages = [], room) {
  let last = null;
  for (const m of messages) {
    if (m.room !== room) continue;
    if (!last || chatTime(m.at) >= chatTime(last.at)) last = m;
  }
  return last;
}

// '어디까지 봤나'의 표시 — 그 방 말 가운데 서버 시각이 가장 늦은 것.
// 내 시계(Date.now)가 아니라 서버 시각으로 적어야, 기기 시계가 틀려도
// 새 말이 '읽음'으로 묻히지 않습니다. 아직 시각이 없는 말(방금 보낸 내 말)은 셈에서 뺍니다.
export function roomSeenMark(messages = [], room) {
  let mark = 0;
  for (const m of messages) {
    if (m.room !== room || !m.at) continue;
    const t = chatTime(m.at);
    if (t > mark) mark = t;
  }
  return mark;
}

// 안 읽은 말 수 — 남이 보낸 것 가운데 표시보다 늦은 것.
export function unreadCount(messages = [], room, myUid, seenMs = 0) {
  let n = 0;
  for (const m of messages) {
    if (m.room !== room || m.fromUid === myUid || !m.at) continue;
    if (chatTime(m.at) > (seenMs || 0)) n += 1;
  }
  return n;
}

// 여러 방의 안 읽은 수 합 — 떠 있는 단추의 배지.
export function totalUnread(messages = [], rooms = [], myUid, seen = {}) {
  return rooms.reduce((sum, room) => sum + unreadCount(messages, room, myUid, seen?.[room] ?? 0), 0);
}

// 대화 목록 — 화면에 설 줄들.
//  교사: 모둠 대화(모둠 차례) → 학생 대화(학번순 명단 차례)
//  학생: 우리 모둠(있으면) → 선생님
// 줄마다 { room, kind, title, sub, last, unread }. 최근 말 차례로 다시 세우지
// 않습니다 — 줄이 자꾸 자리를 바꾸면 늘 누르던 학생을 다시 찾아야 합니다.
export function buildChatRooms({ isTeacher, myUid, groups = [], roster = [], messages = [], seen = {} }) {
  const line = (room, kind, title, sub) => ({
    room,
    kind,
    title,
    sub,
    last: lastMessage(messages, room),
    unread: unreadCount(messages, room, myUid, seen?.[room] ?? 0),
  });
  if (isTeacher) {
    const groupRows = groups
      .filter((g) => g?.id)
      .map((g) => line(groupRoom(g.id), "group", g.name || "모둠", `${(g.memberUids ?? []).length}명`));
    const dmRows = roster.map((s) =>
      line(dmRoom(s.uid), "dm", s.name || "이름 미설정", s.studentId || "")
    );
    // 명단 · 모둠에 없는데 말이 남아 있는 방 — 반에서 빠진 학생, 다시 짠
    // 모둠의 옛 방. 기록이 화면에서 사라지지 않게 목록 끝에 세웁니다.
    const known = new Set([...groupRows, ...dmRows].map((r) => r.room));
    const extra = new Map();
    for (const m of messages) {
      if (!m.room || known.has(m.room)) continue;
      const prev = extra.get(m.room);
      // 1:1 방의 이름은 학생이 보낸 말의 이름표에서
      const name = m.fromRole === "student" ? m.fromName : prev?.name;
      extra.set(m.room, { name: name || prev?.name || "" });
    }
    for (const [room, { name }] of extra) {
      if (isGroupRoom(room)) groupRows.push(line(room, "group", "지난 모둠", "지금은 없는 모둠"));
      else if (isDmRoom(room)) dmRows.push(line(room, "dm", name || "학생", "지금 명단에 없음"));
    }
    return { groups: groupRows, people: dmRows };
  }
  const mine = groups.filter((g) => g?.id && (g.memberUids ?? []).includes(myUid));
  return {
    groups: mine.map((g) =>
      line(groupRoom(g.id), "group", g.name || "우리 모둠", `${(g.memberUids ?? []).length}명 · 선생님과 함께`)
    ),
    people: myUid ? [line(dmRoom(myUid), "dm", "선생님", "나와 선생님의 대화")] : [],
  };
}

// 말 옆의 시각 — 오늘이면 '오전 9:18', 어제면 '어제 오후 3:02', 그 전이면 '9월 25일'.
export function chatTimeLabel(ms, now = Date.now()) {
  if (!ms) return "";
  const d = new Date(ms);
  const n = new Date(now);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const h = d.getHours();
  const clock = `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (sameDay(d, n)) return clock;
  const y = new Date(n);
  y.setDate(n.getDate() - 1);
  if (sameDay(d, y)) return `어제 ${clock}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 보낼 글 다듬기 — 앞뒤 공백을 걷고 천장에서 자릅니다. 빈 글이면 "".
export function cleanChatText(text) {
  return String(text ?? "").trim().slice(0, CHAT_TEXT_MAX);
}

// 서식 글에서 미리보기용 글자만 — 태그를 걷고 줄바꿈 자리를 띄어 씁니다.
// (lib/html.js의 stripHtml과 같은 셈 — 이 파일은 시험이 곧바로 읽어야 해서 따로 둡니다)
export function chatPlainText(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
