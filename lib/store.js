// =============================================================
// 데이터 레이어 (Firestore ↔ 데모 모드 자동 전환)
// -------------------------------------------------------------
// 화면(컴포넌트)은 이 파일의 함수만 호출합니다.
// - Firebase 설정이 완료되면 → Firestore에 실시간 저장/구독
// - 설정 전이면              → 브라우저 메모리에 임시 저장(데모 모드)
//
// [Firestore 데이터 구조] — 사용자별 구분을 위해 모든 문서에
// authorId(uid)를 저장합니다. 나중에 인증을 붙이면 이 값만
// 실제 로그인 유저의 uid로 바뀝니다.
//
//   questions (컬렉션)
//     └ { title, content, keyword, authorId, authorName,
//         authorEmoji, authorRealName,
//         answerCount, meTooIds, createdAt }
//        · meTooIds: "나도 궁금해요"를 누른 사용자 uid 배열.
//          uid가 이미 있으면 추가되지 않으므로 1인 1회가 보장되고,
//          배열 길이가 곧 클릭 수가 됩니다.
//        · authorName은 익명 닉네임, authorRealName은 실제 이름.
//          실명은 관리자(교사)가 프로필을 클릭할 때만 화면에 보입니다.
//       └ answers (하위 컬렉션)
//           └ { content, authorId, authorName, createdAt }
//   notices (컬렉션)
//     └ { title, content, authorId, authorName, createdAt }
// =============================================================
import { db, isFirebaseConfigured } from "./firebase";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  increment,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

// 기본 키워드 — keywords 컬렉션이 비어 있을 때 자동으로 심는 초기값.
// 운영 중 키워드 관리(추가/삭제/순서)는 관리자가 데이터로 수행합니다.
export const DEFAULT_KEYWORDS = [
  "국어",
  "영어",
  "수학",
  "사회",
  "과학",
  "정보",
  "기타",
];
// (하위 호환용 별칭 — 키워드 목록이 아직 로드되기 전 폴백으로 사용)
export const KEYWORDS = DEFAULT_KEYWORDS;

// -------------------------------------------------------------
// 데모 모드용 임시 데이터 (새로고침하면 초기화됩니다)
// -------------------------------------------------------------
const mock = {
  questions: [
    {
      id: "q1",
      title: "이차함수의 최댓값 구하는 방법이 헷갈려요",
      content:
        "y = -2x² + 4x + 1 의 최댓값을 구할 때 꼭짓점을 어떻게 찾는지 모르겠습니다. 완전제곱식으로 바꾸는 과정을 자세히 설명해 주실 분 있나요?",
      keyword: "수학",
      authorId: "user_01",
      authorName: "느긋한 거북이",
      authorEmoji: "🐢",
      authorRealName: "테스트 유저",
      answerCount: 1,
      resolved: true,
      meTooIds: ["user_02", "user_03"],
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
    },
    {
      id: "q2",
      title: "관계대명사 which와 that의 차이가 뭔가요?",
      content:
        "교과서 지문에서 어떤 때는 which, 어떤 때는 that을 쓰는데 둘을 구분하는 기준이 있나요? 콤마가 붙으면 that을 못 쓴다고 들었는데 이유가 궁금합니다.",
      keyword: "영어",
      authorId: "user_01",
      authorName: "엉뚱한 여우",
      authorEmoji: "🦊",
      authorRealName: "테스트 유저",
      answerCount: 0,
      resolved: false,
      meTooIds: [],
      createdAt: new Date(Date.now() - 1000 * 60 * 40),
    },
  ],
  answers: {
    q1: [
      {
        id: "a1",
        content:
          "y = -2(x² - 2x) + 1 = -2(x - 1)² + 3 으로 바꾸면 꼭짓점이 (1, 3)이에요. x²의 계수가 음수라서 위로 볼록 → 최댓값은 3입니다!",
        authorId: "user_01",
        authorName: "명랑한 펭귄",
        authorEmoji: "🐧",
        authorRealName: "테스트 유저",
        createdAt: new Date(Date.now() - 1000 * 60 * 90),
      },
    ],
  },
  notices: [
    {
      id: "n1",
      title: "질문 게시판 이용 안내",
      content:
        "질문은 과목 키워드를 선택해서 올려 주세요. 답변할 때는 친절하고 구체적으로 작성해 주시면 모두에게 도움이 됩니다.",
      authorId: "user_01",
      authorName: "선생님",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    },
    {
      id: "n2",
      title: "시험 기간 질문 환영!",
      content: "다음 주 시험 기간 동안 어려운 문제를 자유롭게 올려 주세요.",
      authorId: "user_01",
      authorName: "선생님",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
    },
  ],
};

