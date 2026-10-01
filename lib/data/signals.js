// =============================================================
// 손들기(question signals)
// -------------------------------------------------------------
// lib/store.js에서 떼어 낸 조각입니다. 화면은 지금까지처럼 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 그대로 다시 내보냅니다.
// =============================================================
import {
  addDoc,
  collection,
  deleteDoc,
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
import { toDate } from "../dates";
import { db, isFirebaseConfigured } from "../firebase";
import { QUESTION_NOTE_MAX, QUESTION_TAG_KEYS } from "../questionTags";
import { SIGNAL_MESSAGE_MAX } from "../signalThread";
import { getCurrentUser } from "../user";
import { mock, mockListeners, nextMockSeq } from "./shared";

// =============================================================
// 언제든 질문하기 — 학생 손들기 신호
// -------------------------------------------------------------
// classes/{classId}/questionSignals/{uid}
//   = { classId, uid, name, studentId, emoji, createdAt, updatedAt }
// 학생은 자기 문서를 만들거나 지우고, 교사는 반 전체 목록을 봅니다.
// =============================================================
function notifyQuestionSignals(classId) {
  const list = Object.values(mock.questionSignals ?? {}).filter((s) => s.classId === classId);
  mockListeners.questionSignals?.get(classId)?.forEach((cb) => cb(list));
}

function signalIdentity(user) {
  return {
    name: user.realName || user.displayName || "이름 미설정",
    studentId: user.studentId || null,
    emoji: user.emoji || "🙂",
  };
}

function sortQuestionSignals(list) {
  return [...list].sort((a, b) => toDate(a.createdAt) - toDate(b.createdAt));
}

// [교사] 현재 반에서 손든 학생 목록 구독
// onError를 받는 이유 — 읽기에 실패해도 목록은 빈 배열이라, 화면에서는
// '아무도 손을 안 들었다'와 구분이 되지 않습니다. 그러면 교사는 기능이
// 고장 난 것을 '오늘은 아무도 안 물어보네'로 읽고 지나갑니다.
export function subscribeQuestionSignals(classId, callback, onError) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const q = collection(db, "classes", classId, "questionSignals");
    return onSnapshot(
      q,
      (snap) => {
        onError?.(null);
        callback(sortQuestionSignals(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
      },
      (e) => {
        console.warn("[질문하기] 손든 학생 목록을 읽지 못했어요:", e?.code, e?.message);
        onError?.(e?.code || "unknown");
        callback([]);
      }
    );
  }
  if (!mock.questionSignals) mock.questionSignals = {};
  if (!mockListeners.questionSignals.has(classId)) mockListeners.questionSignals.set(classId, new Set());
  const emit = () =>
    callback(sortQuestionSignals(Object.values(mock.questionSignals).filter((s) => s.classId === classId)));
  mockListeners.questionSignals.get(classId).add(emit);
  emit();
  return () => mockListeners.questionSignals.get(classId)?.delete(emit);
}

// [학생] 내 손들기 상태만 구독
export function subscribeMyQuestionSignal(classId, uid, callback) {
  if (!classId || !uid) { callback(null); return () => {}; }
  const id = `${uid}_${classId}`;
  if (isFirebaseConfigured) {
    return onSnapshot(
      doc(db, "classes", classId, "questionSignals", uid),
      (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (e) => { console.warn("[질문하기] 내 손들기 상태를 읽지 못했어요:", e?.code, e?.message); callback(null); }
    );
  }
  if (!mock.questionSignals) mock.questionSignals = {};
  if (!mockListeners.questionSignals.has(classId)) mockListeners.questionSignals.set(classId, new Set());
  const emit = () => callback(mock.questionSignals[id] ?? null);
  mockListeners.questionSignals.get(classId).add(emit);
  emit();
  return () => mockListeners.questionSignals.get(classId)?.delete(emit);
}

// [학생] 손들기 켜기/끄기
// 손을 **새로** 들 때는 남아 있던 지난 대화를 먼저 치우고, 손을 내리면 대화도
// 함께 지웁니다(대화는 손 하나에 한 줄기 — 아래 '손들기 대화').
export async function setQuestionSignal(classId, user, active, extra = {}) {
  if (!classId || !user?.uid) return;
  const id = `${user.uid}_${classId}`;
  // 태그와 메모 — '무엇 때문에 손을 들었나'. 둘 다 없어도 손은 올라갑니다
  // (그냥 부르는 손도 있어야 합니다). 태그는 정해진 셋 중 하나만 남기고,
  // 모르는 값은 버립니다 — 화면이 이름을 못 찾아 빈 알약이 뜨지 않게.
  const tag = QUESTION_TAG_KEYS.includes(extra.tag) ? extra.tag : "";
  const note = String(extra.note ?? "").trim().slice(0, QUESTION_NOTE_MAX);
  if (isFirebaseConfigured) {
    const ref = doc(db, "classes", classId, "questionSignals", user.uid);
    if (!active) {
      await deleteDoc(ref);
      await clearSignalMessages(classId, user.uid).catch((e) =>
        console.warn("[손들기] 대화를 치우지 못했어요:", e?.code, e?.message)
      );
      return;
    }
    const prev = await getDoc(ref);
    if (!prev.exists()) {
      await clearSignalMessages(classId, user.uid).catch((e) =>
        console.warn("[손들기] 지난 대화를 치우지 못했어요:", e?.code, e?.message)
      );
    }
    await setDoc(
      ref,
      {
        classId,
        uid: user.uid,
        ...signalIdentity(user),
        tag,
        note,
        createdAt: prev.exists() ? prev.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }
  if (!mock.questionSignals) mock.questionSignals = {};
  if (active) {
    const prev = mock.questionSignals[id];
    if (!prev) await clearSignalMessages(classId, user.uid);
    mock.questionSignals[id] = {
      id,
      classId,
      uid: user.uid,
      ...signalIdentity(user),
      tag,
      note,
      createdAt: prev?.createdAt ?? new Date(),
      seenAt: prev?.seenAt ?? null,
      updatedAt: new Date(),
    };
  } else {
    delete mock.questionSignals[id];
    await clearSignalMessages(classId, user.uid);
  }
  notifyQuestionSignals(classId);
}

// [교사] 손들기 확인 처리 — 목록에서 그 학생의 손들기를 지웁니다.
// setQuestionSignal은 "내(user) 손들기"만 다루므로, 교사가 다른 학생의
// 문서를 지우려면 uid를 직접 지정하는 별도 함수가 필요합니다.
// (규칙상 담당 교사는 ownsClassEditable(cId)로 삭제가 허용됩니다)
// [교사] 손든 학생을 '확인'으로 받아 주고 이력을 한 건 남깁니다.
// -------------------------------------------------------------
// questionSignals는 '지금 손든 사람'만 담고, 손이 내려가면 문서가 지워집니다.
// 그래서 '누가 언제 손을 들었나'가 전혀 남지 않았습니다 — 참여의 변화를 보려면
// 시계열이 있어야 해서 여기에 적습니다.
//
// [닫기는 세지 않습니다] '닫기'로 내린 손은 잘못 눌린 것이라 참여로 볼 수
// 없습니다. 그래서 이 함수는 '확인' 한 갈래뿐이고, 기록에 종류를 담지
// 않습니다 — 적혀 있다는 것 자체가 '교사가 받아 준 손'이라는 뜻입니다.
//
// [raisedAt] 손든 시각을 함께 남깁니다. 이력이 쌓이면 '손을 들고 얼마나
// 기다렸나'까지 볼 수 있는데, 나중에 다시 만들 수 없는 값이라 지금 담아 둡니다.
//
// 이력 쓰기가 실패해도 손은 내려갑니다 — 교사 화면에서 목록이 안 지워지는
// 편이 훨씬 곤란합니다(분석은 한 건 비는 것으로 끝납니다).
export async function confirmQuestionSignal(classId, signal) {
  const uid = signal?.uid;
  if (!classId || !uid) return;
  const byUid = getCurrentUser()?.uid ?? null;
  if (isFirebaseConfigured) {
    if (byUid) {
      try {
        await addDoc(collection(db, "classes", classId, "signalEvents"), {
          classId,
          uid,
          name: signal.name || "",
          studentId: signal.studentId ?? null,
          raisedAt: signal.createdAt ?? null,
          byUid,
          at: serverTimestamp(),
        });
      } catch (e) {
        console.warn("[손들기] 이력을 남기지 못했어요:", e?.code, e?.message);
      }
    }
    await dismissQuestionSignal(classId, uid);
    return;
  }
  if (!mock.signalEvents) mock.signalEvents = [];
  mock.signalEvents.push({
    id: `se${nextMockSeq()}_m`,
    classId,
    uid,
    name: signal.name || "",
    studentId: signal.studentId ?? null,
    raisedAt: signal.createdAt ?? null,
    byUid,
    at: new Date(),
  });
  mockListeners.signalEvents?.forEach((cb) => cb());
  await dismissQuestionSignal(classId, uid);
}

// 한 반의 손들기 이력 구독 (오래된 순) — 교사 대시보드용.
// 정렬은 받아서 여기서 합니다(where + orderBy는 복합 색인을 요구합니다).
export function subscribeClassSignalEvents(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  const sortByAt = (list) => [...list].sort((a, b) => toDate(a.at) - toDate(b.at));
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "classes", classId, "signalEvents"),
      (snap) => callback(sortByAt(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      () => callback([]) // 권한·네트워크 오류는 빈 목록
    );
  }
  if (!mock.signalEvents) mock.signalEvents = [];
  if (!mockListeners.signalEvents) mockListeners.signalEvents = new Set();
  const emit = () => callback(sortByAt(mock.signalEvents.filter((e) => e.classId === classId)));
  mockListeners.signalEvents.add(emit);
  emit();
  return () => mockListeners.signalEvents.delete(emit);
}

export async function dismissQuestionSignal(classId, uid) {
  if (!classId || !uid) return;
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "classes", classId, "questionSignals", uid));
    return;
  }
  const id = `${uid}_${classId}`;
  if (!mock.questionSignals) mock.questionSignals = {};
  delete mock.questionSignals[id];
  notifyQuestionSignals(classId);
}

