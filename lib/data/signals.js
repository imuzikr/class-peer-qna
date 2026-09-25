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
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { toDate } from "../dates";
import { db, isFirebaseConfigured } from "../firebase";
import { QUESTION_NOTE_MAX, QUESTION_TAG_KEYS } from "../questionTags";
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
      return;
    }
    const prev = await getDoc(ref);
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
    mock.questionSignals[id] = {
      id,
      classId,
      uid: user.uid,
      ...signalIdentity(user),
      tag,
      note,
      createdAt: prev?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
  } else {
    delete mock.questionSignals[id];
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
