// =============================================================
// 질문 · 답변 · 공지 (+ 공부방·리포트가 쓰는 질문 조회)
// -------------------------------------------------------------
// lib/store.js에서 떼어 낸 조각입니다. 화면은 지금까지처럼 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 그대로 다시 내보냅니다.
// =============================================================
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { toDate } from "../dates";
import { db, isFirebaseConfigured } from "../firebase";
import { sanitizeHtml } from "../html";
import { replaceDoc } from "../mockDocs";
import { deleteAttachedFiles } from "../storageUpload";
import {
  mock,
  mockListeners,
  nextMockSeq,
  notify,
  notifyQuestions,
  personalizeDemo,
  sortByNewest,
  sortByOldest,
} from "./shared";

// -------------------------------------------------------------
// 질문 (Questions)
// -------------------------------------------------------------

// 질문 목록 실시간 구독. 해제 함수(unsubscribe)를 반환합니다.
export function subscribeQuestions(callback) {
  if (isFirebaseConfigured) {
    const q = query(collection(db, "questions"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  mockListeners.questions.add(callback);
  callback(personalizeDemo(sortByNewest(mock.questions)));
  return () => mockListeners.questions.delete(callback);
}

// 내가 쓴 질문만 구독 — 학습 리포트·교사 대시보드의 '학생 한 명' 화면용.
// -------------------------------------------------------------
// 이 화면들은 지금까지 subscribeQuestions로 전체를 받아 authorId로 걸러
// 썼습니다. 질문이 쌓이면 한 학생의 리포트를 열 때마다 학교 전체 질문을
// 내려받게 되므로, 거르는 일을 서버로 옮깁니다. 화면에 나오는 결과는
// 같습니다 — 같은 조건을 어디서 적용하느냐만 다릅니다.
//
// orderBy를 붙이지 않고 받아서 여기서 정렬하는 이유: 'authorId ==' 에
// 'createdAt 정렬'을 함께 걸면 복합 색인이 필요합니다. 한 사람의 질문은
// 많아야 수백 건이라 여기서 세우는 편이 색인을 새로 배포하는 것보다 낫습니다
// (subscribeStudentRewardEvents와 같은 판단).
export function subscribeMyQuestions(uid, callback) {
  if (!uid) {
    callback([]);
    return () => {};
  }
  if (isFirebaseConfigured) {
    return onSnapshot(
      query(collection(db, "questions"), where("authorId", "==", uid)),
      (snap) => callback(sortByNewest(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      () => callback([])
    );
  }
  const emit = () =>
    callback(
      sortByNewest(personalizeDemo(mock.questions).filter((q) => q.authorId === uid))
    );
  mockListeners.questions.add(emit);
  emit();
  return () => mockListeners.questions.delete(emit);
}

// 특정 키워드에 걸린 질문만 구독 — 공부방 프로젝트의 '관련 질문'용.
// -------------------------------------------------------------
// 공부방도 전체 질문을 받아 boardKeywords로 걸러 쓰고 있었습니다. 공부방은
// 가장 자주 여는 화면이라 그대로 두면 부담이 제일 큽니다.
//
// 'in'은 한 번에 30개까지라 키워드가 더 많으면 나눠 묻고 합칩니다
// (fetchAnswerCounts와 같은 방식). 키워드가 없으면 조회하지 않습니다 —
// 빈 배열로 'in'을 물으면 오류이고, 어차피 결과도 없습니다.
export function subscribeQuestionsByKeywords(keywords, callback) {
  const list = [...new Set((keywords || []).filter(Boolean))];
  if (list.length === 0) {
    callback([]);
    return () => {};
  }
  if (isFirebaseConfigured) {
    const chunks = [];
    for (let i = 0; i < list.length; i += 30) chunks.push(list.slice(i, i + 30));
    const byChunk = chunks.map(() => []);
    const emit = () => callback(sortByNewest(byChunk.flat()));
    const unsubs = chunks.map((chunk, i) =>
      onSnapshot(
        query(collection(db, "questions"), where("keyword", "in", chunk)),
        (snap) => {
          byChunk[i] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          emit();
        },
        () => {
          byChunk[i] = [];
          emit();
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }
  const emit = () =>
    callback(
      sortByNewest(personalizeDemo(mock.questions).filter((q) => list.includes(q.keyword)))
    );
  mockListeners.questions.add(emit);
  emit();
  return () => mockListeners.questions.delete(emit);
}

// 질문 등록. user는 { uid, displayName } 형태입니다.
// imageUrl: 첨부 이미지(data URL, 선택). Firestore 문서 1MB 제한이 있어
// 작성 폼에서 압축해 저장합니다. 원본이 필요하면 Firebase Storage 권장.
export async function addQuestion(user, { title, content, keyword, imageUrl, images }) {
  const data = {
    title,
    content,
    keyword,
    imageUrl: imageUrl ?? null, // 구버전 단일 이미지(하위호환)
    images: images ?? [], // 다중 이미지(URL 배열)

    authorId: user.uid, // ← 사용자별 구분 키
    authorName: user.displayName, // 익명 닉네임
    authorEmoji: user.emoji ?? null, // 프로필 아바타 이모지
    // 실명·이메일 등 식별 정보는 게시물에 넣지 않습니다(모든 학생이 읽으므로).
    // 교사는 users/{uid}를 조회하는 사용자 디렉터리(subscribeUserDirectory)로 확인합니다.
    answerCount: 0,
    resolved: false, // 궁금해요(false) / 해결됐어요(true)
    understoodAnswerId: null, // 질문자가 "이해됐어요"로 표시한 답변 id
    meTooIds: [], // "나도 궁금해요"를 누른 사용자 uid 목록
  };
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "questions"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return;
  }
  mock.questions.push({ id: `q${nextMockSeq()}_m`, ...data, createdAt: new Date() });
  notifyQuestions();
}

// 질문 내용 수정 — 작성자 본인만 호출하도록 화면에서 막습니다.
// (운영 시에는 Firestore 보안 규칙으로 authorId == request.auth.uid 검사)
export async function updateQuestion(
  questionId,
  { title, content, keyword, imageUrl, images }
) {
  const patch = { title, content, keyword, imageUrl: imageUrl ?? null };
  if (images !== undefined) patch.images = images ?? [];
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId), patch);
    return;
  }
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) replaceDoc(mock.questions, target, patch);
  notifyQuestions();
}

// 질문 삭제 — 답변 서브컬렉션과 첨부된 이미지·파일(Storage)도 함께 삭제합니다.
export async function deleteQuestion(questionId) {
  if (isFirebaseConfigured) {
    const qRef = doc(db, "questions", questionId);
    const [qSnap, answersSnap] = await Promise.all([
      getDoc(qRef),
      getDocs(collection(db, "questions", questionId, "answers")),
    ]);
    await Promise.all([
      deleteAttachedFiles(qSnap.data()),
      ...answersSnap.docs.map((d) => deleteAttachedFiles(d.data())),
    ]);
    await Promise.all(answersSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(qRef);
    return;
  }
  mock.questions = mock.questions.filter((q) => q.id !== questionId);
  delete mock.answers[questionId];
  notifyQuestions();
}

// 질문 해결 상태 전환 (궁금해요 ↔ 해결됐어요)
// resolved=false 로 되돌릴 때는 reflectionPending과 understoodAnswerId를 함께 초기화합니다.
// 상단 고정 — 교사가 직접 켜고 끕니다(예전엔 '나도 궁금해요' 5회를
// 넘으면 자동으로 고정됐지만, 인기와 무관하게 교사가 짚어 주고 싶은
// 질문을 고정할 수 있도록 수동으로 바꿨습니다). pinnedAt은 고정한 시각
// 기준으로 최근 고정한 글이 위로 오게 하는 정렬용입니다.
export async function setQuestionPinned(questionId, pinned) {
  const patch = pinned
    ? { pinned: true, pinnedAt: isFirebaseConfigured ? serverTimestamp() : new Date() }
    : { pinned: false, pinnedAt: null };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId), patch);
    return;
  }
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) replaceDoc(mock.questions, target, patch);
  notifyQuestions();
}

