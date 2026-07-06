// =============================================================
// 현재 로그인 사용자 + 역할(role)
// -------------------------------------------------------------
// 실서비스 모드(isFirebaseConfigured): 인증 리스너(lib/auth.js)가 로그인
// 상태가 바뀔 때마다 _setAuthUser()로 현재 사용자 객체를 갱신하고,
// getCurrentUser()는 그 캐시를 동기 반환합니다. 역할은 커스텀 클레임에서
// 오며(functions/setUserRole이 부여), 진짜 권한 강제는 Firestore 보안 규칙이
// request.auth.token.role을 검사하는 것으로 완성됩니다. isAdmin()은 UI 노출용.
//
// 데모 모드(Firebase 미설정): 아래 TEST_USER를 로그인된 것으로 가정합니다.
// 접속한 탭마다 세션 uid를 만들어 내 글과 남의 글을 구분하고, RoleSwitcher로
// 관리자/학생 화면을 미리 볼 수 있습니다. (실서비스에는 영향 없음)
// =============================================================
import { isFirebaseConfigured } from "./firebase";

// 인증 사용자 캐시 — lib/auth.js의 인증 리스너가 채웁니다(동기 접근용).
let _authUser = null;
export function _setAuthUser(u) {
  _authUser = u;
}

export const TEST_USER = {
  uid: "user_01",
  displayName: "테스트 유저",
  role: "admin",
  // 데모용 학번 — Google Workspace 연동 시 account.familyName(성)으로 교체됩니다.
  studentId: "30105",
};

// -------------------------------------------------------------
// 익명 닉네임 ("다급한 달팽이" 형식)
// -------------------------------------------------------------
// 실명이 드러나면 질문하기를 꺼리는 경우가 많아, 접속(세션)마다
// "형용사 + 동물" 조합의 익명 이름을 랜덤으로 만들어 사용합니다.
// - sessionStorage에 저장 → 같은 탭에서는 유지, 새로 접속하면 새 이름
// - 글의 소유자 구분은 uid로 하므로 이름이 바뀌어도 기능에는 영향 없음

const ADJECTIVES = [
  "다급한", "여유로운", "나른한", "흥겨운",
  "씩씩한", "호기심 많은", "느긋한", "재빠른",
  "수줍은", "용감한", "엉뚱한", "명랑한",
  "차분한", "신나는", "진지한", "꿈꾸는",
];

// 동물 이름과 프로필 아이콘용 이모지를 쌍으로 관리합니다
const ANIMALS = [
  { name: "달팽이", emoji: "🐌" },
  { name: "돌고래", emoji: "🐬" },
  { name: "판다", emoji: "🐼" },
  { name: "나무늘보", emoji: "🦥" },
  { name: "고슴도치", emoji: "🦔" },
  { name: "수달", emoji: "🦦" },
  { name: "펭귄", emoji: "🐧" },
  { name: "부엉이", emoji: "🦉" },
  { name: "다람쥐", emoji: "🐿️" },
  { name: "고래", emoji: "🐋" },
  { name: "여우", emoji: "🦊" },
  { name: "거북이", emoji: "🐢" },
  { name: "문어", emoji: "🐙" },
  { name: "코알라", emoji: "🐨" },
  { name: "토끼", emoji: "🐰" },
  { name: "햄스터", emoji: "🐹" },
];

const NICK_KEY = "anon_profile";
const ROLE_KEY = "dev_role_override";

// -------------------------------------------------------------
// [개발용] 역할(보기) 전환
// -------------------------------------------------------------
// 상단바의 토글로 관리자/학생 화면을 오가며 기능을 확인할 수 있습니다.
// sessionStorage에 저장되므로 탭을 닫으면 원래 역할로 돌아갑니다.
// 실제 인증을 붙이면 이 오버라이드는 제거하면 됩니다.

export function getRoleOverride() {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ROLE_KEY);
}

