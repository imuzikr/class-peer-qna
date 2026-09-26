// =============================================================
// 수업 자료 · 방송 · 접속 표시
// -------------------------------------------------------------
// lib/store.js에서 떼어 낸 조각입니다. 화면은 지금까지처럼 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 그대로 다시 내보냅니다.
// =============================================================
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { toDate } from "../dates";
import { db, isFirebaseConfigured } from "../firebase";
import { replaceDoc } from "../mockDocs";
import { deleteAttachedFiles } from "../storageUpload";
import { mock, mockListeners, nextMockSeq } from "./shared";

// =============================================================
// 수업 자료 (수업하기 모드) — 슬라이드 이미지 + 장별 메모
// -------------------------------------------------------------
// lessons/{lessonId} = { title, ownerId, ownerName, slides[], createdAt }
//   slides: [{ imageUrl, note }] — 배열 순서가 곧 슬라이드 순서
//
// · 특정 반이 아니라 '만든 선생님'에게 귀속됩니다 — 같은 과목을 여러 반에
//   가르칠 때 자료 하나로 모든 반에서 수업할 수 있게.
// · 학생은 이 컬렉션을 읽지 않습니다. 수업 중 보이는 슬라이드는 방송
//   문서(broadcasts)에 담긴 현재 장 이미지 URL 하나뿐입니다.
// · 슬라이드가 많아도 장당 URL+메모라 문서 1MB 제한에 여유가 큽니다.
// =============================================================
function notifyLessons() {
  mockListeners.lessons?.forEach((cb) => cb([...(mock.lessons ?? [])]));
}

// 내가 만든 수업 자료 구독 (최신순)
export function subscribeMyLessons(uid, callback) {
  if (!uid) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    // ownerId 단일 조건 + 클라 정렬(복합 색인 불필요)
    const q = query(collection(db, "lessons"), where("ownerId", "==", uid));
    return onSnapshot(
      q,
      (snap) => callback(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
      ),
      (e) => {
        console.warn("[수업하기] 자료 목록을 읽지 못했어요:", e?.code, e?.message);
        callback([]);
      }
    );
  }
  if (!mock.lessons) mock.lessons = [];
  if (!mockListeners.lessons) mockListeners.lessons = new Set();
  const emit = () => callback([...mock.lessons]);
  mockListeners.lessons.add(emit);
  emit();
  return () => mockListeners.lessons.delete(emit);
}

// 새 수업을 만들 때 기본으로 넣어 두는 활동 안내 예시.
// (지금은 안내 문구 목록일 뿐입니다 — 활동 기능은 나중에 다듬을 예정)
export const DEFAULT_LESSON_ACTIVITIES = [
  "짝과 함께 오늘 배운 것을 한 문장으로 말해 보기",
  "공부방에 활동 결과물을 카드로 남기기",
  "질문방에 아직 궁금한 점 올리기",
];

// [교사] 수업 자료 만들기 — slides는 이미 업로드된 [{ imageUrl, note }]
export async function addLesson(user, { title, slides = [], activities }) {
  const data = {
    title: title || "새 수업",
    ownerId: user.uid,
    ownerName: user.realName || user.displayName || "선생님",
    slides,
    activities: activities ?? [...DEFAULT_LESSON_ACTIVITIES],
  };
  if (isFirebaseConfigured) {
    const ref = await addDoc(collection(db, "lessons"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }
  if (!mock.lessons) mock.lessons = [];
  const id = `lesson${nextMockSeq()}_m`;
  mock.lessons.unshift({ id, ...data, createdAt: new Date() });
  notifyLessons();
  return id;
}

// [교사] 수업 자료 수정 (제목·장별 메모)
export async function updateLesson(lessonId, patch) {
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "lessons", lessonId), patch);
    return;
  }
  const l = (mock.lessons ?? []).find((x) => x.id === lessonId);
  if (l) replaceDoc(mock.lessons, l, patch);
  notifyLessons();
}

// [교사] 이 반에서 이 수업을 했다고 적어 둡니다 — '수업 시작하기'를 누를 때.
// taughtDays = { [classId]: ["2026-09-25", …] } — 반마다 **수업한 날**만 모읍니다
// (같은 날 여러 번 열어도 한 번). 수업 관리 창의 '반별 현황'이 이것으로
// '어느 반에서 언제·몇 번 했나'를 셉니다. 자료는 반에 안 묶인 선생님의
// 것이라 이 기록이 없으면 그 물음에 답할 자리가 아예 없었습니다.
// 규칙은 안 건드립니다 — 만든 선생님의 update가 필드를 못 박아 두지 않습니다.
export async function recordLessonTaught(lessonId, classId, dateKey) {
  if (!lessonId || !classId || !dateKey) return;
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "lessons", lessonId), {
      [`taughtDays.${classId}`]: arrayUnion(dateKey),
    });
    return;
  }
  const l = (mock.lessons ?? []).find((x) => x.id === lessonId);
  if (!l) return;
  const had = l.taughtDays?.[classId] ?? [];
  if (had.includes(dateKey)) return;
  replaceDoc(mock.lessons, l, {
    taughtDays: { ...(l.taughtDays ?? {}), [classId]: [...had, dateKey] },
  });
  notifyLessons();
}

