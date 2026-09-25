// =============================================================
// 모둠 메모
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
import { db, isFirebaseConfigured } from "../firebase";
import { sanitizeHtml, stripHtml } from "../html";
import { memoTime } from "../memoThreads";
import { mock, mockListeners } from "./shared";

// =============================================================
// 모둠 메모 — 공부방 '우리 모둠'에서 모둠 친구에게 남기는 쪽지
// -------------------------------------------------------------
// [왜 알림함(users/{uid}/notifications)에 안 쓰나]
// 그 자리는 **본인만** 읽고 쓸 수 있게 잠가 둔 곳입니다(교사도 못 읽습니다 —
// 반 공지 알림에 교사 실명과 공지 본문이 들어 있어서). 학생끼리 서로의
// 알림함에 쓸 수 있게 열면 그 잠금이 통째로 무너지고, 서버 함수로 우회하면
// 이 기능 하나 때문에 Cloud Functions 배포가 걸립니다. 그래서 메모는 이
// 컬렉션 한 곳에만 쌓고, **알림 벨이 '내가 받은 안 읽은 메모'를 함께
// 구독**합니다(components/NotificationBell.jsx).
//
// [질의는 등호 하나뿐 — 복합 색인을 늘리지 않습니다]
//  · 한 친구와의 대화: `where('pairKey','==',…)` — 짝을 문서 ID가 아니라
//    필드에 적어 둔 이유입니다. 정렬은 화면에서 합니다.
//  · 알림 벨: `where('toUid','==',나)` + `where('read','==',false)`
//    (등호 둘은 단일 필드 색인을 합쳐 처리하므로 복합 색인이 필요 없습니다)
// 두 질의 모두 결과가 전부 '내가 낀' 문서라 읽기 규칙을 그대로 통과합니다.
// =============================================================

const GROUP_MEMO_MAX = 4000; // 규칙과 같은 한도 (서식 HTML 포함 길이)

// 두 사람의 짝 열쇠 — 누가 보내든 같은 값이 나오도록 정렬해서 잇습니다.
// (규칙의 pairKeyOf와 **반드시 같은 규칙**이어야 합니다)
export function memoPairKey(a, b) {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function ensureMockMemos() {
  if (!mock.groupMemos) mock.groupMemos = [];
  if (!mockListeners.groupMemos) mockListeners.groupMemos = new Set();
}
function notifyGroupMemos() {
  mockListeners.groupMemos?.forEach((cb) => cb());
}

// 이 반에서 내가 주고받은 메모 **전부** — 오래된 것이 앞.
//
// 한 친구와의 대화만 따로 받지 않고 통째로 받는 까닭: '우리 모둠' 창이
// 최근 대화 목록을 함께 보여 주는데, 그러려면 어차피 상대를 가리지 않고
// 다 있어야 합니다. 여기서 한 번 받아 두면 목록도 대화도 같은 자료를
// 나눠 쓰므로 **리스너가 친구 수만큼 늘지 않습니다**(예전에는 친구를
// 고를 때마다 그 짝의 리스너 둘을 새로 걸었습니다).
//
// **질의를 둘로 나눕니다**(보낸 것 / 받은 것). 하나로 합칠 방법이 없습니다 —
// list 규칙은 결과 문서가 아니라 **질의 자체**로 판정하므로,
// `resource.data.toUid == uid()`를 질의가 증명해 주지 못하면
// "Property toUid is undefined on object"로 떨어집니다(실측). 책방 동료
// 평가(subscribeMyPeerReviews)를 둘로 나눈 것과 같은 이유입니다.
// 등호 하나씩이라 복합 색인은 여전히 필요 없습니다.
//
// [양] 한 학기 모둠 친구 서넛과 주고받는 쪽지라 수십~수백 건입니다. 더
// 줄이려면 `createdAt` 정렬 + limit이 필요한데, 등호 필터와 다른 필드
// 정렬을 함께 걸면 복합 색인이 생깁니다 — 그만큼 커질 자리가 아닙니다.
export function subscribeMyGroupMemos(classId, myUid, callback) {
  if (!classId || !myUid) { callback([]); return () => {}; }
  // 정렬 규칙은 lib/memoThreads.js와 **같은 것 하나**를 씁니다 — 여기서만
  // 다르면 왼쪽 목록과 오른쪽 대화의 차례가 어긋납니다. 특히 방금 보낸
  // 메모(createdAt이 아직 null)를 '가장 최근'으로 보는 규칙이 그렇습니다.
  const byTime = (a, b) => memoTime(a.createdAt) - memoTime(b.createdAt);
  if (isFirebaseConfigured) {
    let sent = [];
    let got = [];
    const emit = () => {
      // 같은 친구와 두 반에서 함께 지낼 수 있어 반으로 한 번 더 거릅니다
      const list = [...sent, ...got].filter((m) => m.classId === classId);
      list.sort(byTime);
      callback(list);
    };
    const watch = (field, set) =>
      onSnapshot(
        query(collection(db, "groupMemos"), where(field, "==", myUid)),
        (snap) => { set(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); emit(); },
        () => { set([]); emit(); }
      );
    const unsubA = watch("fromUid", (v) => { sent = v; });
    const unsubB = watch("toUid", (v) => { got = v; });
    return () => { unsubA(); unsubB(); };
  }
  ensureMockMemos();
  const emit = () => {
    const list = mock.groupMemos
      .filter((m) => m.classId === classId && (m.fromUid === myUid || m.toUid === myUid))
      .sort(byTime);
    callback(list);
  };
  mockListeners.groupMemos.add(emit);
  emit();
  return () => mockListeners.groupMemos.delete(emit);
}


// 알림 벨용 — 내가 받은 것 중 아직 안 읽은 것만.
export function subscribeMyUnreadMemos(uid, callback) {
  if (!uid) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      query(collection(db, "groupMemos"), where("toUid", "==", uid), where("read", "==", false)),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([])
    );
  }
  ensureMockMemos();
  const emit = () =>
    callback(mock.groupMemos.filter((m) => m.toUid === uid && !m.read));
  mockListeners.groupMemos.add(emit);
  emit();
  return () => mockListeners.groupMemos.delete(emit);
}