export async function setQuestionResolved(questionId, resolved) {
  const patch = resolved
    ? { resolved: true }
    : { resolved: false, reflectionPending: false, understoodAnswerId: null };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId), patch);
    return;
  }
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) {
    replaceDoc(mock.questions, target, patch);
  }
  notifyQuestions();
}

// "나중에 쓸게요" — 해결은 되지만 인사이트를 미룬 상태로 표시합니다.
// understoodAnswerId를 함께 넘기면(이해됐어요 경로) 그 답변도 같이 저장합니다.
export async function setQuestionResolvedLater(questionId, understoodAnswerId = null) {
  const patch = {
    resolved: true,
    reflectionPending: true,
    understoodAnswerId: understoodAnswerId ?? null,
  };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId), patch);
    return;
  }
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) replaceDoc(mock.questions, target, patch);
  notifyQuestions();
}

// 한 줄 정리(인사이트) 저장 — "이해의 전환점"을 내 언어로 남기는 생성적 인사이트.
// 저장하면 reflectionPending이 해제되고 질문 상세에 모두에게 공개됩니다.
// understoodAnswerId를 함께 넘기면 "이해됐어요" 답변 표시도 함께 확정됩니다.
export async function addReflection(user, questionId, { learned, next }, understoodAnswerId = null) {
  const reflection = {
    learned: learned ?? "",
    next: next ?? "",
    authorId: user.uid,
    authorName: user.displayName,
    authorEmoji: user.emoji ?? null,
  };
  // 이해됐어요 경로면 understoodAnswerId + resolved도 함께 확정합니다.
  const understoodPatch = understoodAnswerId
    ? { understoodAnswerId, resolved: true }
    : {};
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId), {
      reflection: { ...reflection, createdAt: serverTimestamp() },
      reflectionPending: false,
      ...understoodPatch,
    });
    return;
  }
  const target = mock.questions.find((q) => q.id === questionId);
  replaceDoc(mock.questions, target, {
    reflection: { ...reflection, createdAt: new Date() },
    reflectionPending: false,
    ...(understoodAnswerId ? { understoodAnswerId, resolved: true } : {}),
  });
  notifyQuestions();
}