// =============================================================
// 손들기 대화 — classes/{classId}/signalMessages/{자동 id}
// -------------------------------------------------------------
// = { classId, uid(그 학생), from('student'|'teacher'), text, byUid, at }
// 대화 한 줄기는 손들기 문서의 첫 물음 + 여기 쌓인 말입니다(셈은
// lib/signalThread.js). 고치기는 없고(쌓기만), 지우는 것은 대화를 끝낼 때:
//   · 학생이 '손 내리기' — 제 대화를 통째로
//   · 학생이 새로 손을 듦 — 남아 있던 지난 대화를 먼저 치움
//   · 교사가 '확인'·'닫기' — 교사의 말이 **없으면** 곧바로. 있으면 남겨 두어
//     학생이 읽은 뒤 스스로 치웁니다(닫자마자 지우면 방금 단 답을 학생이 영영
//     못 봅니다 — 답하고 곧바로 '확인'을 누르는 일이 흔합니다).
// 손들기 문서 안에 적지 않는 까닭: 학생과 교사가 **둘 다** 쓰는데 그 문서는
// 학생만 고칠 수 있습니다.
// =============================================================
function notifySignalMessages(classId) {
  mockListeners.signalMessages?.get(classId)?.forEach((cb) => cb());
}

function mockMessageListen(classId, emit) {
  if (!mock.signalMessages) mock.signalMessages = [];
  if (!mockListeners.signalMessages) mockListeners.signalMessages = new Map();
  if (!mockListeners.signalMessages.has(classId)) mockListeners.signalMessages.set(classId, new Set());
  mockListeners.signalMessages.get(classId).add(emit);
  emit();
  return () => mockListeners.signalMessages.get(classId)?.delete(emit);
}