// [교사] 수업 자료 삭제 — 슬라이드 이미지도 Storage에서 함께 정리
export async function deleteLesson(lessonId, slides = []) {
  if (isFirebaseConfigured) {
    await deleteAttachedFiles({ images: slides.map((s) => s.imageUrl) });
    await deleteDoc(doc(db, "lessons", lessonId));
    return;
  }
  mock.lessons = (mock.lessons ?? []).filter((x) => x.id !== lessonId);
  notifyLessons();
}

// =============================================================
// 발표 강제 전환(방송) — 교사가 발표 모드·크게 보기를 켜면 그 반 학생
// 전원의 화면이 자동으로 그 슬라이드로 바뀝니다(교사 화면은 그대로).
// -------------------------------------------------------------
// broadcasts/{classId} — 반마다 문서 1개. 문서가 있으면 방송 중, 없으면
// 방송 중이 아님(별도 active 플래그 없이 존재 여부로 판단).
//  · mode: 'carousel'(보드 캐러셀) | 'single'(카드 크게 보기)
//  · 이미지는 담지 않고 텍스트만(첨부·이미지 없이 슬라이드로 보여주는
//    발표 화면 설계와 동일한 이유 — 학생 화면에 그대로 밀어 보내므로
//    더더욱 텍스트만 담아야 합니다).
// =============================================================
function notifyBroadcast(classId) {
  mockListeners.broadcasts?.get(classId)?.forEach((cb) => cb(mock.broadcasts?.[classId] ?? null));
}

// [끊긴 방송 자동 해제]
// 방송은 문서가 '있으면 켜짐'이라, 교사 PC가 강제 종료되면 지우는 코드가
// 실행되지 못해 학생 화면이 계속 발표 상태로 묶였습니다.
// 그래서 방송 중에는 교사 쪽에서 주기적으로 문서를 건드리고(하트비트),
// 학생 쪽은 그 신호가 끊기면 방송이 끝난 것으로 보고 화면을 되돌립니다.
const BROADCAST_BEAT_MS = 45 * 1000;   // 교사: 45초마다 살아 있음을 표시
const BROADCAST_STALE_MS = 150 * 1000; // 학생: 2분 30초 동안 소식 없으면 해제
// 이미 오래된 문서(교사가 죽은 뒤 뒤늦게 접속한 학생)는 바로 무시합니다.
// 기기 시계 오차를 감안해 넉넉히 잡습니다.
const BROADCAST_DEAD_MS = 10 * 60 * 1000;

const broadcastBeats = new Map(); // classId → setInterval id

function startBroadcastBeat(classId) {
  if (!isFirebaseConfigured || broadcastBeats.has(classId)) return;
  const id = setInterval(async () => {
    try {
      await updateDoc(doc(db, "broadcasts", classId), { updatedAt: serverTimestamp() });
    } catch {
      // 문서가 이미 지워졌거나 권한이 없으면 하트비트를 멈춥니다.
      stopBroadcastBeat(classId);
    }
  }, BROADCAST_BEAT_MS);
  broadcastBeats.set(classId, id);
}

function stopBroadcastBeat(classId) {
  const id = broadcastBeats.get(classId);
  if (id) clearInterval(id);
  broadcastBeats.delete(classId);
}

// 반의 방송 상태 구독 — 문서 없으면 null
export function subscribeBroadcast(classId, callback) {
  if (!classId) { callback(null); return () => {}; }
  if (isFirebaseConfigured) {
    let timer = null;
    const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };
    const unsub = onSnapshot(
      doc(db, "broadcasts", classId),
      (snap) => {
        clearTimer();
        if (!snap.exists()) { callback(null); return; }
        const data = { id: snap.id, ...snap.data() };
        const t = data.updatedAt?.toMillis?.() ?? 0;
        // 서버 시각이 아직 확정되지 않은 순간(내 쓰기 직후)엔 그대로 두고
        // 다음 스냅샷을 기다립니다.
        if (!t) { callback(data); return; }
        if (Date.now() - t > BROADCAST_DEAD_MS) { callback(null); return; }
        callback(data);
        // 하트비트가 오면 스냅샷이 다시 와서 이 타이머가 초기화됩니다.
        // 오지 않으면 방송이 끊긴 것이므로 학생 화면을 원래대로 되돌립니다.
        // (시계 오차와 무관하게 '받은 시점'부터 재므로 안전합니다)
        timer = setTimeout(() => callback(null), BROADCAST_STALE_MS);
      },
      () => { clearTimer(); callback(null); }
    );
    return () => { clearTimer(); unsub(); };
  }
  if (!mock.broadcasts) mock.broadcasts = {};
  if (!mockListeners.broadcasts) mockListeners.broadcasts = new Map();
  if (!mockListeners.broadcasts.has(classId)) mockListeners.broadcasts.set(classId, new Set());
  const emit = (v) => callback(v);
  mockListeners.broadcasts.get(classId).add(emit);
  emit(mock.broadcasts[classId] ?? null);
  return () => mockListeners.broadcasts.get(classId)?.delete(emit);
}

