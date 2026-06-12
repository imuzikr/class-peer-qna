// =============================================================
// 현재 로그인 사용자 + 역할(role)
// -------------------------------------------------------------
// [개발 단계] 실제 로그인 기능을 붙이기 전까지는 아래 테스트 유저가
// 로그인되어 있다고 가정합니다. 모든 질문/답변/공지 데이터는 이
// 유저의 uid(user_01)로 저장됩니다.
//
// role: "admin" | "teacher" | "student"
//  - 개발 중에는 모든 기능을 확인할 수 있도록 admin으로 둡니다.
//  - 화면의 관리자 전용 버튼은 isAdmin()으로 감싸 두었으므로,
//    학생 화면을 미리 보고 싶으면 role을 "student"로 바꿔 보세요.
//
// [나중에 인증 연동 시]
//  - getCurrentUser()가 auth.currentUser의 uid/displayName과
//    커스텀 클레임의 role을 반환하도록 고치면 됩니다.
//    (functions/index.js의 setUserRole이 role 클레임을 부여합니다)
//  - 진짜 보안은 Firestore 보안 규칙이 request.auth.token.role을
//    검사하는 것으로 완성됩니다. isAdmin은 화면 정리용입니다.
// =============================================================

export const TEST_USER = {
  uid: "user_01",
  displayName: "테스트 유저",
  role: "admin",
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

// 이번 접속의 익명 프로필 { name, emoji }를 반환합니다.
// 서버 렌더링 중에는 null을 반환하므로, 화면 표시는 useEffect에서 하세요.
export function getAnonProfile() {
  if (typeof window === "undefined") return null;
  try {
    const saved = sessionStorage.getItem(NICK_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    /* 저장값이 손상된 경우 새로 생성 */
  }
  const animal = pick(ANIMALS);
  const profile = {
    name: `${pick(ADJECTIVES)} ${animal.name}`,
    emoji: animal.emoji,
  };
  sessionStorage.setItem(NICK_KEY, JSON.stringify(profile));
  return profile;
}

export function getCurrentUser() {
  // TODO: 인증 연동 시 아래 한 줄을 교체
  // const u = auth.currentUser;
  // return { uid: u.uid, displayName: u.displayName ?? u.email,
  //          role: (await u.getIdTokenResult()).claims.role ?? "student" };
  // - displayName: 화면에 보이는 익명 닉네임
  // - realName:    실제 이름 (관리자가 프로필 클릭 시 확인용)
  // - emoji:       프로필 동그라미 아바타에 쓰는 동물 이모지
  const anon = getAnonProfile();
  return {
    ...TEST_USER,
    role: getRoleOverride() ?? TEST_USER.role, // 개발용 보기 전환 반영
    displayName: anon?.name ?? TEST_USER.displayName,
    emoji: anon?.emoji ?? "🙂",
    realName: TEST_USER.displayName,
  };
}

// 관리자 전용 UI를 보여줄지 결정하는 관문
export function isAdmin(user) {
  return user?.role === "admin" || user?.role === "teacher";
}
