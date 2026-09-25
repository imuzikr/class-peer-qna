// =============================================================
// 출석 · 자리표 · 기본 모둠
// -------------------------------------------------------------
// lib/store.js에서 떼어 낸 조각입니다. 화면은 지금까지처럼 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 그대로 다시 내보냅니다.
// =============================================================
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { toDate, todayDateKey } from "../dates";
import { db, isFirebaseConfigured } from "../firebase";
import { STUDY_SEAT_COUNT } from "../seats";
import { mock, mockListeners } from "./shared";

// =============================================================
// 공부방 출석부 — 날짜별 출석 기록
// -------------------------------------------------------------
// classes/{classId}/attendanceRecords/{date_uid}
//   = { classId, uid, date, name, studentId, emoji, attendedAt, createdAt }
// 학생은 자기 출석만 남기고, 교사는 반 전체 출석 기록을 봅니다.
// =============================================================
function attendanceIdentity(user) {
  return {
    name: user.realName || user.displayName || "이름 미설정",
    studentId: user.studentId || null,
    emoji: user.emoji || "🙂",
  };
}

function sortAttendanceRecords(list) {
  return [...list].sort((a, b) => {
    const dateCmp = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateCmp) return dateCmp;
    return toDate(b.attendedAt || b.createdAt) - toDate(a.attendedAt || a.createdAt);
  });
}

function notifyAttendanceRecords(classId) {
  mockListeners.attendanceRecords?.get(classId)?.forEach((cb) => cb());
}

export async function markStudyAttendance(classId, user, date = todayDateKey()) {
  if (!classId || !user?.uid) return null;
  const id = `${date}_${user.uid}`;
  if (isFirebaseConfigured) {
    // 문서가 아직 없을 때 존재 여부를 먼저 get()으로 확인하면, 그 읽기 규칙이
    // resource.data를 참조하는 한(없는 문서는 resource가 null) 규칙 평가
    // 자체가 permission-denied로 거부됩니다. 그래서 사전 확인 없이 바로
    // 씁니다 — 이미 기록돼 있으면 규칙(update 금지)이 이 쓰기를 막아 주므로
    // 그 실패는 "이미 출석함"으로 보고 조용히 넘어갑니다.
    const ref = doc(db, "classes", classId, "attendanceRecords", id);
    const data = {
      classId,
      uid: user.uid,
      date,
      ...attendanceIdentity(user),
      attendedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };
    try {
      await setDoc(ref, data);
    } catch (e) {
      if (e?.code !== "permission-denied") throw e;
    }
    return { id, ...data };
  }
  if (!mock.attendanceRecords) mock.attendanceRecords = [];
  const prev = mock.attendanceRecords.find((r) => r.id === id && r.classId === classId);
  if (prev) return prev;
  const record = {
    id,
    classId,
    uid: user.uid,
    date,
    ...attendanceIdentity(user),
    attendedAt: new Date(),
    createdAt: new Date(),
  };
  mock.attendanceRecords.push(record);
  notifyAttendanceRecords(classId);
  return record;
}

export function subscribeMyStudyAttendance(classId, uid, callback) {
  if (!classId || !uid) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "classes", classId, "attendanceRecords"),
      where("uid", "==", uid)
    );
    return onSnapshot(
      q,
      (snap) => callback(sortAttendanceRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      () => callback([])
    );
  }
  if (!mock.attendanceRecords) mock.attendanceRecords = [];
  if (!mockListeners.attendanceRecords.has(classId)) {
    mockListeners.attendanceRecords.set(classId, new Set());
  }
  const emit = () =>
    callback(sortAttendanceRecords(mock.attendanceRecords.filter((r) => r.classId === classId && r.uid === uid)));
  mockListeners.attendanceRecords.get(classId).add(emit);
  emit();
  return () => mockListeners.attendanceRecords.get(classId)?.delete(emit);
}

export function subscribeClassStudyAttendance(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "classes", classId, "attendanceRecords"),
      (snap) => callback(sortAttendanceRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      () => callback([])
    );
  }
  if (!mock.attendanceRecords) mock.attendanceRecords = [];
  if (!mockListeners.attendanceRecords.has(classId)) {
    mockListeners.attendanceRecords.set(classId, new Set());
  }
  const emit = () =>
    callback(sortAttendanceRecords(mock.attendanceRecords.filter((r) => r.classId === classId)));
  mockListeners.attendanceRecords.get(classId).add(emit);
  emit();
  return () => mockListeners.attendanceRecords.get(classId)?.delete(emit);
}

// =============================================================
// 참여 전광판 — 기본 자리표 / 날짜별 임시 자리표 / 반 기본 모둠
// -------------------------------------------------------------
// classes/{classId}/seatLayouts/default
// classes/{classId}/seatLayouts/daily_YYYY-MM-DD
// classes/{classId}/groupAssignments/default
// =============================================================

export function dailySeatLayoutId(date = todayDateKey()) {
  return `daily_${date}`;
}

