// =============================================================
// 반에 딸린 데이터 일괄 파기
// -------------------------------------------------------------
// Firestore는 부모 문서를 지워도 하위 컬렉션이 함께 사라지지 않습니다.
// 그래서 반 문서만 지우면 출석부·자리표·기본 모둠·손들기·돌발 퀴즈 답이 그대로 남고,
// 그 안에는 실명·학번이 들어 있습니다(개인정보 파기 누락).
//
// db를 주입받는 별도 모듈로 둔 이유는, 에뮬레이터에서 "정말 하나도 남지
// 않는지"를 테스트로 확인하기 위해서입니다. 컬렉션이 새로 늘어날 때
// 여기에 추가하는 것을 잊으면 그 테스트가 잡아 줍니다.
// =============================================================

const { collectRefs } = require("./attachments/service");

// 반 문서 아래에 달리는 하위 컬렉션들. recursiveDelete가 알아서 훑지만,
// 무엇이 지워지는지 눈에 보이게 남겨 둡니다(테스트도 이 목록을 씁니다).
const CLASS_SUBCOLLECTIONS = [
  "attendanceRecords", // 출석부 — 실명·학번 포함
  "seatLayouts",       // 자리표(기본 + 날짜별 임시)
  "groupAssignments",  // 반 기본 모둠 — 실명·학번 포함
  "popQuizzes",        // 돌발 퀴즈 + submissions(학생 답) — 2단계까지 recursiveDelete
  "polls",             // 투표 + votes(학생이 고른 것) — 2단계까지 recursiveDelete
  "rewardEvents",      // 과일 지급 이력 — uid·지급 시각(참여 기록)
  "questionSignals",   // 손들기 — 실명·학번 포함
  "signalEvents",      // 손들기 이력 — 실명·학번·손든 시각(참여 기록)
  "signalMessages",    // 손들기 대화 — 학생과 교사가 주고받은 말
  "signalReplies",     // 옛 손들기 답변(대화 이전) — 남은 문서 정리용
  "classNotices",      // 반 공지 발송 이력 — 보낸 내용·시각
  "lessonMemos",       // 수업 메모 — 교사가 수업 중 적어 둔 것
  "chatMessages",      // 간편 메신저의 말 — 선생님 ↔ 학생 · 모둠 대화(실명 이름표)
  "chatReads",         // 간편 메신저의 읽음 표시
  "chatRoomReads",     // 간편 메신저 — 방마다 누가 어디까지 읽었나(말풍선의 읽음)
];

// classId 필드로 묶여 있는 최상위 컬렉션들.
// lessons는 반이 아니라 교사(ownerId)에 귀속되므로 여기 없습니다 —
// 반을 지워도 선생님의 수업 자료는 남아야 합니다.
const CLASS_SCOPED_COLLECTIONS = [
  { name: "rewards", label: "과일 보상" },
  { name: "studentNotes", label: "누가기록" },
  { name: "kwl", label: "KWL 기록" },
  { name: "presence", label: "참여 상태" },
  { name: "joinCodes", label: "입장 코드" },
  { name: "memberships", label: "반 소속" },
];

