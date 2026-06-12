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

export function getCurrentUser() {
  // TODO: 인증 연동 시 아래 한 줄을 교체
  // const u = auth.currentUser;
  // return { uid: u.uid, displayName: u.displayName ?? u.email,
  //          role: (await u.getIdTokenResult()).claims.role ?? "student" };
  return TEST_USER;
}

// 관리자 전용 UI를 보여줄지 결정하는 관문
export function isAdmin(user) {
  return user?.role === "admin" || user?.role === "teacher";
}