// 데모 모드 키워드 (id + 이름 + 순서)
mock.keywords = DEFAULT_KEYWORDS.map((name, i) => ({
  id: `k${i}`,
  name,
  order: i,
}));

let mockSeq = 1;
const mockListeners = {
  questions: new Set(),
  notices: new Set(),
  keywords: new Set(),
  answers: new Map(), // questionId -> Set(callback)
};

function notify(set, data) {
  set.forEach((cb) => cb([...data]));
}

function sortByNewest(arr) {
  return [...arr].sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt));
}

function sortByOldest(arr) {
  return [...arr].sort((a, b) => toDate(a.createdAt) - toDate(b.createdAt));
}

// Firestore Timestamp와 일반 Date를 모두 Date로 변환
export function toDate(value) {
  if (!value) return new Date();
  if (typeof value.toDate === "function") return value.toDate();
  return value instanceof Date ? value : new Date(value);
}

// -------------------------------------------------------------
// 키워드 (Keywords) — 관리자 기능 대비 데이터 구조
// -------------------------------------------------------------
// keywords 컬렉션: { name, order }
// order 값으로 정렬하므로 드래그 앤 드롭 순서 변경은 order만
// 바꾸면 됩니다. 아래 CRUD 함수들은 데이터 계층만 미리 준비해
// 둔 것으로, 관리자 UI는 나중에 붙입니다.

// 키워드 목록 실시간 구독 ({id, name, order} 배열 전달)
export function subscribeKeywords(callback) {
  if (isFirebaseConfigured) {
    const q = query(collection(db, "keywords"), orderBy("order", "asc"));
    return onSnapshot(q, (snap) => {
      if (snap.empty) {
        // 컬렉션이 비어 있으면 기본 키워드를 한 번 심습니다
        seedDefaultKeywords();
        return;
      }
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  mockListeners.keywords.add(callback);
  callback([...mock.keywords].sort((a, b) => a.order - b.order));
  return () => mockListeners.keywords.delete(callback);
}

let keywordsSeeded = false;
async function seedDefaultKeywords() {
  if (keywordsSeeded) return;
  keywordsSeeded = true;
  await Promise.all(
    DEFAULT_KEYWORDS.map((name, i) =>
      addDoc(collection(db, "keywords"), { name, order: i })
    )
  );
}

function notifyKeywords() {
  notify(
    mockListeners.keywords,
    [...mock.keywords].sort((a, b) => a.order - b.order)
  );
}

// [관리자] 키워드 추가 (맨 뒤 순서로)
export async function addKeyword(name) {
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "keywords"), {
      name,
      order: Date.now(), // 충분히 큰 값 → 맨 뒤
    });
    return;
  }
  const maxOrder = Math.max(0, ...mock.keywords.map((k) => k.order));
  mock.keywords.push({ id: `k${++mockSeq}_m`, name, order: maxOrder + 1 });
  notifyKeywords();
}

// [관리자] 키워드 이름 변경
export async function renameKeyword(id, name) {
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "keywords", id), { name });
    return;
  }
  const k = mock.keywords.find((x) => x.id === id);
  if (k) k.name = name;
  notifyKeywords();
}

// [관리자] 키워드 삭제 (기존 질문의 키워드 문자열은 그대로 남습니다)
export async function deleteKeyword(id) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "keywords", id));
    return;
  }
  mock.keywords = mock.keywords.filter((x) => x.id !== id);
  notifyKeywords();
}

