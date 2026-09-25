// =============================================================
// 누가기록(교사가 학생마다 적는 기록)
// -------------------------------------------------------------
// lib/store.js에서 떼어 낸 조각입니다. 화면은 지금까지처럼 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 그대로 다시 내보냅니다.
// =============================================================
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { toDate, todayDateKey } from "../dates";
import { db, isFirebaseConfigured } from "../firebase";
import { mock, mockListeners, nextMockSeq } from "./shared";

// =============================================================
// 누가기록(학생 관찰 기록) — 교사가 학생별로 남기는 append 메모
// -------------------------------------------------------------
// studentNotes/{autoId} = { studentUid, classId, teacherId, teacherName, text, date, createdAt }
//  · 교사만 읽기·쓰기(학생은 볼 수 없음). '멋진 순간'을 준 순간의 기록이나,
//    과일과 무관한 관찰 메모를 학생별로 누적합니다. 대시보드에서 확인.
//  · date("YYYY-MM-DD")는 '언제 있었던 일인지'를 교사가 직접 적는 값입니다.
//    createdAt(기록을 남긴 시각)과 달리 지난 날 일을 뒤늦게 적을 수 있어야
//    하므로 따로 둡니다. date가 없는 옛 기록은 createdAt으로 대신 정렬합니다.
// =============================================================
function notifyStudentNotes(studentUid) {
  mockListeners.studentNotes?.get(studentUid)?.forEach((cb) => cb());
  // 반 단위 건수(누가기록 관리 화면)도 함께 깨웁니다 — 기록을 남기자마자
  // 그 학생 카드의 표식이 바뀌어야 합니다.
  mockListeners.classNoteCounts?.forEach((cb) => cb());
}

// 누가기록 정렬 키 — 교사가 적은 날짜(date)를 우선하고, 없으면 작성 시각
function noteSortKey(n) {
  if (n.date) return new Date(`${n.date}T23:59:59`).getTime();
  return toDate(n.createdAt).getTime();
}
function sortNotes(list) {
  return [...list].sort((a, b) => noteSortKey(b) - noteSortKey(a));
}

// 특정 학생의 누가기록 구독 (최신순) — 교사 전용
export function subscribeStudentNotes(studentUid, callback) {
  if (!studentUid) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    // studentUid 단일 조건 + 클라 정렬(복합 색인 불필요)
    const q = query(collection(db, "studentNotes"), where("studentUid", "==", studentUid));
    return onSnapshot(
      q,
      (snap) => callback(sortNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      () => callback([])
    );
  }
  if (!mock.studentNotes) mock.studentNotes = [];
  if (!mockListeners.studentNotes) mockListeners.studentNotes = new Map();
  if (!mockListeners.studentNotes.has(studentUid)) {
    mockListeners.studentNotes.set(studentUid, new Set());
  }
  const emit = () =>
    callback(sortNotes(mock.studentNotes.filter((n) => n.studentUid === studentUid)));
  mockListeners.studentNotes.get(studentUid).add(emit);
  emit();
  return () => mockListeners.studentNotes.get(studentUid)?.delete(emit);
}

// [교사] 이 반 누가기록의 '학생별 건수' 구독 → { studentUid: n }
// -------------------------------------------------------------
// 누가기록 관리 화면에서 학생 카드마다 기록이 있는지 없는지를 표시하는 데
// 씁니다. 학생마다 따로 구독하면 반 인원만큼 리스너가 생기므로(28명이면
// 28개) classId 하나로 반 전체를 한 번에 받아 여기서 셉니다.
//
// 내용은 세는 데 쓰지 않지만 문서를 통째로 받게 됩니다 — 누가기록은 한 반에
// 많아야 수백 건이고, 이 화면은 교사가 열었을 때만 구독합니다.
export function subscribeClassNoteCounts(classId, callback) {
  if (!classId) { callback({}); return () => {}; }
  const tally = (list) => {
    const counts = {};
    list.forEach((n) => {
      if (!n.studentUid) return;
      counts[n.studentUid] = (counts[n.studentUid] ?? 0) + 1;
    });
    return counts;
  };
  if (isFirebaseConfigured) {
    return onSnapshot(
      query(collection(db, "studentNotes"), where("classId", "==", classId)),
      (snap) => callback(tally(snap.docs.map((d) => d.data()))),
      () => callback({})
    );
  }
  if (!mock.studentNotes) mock.studentNotes = [];
  if (!mockListeners.classNoteCounts) mockListeners.classNoteCounts = new Set();
  const emit = () => callback(tally(mock.studentNotes.filter((n) => n.classId === classId)));
  mockListeners.classNoteCounts.add(emit);
  emit();
  return () => mockListeners.classNoteCounts.delete(emit);
}

// [교사] 누가기록 추가 (append)
export async function addStudentNote(
  user,
  studentUid,
  { text, classId = null, date = null }
) {
  const data = {
    studentUid,
    classId: classId ?? null,
    teacherId: user.uid,
    teacherName: user.displayName ?? "선생님",
    text,
    date: date || todayDateKey(),
  };
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "studentNotes"), { ...data, createdAt: serverTimestamp() });
    return;
  }
  if (!mock.studentNotes) mock.studentNotes = [];
  mock.studentNotes.push({ id: `note${nextMockSeq()}_m`, ...data, createdAt: new Date() });
  notifyStudentNotes(studentUid);
}

// [교사] 누가기록 수정 — 날짜·내용만 고칠 수 있습니다(작성자 정보는 그대로).
export async function updateStudentNote(noteId, studentUid, { text, date }) {
  const patch = {};
  if (text !== undefined) patch.text = text;
  if (date !== undefined) patch.date = date || todayDateKey();
  if (Object.keys(patch).length === 0) return;
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "studentNotes", noteId), patch);
    return;
  }
  mock.studentNotes = (mock.studentNotes ?? []).map((n) =>
    n.id === noteId ? { ...n, ...patch } : n
  );
  notifyStudentNotes(studentUid);
}

// [교사] 누가기록 삭제
export async function deleteStudentNote(noteId, studentUid) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "studentNotes", noteId));
    return;
  }
  mock.studentNotes = (mock.studentNotes ?? []).filter((n) => n.id !== noteId);
  notifyStudentNotes(studentUid);
}
