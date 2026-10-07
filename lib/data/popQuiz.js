// =============================================================
// 돌발 퀴즈 — classes/{cId}/popQuizzes/{qId} (+ submissions/{uid})
// -------------------------------------------------------------
// 셈과 자료 모양은 lib/popQuiz.js 머리 주석에 있습니다. 화면은 지금까지처럼
// "@/lib/store"에서 가져갑니다 — store.js가 여기 공개 이름을 다시 내보냅니다.
//
// [반 문서에 두지 않는 까닭] 열린 퀴즈 하나만 생각하면 반 문서의 한 칸
// (`task`처럼)이면 되지만, 지난 퀴즈를 펴 보고 거기 달린 답을 다시 열어야
// 해서 문서로 쌓습니다. 학생 상단바는 **열린 것만**(`open == true`, 등호
// 하나 — 복합 색인 없음) 듣고, 지난 목록은 창을 열 때 한 번 읽습니다.
//
// [답은 학생마다 한 장 — 문서 ID가 uid] 반송된 뒤 다시 보내면 같은 문서를
// 고쳐 씁니다. 이력은 남기지 않습니다(선생님 요청 — 반송된 답은 학생 화면의
// 입력칸에 그대로 남아 고쳐 쓰는 데만 씁니다).
// =============================================================
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase";
import { sanitizeHtml } from "../html";
import { replaceDoc } from "../mockDocs";
import {
  QUIZ_ANSWER_MAX,
  QUIZ_DESC_MAX,
  QUIZ_NOTE_MAX,
  QUIZ_OUTPUT_MAX,
  QUIZ_TITLE_MAX,
  pickOpenQuiz,
  quizKindOf,
  sortQuizzes,
} from "../popQuiz";
import { getCurrentUser } from "../user";
import { addStudentReward } from "./rewards";
import { mock, nextMockSeq } from "./shared";

const quizzesCol = (classId) => collection(db, "classes", classId, "popQuizzes");
const quizRef = (classId, quizId) => doc(db, "classes", classId, "popQuizzes", quizId);
const answerRef = (classId, quizId, uid) =>
  doc(db, "classes", classId, "popQuizzes", quizId, "submissions", uid);
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// ── 데모 모드 ──
// 구독 콜백은 쓰기가 있을 때마다 다시 돌며 저마다 걸러 갑니다(퀴즈는 수업마다
// 한두 개라 거르는 값이 작습니다).
const mockSubs = new Set();
function mockQuizzes() {
  if (!mock.popQuizzes) mock.popQuizzes = [];
  return mock.popQuizzes;
}
function mockAnswers() {
  if (!mock.popQuizAnswers) mock.popQuizAnswers = [];
  return mock.popQuizAnswers;
}
function mockListen(emit) {
  mockSubs.add(emit);
  emit();
  return () => mockSubs.delete(emit);
}
function mockNotify() {
  mockSubs.forEach((fn) => fn());
}

// ── 퀴즈 ──

// [교사] 보내기 — 열려 있던 퀴즈를 닫고 새것을 엽니다(한 번에 하나 — 선생님 요청).
// 닫기와 열기를 한 묶음(batch)으로 써서, 둘 중 하나만 된 상태가 남지 않게 합니다.
export async function sendPopQuiz(classId, { kind, title, desc = "", boardId = null, boardTitle = "" }) {
  const clean = {
    kind: quizKindOf(kind),
    title: String(title ?? "").trim().slice(0, QUIZ_TITLE_MAX),
    desc: String(desc ?? "").replace(/\s+$/, "").slice(0, QUIZ_DESC_MAX),
    boardId: boardId || null,
    boardTitle: String(boardTitle ?? "").slice(0, 200),
  };
  if (!classId || !clean.title) throw new Error("제목을 적어 주세요.");
  const byUid = getCurrentUser()?.uid ?? null;
  if (isFirebaseConfigured) {
    const openSnap = await getDocs(query(quizzesCol(classId), where("open", "==", true)));
    const batch = writeBatch(db);
    openSnap.docs.forEach((d) => batch.update(d.ref, { open: false, closedAt: serverTimestamp() }));
    const ref = doc(quizzesCol(classId));
    batch.set(ref, { classId, ...clean, byUid, open: true, createdAt: serverTimestamp(), closedAt: null });
    await batch.commit();
    return ref.id;
  }
  const list = mockQuizzes();
  const now = new Date();
  list.filter((q) => q.classId === classId && q.open).forEach((q) =>
    replaceDoc(list, q, { open: false, closedAt: now })
  );
  const id = `pq${nextMockSeq()}_m`;
  list.push({ id, classId, ...clean, byUid, open: true, createdAt: now, closedAt: null });
  mockNotify();
  return id;
}