// 메모 보내기. replyTo가 있으면 어느 말에 답한 것인지 함께 적어 둡니다 —
// 답장을 나중에 펴 봐도 무엇에 대한 답인지 알 수 있게(원문이 지워져도).
export async function sendGroupMemo(user, { classId, toUid, toName = "", html, replyTo = null }) {
  if (!user?.uid || !classId || !toUid || toUid === user.uid) return null;
  const body = sanitizeHtml(String(html ?? "")).slice(0, GROUP_MEMO_MAX);
  if (!stripHtml(body).trim()) return null; // 빈 쪽지는 보내지 않습니다
  const data = {
    classId,
    pairKey: memoPairKey(user.uid, toUid),
    fromUid: user.uid,
    fromName: user.realName || user.displayName || "이름 미설정",
    toUid,
    toName: String(toName ?? "").slice(0, 40),
    html: body,
    // 답장 미리보기는 **글자만** 잘라 둡니다(서식 HTML을 또 담으면 문서가
    // 두 배가 되고, 한 줄 인용에 서식이 필요하지도 않습니다).
    replyToId: replyTo?.id ?? null,
    replyToText: replyTo ? stripHtml(replyTo.html || "").slice(0, 80) : null,
    replyToName: replyTo?.fromName ?? null,
    read: false,
  };
  if (isFirebaseConfigured) {
    const ref = await addDoc(collection(db, "groupMemos"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }
  ensureMockMemos();
  const id = `memo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  mock.groupMemos.push({ id, ...data, createdAt: new Date() });
  notifyGroupMemos();
  return id;
}

// 받은 사람이 '읽음'으로 치우기 — 규칙이 이 두 칸만 허용합니다.
export async function markGroupMemoRead(memoId) {
  if (!memoId) return;
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "groupMemos", memoId), {
      read: true,
      readAt: serverTimestamp(),
    });
    return;
  }
  ensureMockMemos();
  const found = mock.groupMemos.find((m) => m.id === memoId);
  if (found) { found.read = true; found.readAt = new Date(); }
  notifyGroupMemos();
}

// 보낸 사람이 자기 쪽지를 거두기(오타 등). 남의 글은 규칙이 막습니다.
export async function deleteGroupMemo(memoId) {
  if (!memoId) return;
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "groupMemos", memoId));
    return;
  }
  ensureMockMemos();
  mock.groupMemos = mock.groupMemos.filter((m) => m.id !== memoId);
  notifyGroupMemos();
}
