// =============================================================
// KWLS 기록
// -------------------------------------------------------------
// lib/store.js에서 떼어 낸 조각입니다. 화면은 지금까지처럼 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 그대로 다시 내보냅니다.
// =============================================================
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { toDate, todayDateKey } from "../dates";
import { db, isFirebaseConfigured } from "../firebase";
import {
  emptyKwlsAnswers,
  kwlsAnswersFromEntry,
  kwlsFilledCount,
  kwlsLegacyFieldsFromAnswers,
} from "../kwls";
import { replaceDoc } from "../mockDocs";
import { saveParatextEntry } from "./books";
import { mock, mockListeners } from "./shared";

// =============================================================
// KWL — 저장마다 새 항목 생성 (append 모델)
// =============================================================
function notifyKwl(classId, date) {
  const key = `${classId}_${date}`;
  const entries = mock.kwl.filter((e) => e.classId === classId && e.date === date);
  mockListeners.kwl.get(key)?.forEach((cb) => cb([...entries]));
  mockListeners.kwl.get(`${classId}_*`)?.forEach((cb) => cb());
  // 사용자 단위(반 무관) 구독자 — 관리자 대시보드 학생별 KWL 조회용
  // 활동 단위 구독자(act_) — 책방 KWLS 활동 화면. 둘 다 자기 조건으로
  // 다시 걸러 내므로 인자 없이 깨우기만 하면 됩니다.
  for (const [k, set] of mockListeners.kwl) {
    if (k.startsWith("userkwl_") || k.startsWith("act_")) set.forEach((cb) => cb());
  }
  // 전체 구독자 — 관리자 공부방별 통계용
  mockListeners.kwl.get("__all__")?.forEach((cb) => cb());
}

// 오늘 내 KWL 항목 목록 구독 (배열 반환, 등록 순)
export function subscribeMyTodayKwl(classId, userId, date, callback) {
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "kwl"),
      where("classId", "==", classId),
      where("userId", "==", userId),
      where("date", "==", date),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(
      q,
      (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (e) => {
        console.warn("[KWLS] 오늘 내 기록을 읽지 못했어요:", e?.code, e?.message);
        callback([]);
      }
    );
  }
  const key = `${classId}_${date}`;
  if (!mockListeners.kwl.has(key)) mockListeners.kwl.set(key, new Set());
  const wrapped = (allEntries) =>
    callback(allEntries.filter((e) => e.userId === userId));
  mockListeners.kwl.get(key).add(wrapped);
  wrapped(mock.kwl.filter((e) => e.classId === classId && e.date === date));
  return () => mockListeners.kwl.get(key)?.delete(wrapped);
}

// 교사용 — 해당 수업일 전체 학생 KWL 구독
//
// 오류 콜백이 꼭 있어야 합니다. 이 구독이 실패하면(대개 규칙 — 내가 그 반의
// 소유 교사가 아니거나 role 클레임이 없을 때) onSnapshot은 아무 말 없이
// 조용히 멈춥니다. 그러면 교사 패널의 K·W·L·S 격자는 '학생이 아직 안 썼음'과
// 똑같이 전부 회색으로 보여서, 기록이 멀쩡히 있는데도 원인을 짐작할 수
// 없었습니다. 실패를 콘솔에 남겨 두 상황을 구분합니다.
export function subscribeAllKwl(classId, date, callback) {
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "kwl"),
      where("classId", "==", classId),
      where("date", "==", date)
    );
    return onSnapshot(
      q,
      (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (e) => {
        console.warn(
          "[KWLS] 반 전체 기록을 읽지 못했어요 — 격자가 빈 것은 '안 씀'이 아니라 이 오류 때문입니다:",
          e?.code,
          e?.message
        );
        callback([]);
      }
    );
  }
  const key = `${classId}_${date}`;
  if (!mockListeners.kwl.has(key)) mockListeners.kwl.set(key, new Set());
  mockListeners.kwl.get(key).add(callback);
  callback(mock.kwl.filter((e) => e.classId === classId && e.date === date));
  return () => mockListeners.kwl.get(key)?.delete(callback);
}