function normalizeSeatUids(seats = []) {
  const seen = new Set();
  const out = Array.from({ length: STUDY_SEAT_COUNT }, (_, i) => {
    const uid = typeof seats[i] === "string" && seats[i] ? seats[i] : null;
    if (!uid || seen.has(uid)) return null;
    seen.add(uid);
    return uid;
  });
  return out;
}

function seatLayoutKey(classId, layoutId) {
  return `${classId}_${layoutId}`;
}

function notifySeatLayout(classId, layoutId) {
  mockListeners.seatLayouts?.get(seatLayoutKey(classId, layoutId))?.forEach((cb) => cb());
}

function notifyGroupAssignment(classId) {
  mockListeners.groupAssignments?.get(classId)?.forEach((cb) => cb());
}

export async function saveStudySeatLayout(classId, layoutId, seats, user, extra = {}) {
  if (!classId || !layoutId || !user?.uid) return null;
  const cleanSeats = normalizeSeatUids(seats);
  const data = {
    classId,
    layoutId,
    seats: cleanSeats,
    ...extra,
    updatedBy: user.uid,
    updatedAt: isFirebaseConfigured ? serverTimestamp() : new Date(),
  };
  if (isFirebaseConfigured) {
    await setDoc(doc(db, "classes", classId, "seatLayouts", layoutId), data, { merge: true });
    return { id: layoutId, ...data };
  }
  if (!mock.seatLayouts) mock.seatLayouts = [];
  const idx = mock.seatLayouts.findIndex((x) => x.classId === classId && x.id === layoutId);
  const next = { id: layoutId, ...data };
  if (idx >= 0) mock.seatLayouts[idx] = { ...mock.seatLayouts[idx], ...next };
  else mock.seatLayouts.push(next);
  notifySeatLayout(classId, layoutId);
  return next;
}

export function subscribeStudySeatLayout(classId, layoutId, callback) {
  if (!classId || !layoutId) { callback(null); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      doc(db, "classes", classId, "seatLayouts", layoutId),
      (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => callback(null)
    );
  }
  if (!mock.seatLayouts) mock.seatLayouts = [];
  const key = seatLayoutKey(classId, layoutId);
  if (!mockListeners.seatLayouts.has(key)) mockListeners.seatLayouts.set(key, new Set());
  const emit = () =>
    callback(mock.seatLayouts.find((x) => x.classId === classId && x.id === layoutId) ?? null);
  mockListeners.seatLayouts.get(key).add(emit);
  emit();
  return () => mockListeners.seatLayouts.get(key)?.delete(emit);
}

const GROUP_COLORS = ["#2563eb", "#16a34a", "#f97316", "#9333ea", "#dc2626", "#0891b2"];

export function normalizeStudyGroups(groups = []) {
  const seen = new Set();
  return groups
    .slice(0, 6)
    .map((g, i) => {
      const index = Number(g.index ?? i + 1) || i + 1;
      const members = (g.members ?? [])
        .filter((m) => m?.uid && !seen.has(m.uid))
        .map((m) => {
          seen.add(m.uid);
          return {
            uid: m.uid,
            name: m.name || "이름 미설정",
            studentId: m.studentId || null,
            emoji: m.emoji || "🙂",
          };
        });
      return {
        id: g.id || `group_${index}`,
        index,
        name: (g.name || `${index}모둠`).trim(),
        color: g.color || GROUP_COLORS[(index - 1) % GROUP_COLORS.length],
        memberUids: members.map((m) => m.uid),
        members,
      };
    });
}

export async function saveStudyGroupAssignment(classId, groups, user) {
  if (!classId || !user?.uid) return null;
  const data = {
    classId,
    groups: normalizeStudyGroups(groups),
    updatedBy: user.uid,
    updatedAt: isFirebaseConfigured ? serverTimestamp() : new Date(),
  };
  if (isFirebaseConfigured) {
    await setDoc(doc(db, "classes", classId, "groupAssignments", "default"), data, { merge: true });
    return { id: "default", ...data };
  }
  if (!mock.groupAssignments) mock.groupAssignments = [];
  const idx = mock.groupAssignments.findIndex((x) => x.classId === classId && x.id === "default");
  const next = { id: "default", ...data };
  if (idx >= 0) mock.groupAssignments[idx] = { ...mock.groupAssignments[idx], ...next };
  else mock.groupAssignments.push(next);
  notifyGroupAssignment(classId);
  return next;
}

export function subscribeStudyGroupAssignment(classId, callback) {
  if (!classId) { callback(null); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      doc(db, "classes", classId, "groupAssignments", "default"),
      (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => callback(null)
    );
  }
  if (!mock.groupAssignments) mock.groupAssignments = [];
  if (!mockListeners.groupAssignments.has(classId)) mockListeners.groupAssignments.set(classId, new Set());
  const emit = () =>
    callback(mock.groupAssignments.find((x) => x.classId === classId && x.id === "default") ?? null);
  mockListeners.groupAssignments.get(classId).add(emit);
  emit();
  return () => mockListeners.groupAssignments.get(classId)?.delete(emit);
}
