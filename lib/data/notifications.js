// =============================================================
// 개인 알림함 · 반 공지
// -------------------------------------------------------------
// lib/store.js에서 떼어 낸 조각입니다. 화면은 지금까지처럼 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 그대로 다시 내보냅니다.
// =============================================================
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { toDate } from "../dates";
import { db, functions, isFirebaseConfigured } from "../firebase";
import { getCurrentUser } from "../user";
import { mock, mockListeners, nextMockSeq } from "./shared";

// ─── 알림(users/{uid}/notifications) — 상단바 알림 벨 ───────────────
// 새 답변(new_answer) / 답변 채택(answer_understood) 알림을 Cloud
// Functions(onAnswerCreated, onAnswerUnderstood)가 여기에 씁니다.
// 목록에는 '아직 읽지 않은 것'만 올립니다.
// -------------------------------------------------------------
// 읽은 알림까지 남겨 두면 목록이 지난 소식으로 차서, 정작 새로 온 것을
// 찾기 어려워집니다(20개 창이라 오래된 읽은 알림이 새 알림을 밀어내기도
// 했습니다). 학생이 '읽음'을 눌러 하나씩 치우고, 치운 것은 목록에서
// 빠집니다 — 누르지 않은 것은 아무리 오래돼도 남습니다.
//
// 서버에서 걸러야 합니다. 전부 받아 화면에서 거르면, 읽은 알림이 20개
// 창을 채웠을 때 그 뒤의 안 읽은 알림이 영영 안 보입니다.
// (read ==, createdAt desc 복합 색인 — firestore.indexes.json)
export function subscribeMyNotifications(uid, callback) {
  if (!uid) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "users", uid, "notifications"),
      where("read", "==", false),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([])
    );
  }
  // 데모 모드는 알림을 발생시키는 서버 이벤트가 없어 지원하지 않음
  callback([]);
  return () => {};
}

export async function markNotificationRead(uid, notifId) {
  if (!isFirebaseConfigured) return;
  await updateDoc(doc(db, "users", uid, "notifications", notifId), { read: true });
}

// 안 읽은 알림을 한 번에 읽음 처리 — 알림 목록 위의 '모두 읽음'.
// 한 건씩 누르는 것과 결과가 같아야 하므로 같은 필드만 바꿉니다.
export async function markAllNotificationsRead(uid) {
  if (!isFirebaseConfigured || !uid) return 0;
  const snap = await getDocs(
    query(
      collection(db, "users", uid, "notifications"),
      where("read", "==", false)
    )
  );
  if (snap.empty) return 0;
  // 배치 상한(500)보다 적게 끊습니다. 남으면 목록에 그대로 남아 있으니
  // 한 번 더 누르면 됩니다 — 여기서 반복해 돌리다 실패하는 것보다 낫습니다.
  const docs = snap.docs.slice(0, 400);
  const batch = writeBatch(db);
  docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
  return docs.length;
}

// [교사] 반 공지 보내기 → 그 반 학생들의 알림으로
// -------------------------------------------------------------
// 서버 함수가 '내가 개설한 반인지'를 확인하고 memberships로 받는 사람을
// 정합니다(functions/index.js의 sendClassNotice). 클라이언트가 학생 문서에
// 직접 쓰지 않으므로 알림 규칙은 '본인만'으로 좁은 채 그대로 둡니다.
export async function sendClassNotice(classId, text) {
  if (!isFirebaseConfigured) {
    // 데모 모드는 알림을 받을 학생 계정이 없습니다. 대신 발송 이력만
    // 남겨 교사 화면(이력 목록)이 실제와 같게 동작하도록 합니다.
    if (!mock.classNotices) mock.classNotices = [];
    mock.classNotices.push({
      id: `cn${nextMockSeq()}_m`,
      classId,
      text: String(text ?? "").trim(),
      sentCount: 0,
      senderUid: getCurrentUser()?.uid ?? null,
      senderName: getCurrentUser()?.displayName ?? "선생님",
      sentAt: new Date(),
    });
    mockListeners.classNotices?.forEach((cb) => cb());
    return { ok: true, sent: 0 };
  }
  const res = await httpsCallable(functions, "sendClassNotice")({ classId, text });
  return res.data;
}