// [교사] 방송 시작/내용 갱신 — 매번 전체 덮어쓰기(merge 없이)라 이전 필드가 남지 않음
export async function startBroadcast(user, classId, payload) {
  const data = { classId, startedBy: user.uid, updatedAt: serverTimestamp(), ...payload };
  if (isFirebaseConfigured) {
    await setDoc(doc(db, "broadcasts", classId), data);
    // 방송이 살아 있음을 주기적으로 알립니다 — 교사 PC가 갑자기 꺼지면
    // 이 신호가 끊기고, 학생 화면은 스스로 발표 상태에서 빠져나옵니다.
    startBroadcastBeat(classId);
    return;
  }
  if (!mock.broadcasts) mock.broadcasts = {};
  mock.broadcasts[classId] = { id: classId, ...data, updatedAt: new Date() };
  notifyBroadcast(classId);
}

// [교사] 방송 종료 — 문서를 지워 학생 화면이 즉시 원래대로 돌아가게 함
export async function stopBroadcast(classId) {
  if (!classId) return;
  stopBroadcastBeat(classId);
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "broadcasts", classId));
    return;
  }
  if (mock.broadcasts) delete mock.broadcasts[classId];
  notifyBroadcast(classId);
}

// =============================================================
// 학생 참여 상태 (Presence) — 발표 중 학생 화면이 실제로 보이는지
// -------------------------------------------------------------
// presence/{uid}_{classId} = { classId, uid, visible, updatedAt }
//  · 학생: 발표(방송) 중일 때만 올립니다. 브라우저 탭이 가려지면
//    visible=false, 다시 보이면 true. 20초마다 살아 있음도 함께 알립니다.
//  · 교사: 그 반의 상태를 실시간으로 읽어 '전광판'에 표시합니다.
//  · 60초 넘게 소식이 없으면 접속이 끊긴 것으로 봅니다(회색).
//    방송과 같은 이유 — PC가 갑자기 꺼지면 지우는 코드가 못 돕니다.
// =============================================================
export const PRESENCE_BEAT_MS = 20 * 1000;
export const PRESENCE_STALE_MS = 60 * 1000;
// 마지막 타자로부터 이만큼은 '필기 중'으로 봅니다. 하트비트가 20초마다
// 도니 그보다 넉넉해야 한 박자 사이에 표시가 꺼졌다 켜졌다 하지 않습니다.
export const NOTING_WINDOW_MS = 90 * 1000;

function notifyPresence(classId) {
  const list = Object.values(mock.presence ?? {}).filter((p) => p.classId === classId);
  mockListeners.presence?.get(classId)?.forEach((cb) => cb(list));
}

// [학생] 내 화면이 보이는지 알립니다(본인 문서만 씀).
// noting — 방금 수업 노트에 필기했는지. 전광판이 ✍️로 보여 줍니다.
// (규칙은 presence에 필드 화이트리스트가 없어 이 필드를 더해도 통과합니다)
export async function reportPresence(user, classId, visible, noting = false) {
  if (!user?.uid || !classId) return;
  const id = `${user.uid}_${classId}`;
  const data = { classId, uid: user.uid, visible: !!visible, noting: !!noting };
  if (isFirebaseConfigured) {
    // 실패해도 수업 진행에는 지장이 없으므로 조용히 넘어갑니다.
    try {
      await setDoc(doc(db, "presence", id), { ...data, updatedAt: serverTimestamp() });
    } catch { /* 권한·네트워크 오류 무시 */ }
    return;
  }
  if (!mock.presence) mock.presence = {};
  mock.presence[id] = { id, ...data, updatedAt: new Date() };
  notifyPresence(classId);
}

// [교사] 반 학생들의 참여 상태 구독 → [{ uid, visible, updatedAt }]
export function subscribePresence(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const q = query(collection(db, "presence"), where("classId", "==", classId));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([])
    );
  }
  if (!mock.presence) mock.presence = {};
  if (!mockListeners.presence) mockListeners.presence = new Map();
  if (!mockListeners.presence.has(classId)) mockListeners.presence.set(classId, new Set());
  const emit = (v) => callback(v);
  mockListeners.presence.get(classId).add(emit);
  emit(Object.values(mock.presence).filter((p) => p.classId === classId));
  return () => mockListeners.presence.get(classId)?.delete(emit);
}
