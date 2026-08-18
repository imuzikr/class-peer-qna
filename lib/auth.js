"use client";

// =============================================================
// 인증 (Firebase Authentication) — 이메일/비밀번호 + 구글
// -------------------------------------------------------------
// · 회원가입/로그인/로그아웃, 구글 로그인
// · 로그인 시 users/{uid} 프로필 문서를 보장(없으면 생성)
// · 역할(role)은 커스텀 클레임에서 읽음(functions/setUserRole가 부여).
//   초기 관리자 이메일은 클레임이 없어도 admin으로 부트스트랩.
// · 앱 전역의 동기 getCurrentUser()를 위해, 인증 상태가 바뀌면
//   lib/user.js의 _setAuthUser()로 현재 사용자 캐시를 갱신합니다.
// =============================================================
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  getAdditionalUserInfo,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import {
  _setAuthUser,
  makeAnonName,
  getSessionNick,
  clearSessionNick,
  splitWorkspaceName,
} from "./user";

const INITIAL_ADMIN_EMAIL = "iseoul72@gmail.com";

// 학생 가입을 제한하는 학교 이메일 도메인('@' 없이). 관리자 화면의 과일 기록
// 정리(REWARD_DOMAIN)도 이 값을 그대로 씁니다 — 두 곳에 따로 적어 두면
// 나중에 하나만 고쳐 어긋나기 쉬우므로 여기 한 곳만 소스로 둡니다.
export const SCHOOL_EMAIL_DOMAIN = "hansung.hs.kr";

function isSchoolEmail(email) {
  return (email || "").toLowerCase().trim().endsWith(`@${SCHOOL_EMAIL_DOMAIN}`);
}

