// =============================================================
// 사용자 디렉터리 · 프로필 · 역할 · 탈퇴
// -------------------------------------------------------------
// lib/store.js에서 떼어 낸 조각입니다. 화면은 지금까지처럼 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 그대로 다시 내보냅니다.
// =============================================================
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions, isFirebaseConfigured } from "../firebase";
import { deleteAttachedFiles } from "../storageUpload";
import { splitWorkspaceName } from "../user";
import { mock, mockListeners, notifyQuestions } from "./shared";

// ─── 사용자 디렉터리 (실명·이메일) — 교사/관리자 전용 조회 ──────────
// 실명·이메일 같은 식별 정보(PII)는 게시물 문서에 넣지 않고 users/{uid}에만
// 둡니다(게시물은 모든 학생이 읽으므로). 교사 화면은 이 디렉터리로
// uid→실명/이메일을 조회합니다. 보안 규칙이 users 읽기를 "본인+교사"로
// 제한하므로, 학생이 호출하면 거부됩니다(그래서 학생 화면에선 호출하지 않음).
const _userDirectory = new Map(); // uid -> { uid, realName, email, displayName, emoji, studentId }

// 동기 조회용 — AuthorBadge·StudyCard 등이 렌더 시점에 실명을 찾습니다.
export function getDirectoryUser(uid) {
  return uid ? _userDirectory.get(uid) ?? null : null;
}
export function getDirectoryRealName(uid) {
  return getDirectoryUser(uid)?.realName || null;
}

function setDirectory(list) {
  _userDirectory.clear();
  list.forEach((e) => e.uid && _userDirectory.set(e.uid, e));
}

// 데모 모드: 단일 출처(users)가 없으므로 게시물의 author 정보로 디렉터리를 흉내냅니다.
export function buildMockDirectory() {
  const map = new Map();
  const add = (item) => {
    if (!item?.authorId) return;
    const prev = map.get(item.authorId) ?? { uid: item.authorId };
    map.set(item.authorId, {
      ...prev,
      realName: item.authorRealName ?? prev.realName ?? "",
      email: item.authorEmail ?? prev.email ?? "",
      displayName: item.authorName ?? prev.displayName ?? "",
      emoji: item.authorEmoji ?? prev.emoji ?? "🙂",
      studentId: item.authorStudentId ?? prev.studentId ?? null,
    });
  };
  mock.questions.forEach(add);
  Object.values(mock.answers).forEach((arr) => arr.forEach(add));
  (mock.studyCards ?? []).forEach(add);
  return [...map.values()];
}

// 교사 전용: users 컬렉션을 구독해 uid→프로필 디렉터리를 만듭니다.
export function subscribeUserDirectory(callback) {
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "users"),
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data();
          // 예전 가입 계정: 실명 칸에 "21031홍길동"(워크스페이스 계정 이름)이
          // 통째로 남아 있으면 표시 시점에 학번·이름으로 분리
          const ws = !data.studentId ? splitWorkspaceName(data.realName) : null;
          return {
            uid: d.id,
            realName: ws ? ws.realName : data.realName ?? "",
            email: data.email ?? "",
            displayName: data.displayName ?? "",
            emoji: data.emoji ?? "🙂",
            studentId: data.studentId ?? (ws ? ws.studentId : null),
            role: data.role ?? "student",
            requestedRole: data.requestedRole ?? null, // '선생님' 승인 대기 표시
            withdrawRequested: data.withdrawRequested ?? false, // 탈퇴 신청 대기 표시
          };
        });
        setDirectory(list);
        callback(list);
      },
      () => callback([]) // 권한 거부 등은 빈 목록으로 (학생이 잘못 구독한 경우)
    );
  }
  const list = buildMockDirectory();
  setDirectory(list);
  callback(list);
  return () => {};
}

// ─── 본인 프로필 수정 (프로필 메뉴) ─────────────────────────────
// 규칙상 학생 본인은 email·emoji·fcmTokens·requestedRole만 변경 가능
// (닉네임·실명·학번은 교사만 수정). 교사는 본인 실명 수정에 사용합니다.
export async function updateMyProfile(uid, patch) {
  if (isFirebaseConfigured) {
    await setDoc(doc(db, "users", uid), patch, { merge: true });
    return;
  }
  // 데모 모드: 세션 기반 테스트 유저라 저장할 프로필 문서가 없음 — 생략
}