// subscribeAllKwl과 동일 조건으로 1회성 재조회 — 전체 화면의 '새로고침' 버튼용.
// (실시간 구독이 이미 켜져 있지만, 연결이 끊겼을 때도 확실히 최신화하기 위함)
export async function fetchAllKwlOnce(classId, date) {
  if (isFirebaseConfigured) {
    const snap = await getDocs(
      query(
        collection(db, "kwl"),
        where("classId", "==", classId),
        where("date", "==", date)
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return mock.kwl.filter((e) => e.classId === classId && e.date === date);
}

// [교사] 이 반의 KWLS가 '어느 날에 있는가' — 전체 화면 달력에 깔 요약
// -------------------------------------------------------------
// 달력은 '이 날 기록이 있나'만 알면 되는데, 그걸 알려면 결국 그 반의 kwl
// 문서를 다 읽어야 합니다. 날짜 범위로 좁히려면 classId 등호와 date 범위를
// 함께 걸어야 해서 복합 색인이 필요해집니다 — 색인을 늘리지 않으려고
// 등호 하나로 받고 날짜별 집계는 여기서 합니다.
//
// 그래서 한 번만 읽고 반별로 쥐고 있습니다(달력을 열거나 화살표를 처음
// 누를 때 한 번). 전체 화면의 '새로고침' 버튼이 이 캐시를 버립니다. 지금
// 보고 있는 날짜의 숫자는 화면이 이미 실시간으로 들고 있으므로
// (subscribeAllKwl) 화면에서 그 값으로 덮어씁니다 — 방금 쓴 학생이 달력에
// 바로 보이도록.
//
// [한 번 읽고 둘을 냅니다] 달력은 '그날 몇 명이 썼나'(days)를 쓰고, 좌우
// 화살표는 '이 학생이 쓴 날은 언제인가'(byUid)를 씁니다. 같은 질의 하나로
// 나오는 값이라 캐시에 함께 담아 둡니다 — 화살표 때문에 반의 kwl을 한 번
// 더 읽을 이유가 없습니다.
//
// [세는 기준은 '문서가 있나'가 아니라 '한 칸이라도 썼나'입니다.]
// 빈 문서가 남은 날을 세면 달력이 초록인데 열어 보면 아무것도 없고,
// 화살표도 그 빈 날에 내려앉습니다. 종합 격자가 칸을 칠하는 기준
// (kwlsFilledCount > 0)과 같게 맞춰 세 화면이 한 날짜를 두고 다른 말을
// 하지 않게 합니다.
const _kwlDaysCache = new Map(); // classId -> { days, byUid }
// 같은 순간에 days와 byUid를 함께 물어보므로(화면이 Promise.all로 부릅니다)
// 아직 답이 안 온 질의를 붙잡아 둡니다 — 없으면 캐시가 비어 있는 첫 호출에서
// 같은 질의가 두 번 나갑니다.
const _kwlDaysInflight = new Map();

export function invalidateKwlDays(classId = null) {
  if (classId) _kwlDaysCache.delete(classId);
  else _kwlDaysCache.clear();
}

function loadKwlDayIndex(classId, force) {
  if (!force && _kwlDaysCache.has(classId)) return Promise.resolve(_kwlDaysCache.get(classId));
  if (_kwlDaysInflight.has(classId)) return _kwlDaysInflight.get(classId);
  const p = readKwlDayIndex(classId).finally(() => _kwlDaysInflight.delete(classId));
  _kwlDaysInflight.set(classId, p);
  return p;
}

async function readKwlDayIndex(classId) {
  let rows;
  if (isFirebaseConfigured) {
    const snap = await getDocs(
      query(collection(db, "kwl"), where("classId", "==", classId))
    );
    rows = snap.docs.map((d) => d.data());
  } else {
    rows = mock.kwl.filter((e) => e.classId === classId);
  }
  // 한 학생이 같은 날 여러 건을 쓸 수 있어(공부방 하루 성찰 + 책방 KWLS 활동)
  // 건수가 아니라 사람 수로 셉니다 — 달력에서 '몇 명이 썼나'가 더 읽기 쉽고,
  // 전체 화면 머리의 'n명'과도 같은 뜻이 됩니다.
  const byDate = new Map();
  const byUser = new Map();
  rows.forEach((e) => {
    if (!e.date || !e.userId) return;
    if (kwlsFilledCount(kwlsAnswersFromEntry(e)) === 0) return;
    if (!byDate.has(e.date)) byDate.set(e.date, new Set());
    byDate.get(e.date).add(e.userId);
    if (!byUser.has(e.userId)) byUser.set(e.userId, new Set());
    byUser.get(e.userId).add(e.date);
  });
  const days = {};
  byDate.forEach((uids, date) => { days[date] = uids.size; });
  const byUid = {};
  byUser.forEach((dates, uid) => { byUid[uid] = [...dates].sort(); });
  const index = { days, byUid };
  _kwlDaysCache.set(classId, index);
  return index;
}

export async function fetchKwlDays(classId, { force = false } = {}) {
  if (!classId) return {};
  return (await loadKwlDayIndex(classId, force)).days;
}

// [교사] 학생별로 'KWLS를 쓴 날' 목록 — { uid: ['YYYY-MM-DD', …] 오름차순 }
// 전체 화면의 좌우 화살표가 '다음 기록이 있는 날'로 건너뛰는 데 씁니다.
export async function fetchKwlUserDays(classId, { force = false } = {}) {
  if (!classId) return {};
  return (await loadKwlDayIndex(classId, force)).byUid;
}

// 내 전체 KWL 기록 구독 (최신순)
export function subscribeMyAllKwl(classId, userId, callback) {
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "kwl"),
      where("classId", "==", classId),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(
      q,
      (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (e) => {
        console.warn("[KWLS] 내 기록 목록을 읽지 못했어요:", e?.code, e?.message);
        callback([]);
      }
    );
  }
  const key = `${classId}_*`;
  if (!mockListeners.kwl.has(key)) mockListeners.kwl.set(key, new Set());
  const cb = () =>
    callback(
      [...mock.kwl]
        .filter((e) => e.classId === classId && e.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    );
  mockListeners.kwl.get(key).add(cb);
  cb();
  return () => mockListeners.kwl.get(key)?.delete(cb);
}

// 특정 학생의 전체 KWL 기록 구독 (반 무관) — 관리자 대시보드 학생별 조회용
export function subscribeUserKwl(userId, callback) {
  if (!userId) {
    callback([]);
    return () => {};
  }
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "kwl"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  const key = `userkwl_${userId}`;
  if (!mockListeners.kwl.has(key)) mockListeners.kwl.set(key, new Set());
  const cb = () =>
    callback(
      [...mock.kwl]
        .filter((e) => e.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    );
  mockListeners.kwl.get(key).add(cb);
  cb();
  return () => mockListeners.kwl.get(key)?.delete(cb);
}

// 전체 KWL 구독 (모든 반·사용자) — 관리자 공부방별 통계용
export function subscribeKwlAll(callback) {
  if (isFirebaseConfigured) {
    const q = query(collection(db, "kwl"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  const key = "__all__";
  if (!mockListeners.kwl.has(key)) mockListeners.kwl.set(key, new Set());
  const cb = () =>
    callback([...mock.kwl].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  mockListeners.kwl.get(key).add(cb);
  cb();
  return () => mockListeners.kwl.get(key)?.delete(cb);
}

// 여러 반의 KWL을 반별 구독으로 나눠 합쳐 반환 (일반 교사: 소유 반만).
// 규칙상 교사는 전체 kwl을 나열할 수 없으므로 반별(where classId==)로 나눕니다.
export function subscribeKwlForClasses(classIds, callback) {
  const ids = [...new Set((classIds || []).filter(Boolean))];
  if (ids.length === 0) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const byClass = {};
    const emit = () => {
      const all = Object.values(byClass).flat();
      all.sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt));
      callback(all);
    };
    const unsubs = ids.map((cid) =>
      onSnapshot(
        query(collection(db, "kwl"), where("classId", "==", cid)),
        (snap) => { byClass[cid] = snap.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); },
        () => { byClass[cid] = []; emit(); }
      )
    );
    return () => unsubs.forEach((u) => u());
  }
  const key = "__all__";
  if (!mockListeners.kwl.has(key)) mockListeners.kwl.set(key, new Set());
  const cb = () =>
    callback(
      [...mock.kwl]
        .filter((e) => ids.includes(e.classId))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    );
  mockListeners.kwl.get(key).add(cb);
  cb();
  return () => mockListeners.kwl.get(key)?.delete(cb);
}

// KWL 저장 — 하루 1개. 문서 ID를 uid_classId_date로 고정해, 같은 날 다시
// 저장하면 새로 만들지 않고 덮어씁니다(upsert). (중복 생성 방지)
export async function addKwl(classId, user, date, values = {}) {
  const id = `${user.uid}_${classId}_${date}`;
  const answers = {
    ...emptyKwlsAnswers(),
    ...(values.answers ?? {}),
    know: values.answers?.know ?? values.K ?? "",
    want: values.answers?.want ?? values.W ?? "",
    learned: values.answers?.learned ?? values.L ?? "",
    still: values.answers?.still ?? values.S ?? "",
  };
  const data = {
    classId,
    userId: user.uid,
    date,
    answers,
    ...kwlsLegacyFieldsFromAnswers(answers),
    authorName: user.displayName ?? "나",
    authorEmoji: user.emoji ?? "🙂",
  };
  if (isFirebaseConfigured) {
    await setDoc(
      doc(db, "kwl", id),
      { ...data, createdAt: serverTimestamp() },
      { merge: true }
    );
    return;
  }
  const existing = mock.kwl.find((e) => e.id === id);
  if (existing) replaceDoc(mock.kwl, existing, data);
  else mock.kwl.push({ id, ...data, createdAt: new Date() });
  notifyKwl(classId, date);
}

// 책방 KWLS 활동 저장 — 책방 기록(entries)과 공부방 KWLS 스트림(kwl)에 함께.
// -------------------------------------------------------------
// 학생이 KWLS를 공부방에서 썼는지 책방 활동에서 썼는지는 '저장한 자리'의
// 차이일 뿐, 학습으로 보면 같은 성찰입니다. 그런데 그동안 두 곳에 따로
// 쌓여서 히트맵·기록 탭·교사 패널이 한쪽만 보고 있었습니다.
//
// entries를 없애고 kwl로 합치지 않은 이유: entries는 곁텍스트·RAFT·마인드맵이
// 함께 쓰는 저장소라, KWLS만 떼어내면 책방 화면(KwlsBoard·발표 모드)이 함께
// 깨집니다. 그래서 책방 쪽은 그대로 두고 kwl에도 적습니다 — 관찰 화면은
// 전부 kwl을 보므로 이것만으로 일원화됩니다.
//
// 문서 ID에 act_를 넣어 그날의 공부방 KWLS(uid_classId_date)와 부딪히지
// 않게 합니다. 같은 날 둘 다 써도 둘 다 남습니다.
// topic — 교사가 활동에 주제어를 정해 두었으면 그것, 비워 두었으면 학생이
// 자기 화면에서 적은 것. kwl 스트림(기록 탭·히트맵)에도 같은 값이 실려야
// 두 곳에서 같은 이름으로 보입니다.
export async function saveKwlsActivityEntry(activity, user, answers, topic = "") {
  await saveParatextEntry(activity.id, user, answers);
  if (!activity.classId) return; // 반이 없는 활동은 kwl 스트림에 넣을 수 없음

  const id = `${user.uid}_${activity.classId}_act_${activity.id}`;
  const base = {
    classId: activity.classId,
    userId: user.uid,
    answers: { ...emptyKwlsAnswers(), ...answers },
    // 어디서 쓴 것인지 — 기록 탭에서 '책방' 딱지를 붙이는 데 씁니다
    activityId: activity.id,
    activityTitle: activity.title ?? "",
    topic: (activity.topic ?? "").trim() || String(topic ?? "").trim(),
    authorName: user.displayName ?? "나",
    authorEmoji: user.emoji ?? "🙂",
  };
  base.K = base.answers.know;
  base.W = base.answers.want;
  base.L = base.answers.learned;
  base.S = base.answers.still;

  if (isFirebaseConfigured) {
    const ref = doc(db, "kwl", id);
    // date는 처음 쓴 날로 고정합니다. 규칙(kwl update)이 date가 그대로일
    // 것을 요구해서, 다음 날 고치며 오늘 날짜를 다시 실어 보내면 거부됩니다.
    // createdAt도 마찬가지 — subscribeMyTodayKwl이 createdAt으로 정렬하는데
    // 그 필드가 없으면 쿼리에서 아예 빠집니다.
    const existing = await getDoc(ref).catch(() => null);
    const first = !existing?.exists();
    await setDoc(
      ref,
      first
        ? { ...base, date: todayDateKey(), createdAt: serverTimestamp() }
        : base,
      { merge: true }
    );
    return;
  }
  const found = mock.kwl.find((e) => e.id === id);
  if (found) replaceDoc(mock.kwl, found, base);
  else mock.kwl.push({ id, ...base, date: todayDateKey(), createdAt: new Date() });
  notifyKwl(activity.classId, todayDateKey());
}

// [교사] 책방 KWLS 활동 한 개의 제출물 — kwl 스트림에서 읽습니다.
// -------------------------------------------------------------
// 예전에는 bookActivities/{id}/entries 를 읽었습니다. 그런데 같은 성찰이
// 공부방 쪽 kwl 에도 쌓이면서 '어느 쪽이 진짜인가'가 생겼습니다. 관찰
// 화면을 kwl 하나로 모으는 중이라, 이 화면도 kwl 을 보게 합니다.
//
// classId까지 함께 거는 이유는 두 가지입니다. 규칙이 문서마다
// ownsClass(classId) 로 판정하므로 반을 명시하면 통과가 분명해지고,
// 등식 조건 두 개는 색인을 따로 만들 필요가 없습니다.
//
// 반환 모양은 entries 쪽(authorId·authorName·answers)에 맞춰 둡니다 —
// 부르는 화면(KwlsBoard)이 그 모양을 이미 쓰고 있어서, 저장소가 바뀐 것을
// 화면이 알 필요가 없습니다.
export function subscribeActivityKwl(classId, actId, callback) {
  if (!classId || !actId) { callback([]); return () => {}; }
  const shape = (d) => ({
    id: d.id,
    authorId: d.userId,
    authorName: d.authorName ?? "",
    answers: kwlsAnswersFromEntry(d),
    // 교사가 활동에 주제어를 비워 두면 학생이 각자 적습니다. 교사 화면이
    // '누가 무엇을 다루는지'를 보여 주려면 이 값이 여기까지 와야 합니다.
    topic: d.topic ?? "",
    updatedAt: d.createdAt ?? null,
  });
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "kwl"),
      where("classId", "==", classId),
      where("activityId", "==", actId)
    );
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((doc) => shape({ id: doc.id, ...doc.data() }))),
      (e) => {
        console.warn("[KWLS] 활동 제출물을 읽지 못했어요:", e?.code, e?.message);
        callback([]);
      }
    );
  }
  const key = `act_${actId}`;
  if (!mockListeners.kwl.has(key)) mockListeners.kwl.set(key, new Set());
  const cb = () =>
    callback(
      mock.kwl
        .filter((e) => e.classId === classId && e.activityId === actId)
        .map(shape)
    );
  mockListeners.kwl.get(key).add(cb);
  cb();
  return () => mockListeners.kwl.get(key)?.delete(cb);
}

// KWL 삭제 (중복 정리·삭제용)
export async function deleteKwl(entry) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "kwl", entry.id));
    return;
  }
  mock.kwl = mock.kwl.filter((e) => e.id !== entry.id);
  notifyKwl(entry.classId, entry.date);
}

// KWL 항목 수정 (저장 후 내용 편집). entry는 { id, classId, date }를 포함.
export async function updateKwl(entry, values = {}) {
  const answers = {
    ...emptyKwlsAnswers(),
    ...(values.answers ?? {}),
    know: values.answers?.know ?? values.K ?? "",
    want: values.answers?.want ?? values.W ?? "",
    learned: values.answers?.learned ?? values.L ?? "",
    still: values.answers?.still ?? values.S ?? "",
  };
  const legacyFields = kwlsLegacyFieldsFromAnswers(answers);
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "kwl", entry.id), {
      answers,
      ...legacyFields,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  const target = mock.kwl.find((e) => e.id === entry.id);
  if (target) replaceDoc(mock.kwl, target, { answers, ...legacyFields });
  notifyKwl(target?.classId ?? entry.classId, target?.date ?? entry.date);
}
