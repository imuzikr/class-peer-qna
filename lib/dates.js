// =============================================================
// 날짜·시각 — Firebase 없이 도는 순수 함수
// -------------------------------------------------------------
// 원래 lib/store.js 안에 있던 것을 옮겼습니다. store.js는 Firestore를
// import하므로, 거기 두면 이 몇 줄을 시험하려고 해도 Firebase까지 끌려와
// 시험이 소스를 정규식으로 잘라 내야 했습니다(tests/ui/rewardTiming).
//
// **store.js가 같은 이름으로 다시 내보냅니다** — `import { toDate } from
// "@/lib/store"`로 쓰던 자리는 그대로 둬도 됩니다. 새로 쓰는 자리는 이
// 파일에서 곧바로 가져오세요.
// =============================================================

// Firestore Timestamp와 일반 Date를 모두 Date로 변환
export function toDate(value) {
  if (!value) return new Date();
  if (typeof value.toDate === "function") return value.toDate();
  return value instanceof Date ? value : new Date(value);
}

// 'YYYY-MM-DD' — 기기 시간대 기준의 '오늘'. 출석·자리표·수업 노트의
// 문서 ID가 모두 이 값을 씁니다.
export function todayDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// -------------------------------------------------------------
// 표시용 시간 포맷 ("방금 전", "5분 전" 등)
// -------------------------------------------------------------
export function formatTime(value) {
  const date = toDate(value);
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;
  return date.toLocaleDateString("ko-KR");
}

// -------------------------------------------------------------
// 밀리초까지 보이는 시각 — 출석 기록 전용
// -------------------------------------------------------------
// `serverTimestamp()`는 초·나노초 두 칸이라 1/1000초는 **처음부터 저장돼
// 있었습니다**. 잘리던 곳은 두 군데였습니다 — `toDate()`가 주는 JS Date가
// 밀리초까지만 담고(나노초는 여기서 버려짐), 화면은 시·분만 찍었습니다.
// 그래서 저장도 규칙도 안 건드리고 **읽어서 그리는 자리만** 고칩니다.
//
// **`fractionalSecondDigits`를 쓰지 않습니다** — ES2021 옵션이라 오래된
// 기기에서 조용히 무시되면 그 화면에서만 밀리초가 사라집니다. 세 자리를
// 손으로 붙이면 어디서나 같은 글자가 나옵니다.
//
// **값이 없으면 빈 문자열입니다.** `toDate(null)`은 '지금'을 돌려주는데,
// 방금 찍은 기록은 서버가 답하기 전까지 이 칸이 null이라 그대로 두면
// **지어낸 밀리초**가 화면에 찍힙니다(부르는 쪽이 '-'로 받습니다).
function msOf(date) {
  return String(date.getMilliseconds()).padStart(3, "0");
}

// 09:03:07.048 — 자리표처럼 날짜가 이미 정해진 화면용
export function formatClockMs(value) {
  if (value == null || value === "") return "";
  const date = toDate(value);
  const clock = date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${clock}.${msOf(date)}`;
}

// 2026. 09. 22. 09:03:07.048 — 날짜까지 함께 보는 표용
export function formatStampMs(value) {
  if (value == null || value === "") return "";
  const date = toDate(value);
  const day = date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${day} ${formatClockMs(value)}`;
}