const mockMessagesOf = (classId, uid) =>
  (mock.signalMessages ?? []).filter((m) => m.classId === classId && (!uid || m.uid === uid));

// [교사] 이 반의 대화 말 전부 — 손바닥 불(답을 기다리는 대화가 있나)에 쓰여
// 목록을 펼치지 않아도 늘 듣습니다. 열린 대화는 손든 학생 수만큼이라 작습니다.
export function subscribeSignalMessages(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "classes", classId, "signalMessages"),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => { console.warn("[손들기] 대화를 읽지 못했어요:", e?.code, e?.message); callback([]); }
    );
  }
  return mockMessageListen(classId, () => callback(mockMessagesOf(classId)));
}

// [학생] 내 대화의 말 — `where uid == 나`여야 규칙의 list를 통과합니다.
export function subscribeMySignalMessages(classId, uid, callback) {
  if (!classId || !uid) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      query(collection(db, "classes", classId, "signalMessages"), where("uid", "==", uid)),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => { console.warn("[손들기] 내 대화를 읽지 못했어요:", e?.code, e?.message); callback([]); }
    );
  }
  return mockMessageListen(classId, () => callback(mockMessagesOf(classId, uid)));
}

// 한 마디 보내기 — from은 'student'(본인 대화) 또는 'teacher'(담당 교사).
export async function sendSignalMessage(classId, studentUid, from, text) {
  const body = String(text ?? "").trim().slice(0, SIGNAL_MESSAGE_MAX);
  if (!classId || !studentUid || !body) return;
  const role = from === "teacher" ? "teacher" : "student";
  const byUid = getCurrentUser()?.uid ?? null;
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "classes", classId, "signalMessages"), {
      classId, uid: studentUid, from: role, text: body, byUid, at: serverTimestamp(),
    });
    return;
  }
  if (!mock.signalMessages) mock.signalMessages = [];
  mock.signalMessages = [
    ...mock.signalMessages,
    { id: `sm${nextMockSeq()}_m`, classId, uid: studentUid, from: role, text: body, byUid, at: new Date() },
  ];
  notifySignalMessages(classId);
}