// ─── 관리자 전용: 학생 프로필 수정 ───────────────────────────────
// 실명·이메일은 users/{uid}(단일 출처)에만 저장하고, 게시물에는 비식별
// 정보(닉네임·이모지)만 전파합니다. 카드는 collectionGroup("cards")로 조회.
export async function updateStudentProfile(uid, { name, emoji, realName, email, studentId }) {
  if (isFirebaseConfigured) {
    // 식별 정보(실명·이메일·학번)는 users/{uid}에만 — 이 저장이 핵심이며,
    // 아래 게시물 닉네임 동기화는 best-effort(부분 실패 허용)로 진행합니다.
    const profilePatch = { displayName: name, emoji, realName, email: email ?? "" };
    if (studentId !== undefined) profilePatch.studentId = studentId || null;
    await setDoc(doc(db, "users", uid), profilePatch, { merge: true });

    // 게시물에는 비식별 정보만 갱신 (피드 닉네임/아바타 동기화용).
    // batch(전부-아니면-실패) 대신 개별 갱신 — 규칙상 일부 문서(타 교사 반
    // 카드 등)가 거부되어도 나머지 동기화와 프로필 저장은 유지됩니다.
    const patch = { authorName: name, authorEmoji: emoji };
    const updates = [];
    try {
      const qSnap = await getDocs(query(collection(db, "questions"), where("authorId", "==", uid)));
      qSnap.docs.forEach((d) => updates.push(updateDoc(d.ref, patch)));
    } catch (e) {
      console.warn("[updateStudentProfile] 질문 동기화 건너뜀:", e?.message);
    }
    try {
      const aSnap = await getDocs(query(collectionGroup(db, "answers"), where("authorId", "==", uid)));
      aSnap.docs.forEach((d) => updates.push(updateDoc(d.ref, patch)));
    } catch (e) {
      console.warn("[updateStudentProfile] 답변 동기화 건너뜀:", e?.message);
    }
    try {
      const cSnap = await getDocs(query(collectionGroup(db, "cards"), where("authorId", "==", uid)));
      cSnap.docs.forEach((d) => updates.push(updateDoc(d.ref, patch)));
    } catch (e) {
      console.warn("[updateStudentProfile] 카드 동기화 건너뜀:", e?.message);
    }
    await Promise.allSettled(updates);
    return;
  }
  // 데모: PII 분리가 의미 없으므로 게시물에 함께 갱신(디렉터리도 여기서 파생)
  const patch = { authorName: name, authorEmoji: emoji, authorRealName: realName, authorEmail: email ?? "" };
  if (studentId !== undefined) patch.authorStudentId = studentId || null;
  mock.questions = mock.questions.map((q) =>
    q.authorId === uid ? { ...q, ...patch } : q
  );
  Object.keys(mock.answers).forEach((qid) => {
    mock.answers[qid] = mock.answers[qid].map((a) =>
      a.authorId === uid ? { ...a, ...patch } : a
    );
  });
  mock.studyCards = (mock.studyCards ?? []).map((c) =>
    c.authorId === uid ? { ...c, ...patch } : c
  );
  notifyQuestions();
}

// ─── 관리자 전용: 역할(교사/관리자) 부여 ──────────────────────────
// Cloud Functions(setUserRole)를 호출해 커스텀 클레임을 부여합니다.
// 역할은 클라이언트가 스스로 바꿀 수 없고(보안 규칙), 이 경로로만 바뀝니다.
// (데모 모드에는 실제 인증·클레임이 없어 지원하지 않습니다)
export async function assignUserRole(uid, role) {
  const fn = httpsCallable(functions, "setUserRole");
  const result = await fn({ uid, role });
  return result.data;
}