// 답변 강조 표시: 질문자가 가장 도움이 된 답변에 "이해됐어요"를 남깁니다.
// answerId=null 이면 강조와 해결 상태를 함께 해제합니다.
// 이 함수는 직접 호출하지 않고, ReflectionModal을 통해 addReflection과 함께 씁니다.
// (직접 호출이 필요한 경우는 이해됐어요 토글 OFF 경로뿐입니다.)
export async function setUnderstoodAnswer(questionId, answerId) {
  const patch = {
    understoodAnswerId: answerId ?? null,
    resolved: !!answerId,
    ...(answerId ? {} : { reflectionPending: false }),
  };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId), patch);
    return;
  }
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) replaceDoc(mock.questions, target, patch);
  notifyQuestions();
}

// "나도 궁금해요" 설정/해제
// - on=true  → meTooIds 배열에 uid 추가 (이미 있으면 중복 추가되지 않음)
// - on=false → 배열에서 uid 제거 (다시 눌러 취소)
// 배열 기반이라 같은 사람이 여러 번 눌러도 1회만 집계됩니다.
export async function setMeToo(user, questionId, on) {
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId), {
      meTooIds: on ? arrayUnion(user.uid) : arrayRemove(user.uid),
    });
    return;
  }
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) {
    const ids = new Set(target.meTooIds ?? []);
    if (on) ids.add(user.uid);
    else ids.delete(user.uid);
    replaceDoc(mock.questions, target, { meTooIds: [...ids] });
  }
  notifyQuestions();
}

// -------------------------------------------------------------
// 답변 (Answers) — questions/{questionId}/answers 하위 컬렉션
// -------------------------------------------------------------

export function subscribeAnswers(questionId, callback) {
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "questions", questionId, "answers"),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  if (!mockListeners.answers.has(questionId)) {
    mockListeners.answers.set(questionId, new Set());
  }
  mockListeners.answers.get(questionId).add(callback);
  callback(sortByOldest(mock.answers[questionId] ?? []));
  return () => mockListeners.answers.get(questionId)?.delete(callback);
}