// 쿼리로 찾은 문서를 400개씩 나눠 지웁니다(배치 상한 회피).
async function deleteByQuery(db, query, warnings, label, remember) {
  try {
    const snap = await query.get();
    if (remember) snap.docs.forEach((doc) => remember(doc.data()));
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

// 쿼리로 찾은 문서들을 하위 컬렉션까지 통째로 지웁니다.
async function deleteMatchingDocsDeep(db, query, warnings, label, rememberTree) {
  try {
    const snap = await query.get();
    for (const d of snap.docs) {
      if (rememberTree) await rememberTree(d.ref, d.data());
      await db.recursiveDelete(d.ref);
    }
    return snap.size;
  } catch (e) {
    warnings.push(`${label}: ${e && e.message}`);
    return 0;
  }
}

/**
 * 반 하나에 딸린 모든 데이터를 지웁니다. 여러 번 실행해도 안전(멱등)합니다.
 *
 * @param db Firestore 인스턴스(admin SDK)
 * @param classId 지울 반
 * @param onCardAttachments 삭제한 문서의 첨부 파일을 정리하는 Admin 콜백(선택).
 *        호출 이름은 하위 호환으로 유지합니다. 보호된 파일은 다른 부모가 계속
 *        참조하는지 확인하며, Storage를 쓰지 않는 테스트에서는 넘기지 않습니다.
 * @returns warnings — 실패한 항목 목록. 비어 있어야 완전히 지워진 것입니다.
 */
async function purgeClassData(db, classId, onCardAttachments) {
  const warnings = [];
  const attachmentsToClean = [];
  const remember = onCardAttachments ? (data) => {
    if (data && (collectRefs(data).size || data.imageUrl || data.images?.length || data.attachments?.length)) {
      attachmentsToClean.push(data);
    }
  } : null;
  async function rememberTree(ref, data) {
    remember(data);
    for (const collection of await ref.listCollections()) {
      const children = await collection.get();
      for (const child of children.docs) await rememberTree(child.ref, child.data());
    }
  }

  // 1) 공부방 보드 — 먼저 참조를 모으고 보드를 통째로 지웁니다.
  //    파일은 모든 문서를 지운 뒤 정리해야 같은 반의 다른 사본에 남아 있던
  //    참조를 사용 중으로 잘못 판정하지 않습니다. 반 밖의 사본은 계속 보호합니다.
  try {
    const boardsSnap = await db.collection("studyBoards").where("classId", "==", classId).get();
    for (const boardDoc of boardsSnap.docs) {
      if (onCardAttachments) {
        await rememberTree(boardDoc.ref, boardDoc.data());
      }
      await db.recursiveDelete(boardDoc.ref);
    }
  } catch (e) {
    warnings.push(`공부방 보드: ${e && e.message}`);
  }

  // 2) 책방 활동 — groups/{gId}/words 와 entries 하위 컬렉션까지.
  //    entries에는 학생 실명과 제출물이 들어 있습니다.
  await deleteMatchingDocsDeep(
    db,
    db.collection("bookActivities").where("classId", "==", classId),
    warnings,
    "책방 활동",
    onCardAttachments ? rememberTree : null
  );

  // 3) classId 필드로 묶인 최상위 기록들
  for (const { name, label } of CLASS_SCOPED_COLLECTIONS) {
    await deleteByQuery(db, db.collection(name).where("classId", "==", classId), warnings, label, remember);
  }

  // 4) 방송 문서 — 문서 ID가 곧 classId
  try {
    const ref = db.doc(`broadcasts/${classId}`);
    if (remember) remember((await ref.get()).data());
    await ref.delete();
  } catch (e) {
    warnings.push(`방송 상태: ${e && e.message}`);
  }

  // 5) 반 문서 — 하위 컬렉션(CLASS_SUBCOLLECTIONS)까지 통째로.
  //    이력이라 규칙상 아무도 못 지우는 rewardEvents도 여기서 함께 사라집니다
  //    (admin SDK는 규칙을 우회합니다).
  //    맨 마지막에 지웁니다. 중간에 실패하면 반 문서가 남아 있어야 교사가
  //    다시 삭제를 눌러 이어서 정리할 수 있습니다.
  try {
    const ref = db.doc(`classes/${classId}`);
    if (remember) await rememberTree(ref, (await ref.get()).data());
    await db.recursiveDelete(ref);
  } catch (e) {
    warnings.push(`반 문서: ${e && e.message}`);
  }

  // Trusted Admin callback checks every surviving parent before deleting a
  // protected object. Errors remain visible and can be retried safely.
  if (onCardAttachments) {
    for (const data of attachmentsToClean) {
      try { await onCardAttachments(data); }
      catch (e) { warnings.push(`첨부 파일: ${e && e.message}`); }
    }
  }

  return warnings;
}

module.exports = {
  purgeClassData,
  CLASS_SUBCOLLECTIONS,
  CLASS_SCOPED_COLLECTIONS,
};