// 한 학생의 대화를 통째로 지웁니다(학생 본인 · 담당 교사).
export async function clearSignalMessages(classId, studentUid) {
  if (!classId || !studentUid) return;
  if (isFirebaseConfigured) {
    const snap = await getDocs(
      query(collection(db, "classes", classId, "signalMessages"), where("uid", "==", studentUid))
    );
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return;
  }
  const before = mock.signalMessages?.length ?? 0;
  mock.signalMessages = (mock.signalMessages ?? []).filter(
    (m) => !(m.classId === classId && m.uid === studentUid)
  );
  if (mock.signalMessages.length !== before) notifySignalMessages(classId);
}

// [학생] 선생님 말을 읽었다 — 제 손들기 문서에 읽은 시각을 적습니다(규칙은 그
// 문서의 학생 update 그대로: 손든 시각 불변 · updatedAt은 서버 시각).
export async function markSignalSeen(classId, uid) {
  if (!classId || !uid) return;
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "classes", classId, "questionSignals", uid), {
      seenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }
  const id = `${uid}_${classId}`;
  const s = mock.questionSignals?.[id];
  if (!s) return;
  mock.questionSignals[id] = { ...s, seenAt: new Date(), updatedAt: new Date() }; // 갈아 끼우기
  notifyQuestionSignals(classId);
}