export function setRoleOverride(role) {
  sessionStorage.setItem(ROLE_KEY, role);
  // 화면 전체가 새 역할로 다시 그려지도록 알림 (board 페이지가 구독)
  window.dispatchEvent(new Event("role-change"));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 익명 닉네임 { name, emoji } 1개 생성 (저장 없음).
// 가입 시 users 문서에도 저장하지만(폴백용), 표시용 닉네임은
// 아래 getSessionNick()이 접속(세션)마다 새로 만듭니다.
export function makeAnonName() {
  const animal = pick(ANIMALS);
  return { name: `${pick(ADJECTIVES)} ${animal.name}`, emoji: animal.emoji };
}

// -------------------------------------------------------------
// 세션 닉네임 (실서비스) — 접속할 때마다 새 익명 이름
// -------------------------------------------------------------
// 같은 학생이라도 접속(브라우저 세션)마다 다른 닉네임이 되어
// 친구들이 글을 이어 붙여 "누군지" 추측하기 어렵게 합니다.
//  · sessionStorage: 같은 탭에서 새로고침해도 수업 중에는 이름 유지,
//    탭을 닫고 다시 접속하면 새 이름
//  · uid를 함께 저장 → 공용 PC에서 같은 탭으로 다른 학생이 로그인하면
//    이전 학생의 닉네임을 물려받지 않고 새로 생성
//  · 글의 소유·권한은 uid 기준이므로 이름이 바뀌어도 기능에는 영향 없음
const SESSION_NICK_KEY = "session_nick";

export function getSessionNick(uid) {
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_NICK_KEY) ?? "null");
    if (saved?.uid === uid && saved.name && saved.emoji) return saved;
  } catch {
    /* 손상된 저장값은 새로 생성 */
  }
  const fresh = { uid, ...makeAnonName() };
  sessionStorage.setItem(SESSION_NICK_KEY, JSON.stringify(fresh));
  return fresh;
}

// 로그아웃 시 호출 — 같은 탭에서 다시 로그인하면 새 닉네임을 받습니다.
export function clearSessionNick() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_NICK_KEY);
}

function makeSessionUid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `session_${crypto.randomUUID()}`;
  }
  return `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// 이번 접속의 익명 프로필 { name, emoji }를 반환합니다.
// 서버 렌더링 중에는 null을 반환하므로, 화면 표시는 useEffect에서 하세요.
export function getAnonProfile() {
  if (typeof window === "undefined") return null;
  try {
    const saved = sessionStorage.getItem(NICK_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.uid) return parsed;
      const migrated = { ...parsed, uid: makeSessionUid() };
      sessionStorage.setItem(NICK_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    /* 저장값이 손상된 경우 새로 생성 */
  }
  const animal = pick(ANIMALS);
  const profile = {
    uid: makeSessionUid(),
    name: `${pick(ADJECTIVES)} ${animal.name}`,
    emoji: animal.emoji,
  };
  sessionStorage.setItem(NICK_KEY, JSON.stringify(profile));
  return profile;
}

export function getCurrentUser() {
  // 실서비스(Firebase 설정됨): 인증 리스너가 채운 캐시를 반환.
  // 로그인 전/로딩 중에는 null일 수 있으므로, 보호 페이지는 가드로 막습니다.
  if (isFirebaseConfigured) {
    return _authUser;
  }
  // 데모 모드: 테스트 유저 + 익명 닉네임
  const anon = getAnonProfile();
  const role = getRoleOverride() ?? TEST_USER.role; // 개발용 보기 전환 반영
  const isTeacherRole = role === "admin" || role === "teacher";
  return {
    ...TEST_USER,
    uid: anon?.uid ?? TEST_USER.uid,
    role,
    // 교사/관리자는 익명 닉네임 대신 항상 '선생님'으로 표시
    displayName: isTeacherRole ? "선생님" : anon?.name ?? TEST_USER.displayName,
    emoji: isTeacherRole ? "🧑‍🏫" : anon?.emoji ?? "🙂",
    realName: TEST_USER.displayName,
    studentId: TEST_USER.studentId ?? null,
  };
}

// 관리자 전용 UI를 보여줄지 결정하는 관문
export function isAdmin(user) {
  return user?.role === "admin" || user?.role === "teacher";
}
