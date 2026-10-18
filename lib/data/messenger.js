// =============================================================
// 간편 메신저 — 읽고 쓰기 (실서비스 · 데모)
// -------------------------------------------------------------
// 셈은 lib/messenger.js, 화면은 components/MessengerWindow.jsx.
//
//  · 말   classes/{cId}/chatMessages/{자동 id}
//         { classId, room, fromUid, fromName, fromRole('teacher'|'student'), text, html?, at }
//         `html`은 서식 글(정화를 거친 것), `text`는 글자만(미리보기 · 안 읽은 줄 ·
//         옛 화면). 서식 없이 보낸 말과 옛 말은 `html`이 없습니다.
//  · 읽음 classes/{cId}/chatReads/{uid}  { rooms: { [room]: 서버 시각 ms }, updatedAt }
//
// [읽는 범위]
//  · 교사 — 반 전체의 **최근 300개**(`orderBy at desc · limit`). 단일 필드 정렬이라
//    복합 색인이 없습니다. 학생 대화 · 모둠 대화를 한 리스너로 봅니다.
//  · 학생 — 내 방 둘(선생님 1:1 · 우리 모둠)을 **방마다 등호 하나**로. 규칙이
//    질의로 판정하므로(list) `where room ==`가 '내 방'을 증명해야 통과합니다.
//    정렬은 화면에서 합니다(등호 + 다른 필드 정렬은 복합 색인이 생깁니다).
//
// 말은 **고치지 않습니다**(규칙이 update를 막음). 지우는 것은 담당 교사만.
// =============================================================
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase";
import {
  CHAT_HTML_MAX,
  CHAT_NAME_MAX,
  CHAT_TEACHER_LIMIT,
  chatPlainText,
  cleanChatText,
} from "../messenger";
import { sanitizeHtml } from "../html";
import { mock, nextMockSeq } from "./shared";

// ── 데모 저장소 — 반마다 말 목록 하나, 사람마다 읽음 표시 하나 ──
const mockChatListeners = new Set();
const mockReadListeners = new Set();
function mockChats() {
  if (!mock.chatMessages) mock.chatMessages = [];
  return mock.chatMessages;
}
function mockReads() {
  if (!mock.chatReads) mock.chatReads = {};
  return mock.chatReads;
}
const emitChats = () => mockChatListeners.forEach((cb) => cb());
const emitReads = () => mockReadListeners.forEach((cb) => cb());

const withId = (d) => ({ id: d.id, ...d.data() });

// 교사 — 이 반의 최근 말(오래된 것이 앞).
export function subscribeClassChat(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      query(
        collection(db, "classes", classId, "chatMessages"),
        orderBy("at", "desc"),
        limit(CHAT_TEACHER_LIMIT)
      ),
      (snap) => callback(snap.docs.map(withId).reverse()),
      (e) => {
        console.warn("[메신저] 반 대화를 못 읽었어요:", e?.code, e?.message);
        callback([]);
      }
    );
  }
  const emit = () => callback(mockChats().filter((m) => m.classId === classId));
  mockChatListeners.add(emit);
  emit();
  return () => mockChatListeners.delete(emit);
}

// 학생 — 내 방들의 말. rooms: ["dm_나", "grp_group_2"]
export function subscribeRoomsChat(classId, rooms, callback) {
  const list = (rooms ?? []).filter(Boolean);
  if (!classId || list.length === 0) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const byRoom = new Map();
    const emit = () => callback([...byRoom.values()].flat());
    const unsubs = list.map((room) =>
      onSnapshot(
        query(collection(db, "classes", classId, "chatMessages"), where("room", "==", room)),
        (snap) => { byRoom.set(room, snap.docs.map(withId)); emit(); },
        (e) => {
          console.warn("[메신저] 대화를 못 읽었어요:", room, e?.code, e?.message);
          byRoom.set(room, []);
          emit();
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }
  const emit = () =>
    callback(mockChats().filter((m) => m.classId === classId && list.includes(m.room)));
  mockChatListeners.add(emit);
  emit();
  return () => mockChatListeners.delete(emit);
}

// 말 보내기. role은 화면이 정하지만 규칙이 다시 봅니다(교사만 'teacher').
// html을 주면 서식 글로(정화한 뒤 천장에서 자름), 글자는 거기서 뽑습니다.
export async function sendChatMessage(classId, user, { room, role, text, html }) {
  const rich = html != null ? sanitizeHtml(String(html)).slice(0, CHAT_HTML_MAX) : "";
  const body = cleanChatText(rich ? chatPlainText(rich) : text);
  if (!classId || !user?.uid || !room || !body) return null;
  const data = {
    classId,
    room,
    fromUid: user.uid,
    fromName: String(
      role === "teacher" ? "선생님" : user.realName || user.displayName || "이름 미설정"
    ).slice(0, CHAT_NAME_MAX),
    fromRole: role === "teacher" ? "teacher" : "student",
    text: body,
    ...(rich ? { html: rich } : {}),
  };
  if (isFirebaseConfigured) {
    const ref = await addDoc(collection(db, "classes", classId, "chatMessages"), {
      ...data,
      at: serverTimestamp(),
    });
    return ref.id;
  }
  const id = `chat_${nextMockSeq()}`;
  mockChats().push({ id, ...data, at: new Date() });
  emitChats();
  return id;
}

// 담당 교사가 말 하나를 걷기(잘못 보낸 말 · 다툼).
export async function deleteChatMessage(classId, messageId) {
  if (!classId || !messageId) return;
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "classes", classId, "chatMessages", messageId));
    return;
  }
  mock.chatMessages = mockChats().filter((m) => m.id !== messageId);
  emitChats();
}

// 내 읽음 표시 — { [room]: ms }. 문서가 없으면 빈 맵.
export function subscribeChatReads(classId, uid, callback) {
  if (!classId || !uid) { callback({}); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      doc(db, "classes", classId, "chatReads", uid),
      (snap) => callback(snap.exists() ? snap.data().rooms ?? {} : {}),
      () => callback({})
    );
  }
  const key = `${classId}_${uid}`;
  const emit = () => callback({ ...(mockReads()[key] ?? {}) });
  mockReadListeners.add(emit);
  emit();
  return () => mockReadListeners.delete(emit);
}

// 한 방을 '여기까지 봤다'로 — seenMs는 그 방 마지막 말의 서버 시각.
// merge라 다른 방의 표시는 그대로 남습니다.
export async function markChatRoomSeen(classId, uid, room, seenMs) {
  if (!classId || !uid || !room || !seenMs) return;
  if (isFirebaseConfigured) {
    await setDoc(
      doc(db, "classes", classId, "chatReads", uid),
      { rooms: { [room]: seenMs }, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return;
  }
  const key = `${classId}_${uid}`;
  const reads = mockReads();
  reads[key] = { ...(reads[key] ?? {}), [room]: seenMs };
  emitReads();
}
