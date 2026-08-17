// =============================================================
// Cloud Functions — 서버에서 동작하는 코드
// -------------------------------------------------------------
// 클라이언트(브라우저)는 조작될 수 있으므로, 아래 세 종류의 작업은
// Firebase 서버에서 실행됩니다.
//
//   [1] 데이터 무결성  : 답변 생성/삭제 시 answerCount를 서버가 집계
//   [2] 역할 부여      : 관리자/교사/학생 역할을 커스텀 클레임으로 지정
//   [3] 알림·예약 작업 : 새 답변 알림 발송, 주간 답변왕 집계
//
// 배포: 프로젝트 루트에서
//   npm install -g firebase-tools
//   firebase login
//   cd functions && npm install && cd ..
//   firebase deploy --only functions
// ※ Cloud Functions는 Blaze(종량제) 요금제에서만 배포됩니다.
//   학급 규모 사용량은 대부분 무료 한도 안에서 처리됩니다.
// =============================================================
const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
} = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// 서울 리전에서 실행
setGlobalOptions({ region: "asia-northeast3" });

// 역할 종류와 최초 관리자 이메일
// (첫 관리자는 아직 admin 클레임이 없으므로, 이 이메일로 로그인한
//  계정에 한해 스스로 역할을 부여할 수 있게 허용합니다.)
const ROLES = ["admin", "teacher", "student"];
const INITIAL_ADMIN_EMAIL = "iseoul72@gmail.com";

// =============================================================
// 주간 랭킹 집계 헬퍼 — 랜딩(로그인 전) 공개 문서를 "이번 주"로 갱신
// -------------------------------------------------------------
// 예약(월요일 08:00) 실행뿐 아니라 질문/답변이 생기고 지워질 때마다
// 호출되어, stats/weeklyQuestioners · stats/weeklyAnswerers 가 항상
// "이번 주 현재까지"의 순위를 담도록 합니다.
//  · 집계 창 = 가장 최근 "월요일 08:00(KST)" 이후 → 매주 월요일 08:00에
//    자동 초기화(그 시각 이후 기록만 집계).
//  · 이 문서는 로그인 없이 누구나 읽을 수 있으므로 **실명을 담지 않습니다**
//    (익명 닉네임만). 실명은 본인과 담당 교사만 본다는 방침을 따릅니다.
//  · 읽기 비용을 줄이려 이번 주 범위만 쿼리하고, 색인이 없으면 전체 읽기로
//    자동 폴백합니다(readSince 참고).
// =============================================================
// 이번 주 시작(가장 최근 월요일 08:00 KST)을 epoch millis로 반환
function weekStartMillis() {
  const KST = 9 * 60 * 60 * 1000; // 한국 표준시(UTC+9, DST 없음)
  const nowUtc = Date.now();
  const kst = new Date(nowUtc + KST); // getUTC*가 KST 벽시계를 반영
  const day = kst.getUTCDay(); // 0=일 … 1=월 … 6=토
  const kstMidnightUtc =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - KST;
  const daysSinceMon = (day + 6) % 7; // 월=0 … 일=6
  let start = kstMidnightUtc - daysSinceMon * 86400000 + 8 * 3600000; // 월 08:00 KST
  if (start > nowUtc) start -= 7 * 86400000; // 아직 월요일 08:00 전이면 지난 주 기준
  return start;
}