// users/{uid} 프로필 보장 — 없으면 생성하고 데이터를 반환합니다.
export async function ensureUserProfile(fbUser, extra = {}) {
  const ref = doc(db, "users", fbUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const anon = makeAnonName();
  const emailPrefix = (fbUser.email || "").split("@")[0];
  // 학교 워크스페이스 계정 이름("21031홍길동")이면 학번·이름을 자동 분리
  const rawName =
    extra.realName || fbUser.displayName || emailPrefix || "이름 미설정";
  const ws = splitWorkspaceName(rawName);
  const profile = {
    email: fbUser.email ?? "",
    realName: ws ? ws.realName : rawName,
    displayName: anon.name, // 게시판 표시용 익명 닉네임(고정)
    emoji: anon.emoji,
    role: "student", // 기본 역할 — 승격은 functions/setUserRole로만
    // '선생님'으로 가입 신청 시 표시(권한 아님). 관리자 승인 전까지는 학생으로
    // 이용하며, 승인되면 setUserRole이 role 클레임을 teacher로 바꿉니다.
    requestedRole: extra.requestedRole === "teacher" ? "teacher" : null,
    studentId: ws ? ws.studentId : null,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
  return profile;
}

// Firebase 사용자 → 앱 사용자 객체(역할/프로필 포함)
async function buildAppUser(fbUser) {
  let role;
  try {
    const tokenResult = await fbUser.getIdTokenResult();
    role = tokenResult.claims.role;
  } catch {
    /* 토큰 조회 실패 시 프로필/기본값 사용 */
  }
  const profile = await ensureUserProfile(fbUser);
  // 초기 관리자 이메일은 클레임이 없어도 admin으로(부트스트랩)
  if (!role && fbUser.email === INITIAL_ADMIN_EMAIL) role = "admin";

  const finalRole = role || profile.role || "student";
  // 교사/관리자는 익명 닉네임 대신 항상 '선생님'으로 표시
  const isTeacherRole = finalRole === "admin" || finalRole === "teacher";

  // 교사/관리자 프로필 자가 치유:
  //  · 표시 이름을 항상 '선생님' + 🧑‍🏫로 고정(닉네임 미적용) → 디렉터리·목록 등
  //    프로필 문서를 읽는 모든 화면에서 '선생님'으로 보이게 함
  //  · 최고 관리자는 users.role도 'admin'으로 맞춰 학생 목록/탈퇴 규칙에서 제외
  // (본인은 isTeacher라 규칙상 자기 문서 쓰기 허용)
  if (isTeacherRole) {
    const heal = {};
    if (fbUser.email === INITIAL_ADMIN_EMAIL && profile.role !== "admin") heal.role = "admin";
    if (profile.displayName !== "선생님") heal.displayName = "선생님";
    if (profile.emoji !== "🧑‍🏫") heal.emoji = "🧑‍🏫";
    if (Object.keys(heal).length > 0) {
      try {
        await setDoc(doc(db, "users", fbUser.uid), heal, { merge: true });
        Object.assign(profile, heal);
      } catch {
        /* 규칙 미반영 등은 무시 — 반환값은 아래에서 '선생님'으로 강제 */
      }
    }
  }

  // 학생: 접속(세션)마다 새 익명 닉네임 — 게시물엔 작성 시점 이름이
  // 저장되므로, 이전 접속에서 쓴 글과 이어 붙여 추측하기 어려워집니다.
  const sessionNick = isTeacherRole ? null : getSessionNick(fbUser.uid);

  // 예전 가입 계정: 실명 칸에 "21031홍길동"이 통째로 저장되어 있고 학번이
  // 비어 있으면, 표시 시점에 학번·이름으로 분리(규칙상 본인은 저장 불가 —
  // 저장값 정리는 교사가 학생 수정 모달에서).
  const rawRealName = profile.realName || fbUser.displayName || "이름 미설정";
  const ws = !profile.studentId ? splitWorkspaceName(rawRealName) : null;

  return {
    uid: fbUser.uid,
    email: fbUser.email ?? "",
    role: finalRole,
    displayName: isTeacherRole
      ? "선생님"
      : sessionNick?.name || profile.displayName,
    emoji: isTeacherRole ? "🧑‍🏫" : sessionNick?.emoji || profile.emoji || "🙂",
    realName: ws ? ws.realName : rawRealName,
    studentId: profile.studentId ?? (ws ? ws.studentId : null),
    withdrawRequested: profile.withdrawRequested ?? false,
  };
}

// 인증 상태 구독 — 사용자 객체(또는 null)를 콜백으로 전달.
// 캐시(_setAuthUser)도 함께 갱신해 동기 getCurrentUser()가 동작하게 합니다.
export function onAuthChange(cb) {
  return onAuthStateChanged(auth, async (fbUser) => {
    let appUser = null;
    if (fbUser) {
      try {
        appUser = await buildAppUser(fbUser);
      } catch {
        appUser = null;
      }
    }
    _setAuthUser(appUser);
    cb(appUser);
  });
}

// 학생 가입은 학교 이메일(@hansung.hs.kr)만 허용합니다. 선생님으로
// 가입 신청하는 경우는 제외 — 선생님은 개인 메일로 가입 후 관리자 승인을
// 받는 기존 방식을 그대로 씁니다. 실제 강제는 firestore.rules의
// users 생성 규칙이 하고(request.auth.token.email로 위조 불가하게 검사),
// 여기서는 계정 생성 전에 먼저 걸러 불필요한 Auth 계정이 생기지 않게 합니다.
export async function signUpWithEmail(email, password, requestedRole = null) {
  if (requestedRole !== "teacher" && !isSchoolEmail(email)) {
    throw Object.assign(new Error("학교 이메일로만 학생 가입이 가능합니다."), {
      code: "auth/school-domain-required",
    });
  }
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await ensureUserProfile(cred.user, { requestedRole });
  const appUser = await buildAppUser(cred.user);
  _setAuthUser(appUser);
  return appUser;
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const appUser = await buildAppUser(cred.user);
  _setAuthUser(appUser);
  return appUser;
}

export async function signInWithGoogle(requestedRole = null) {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  const isNewUser = !!getAdditionalUserInfo(cred)?.isNewUser;

  // 구글 계정의 이메일은 팝업이 끝나야 알 수 있어 signUpWithEmail처럼
  // 미리 막을 수 없습니다. 신규 계정인데 학교 도메인이 아니고 선생님
  // 가입 신청도 아니면, 방금 만들어진 Auth 계정을 되돌립니다(그대로 두면
  // 프로필 없는 계정이 남아 다음에도 로그인은 되는데 앱은 못 쓰는
  // 어정쩡한 상태가 됩니다).
  if (isNewUser && requestedRole !== "teacher" && !isSchoolEmail(cred.user.email)) {
    try {
      await cred.user.delete();
    } catch {
      /* 삭제 실패해도 로그아웃은 진행 — 다음 로그인 시 다시 이 경로를 탐 */
    }
    await signOut(auth);
    throw Object.assign(new Error("학교 이메일 계정으로만 학생 가입이 가능합니다."), {
      code: "auth/school-domain-required",
    });
  }

  // 구글 팝업은 로그인/가입을 겸합니다. 새로 가입하는 경우에만 신청 역할을
  // 반영하고, 기존 계정 로그인은 프로필을 건드리지 않습니다.
  if (requestedRole && isNewUser) {
    await ensureUserProfile(cred.user, { requestedRole });
  }
  const appUser = await buildAppUser(cred.user);
  _setAuthUser(appUser);
  return appUser;
}

export async function signOutUser() {
  await signOut(auth);
  _setAuthUser(null);
  // 같은 탭에서 다음 로그인(다른 학생 포함) 시 새 닉네임을 받도록 초기화
  clearSessionNick();
}
