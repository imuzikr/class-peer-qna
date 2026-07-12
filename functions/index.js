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
//  · 격려·칭찬 목적으로 실명(users.realName)을 함께 저장해 랜딩에 표시.
//    (공개 문서이므로 실명 노출 범위는 랜딩 접속자 전체 — 운영 결정 사항)
//  · 색인 없이 동작하도록 전체를 읽어 코드에서 창(週)으로 거릅니다.
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
// 상위 5명의 실명(users.realName)을 함께 붙입니다(격려·칭찬용 표시).
async function aggregateTop5(snap, sinceMillis) {
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
  const ranked = [...byUser.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  // 상위 5명만 users에서 실명 조회 (admin SDK — 규칙 미적용)
  const profiles = await Promise.all(
    ranked.map((r) => db.doc(`users/${r.uid}`).get().catch(() => null))
  );
  const top = ranked.map((r, i) => {
    const p = profiles[i]?.exists ? profiles[i].data() : null;
    return {
      authorName: r.authorName,
      authorEmoji: r.authorEmoji,
      realName: (p && p.realName) || "",
      count: r.count,
    };
  });
  return { top, total };
}

// 이번 주 "질문을 많이 올린" 상위 5명 → 공개 문서 갱신. top 반환.
async function recomputeQuestioners() {
  const snap = await db.collection("questions").get();
  const { top, total } = await aggregateTop5(snap, weekStartMillis());
  await db.doc("stats/weeklyQuestioners").set({
    top,
    totalQuestions: total,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return top;
}

// 이번 주 "답변을 많이 단" 상위 5명 → 공개 문서 갱신. top 반환.
async function recomputeAnswerers() {
  const snap = await db.collectionGroup("answers").get();
  const { top, total } = await aggregateTop5(snap, weekStartMillis());
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

    // 2) [3-알림] 질문 작성자에게 알림 (자기 질문에 단 답변은 제외)
    const questionSnap = await questionRef.get();
    if (!questionSnap.exists) return;
    const question = questionSnap.data();
    if (question.authorId === answer.authorId) return;

    // 2-a) 인앱 알림 문서 생성 — 클라이언트가 users/{uid}/notifications를
    //      구독하면 화면에 알림 목록을 띄울 수 있습니다.
    await db.collection(`users/${question.authorId}/notifications`).add({
      type: "new_answer",
      questionId,
      questionTitle: question.title,
      answerAuthorName: answer.authorName,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2-b) FCM 푸시 발송 — 클라이언트가 알림 권한을 받아
    //      users/{uid} 문서의 fcmTokens 배열에 토큰을 저장해 두면 발송됩니다.
    const userSnap = await db.doc(`users/${question.authorId}`).get();
    const tokens = userSnap.get("fcmTokens") || [];
    if (tokens.length === 0) return;

    const result = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: "새 답변이 달렸어요!",
        body: `${answer.authorName}님이 "${question.title}"에 답변했습니다.`,
      },
      data: { questionId },
    });

    // 만료된 토큰은 정리
    const deadTokens = tokens.filter(
      (_, i) => result.responses[i].error != null
    );
    if (deadTokens.length > 0) {
      await db.doc(`users/${question.authorId}`).update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...deadTokens),
      });
    }
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
exports.setUserRole = onCall(async (request) => {
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
exports.deleteAuthUser = onCall(async (request) => {
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

  await admin.auth().deleteUser(uid);
  return { ok: true, uid };
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