// snap을 이번 주(since 이후)로 걸러 상위 5명 + 총건수 집계.
//
// [실명을 담지 않습니다]
// 이 결과는 stats/* 공개 문서로 저장되고, 그 문서는 로그인 없이 누구나
// 읽을 수 있습니다. 개인정보처리방침이 "실명은 본인과 담당 교사만 확인"으로
// 약속하고 있으므로 랭킹에는 익명 닉네임만 담습니다.
function aggregateTop5(snap, sinceMillis) {
  const byUser = new Map();
  let total = 0;
  snap.forEach((doc) => {
    const d = doc.data();
    if (!d.authorId) return;
    const t = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : 0;
    if (t < sinceMillis) return; // 이번 주 이전 기록은 제외(월요일 초기화)
    total += 1;
    const cur = byUser.get(d.authorId) ?? {
      uid: d.authorId,
      authorName: "익명",
      authorEmoji: "🙂",
      count: 0,
      latest: -1,
    };
    cur.count += 1;
    if (t >= cur.latest) {
      cur.latest = t;
      cur.authorName = d.authorName || cur.authorName;
      cur.authorEmoji = d.authorEmoji || cur.authorEmoji;
    }
    byUser.set(d.authorId, cur);
  });
  const top = [...byUser.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((r) => ({
      authorName: r.authorName,
      authorEmoji: r.authorEmoji,
      count: r.count,
    }));
  return { top, total };
}

// 이번 주 기록만 읽어 옵니다 — 질문/답변이 하나 생길 때마다 전체 컬렉션을
// 다시 읽으면 누적 건수에 비례해 읽기 비용이 계속 불어납니다.
// 범위 쿼리에 필요한 색인이 아직 없으면(FAILED_PRECONDITION) 예전처럼
// 전체를 읽어 코드에서 거릅니다 — 색인 없이도 동작이 끊기지 않도록.
async function readSince(ref, sinceMillis) {
  const cutoff = admin.firestore.Timestamp.fromMillis(sinceMillis);
  try {
    return await ref.where("createdAt", ">=", cutoff).get();
  } catch (e) {
    console.warn("[집계] 범위 쿼리 실패 — 전체 읽기로 대체합니다:", e && e.message);
    return await ref.get();
  }
}

// 이번 주 "질문을 많이 올린" 상위 5명 → 공개 문서 갱신. top 반환.
async function recomputeQuestioners() {
  const since = weekStartMillis();
  const snap = await readSince(db.collection("questions"), since);
  const { top, total } = aggregateTop5(snap, since);
  await db.doc("stats/weeklyQuestioners").set({
    top,
    totalQuestions: total,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return top;
}

// 이번 주 "답변을 많이 단" 상위 5명 → 공개 문서 갱신. top 반환.
async function recomputeAnswerers() {
  const since = weekStartMillis();
  const snap = await readSince(db.collectionGroup("answers"), since);
  const { top, total } = aggregateTop5(snap, since);
  await db.doc("stats/weeklyAnswerers").set({
    top,
    totalAnswers: total,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return top;
}

// =============================================================
// [1] 데이터 무결성 — answerCount 서버 집계
// -------------------------------------------------------------
// 클라이언트가 직접 카운트를 올리면 조작·동시성 문제가 생기므로,
// answers 하위 컬렉션에 문서가 생기고/지워질 때 서버가 집계합니다.
// (이 함수를 배포한 뒤에는 lib/store.js의 addAnswer 안에 있는
//  updateDoc(... increment(1)) 부분을 삭제하세요. 중복 집계 방지)
// =============================================================
exports.onAnswerCreated = onDocumentCreated(
  "questions/{questionId}/answers/{answerId}",
  async (event) => {
    const { questionId } = event.params;
    const answer = event.data.data();
    const questionRef = db.doc(`questions/${questionId}`);

    // 1) 답변 수 +1 (서버에서만 수행 → 조작 불가, 동시 답변에도 안전)
    await questionRef.update({
      answerCount: admin.firestore.FieldValue.increment(1),
    });

    // 1-b) 답변왕 순위 즉시 갱신(현재까지) — 아래 알림 로직의 조기 return과
    //      무관하게 항상 실행되도록 여기서 먼저 호출합니다.
    await recomputeAnswerers().catch(() => {});

    // 2) [3-알림] 질문 작성자에게 인앱 알림 (자기 질문에 단 답변은 제외)
    //    클라이언트가 users/{uid}/notifications를 구독하면 상단바 알림
    //    벨(NotificationBell)에 표시됩니다.
    const questionSnap = await questionRef.get();
    if (!questionSnap.exists) return;
    const question = questionSnap.data();
    if (question.authorId === answer.authorId) return;

    await db.collection(`users/${question.authorId}/notifications`).add({
      type: "new_answer",
      questionId,
      questionTitle: question.title,
      answerAuthorName: answer.authorName,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
);

// 질문자가 "이해됐어요"로 답변을 채택하면, 그 답변을 쓴 학생에게 인앱 알림
exports.onAnswerUnderstood = onDocumentUpdated(
  "questions/{questionId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    const answerId = after.understoodAnswerId;
    // 새로 채택된 경우에만(이미 채택돼 있던 것과 같으면 스킵)
    if (!answerId || answerId === before.understoodAnswerId) return;

    const { questionId } = event.params;
    const answerSnap = await db.doc(`questions/${questionId}/answers/${answerId}`).get();
    if (!answerSnap.exists) return;
    const answer = answerSnap.data();
    // 자기 질문에 자기가 단 답변을 채택한 경우는 알림 불필요
    if (!answer.authorId || answer.authorId === after.authorId) return;

    await db.collection(`users/${answer.authorId}/notifications`).add({
      type: "answer_understood",
      questionId,
      questionTitle: after.title,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
);

// 답변이 삭제되면 카운트 -1 + 답변왕 순위 갱신
exports.onAnswerDeleted = onDocumentDeleted(
  "questions/{questionId}/answers/{answerId}",
  async (event) => {
    await db
      .doc(`questions/${event.params.questionId}`)
      .update({ answerCount: admin.firestore.FieldValue.increment(-1) })
      .catch(() => {}); // 질문이 함께 삭제된 경우는 무시
    await recomputeAnswerers().catch(() => {});
  }
);

// 질문이 생기거나 지워지면 질문대장 순위를 즉시 갱신(현재까지)
exports.onQuestionCreated = onDocumentCreated("questions/{qId}", async () => {
  await recomputeQuestioners().catch(() => {});
});
exports.onQuestionDeleted = onDocumentDeleted("questions/{qId}", async () => {
  await recomputeQuestioners().catch(() => {});
});

// =============================================================
// [2] 역할 부여 — 커스텀 클레임 (admin / teacher / student)
// -------------------------------------------------------------
// 역할은 클라이언트가 스스로 정할 수 없고, 이 함수를 통해서만
// 부여됩니다. 부여된 클레임은 Firestore 보안 규칙에서
// request.auth.token.role 로 검사할 수 있습니다.
//   예) notices 쓰기: request.auth.token.role in ['admin', 'teacher']
//
// 클라이언트 호출 예시:
//   import { getFunctions, httpsCallable } from "firebase/functions";
//   const fn = httpsCallable(getFunctions(undefined, "asia-northeast3"), "setUserRole");
//   await fn({ uid: "대상_유저_uid", role: "teacher" });
// =============================================================
exports.setUserRole = onCall({ enforceAppCheck: true }, async (request) => {
  // 로그인 필수
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  // 호출 권한: 이미 admin이거나, 최초 관리자 이메일 본인
  const callerIsAdmin = request.auth.token.role === "admin";
  const callerIsInitialAdmin =
    request.auth.token.email === INITIAL_ADMIN_EMAIL &&
    request.auth.token.email_verified === true;
  if (!callerIsAdmin && !callerIsInitialAdmin) {
    throw new HttpsError("permission-denied", "역할을 부여할 권한이 없습니다.");
  }

  // 입력 검증
  const { uid, role } = request.data || {};
  if (typeof uid !== "string" || !ROLES.includes(role)) {
    throw new HttpsError(
      "invalid-argument",
      `uid와 role(${ROLES.join("/")})을 올바르게 전달해 주세요.`
    );
  }

  // 1) 인증 토큰에 역할 기록 (보안 규칙에서 사용)
  await admin.auth().setCustomUserClaims(uid, { role });

  // 2) 화면 표시용으로 사용자 문서에도 기록
  await db.doc(`users/${uid}`).set({ role }, { merge: true });

  return { ok: true, uid, role };
});

// =============================================================
// 탈퇴 공통 헬퍼 — 권한 판정과 데이터 파기
// =============================================================

// 호출한 교사가 "그 학생을 맡고 있는지" — 학생이 속한 반 중 하나라도
// 호출자가 개설한 반이면 담당 교사로 봅니다.
async function callerOwnsStudent(callerUid, targetUid) {
  const mems = await db.collection("memberships").where("uid", "==", targetUid).get();
  if (mems.empty) return false;
  const classIds = [...new Set(mems.docs.map((d) => d.data().classId).filter(Boolean))];
  const classes = await Promise.all(
    classIds.map((id) => db.doc(`classes/${id}`).get().catch(() => null))
  );
  return classes.some((c) => c && c.exists && c.data().createdBy === callerUid);
}

// 쿼리에 걸린 문서를 모두 삭제 (배치 상한 500 고려)
async function deleteByQuery(query, warnings, label) {
  try {
    const snap = await query.get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    return snap.size;
  } catch (e) {
    // 색인 미생성 등으로 실패해도 나머지 파기는 계속 — 대신 반드시 보고합니다.
    warnings.push(`${label}: ${e && e.message}`);
    return 0;
  }
}

// 학생이 남긴 모든 흔적을 지웁니다. 여러 번 실행해도 안전(멱등)합니다.
// 실패한 항목은 warnings에 모아 호출자에게 그대로 돌려줍니다 — 일부만
// 지워졌는데 성공으로 보고하는 일이 없도록.
async function purgeStudentData(uid, warnings) {
  // 1) 본인이 올린 질문 + 그 질문에 달린 답변(남이 단 것 포함)
  try {
    const qs = await db.collection("questions").where("authorId", "==", uid).get();
    for (const d of qs.docs) {
      const subs = await d.ref.collection("answers").get();
      await Promise.all(subs.docs.map((s) => s.ref.delete()));
      await d.ref.delete();
    }
  } catch (e) {
    warnings.push(`질문: ${e && e.message}`);
  }

  // 2) 남의 글에 단 답변 · 공부방 카드 · KWL
  await deleteByQuery(db.collectionGroup("answers").where("authorId", "==", uid), warnings, "답변");
  await deleteByQuery(db.collectionGroup("cards").where("authorId", "==", uid), warnings, "공부방 카드");
  await deleteByQuery(db.collection("kwl").where("userId", "==", uid), warnings, "KWL");

  // 3) 보상(과일) · 누가기록
  await deleteByQuery(db.collection("rewards").where("uid", "==", uid), warnings, "과일 기록");
  await deleteByQuery(db.collection("studentNotes").where("studentUid", "==", uid), warnings, "누가기록");

  // 4) 책방 — 낱말에는 실명(authorName)이 들어 있어 반드시 지웁니다.
  await deleteByQuery(db.collectionGroup("words").where("authorId", "==", uid), warnings, "책방 낱말");
  // 모둠 명단에서도 빼냅니다(members에 실명 보관).
  try {
    const groups = await db
      .collectionGroup("groups")
      .where("memberUids", "array-contains", uid)
      .get();
    await Promise.all(
      groups.docs.map((g) => {
        const d = g.data();
        const patch = {
          memberUids: admin.firestore.FieldValue.arrayRemove(uid),
          members: (d.members || []).filter((m) => m && m.uid !== uid),
        };
        if (d.leaderUid === uid) patch.leaderUid = null;
        return g.ref.update(patch);
      })
    );
  } catch (e) {
    warnings.push(`책방 모둠 명단: ${e && e.message}`);
  }

  // 5) 업로드한 파일 전부 (uploads/{uid}/ 아래)
  try {
    await admin.storage().bucket().deleteFiles({ prefix: `uploads/${uid}/` });
  } catch (e) {
    warnings.push(`첨부 파일: ${e && e.message}`);
  }

  // 6) 소속 → 프로필 순서로 마지막에. 소속을 먼저 지우면 재시도할 때
  //    담당 교사 판정이 불가능해지므로 이 순서를 지킵니다.
  await deleteByQuery(db.collection("memberships").where("uid", "==", uid), warnings, "반 소속");
  try {
    await db.doc(`users/${uid}`).delete();
  } catch (e) {
    warnings.push(`프로필: ${e && e.message}`);
  }
}

// =============================================================
// [2-b] 탈퇴 — 로그인 계정(Authentication) 삭제
// -------------------------------------------------------------
// 클라이언트는 "남의 계정"을 지울 수 없으므로(구글 정책), 계정 삭제는
// 서버에서만 수행합니다. Firestore 데이터 삭제는 앱(deleteStudent)이
// 규칙 아래에서 처리하고, 이 함수는 로그인 계정 자체를 제거해
// 재가입(같은 이메일)이 가능하도록 하고 남아 있는 역할 클레임도 없앱니다.
//
// 권한 계층:
//  · 최고 관리자: 누구나 삭제(단, 최고 관리자 계정 자신은 보호)
//  · 선생님(중간 관리자): 학생 계정만 삭제 (다른 선생님/관리자 삭제 불가)
// =============================================================
exports.deleteAuthUser = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const callerRole = request.auth.token.role;
  const callerIsAdmin =
    callerRole === "admin" ||
    (request.auth.token.email === INITIAL_ADMIN_EMAIL &&
      request.auth.token.email_verified === true);
  const callerIsTeacher = callerRole === "teacher" || callerIsAdmin;
  if (!callerIsTeacher) {
    throw new HttpsError("permission-denied", "탈퇴 처리 권한이 없습니다.");
  }

  const { uid } = request.data || {};
  if (typeof uid !== "string" || !uid) {
    throw new HttpsError("invalid-argument", "uid를 올바르게 전달해 주세요.");
  }

  // 대상 계정 확인 (이미 없으면 성공으로 간주)
  const target = await admin.auth().getUser(uid).catch(() => null);
  if (!target) return { ok: true, alreadyGone: true };

  // 최고 관리자 계정은 삭제 불가
  if (target.email === INITIAL_ADMIN_EMAIL) {
    throw new HttpsError("permission-denied", "최고 관리자 계정은 삭제할 수 없습니다.");
  }
  // 선생님/관리자 계정 삭제는 최고 관리자만
  const targetRole = target.customClaims && target.customClaims.role;
  const targetIsStaff = targetRole === "teacher" || targetRole === "admin";
  if (targetIsStaff && !callerIsAdmin) {
    throw new HttpsError("permission-denied", "선생님 계정은 최고 관리자만 탈퇴 처리할 수 있습니다.");
  }
  // 담당 교사만 — 예전에는 교사이기만 하면 아무 반 학생이나 지울 수 있었습니다.
  if (!callerIsAdmin && !(await canDeleteStudent(request.auth.uid, uid))) {
    throw new HttpsError("permission-denied", "담당하는 반의 학생만 탈퇴 처리할 수 있습니다.");
  }

  await admin.auth().deleteUser(uid);
  return { ok: true, uid };
});

// 교사가 이 학생을 탈퇴 처리해도 되는가.
//  · 담당 교사(같은 반)면 언제나 가능
//  · 그 외 교사는 학생 본인이 탈퇴를 신청한 경우에만 가능
//    (당직 교사가 신청 건을 처리하는 기존 운영 방식을 유지하기 위함)
async function canDeleteStudent(callerUid, targetUid) {
  if (await callerOwnsStudent(callerUid, targetUid)) return true;
  const prof = await db.doc(`users/${targetUid}`).get().catch(() => null);
  return !!(prof && prof.exists && prof.data().withdrawRequested === true);
}

// =============================================================
// [2-c] 탈퇴 — 계정과 데이터를 한 번에 파기 (권장 경로)
// -------------------------------------------------------------
// 예전에는 앱이 Firestore를 지운 뒤 계정 삭제를 따로 호출하고, 그 실패를
// 조용히 넘겼습니다. 그러면 계정과 교사 클레임이 살아남아 다음 로그인에
// 프로필이 되살아납니다. 이제 서버에서 한 번에 처리합니다.
//
// 순서: 로그인 계정 먼저 → 데이터. 중간에 실패해도 최소한 다시 로그인해
// 되살아나는 일은 없고, 같은 요청을 다시 보내면 남은 것만 마저 지웁니다.
exports.deleteStudentAccount = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

  const callerRole = request.auth.token.role;
  const callerIsAdmin =
    callerRole === "admin" ||
    (request.auth.token.email === INITIAL_ADMIN_EMAIL &&
      request.auth.token.email_verified === true);
  if (!(callerRole === "teacher" || callerIsAdmin)) {
    throw new HttpsError("permission-denied", "탈퇴 처리 권한이 없습니다.");
  }

  const { uid } = request.data || {};
  if (typeof uid !== "string" || !uid) {
    throw new HttpsError("invalid-argument", "uid를 올바르게 전달해 주세요.");
  }
  if (uid === request.auth.uid) {
    throw new HttpsError("invalid-argument", "본인 계정은 이 경로로 처리할 수 없습니다.");
  }

  const target = await admin.auth().getUser(uid).catch(() => null);
  if (target && target.email === INITIAL_ADMIN_EMAIL) {
    throw new HttpsError("permission-denied", "최고 관리자 계정은 삭제할 수 없습니다.");
  }
  const targetRole = target && target.customClaims && target.customClaims.role;
  if ((targetRole === "teacher" || targetRole === "admin") && !callerIsAdmin) {
    throw new HttpsError("permission-denied", "선생님 계정은 최고 관리자만 탈퇴 처리할 수 있습니다.");
  }
  if (!callerIsAdmin && !(await canDeleteStudent(request.auth.uid, uid))) {
    throw new HttpsError("permission-denied", "담당하는 반의 학생만 탈퇴 처리할 수 있습니다.");
  }

  const warnings = [];
  if (target) {
    // 계정을 먼저 없애 되살아날 여지를 차단합니다(클레임도 함께 사라짐).
    await admin.auth().deleteUser(uid);
  }
  await purgeStudentData(uid, warnings);

  return { ok: warnings.length === 0, uid, warnings };
});

// =============================================================
// [3] 예약 작업 — 주간 답변왕 정기 공지 (랜딩은 실시간 반영)
// -------------------------------------------------------------
// 순위 자체는 답변이 생기고/지워질 때마다 recomputeAnswerers()가 즉시
// 갱신하므로 랜딩은 항상 "현재까지"의 순위를 보여 줍니다. 이 예약 함수는
// 매주 월요일 오전 8시(서울)에 한 번 더 재집계하고 "이번 주 답변왕" 공지를
// 게시하는 용도입니다.
// ※ collectionGroup("answers") 쿼리는 최초 실행 시 색인이 필요할 수
//   있습니다. 함수 로그의 오류 메시지에 있는 링크를 누르면
//   Firebase 콘솔에서 한 번의 클릭으로 색인이 생성됩니다.
// =============================================================
exports.weeklyTopAnswerers = onSchedule(
  { schedule: "every monday 08:00", timeZone: "Asia/Seoul" },
  async () => {
    // 순위는 이미 답변이 생길 때마다 갱신되지만, 주간 정기 공지를 위해
    // 한 번 더 집계하고 공지사항으로도 게시합니다.
    const top = await recomputeAnswerers();
    if (top.length > 0) {
      const lines = top
        .map((t, i) => `${i + 1}위 ${t.authorName} (${t.count}개)`)
        .join(" · ");
      await db.collection("notices").add({
        title: "🏆 이번 주 답변왕",
        content: `이번 주(월요일부터) 가장 많이 답변해 준 친구들입니다. ${lines}. 모두 고마워요!`,
        authorId: "system",
        authorName: "배움나눔 봇",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
);

// =============================================================
// [3-b] 예약 작업 — 주간 질문대장 정기 재집계 (랜딩은 실시간 반영)
// -------------------------------------------------------------
// 순위는 질문이 생길 때마다 recomputeQuestioners()가 즉시 갱신하므로
// 랜딩은 항상 "현재까지"를 보여 줍니다. 이 예약 함수는 매주 월요일 오전
// 8시(서울)에 한 번 더 재집계하는 안전망입니다.
// · 이 문서는 로그인 전 랜딩 화면에서도 보여야 하므로, 보안 규칙에서
//   유일하게 "공개 읽기"를 허용합니다(작성자 uid는 담지 않고 익명 닉네임만).
// · 질문 문서의 authorName/authorEmoji는 접속(세션)마다 바뀌므로,
//   같은 authorId의 가장 최근 질문에 쓰인 닉네임을 대표로 사용합니다.
// =============================================================
exports.weeklyTopQuestioners = onSchedule(
  { schedule: "every monday 08:00", timeZone: "Asia/Seoul" },
  async () => {
    // 순위는 질문이 생길 때마다 실시간으로 갱신되므로, 여기서는 주간
    // 정기 재집계만 수행합니다(안전망).
    await recomputeQuestioners();
  }
);