// [관리자] 순서 일괄 변경 — 드래그 앤 드롭 결과(id 배열)를 그대로 전달
export async function reorderKeywords(orderedIds) {
  if (isFirebaseConfigured) {
    await Promise.all(
      orderedIds.map((id, i) => updateDoc(doc(db, "keywords", id), { order: i }))
    );
    return;
  }
  orderedIds.forEach((id, i) => {
    const k = mock.keywords.find((x) => x.id === id);
    if (k) k.order = i;
  });
  notifyKeywords();
}

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
  callback(sortByNewest(mock.questions));
  return () => mockListeners.questions.delete(callback);
}

// 질문 등록. user는 { uid, displayName } 형태입니다.
// imageUrl: 첨부 이미지(data URL, 선택). Firestore 문서 1MB 제한이 있어
// 작성 폼에서 압축해 저장합니다. 원본이 필요하면 Firebase Storage 권장.
export async function addQuestion(user, { title, content, keyword, imageUrl }) {
  const data = {
    title,
    content,
    keyword,
    imageUrl: imageUrl ?? null,
    authorId: user.uid, // ← 사용자별 구분 키
    authorName: user.displayName, // 익명 닉네임
    authorEmoji: user.emoji ?? null, // 프로필 아바타 이모지
    authorRealName: user.realName ?? null, // 실명 (관리자 확인용)
    answerCount: 0,
    resolved: false, // 궁금해요(false) / 해결됐어요(true)
    meTooIds: [], // "나도 궁금해요"를 누른 사용자 uid 목록
  };
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "questions"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return;
  }
  mock.questions.push({ id: `q${++mockSeq}_m`, ...data, createdAt: new Date() });
  notify(mockListeners.questions, sortByNewest(mock.questions));
}

// 질문 내용 수정 — 작성자 본인만 호출하도록 화면에서 막습니다.
// (운영 시에는 Firestore 보안 규칙으로 authorId == request.auth.uid 검사)
export async function updateQuestion(
  questionId,
  { title, content, keyword, imageUrl }
) {
  const patch = { title, content, keyword, imageUrl: imageUrl ?? null };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId), patch);
    return;
  }
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) Object.assign(target, patch);
  notify(mockListeners.questions, sortByNewest(mock.questions));
}

// 질문 해결 상태 토글 (궁금해요 ↔ 해결됐어요)
export async function setQuestionResolved(questionId, resolved) {
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "questions", questionId), { resolved });
    return;
  }
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) target.resolved = resolved;
  notify(mockListeners.questions, sortByNewest(mock.questions));
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
    target.meTooIds = [...ids];
  }
  notify(mockListeners.questions, sortByNewest(mock.questions));
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

// 답변 등록. content는 서식(HTML) 문자열, imageUrl은 첨부 이미지(선택)
export async function addAnswer(user, questionId, content, imageUrl = null) {
  const data = {
    content,
    imageUrl: imageUrl ?? null,
    authorId: user.uid, // ← 사용자별 구분 키
    authorName: user.displayName, // 익명 닉네임
    authorEmoji: user.emoji ?? null, // 프로필 아바타 이모지
    authorRealName: user.realName ?? null, // 실명 (관리자 확인용)
  };
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "questions", questionId, "answers"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "questions", questionId), {
      answerCount: increment(1),
    });
    return;
  }
  if (!mock.answers[questionId]) mock.answers[questionId] = [];
  mock.answers[questionId].push({
    id: `a${++mockSeq}_m`,
    ...data,
    createdAt: new Date(),
  });
  const target = mock.questions.find((q) => q.id === questionId);
  if (target) target.answerCount += 1;
  notify(
    mockListeners.answers.get(questionId) ?? new Set(),
    sortByOldest(mock.answers[questionId])
  );
  notify(mockListeners.questions, sortByNewest(mock.questions));
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
  mock.notices.push({ id: `n${++mockSeq}_m`, ...data, createdAt: new Date() });
  notify(mockListeners.notices, sortByNewest(mock.notices));
}

// -------------------------------------------------------------
// 표시용 시간 포맷 ("방금 전", "5분 전" 등)
// -------------------------------------------------------------
export function formatTime(value) {
  const date = toDate(value);
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;
  return date.toLocaleDateString("ko-KR");
}