// ─── 관리자 전용: 선생님 가입 신청 승인/거절 ─────────────────────
// 승인: teacher 클레임 부여 + 대기 표시(requestedRole) 해제.
// 거절: 대기 표시만 해제(학생으로 유지).
export async function approveTeacherRequest(uid) {
  await assignUserRole(uid, "teacher");
  if (isFirebaseConfigured) {
    // 대기 표시 해제 + 표시 이름을 '선생님'으로 고정(닉네임 미적용)
    await setDoc(
      doc(db, "users", uid),
      { requestedRole: null, displayName: "선생님", emoji: "🧑‍🏫" },
      { merge: true }
    );
  }
}
export async function dismissTeacherRequest(uid) {
  if (isFirebaseConfigured) {
    await setDoc(doc(db, "users", uid), { requestedRole: null }, { merge: true });
  }
}

// ─── 회원 탈퇴 신청 (본인) ───────────────────────────────────────
// 즉시 삭제하지 않고 '신청' 표시만 남깁니다. 학생의 신청은 선생님이,
// 선생님의 신청은 최고 관리자가 확인 후 deleteStudent()로 최종 처리합니다.
export async function requestWithdrawal(uid) {
  if (isFirebaseConfigured) {
    await setDoc(
      doc(db, "users", uid),
      { withdrawRequested: true, withdrawRequestedAt: serverTimestamp() },
      { merge: true }
    );
  }
}

// 신청 취소(본인) 또는 거절(교사/관리자) — 계정은 유지하고 신청 표시만 해제
export async function dismissWithdrawalRequest(uid) {
  if (isFirebaseConfigured) {
    await setDoc(doc(db, "users", uid), { withdrawRequested: false }, { merge: true });
  }
}

