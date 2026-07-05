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
import { _setAuthUser, makeAnonName, getSessionNick, clearSessionNick } from "./user";

const INITIAL_ADMIN_EMAIL = "iseoul72@gmail.com";

// users/{uid} 프로필 보장 — 없으면 생성하고 데이터를 반환합니다.
export async function ensureUserProfile(fbUser, extra = {}) {
  const ref = doc(db, "users", fbUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const anon = makeAnonName();
  const emailPrefix = (fbUser.email || "").split("@")[0];
  const profile = {
    email: fbUser.email ?? "",
    realName: extra.realName || fbUser.displayName || emailPrefix || "이름 미설정",
    displayName: anon.name, // 게시판 표시용 익명 닉네임(고정)
    emoji: anon.emoji,
    role: "student", // 기본 역할 — 승격은 functions/setUserRole로만
    // '선생님'으로 가입 신청 시 표시(권한 아님). 관리자 승인 전까지는 학생으로
    // 이용하며, 승인되면 setUserRole이 role 클레임을 teacher로 바꿉니다.
    requestedRole: extra.requestedRole === "teacher" ? "teacher" : null,
    studentId: null,
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

  // 최고 관리자 프로필의 role을 'admin'으로 맞춰 둡니다. 부트스트랩만으로는
  // users.role이 'student'로 남아, 학생 목록에 노출되거나 교사 탈퇴 규칙에
  // 걸릴 수 있으므로 자가 치유(본인은 isTeacher라 규칙상 쓰기 허용).
  if (fbUser.email === INITIAL_ADMIN_EMAIL && profile.role !== "admin") {
    try {
      await setDoc(doc(db, "users", fbUser.uid), { role: "admin" }, { merge: true });
      profile.role = "admin";
    } catch {
      /* 규칙 미반영 등은 무시 — 규칙 쪽 이메일 차단이 최종 방어선 */
    }
  }

  const finalRole = role || profile.role || "student";
  // 교사/관리자는 익명 닉네임 대신 항상 '선생님'으로 표시
  const isTeacherRole = finalRole === "admin" || finalRole === "teacher";
  // 학생: 접속(세션)마다 새 익명 닉네임 — 게시물엔 작성 시점 이름이
  // 저장되므로, 이전 접속에서 쓴 글과 이어 붙여 추측하기 어려워집니다.
  const sessionNick = isTeacherRole ? null : getSessionNick(fbUser.uid);

  return {
    uid: fbUser.uid,
    email: fbUser.email ?? "",
    role: finalRole,
    displayName: isTeacherRole
      ? "선생님"
      : sessionNick?.name || profile.displayName,
    emoji: isTeacherRole ? "🧑‍🏫" : sessionNick?.emoji || profile.emoji || "🙂",
    realName: profile.realName || fbUser.displayName || "이름 미설정",
    studentId: profile.studentId ?? null,
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

export async function signUpWithEmail(email, password, requestedRole = null) {
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
  // 구글 팝업은 로그인/가입을 겸합니다. 새로 가입하는 경우에만 신청 역할을
  // 반영하고, 기존 계정 로그인은 프로필을 건드리지 않습니다.
  if (requestedRole && getAdditionalUserInfo(cred)?.isNewUser) {
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