// [교사] 퀴즈 마치기 — 더는 보낼 수 없습니다. 이미 온 답은 그대로이고, 과일은
// 닫힌 뒤에도 줄 수 있습니다(반송은 못 함 — 다시 보낼 길이 없으므로).
export async function closePopQuiz(classId, quizId) {
  if (!classId || !quizId) return;
  if (isFirebaseConfigured) {
    await updateDoc(quizRef(classId, quizId), { open: false, closedAt: serverTimestamp() });
    return;
  }
  const list = mockQuizzes();
  const q = list.find((x) => x.id === quizId);
  if (q) replaceDoc(list, q, { open: false, closedAt: new Date() });
  mockNotify();
}

// [학생 · 교사] 지금 열린 퀴즈 하나(없으면 null) — 상단바가 늘 듣습니다.
export function subscribeOpenPopQuiz(classId, callback) {
  if (!classId) { callback(null); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      query(quizzesCol(classId), where("open", "==", true)),
      (snap) => callback(pickOpenQuiz(rows(snap))),
      (e) => { console.warn("[돌발 퀴즈] 열린 퀴즈를 읽지 못했어요:", e?.code, e?.message); callback(null); }
    );
  }
  return mockListen(() =>
    callback(pickOpenQuiz(mockQuizzes().filter((q) => q.classId === classId)))
  );
}

// [교사] 이 반의 퀴즈 전부(최근 것이 위) — 관리 창이 떠 있는 동안만.
export function subscribePopQuizzes(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      quizzesCol(classId),
      (snap) => callback(sortQuizzes(rows(snap))),
      (e) => { console.warn("[돌발 퀴즈] 퀴즈 목록을 읽지 못했어요:", e?.code, e?.message); callback([]); }
    );
  }
  return mockListen(() =>
    callback(sortQuizzes(mockQuizzes().filter((q) => q.classId === classId)))
  );
}

// [학생] 지난 퀴즈 목록 — 창을 열 때 한 번 읽습니다(구독 아님).
export async function fetchPopQuizzes(classId) {
  if (!classId) return [];
  if (isFirebaseConfigured) return sortQuizzes(rows(await getDocs(quizzesCol(classId))));
  return sortQuizzes(mockQuizzes().filter((q) => q.classId === classId));
}

// ── 답 ──

// [교사] 한 퀴즈에 온 답 전부.
export function subscribePopQuizAnswers(classId, quizId, callback) {
  if (!classId || !quizId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "classes", classId, "popQuizzes", quizId, "submissions"),
      (snap) => callback(rows(snap)),
      (e) => { console.warn("[돌발 퀴즈] 답을 읽지 못했어요:", e?.code, e?.message); callback([]); }
    );
  }
  return mockListen(() =>
    callback(mockAnswers().filter((a) => a.classId === classId && a.quizId === quizId))
  );
}

// [학생] 내 답 한 장(없으면 null).
export function subscribeMyPopQuizAnswer(classId, quizId, uid, callback) {
  if (!classId || !quizId || !uid) { callback(null); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      answerRef(classId, quizId, uid),
      (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (e) => { console.warn("[돌발 퀴즈] 내 답을 읽지 못했어요:", e?.code, e?.message); callback(null); }
    );
  }
  return mockListen(() =>
    callback(mockAnswers().find((a) => a.classId === classId && a.quizId === quizId && a.uid === uid) ?? null)
  );
}