// 답변 등록. content는 서식(HTML) 문자열, images는 첨부 이미지 URL 배열(선택)
export async function addAnswer(user, questionId, content, imageUrl = null, images = []) {
  const data = {
    content,
    imageUrl: imageUrl ?? null, // 구버전 단일 이미지(하위호환)
    images: images ?? [], // 다중 이미지(URL 배열)
    authorId: user.uid, // ← 사용자별 구분 키
    authorName: user.displayName, // 익명 닉네임
    authorEmoji: user.emoji ?? null, // 프로필 아바타 이모지
    // 실명·이메일은 게시물에 저장하지 않음 — 교사는 사용자 디렉터리로 확인
  };
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "questions", questionId, "answers"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    // answerCount는 onAnswerCreated Cloud Function이 서버에서 집계합니다.
    // 클라이언트에서 직접 올리면 Function 배포 후 중복 집계가 되므로 제거했습니다.
    return;
  }
  if (!mock.answers[questionId]) mock.answers[questionId] = [];
  mock.answers[questionId].push({
    id: `a${nextMockSeq()}_m`,
    ...data,
    createdAt: new Date(),
  });
  const target = mock.questions.find((q) => q.id === questionId);
  replaceDoc(mock.questions, target, (q) => ({ answerCount: (q.answerCount ?? 0) + 1 }));
  notify(
    mockListeners.answers.get(questionId) ?? new Set(),
    sortByOldest(mock.answers[questionId])
  );
  notifyQuestions();
}

// 답변 고치기 — **본문만** 바꿉니다. 첨부 이미지·반응·작성자·시각은 그대로
// 둡니다(규칙이 작성자에게 `content`·`imageUrl`·`images`만 열어 두었고, 그중
// 화면에서 고칠 수 있는 것은 글뿐입니다).
export async function updateAnswer(questionId, answerId, content) {
  if (!questionId || !answerId) return;
  const html = sanitizeHtml(content ?? "");
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId, "answers", answerId), {
      content: html,
    });
    return;
  }
  // mock은 **문서를 갈아 끼웁니다**(제자리에서 고치지 않고) — 같은 객체를
  // 고쳐 두면 그것을 들고 있는 쪽이 늘 같은 참조를 받아 React가 다시 그리지
  // 않습니다(반 문서·활동 문서에서 겪은 그 함정과 같습니다).
  const list = mock.answers[questionId] ?? [];
  mock.answers[questionId] = list.map((a) =>
    a.id === answerId ? { ...a, content: html } : a
  );
  notify(
    mockListeners.answers.get(questionId) ?? new Set(),
    sortByOldest(mock.answers[questionId])
  );
}

// 답변 지우기 — 첨부한 이미지도 함께 지웁니다(질문 삭제와 같은 길).
// answerCount는 onAnswerDeleted Cloud Function이 서버에서 내립니다 —
// 여기서 직접 내리면 함수와 겹쳐 두 번 깎입니다.
export async function deleteAnswer(questionId, answerId) {
  if (!questionId || !answerId) return;
  if (isFirebaseConfigured) {
    const ref = doc(db, "questions", questionId, "answers", answerId);
    const snap = await getDoc(ref);
    if (snap.exists()) await deleteAttachedFiles(snap.data());
    await deleteDoc(ref);
    return;
  }
  mock.answers[questionId] = (mock.answers[questionId] ?? []).filter(
    (a) => a.id !== answerId
  );
  const target = mock.questions.find((q) => q.id === questionId);
  if (target && target.answerCount > 0) {
    replaceDoc(mock.questions, target, (q) => ({ answerCount: q.answerCount - 1 }));
  }
  notify(
    mockListeners.answers.get(questionId) ?? new Set(),
    sortByOldest(mock.answers[questionId])
  );
  notifyQuestions();
}

// 답변에 다는 작은 반응 — 정답 여부와 상관없이 응답자의 노력을 가볍게
// 칭찬하는 용도입니다. meTooIds와 같은 배열 토글 방식이라, 같은 사람이
// 같은 이모티콘을 다시 누르면 취소되고 종류가 다르면 동시에 여러 개를
// 누를 수 있습니다. 자기 답변에는 반응할 수 없습니다(규칙에서도 막음).
const ANSWER_REACTION_FIELDS = {
  thumbsUp: "thumbsUpIds",
  heart: "heartIds",
  smile: "smileIds",
};