// ─── 교사·관리자: 학생 탈퇴 처리 ────────────────────────────────
// 계정 삭제와 데이터 파기를 서버 함수(deleteStudentAccount) 한 번에 맡깁니다.
//  · 담당 교사인지 서버가 검사합니다(예전엔 교사면 아무 반 학생이나 삭제 가능).
//  · 계정을 먼저 지워 되살아나는 일을 막고, 데이터는 멱등하게 파기합니다.
//  · 일부만 지워졌으면 warnings로 돌려받아 화면에 알립니다(조용한 실패 금지).
//
// 함수가 아직 배포되지 않은 과도기에는 예전 클라이언트 경로로 물러섭니다.
// (규칙에서 users 삭제를 관리자에게만 열어 두면 이 폴백도 자연히 막힙니다)
export async function deleteStudent(uid) {
  if (isFirebaseConfigured) {
    try {
      const res = await httpsCallable(functions, "deleteStudentAccount")({ uid });
      const warnings = res?.data?.warnings ?? [];
      if (warnings.length > 0) {
        const err = new Error(`일부 자료를 지우지 못했어요:\n· ${warnings.join("\n· ")}`);
        err.partial = true;
        throw err;
      }
      return;
    } catch (e) {
      // 함수 미배포(not-found/internal)일 때만 예전 경로로. 권한 거부·부분 실패는
      // 그대로 올려보내 교사가 결과를 알 수 있게 합니다.
      const code = e?.code || "";
      const missing = code.includes("not-found") || code.includes("unimplemented");
      if (!missing) throw e;
      console.warn("[deleteStudent] 서버 함수를 찾지 못해 예전 경로로 처리합니다:", code);
    }

    // ── 이하 폴백(구 경로) — 함수 배포 후에는 실행되지 않습니다 ──
    // 1) 본인이 올린 질문 + 그 질문의 답변(첨부 포함) 삭제
    const qSnap = await getDocs(query(collection(db, "questions"), where("authorId", "==", uid)));
    await Promise.all(qSnap.docs.map(async (d) => {
      const aSnap = await getDocs(collection(db, "questions", d.id, "answers"));
      await Promise.all([
        deleteAttachedFiles(d.data()),
        ...aSnap.docs.map((a) => deleteAttachedFiles(a.data())),
      ]);
      await Promise.all(aSnap.docs.map((a) => deleteDoc(a.ref)));
      await deleteDoc(d.ref);
    }));

    // 2~4) 남의 글에 단 답변·카드·KWL은 best-effort로 정리합니다.
    //   collectionGroup 색인이 아직 없어도(예외) 탈퇴(프로필 삭제)는 계속 진행되도록
    //   각 단계를 개별 try/catch로 감쌉니다. (색인 생성 후엔 완전 정리)
    try {
      const aSnap = await getDocs(query(collectionGroup(db, "answers"), where("authorId", "==", uid)));
      await Promise.all(aSnap.docs.map((d) => deleteAttachedFiles(d.data())));
      await Promise.all(aSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (e) {
      console.warn("[deleteStudent] answers 정리 건너뜀(색인 필요할 수 있음):", e?.message);
    }
    try {
      const cSnap = await getDocs(query(collectionGroup(db, "cards"), where("authorId", "==", uid)));
      await Promise.all(cSnap.docs.map((d) => deleteAttachedFiles(d.data())));
      await Promise.all(cSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (e) {
      console.warn("[deleteStudent] cards 정리 건너뜀:", e?.message);
    }
    try {
      const kSnap = await getDocs(query(collection(db, "kwl"), where("userId", "==", uid)));
      await Promise.all(kSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (e) {
      console.warn("[deleteStudent] kwl 정리 건너뜀:", e?.message);
    }

    // 5) 소속(memberships)·과일 보상(rewards) 정리 — 안 지우면 탈퇴 후에도
    //    교사 반 명단·'멋진 순간' 패널에 "이름 미설정"으로 계속 남습니다.
    try {
      const memSnap = await getDocs(query(collection(db, "memberships"), where("uid", "==", uid)));
      await Promise.all(memSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (e) {
      console.warn("[deleteStudent] memberships 정리 건너뜀:", e?.message);
    }
    try {
      const rwSnap = await getDocs(query(collection(db, "rewards"), where("uid", "==", uid)));
      await Promise.all(rwSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (e) {
      console.warn("[deleteStudent] rewards 정리 건너뜀:", e?.message);
    }

    // 6) 프로필(PII) 문서 삭제
    //    알림함(users/{uid}/notifications)은 여기서 못 지웁니다 — 규칙이
    //    본인에게만 열려 있어(userId == uid()) 교사가 남의 알림에 손댈 수
    //    없습니다. 규칙을 넓히면 교사가 학생 알림을 읽게 되므로 그대로 두고,
    //    서버 함수(purgeStudentData)가 admin SDK로 지웁니다. 이 폴백은 함수가
    //    배포되지 않은 과도기에만 도는 길이라 그때는 알림함이 남습니다
    //    (npm run books:purge-orphans 로 나중에 훑어 지울 수 있습니다).
    await deleteDoc(doc(db, "users", uid));

    // 7) 로그인 계정(Authentication) 삭제 — 서버(Cloud Function)에서만 가능.
    //    같은 이메일 재가입 허용 + 남은 역할 클레임 제거. 함수 미배포 시엔
    //    데이터 삭제는 이미 끝났으므로 best-effort로 넘어갑니다.
    try {
      await httpsCallable(functions, "deleteAuthUser")({ uid });
    } catch (e) {
      console.warn("[deleteStudent] 로그인 계정 삭제 건너뜀(함수 배포 필요할 수 있음):", e?.message);
    }
    return;
  }
  const qids = mock.questions.filter((q) => q.authorId === uid).map((q) => q.id);
  mock.questions = mock.questions.filter((q) => q.authorId !== uid);
  qids.forEach((id) => delete mock.answers[id]);
  Object.keys(mock.answers).forEach((qid) => {
    mock.answers[qid] = (mock.answers[qid] ?? []).filter((a) => a.authorId !== uid);
  });
  mock.studyCards = (mock.studyCards ?? []).filter((c) => c.authorId !== uid);
  mock.kwl = (mock.kwl ?? []).filter((e) => e.userId !== uid);
  if (mock.memberships) mock.memberships = mock.memberships.filter((m) => m.uid !== uid);
  if (mock.rewards) mock.rewards = mock.rewards.filter((r) => r.uid !== uid);
  notifyQuestions();
  mockListeners.classMembers?.forEach((cb) => cb());
  mockListeners.rewards?.forEach((cb) => cb());
}