// [학생] 지난 퀴즈의 내 답 — 목록에서 펼칠 때 한 건씩.
export async function fetchMyPopQuizAnswer(classId, quizId, uid) {
  if (!classId || !quizId || !uid) return null;
  if (isFirebaseConfigured) {
    const snap = await getDoc(answerRef(classId, quizId, uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }
  return mockAnswers().find((a) => a.classId === classId && a.quizId === quizId && a.uid === uid) ?? null;
}

// [학생] 선생님께 보내기 — 처음이면 새로, 반송된 뒤면 같은 문서를 고쳐 씁니다.
// 규칙이 '열린 퀴즈 · 아직 안 보냈거나 반송됨'만 받습니다(lib/popQuiz.js의
// canSubmitQuiz와 같은 판정). 글은 정화해서, 코드는 글자 그대로 둡니다.
export async function submitPopQuizAnswer(classId, quizId, uid, { kind, text, output = "" }) {
  if (!classId || !quizId || !uid) return;
  const k = quizKindOf(kind);
  const body = k === "code"
    ? String(text ?? "").replace(/\s+$/, "").slice(0, QUIZ_ANSWER_MAX)
    : sanitizeHtml(String(text ?? "")).slice(0, QUIZ_ANSWER_MAX);
  const out = k === "code" ? String(output ?? "").slice(0, QUIZ_OUTPUT_MAX) : "";
  const data = { classId, quizId, uid, kind: k, text: body, output: out, status: "submitted" };
  if (isFirebaseConfigured) {
    await setDoc(answerRef(classId, quizId, uid), { ...data, submittedAt: serverTimestamp() }, { merge: true });
    return;
  }
  const list = mockAnswers();
  const prev = list.find((a) => a.classId === classId && a.quizId === quizId && a.uid === uid);
  if (prev) replaceDoc(list, prev, { ...data, submittedAt: new Date() });
  else list.push({ id: uid, ...data, submittedAt: new Date() });
  mockNotify();
}

// [교사] 반송 — 다시 보내 달라는 뜻. 한 마디(선택)는 학생 창 맨 위에 섭니다.
export async function returnPopQuizAnswer(classId, quizId, uid, note = "") {
  if (!classId || !quizId || !uid) return;
  const patch = {
    status: "returned",
    returnNote: String(note ?? "").trim().slice(0, QUIZ_NOTE_MAX),
    reviewedBy: getCurrentUser()?.uid ?? null,
  };
  if (isFirebaseConfigured) {
    await updateDoc(answerRef(classId, quizId, uid), { ...patch, reviewedAt: serverTimestamp() });
    return;
  }
  const list = mockAnswers();
  const a = list.find((x) => x.classId === classId && x.quizId === quizId && x.uid === uid);
  if (a) replaceDoc(list, a, { ...patch, reviewedAt: new Date() });
  mockNotify();
}

// [교사] 과일 한 개 — 지급 이력에도 그대로 남습니다(addStudentReward). 과일을
// **먼저** 주고 답에 '받음'을 적습니다: 순서를 뒤집으면 표시만 바뀌고 과일이
// 안 나간 채 단추가 사라질 수 있습니다. 그 학생의 퀴즈는 여기서 끝납니다.
export async function rewardPopQuizAnswer(classId, quizId, uid, identity = null) {
  if (!classId || !quizId || !uid) return;
  await addStudentReward(classId, uid, 1, identity);
  const patch = { status: "rewarded", reviewedBy: getCurrentUser()?.uid ?? null };
  if (isFirebaseConfigured) {
    await updateDoc(answerRef(classId, quizId, uid), { ...patch, reviewedAt: serverTimestamp() });
    return;
  }
  const list = mockAnswers();
  const a = list.find((x) => x.classId === classId && x.quizId === quizId && x.uid === uid);
  if (a) replaceDoc(list, a, { ...patch, reviewedAt: new Date() });
  mockNotify();
}