export async function setAnswerReaction(questionId, answerId, kind, uid, on) {
  const field = ANSWER_REACTION_FIELDS[kind];
  if (!field || !questionId || !answerId || !uid) return;
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId, "answers", answerId), {
      [field]: on ? arrayUnion(uid) : arrayRemove(uid),
    });
    return;
  }
  const a = (mock.answers[questionId] ?? []).find((x) => x.id === answerId);
  if (a) {
    const ids = new Set(a[field] ?? []);
    if (on) ids.add(uid);
    else ids.delete(uid);
    a[field] = [...ids];
  }
  notify(
    mockListeners.answers.get(questionId) ?? new Set(),
    sortByOldest(mock.answers[questionId] ?? [])
  );
}

// -------------------------------------------------------------
// 공지사항 (Notices)
// -------------------------------------------------------------

export function subscribeNotices(callback) {
  if (isFirebaseConfigured) {
    const q = query(collection(db, "notices"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  mockListeners.notices.add(callback);
  callback(sortByNewest(mock.notices));
  return () => mockListeners.notices.delete(callback);
}

export async function addNotice(user, { title, content }) {
  const data = {
    title,
    content,
    authorId: user.uid,
    // 공지는 관리자(교사) 전용이므로 익명 닉네임 대신 고정 이름 사용
    authorName: "선생님",
  };
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "notices"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return;
  }
  mock.notices.push({ id: `n${nextMockSeq()}_m`, ...data, createdAt: new Date() });
  notify(mockListeners.notices, sortByNewest(mock.notices));
}

// [작성자 본인 또는 최고 관리자] 공지 삭제
export async function deleteNotice(noticeId) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "notices", noticeId));
    return;
  }
  mock.notices = mock.notices.filter((n) => n.id !== noticeId);
  notify(mockListeners.notices, sortByNewest(mock.notices));
}