// [교사] 반 공지 발송 이력 구독 → [{ text, sentCount, senderName, sentAt }] (최신순)
// -------------------------------------------------------------
// 서버 함수가 학생 알림을 보낸 뒤 남기는 기록입니다(classes/{cId}/classNotices).
// 학생은 '읽음'으로 자기 알림을 치우면 그만이지만, 교사에게는 무엇을 언제
// 보냈는지가 어디에도 안 남아 있었습니다.
//
// 최근 것만 봅니다 — 이 목록은 '방금 보낸 게 맞나', '아까 그거 보냈던가'를
// 확인하는 자리라 옛것까지 다 내려받을 이유가 없습니다.
const CLASS_NOTICE_HISTORY = 20;

export function subscribeClassNotices(classId, callback) {
  if (!classId) {
    callback([]);
    return () => {};
  }
  if (isFirebaseConfigured) {
    return onSnapshot(
      query(
        collection(db, "classes", classId, "classNotices"),
        orderBy("sentAt", "desc"),
        limit(CLASS_NOTICE_HISTORY)
      ),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([])
    );
  }
  if (!mock.classNotices) mock.classNotices = [];
  if (!mockListeners.classNotices) mockListeners.classNotices = new Set();
  const emit = () =>
    callback(
      mock.classNotices
        .filter((n) => n.classId === classId)
        .sort((a, b) => toDate(b.sentAt) - toDate(a.sentAt))
        .slice(0, CLASS_NOTICE_HISTORY)
    );
  mockListeners.classNotices.add(emit);
  emit();
  return () => mockListeners.classNotices.delete(emit);
}

// 오래된 알림 정리 — 각자 자기 것만 지웁니다.
// -------------------------------------------------------------
// 알림은 지금까지 쌓이기만 했습니다. 화면에는 최근 20개만 보여서(아래
// subscribeMyNotifications의 limit) 눈에 띄지 않았을 뿐, 문서는 계속
// 남았습니다. 반 공지가 생기면서 한 번 보낼 때마다 학생 수만큼 문서가
// 늘어나므로 이제는 정리가 필요합니다.
//
// 서버 함수나 콘솔 TTL 설정 없이, 학생이 알림을 열어 볼 때 자기 것만
// 치웁니다 — 규칙상 본인은 자기 알림을 지울 수 있고(users/{uid}/notifications
// read, write), 정리해야 할 사람이 정확히 그 순간 접속해 있기 때문입니다.
//
// 기준은 '읽은 지 오래된 것'입니다. 안 읽은 알림은 아무리 오래돼도 남깁니다 —
// 오래 안 들어온 학생의 알림을 대신 지워 버리면 그 학생만 소식을 놓칩니다.
const NOTIF_KEEP_DAYS = 30;

export async function pruneOldNotifications(uid) {
  if (!isFirebaseConfigured || !uid) return 0;
  const cutoff = new Date(Date.now() - NOTIF_KEEP_DAYS * 24 * 60 * 60 * 1000);
  try {
    const snap = await getDocs(
      query(
        collection(db, "users", uid, "notifications"),
        where("read", "==", true),
        where("createdAt", "<", cutoff)
      )
    );
    if (snap.empty) return 0;
    // 배치 상한(500)보다 적게 끊어 한 번에 지웁니다. 남으면 다음 접속 때
    // 이어서 지웁니다 — 한 번에 다 비우려고 붙잡아 둘 이유가 없습니다.
    const docs = snap.docs.slice(0, 400);
    const batch = writeBatch(db);
    docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return docs.length;
  } catch {
    // 색인이 아직 없거나 일시적 오류 — 정리는 다음 기회에. 알림 표시 자체를
    // 막을 이유는 없습니다.
    return 0;
  }
}