// 특정 학생들이 쓴 질문만 구독 — 공부방 참여 전광판의 '질문 수'용.
// -------------------------------------------------------------
// 전광판은 반 학생마다 '이 학생이 지금까지 쓴 질문 수'를 셉니다. 키워드로
// 좁힌 목록으로는 그 수가 달라지므로(프로젝트 키워드 질문만 세게 됨)
// 작성자 기준으로 따로 받습니다. 반 명단만큼이라 학교 전체보다 훨씬 적고,
// 전광판을 열었을 때만 구독합니다.
export function subscribeQuestionsByAuthors(uids, callback) {
  const list = [...new Set((uids || []).filter(Boolean))];
  if (list.length === 0) {
    callback([]);
    return () => {};
  }
  if (isFirebaseConfigured) {
    const chunks = [];
    for (let i = 0; i < list.length; i += 30) chunks.push(list.slice(i, i + 30));
    const byChunk = chunks.map(() => []);
    const emit = () => callback(sortByNewest(byChunk.flat()));
    const unsubs = chunks.map((chunk, i) =>
      onSnapshot(
        query(collection(db, "questions"), where("authorId", "in", chunk)),
        (snap) => {
          byChunk[i] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          emit();
        },
        () => {
          byChunk[i] = [];
          emit();
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }
  const emit = () =>
    callback(
      sortByNewest(personalizeDemo(mock.questions).filter((q) => list.includes(q.authorId)))
    );
  mockListeners.questions.add(emit);
  emit();
  return () => mockListeners.questions.delete(emit);
}

// 내가 쓴 답변 + 그 답변이 달린 질문 → [{ question, answer }] (최신순)
// -------------------------------------------------------------
// 학습 리포트는 '내가 답변한 것'의 키워드·제목이 필요합니다. 지금까지는
// 질문 전체를 받은 뒤 질문마다 답변을 구독해서(질문 수만큼 리스너!) 그중
// 내 답변만 골라 썼습니다. 질문이 5,000개면 리스너가 5,000개가 됩니다.
//
// 방향을 뒤집습니다. 내 답변을 먼저 찾고(collectionGroup + authorId, 이
// 색인은 firestore.indexes.json에 이미 있습니다), 그 답변이 달린 질문만
// 골라 읽습니다. 리스너는 하나, 읽는 질문은 내가 답한 것뿐입니다.
//
// 질문은 한 번 읽으면 캐시에 둡니다 — 답변이 하나 추가될 때마다 이미 아는
// 질문까지 다시 읽을 이유가 없습니다. 대신 질문 쪽 변화(제목 수정 등)는
// 이 화면에 바로 반영되지 않는데, 리포트는 내 활동 통계를 보는 자리라
// 그 정도면 충분합니다(예전 방식은 질문마다 실시간 구독을 걸어 얻던
// 최신성이었고, 그 대가가 리스너 5,000개였습니다).
export function subscribeMyAnswerEvents(uid, callback) {
  if (!uid) {
    callback([]);
    return () => {};
  }
  if (isFirebaseConfigured) {
    const questionCache = new Map();
    let live = true;
    let seq = 0;
    const unsub = onSnapshot(
      query(collectionGroup(db, "answers"), where("authorId", "==", uid)),
      async (snap) => {
        const mySeq = ++seq;
        // 답변 문서의 부모의 부모가 그 질문입니다 (questions/{qId}/answers/{aId})
        const rows = snap.docs.map((d) => ({
          questionId: d.ref.parent.parent?.id ?? null,
          answer: { id: d.id, ...d.data() },
        }));
        const missing = [
          ...new Set(rows.map((r) => r.questionId).filter((id) => id && !questionCache.has(id))),
        ];
        await Promise.all(
          missing.map(async (id) => {
            try {
              const qs = await getDoc(doc(db, "questions", id));
              if (qs.exists()) questionCache.set(id, { id: qs.id, ...qs.data() });
            } catch {
              /* 지워졌거나 못 읽는 질문 — 아래에서 건너뜁니다 */
            }
          })
        );
        // 기다리는 사이에 더 새로운 스냅숏이 왔거나 구독이 끊겼으면 버립니다
        if (!live || mySeq !== seq) return;
        const events = rows
          .filter((r) => r.questionId && questionCache.has(r.questionId))
          .map((r) => ({ question: questionCache.get(r.questionId), answer: r.answer }));
        callback(events.sort((a, b) => toDate(b.answer.createdAt) - toDate(a.answer.createdAt)));
      },
      () => callback([])
    );
    return () => {
      live = false;
      unsub();
    };
  }
  // 데모 모드 — mock.answers는 questionId를 키로 하는 객체입니다
  const emit = () => {
    const questions = personalizeDemo(mock.questions);
    const events = [];
    Object.entries(mock.answers ?? {}).forEach(([questionId, list]) => {
      const question = questions.find((q) => q.id === questionId);
      if (!question) return;
      (list ?? []).forEach((answer) => {
        if (answer.authorId === uid) events.push({ question, answer });
      });
    });
    callback(events.sort((a, b) => toDate(b.answer.createdAt) - toDate(a.answer.createdAt)));
  };
  // addAnswer가 끝에 notifyQuestions()를 부르므로 질문 리스너에 얹으면
  // 답변이 추가될 때도 함께 깨어납니다(별도 리스너 집합이 필요 없습니다).
  mockListeners.questions.add(emit);
  emit();
  return () => mockListeners.questions.delete(emit);
}

// [교사] 학생별 답변 수 → { uid: n }
// -------------------------------------------------------------
// 질문마다 답변을 구독하면 리스너가 질문 수만큼 늘어나므로, collectionGroup에
// authorId in [...] 한 번으로 셉니다(이 색인은 firestore.indexes.json에 이미
// 있습니다). 'in'은 한 번에 30개까지라 반 인원 단위로 나눠 물어봅니다.
export async function fetchAnswerCounts(uids) {
  const ids = [...new Set((uids || []).filter(Boolean))];
  const counts = {};
  ids.forEach((uid) => { counts[uid] = 0; });
  if (ids.length === 0) return counts;
  if (!isFirebaseConfigured) {
    // 데모 모드의 mock.answers는 questionId를 키로 하는 객체입니다
    Object.values(mock.answers ?? {}).forEach((list) => {
      (list ?? []).forEach((a) => {
        if (counts[a.authorId] != null) counts[a.authorId] += 1;
      });
    });
    return counts;
  }
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    try {
      const snap = await getDocs(
        query(collectionGroup(db, "answers"), where("authorId", "in", chunk))
      );
      snap.forEach((d) => {
        const uid = d.data()?.authorId;
        if (counts[uid] != null) counts[uid] += 1;
      });
    } catch {
      // 색인이 아직 없거나 권한 문제면 0으로 두고 넘어갑니다 —
      // 정보창의 다른 항목까지 막을 이유는 없습니다.
    }
  }
  return counts;
}
