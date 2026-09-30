// =============================================================
// 과일(rewards) · 지급 이력 · 반 명단 구독
// -------------------------------------------------------------
// lib/store.js에서 떼어 낸 조각입니다. 화면은 지금까지처럼 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 그대로 다시 내보냅니다.
// =============================================================
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { toDate } from "../dates";
import { db, isFirebaseConfigured } from "../firebase";
import { replaceDoc } from "../mockDocs";
import { expectSelfGain, dropSelfGain } from "../selfFruitGain";
import { getCurrentUser } from "../user";
import { mock, mockListeners, nextMockSeq } from "./shared";

// =============================================================
// 학생 보상(과일) — 교사가 참여도에 따라 과일을 부여 (반별)
// -------------------------------------------------------------
// rewards/{classId_uid} = { classId, uid, count(0~REWARD_MAX), updatedAt }
//  · 쓰기는 반 소유 교사만(규칙), 읽기는 같은 반 학생도 가능.
//  · 과일 아이콘/순서는 화면에서 결정하고, 여기선 개수만 저장.
//  · 20개(REWARD_STAR)마다 ⭐ 하나로 바꿔 표시하고 과일 뱃지는 새로 시작.
// =============================================================
export const REWARD_STAR = 20;  // 과일 20개 = 별 1개
export const REWARD_MAX = 100;  // 하드 캡(별 5개) — 규칙과 동일

// 특정 반의 소속 학생 uid 목록 구독 (교사 전용 — memberships 읽기)
export function subscribeClassMembers(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const q = query(collection(db, "memberships"), where("classId", "==", classId));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => d.data().uid).filter(Boolean)),
      () => callback([])
    );
  }
  if (!mock.memberships) mock.memberships = [];
  if (!mockListeners.classMembers) mockListeners.classMembers = new Set();
  const emit = () =>
    callback(mock.memberships.filter((m) => m.classId === classId).map((m) => m.uid));
  mockListeners.classMembers.add(emit);
  emit();
  return () => mockListeners.classMembers.delete(emit);
}

// 모든 반의 보상(과일) 구독 → [{ classId, uid, count }] (교사 전용, 대시보드 학급통계용)
export function subscribeAllRewards(callback) {
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "rewards"),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([])
    );
  }
  if (!mock.rewards) mock.rewards = [];
  if (!mockListeners.rewards) mockListeners.rewards = new Set();
  const emit = () => callback([...mock.rewards]);
  mockListeners.rewards.add(emit);
  emit();
  return () => mockListeners.rewards.delete(emit);
}

// 여러 반의 보상을 반별 구독으로 나눠 합쳐 반환 (일반 교사: 소유 반만).
// 규칙상 교사는 전체 rewards를 나열할 수 없으므로, 반별(where classId==)로 나눕니다.
export function subscribeRewardsForClasses(classIds, callback) {
  const ids = [...new Set((classIds || []).filter(Boolean))];
  if (ids.length === 0) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const byClass = {};
    const emit = () => callback(Object.values(byClass).flat());
    const unsubs = ids.map((cid) =>
      onSnapshot(
        query(collection(db, "rewards"), where("classId", "==", cid)),
        (snap) => { byClass[cid] = snap.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); },
        () => { byClass[cid] = []; emit(); }
      )
    );
    return () => unsubs.forEach((u) => u());
  }
  if (!mock.rewards) mock.rewards = [];
  if (!mockListeners.rewards) mockListeners.rewards = new Set();
  const emit = () => callback(mock.rewards.filter((r) => ids.includes(r.classId)));
  mockListeners.rewards.add(emit);
  emit();
  return () => mockListeners.rewards.delete(emit);
}

// 특정 반의 보상(과일 개수) 구독 → [{ uid, count }]
export function subscribeClassRewards(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const q = query(collection(db, "rewards"), where("classId", "==", classId));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([]) // 권한/네트워크 오류는 빈 목록
    );
  }
  if (!mock.rewards) mock.rewards = [];
  if (!mockListeners.rewards) mockListeners.rewards = new Set();
  const emit = () => callback(mock.rewards.filter((r) => r.classId === classId));
  mockListeners.rewards.add(emit);
  emit();
  return () => mockListeners.rewards.delete(emit);
}

// 한 학생이 받은 과일 총합 구독 (여러 반 합산) — 교사 전용(대시보드용)
export function subscribeStudentRewardTotal(uid, callback) {
  if (!uid) { callback(0); return () => {}; }
  const sum = (docs) => docs.reduce((s, r) => s + (r.count ?? 0), 0);
  if (isFirebaseConfigured) {
    const q = query(collection(db, "rewards"), where("uid", "==", uid));
    return onSnapshot(
      q,
      (snap) => callback(sum(snap.docs.map((d) => d.data()))),
      () => callback(0)
    );
  }
  if (!mock.rewards) mock.rewards = [];
  if (!mockListeners.rewards) mockListeners.rewards = new Set();
  const emit = () => callback(sum(mock.rewards.filter((r) => r.uid === uid)));
  mockListeners.rewards.add(emit);
  emit();
  return () => mockListeners.rewards.delete(emit);
}

// 본인(학생)이 특정 반에서 받은 과일 개수 실시간 구독 — 상단바 뱃지용.
// 어느 반을 볼지는 호출하는 쪽(TopNav)이
// study 화면과 동일한 기준(세션에 기억된 반 → 없으면 첫 소속)으로 정해
// 넘겨주므로, 여러 반에 흔적이 남아 있어도 지금 보고 있는 반의 개수만
// 정확히 보여줍니다.
export function subscribeMyClassRewardCount(classId, uid, callback) {
  if (!classId || !uid) { callback(0); return () => {}; }
  if (isFirebaseConfigured) {
    // 없는 문서의 직접 읽기는 resource.data 기반 규칙에서 거부됩니다.
    // 반과 학생을 한정한 쿼리는 기록이 없어도 0부터 구독을 유지합니다.
    const q = query(
      collection(db, "rewards"),
      where("classId", "==", classId),
      where("uid", "==", uid)
    );
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        // 빈 로컬 캐시를 0으로 확정하면 기존 과일까지 새 보상으로 오인합니다.
        if (snap.metadata.fromCache) return;
        const reward = snap.docs.find((d) => d.id === `${classId}_${uid}`);
        callback(reward?.data().count ?? 0);
      },
      () => callback(0)
    );
  }
  if (!mock.rewards) mock.rewards = [];
  if (!mockListeners.rewards) mockListeners.rewards = new Set();
  const emit = () => {
    const r = mock.rewards.find((x) => x.classId === classId && x.uid === uid);
    callback(r?.count ?? 0);
  };
  mockListeners.rewards.add(emit);
  emit();
  return () => mockListeners.rewards.delete(emit);
}

// [교사] 학생 과일 수 설정 (0~REWARD_MAX). setDoc(merge)로 upsert.
// identity(선택): { name, emoji } — 이름표를 문서에 함께 저장해,
// 학생(읽기 전용) 화면에서 디렉터리 없이도 표시할 수 있게 합니다.
// 공부방은 실명 참여 공간이라 실명을 담습니다. rewards는 규칙상
// 그 반 소속 학생만 읽을 수 있어 반 밖으로는 새지 않습니다.
// 과일 주기 — 총계(rewards)를 갱신하면서 지급 이력을 한 건 남깁니다.
// -------------------------------------------------------------
// rewards는 누적 총계 하나뿐이라 '언제 몇 개 받았나'가 남지 않았습니다.
// 참여의 변화를 보려면 시계열이 있어야 해서, 줄 때마다 이벤트를 적습니다.
// 교사가 과일을 주는 건 하루 몇 번뿐이라 비용은 사실상 없습니다.
//
// 트랜잭션으로 묶는 이유가 둘입니다.
//  · 이력이 정확하려면 '이전 값'을 읽어야 delta를 낼 수 있습니다.
//  · 지금까지는 클라이언트가 count+1을 계산해 절대값으로 넘겨서, 두 교사가
//    동시에 주면 한 번이 조용히 사라졌습니다. 트랜잭션 안에서 다시 읽으면
//    그 유실도 함께 막힙니다.
export async function setStudentReward(classId, uid, count, identity = null) {
  const safe = Math.max(0, Math.min(REWARD_MAX, Math.round(count) || 0));
  const extra = identity
    ? { name: identity.name || "", emoji: identity.emoji || "🙂" }
    : {};
  if (isFirebaseConfigured) {
    const ref = doc(db, "rewards", `${classId}_${uid}`);
    const byUid = getCurrentUser()?.uid ?? null;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const before = snap.exists() ? snap.data().count ?? 0 : 0;
      tx.set(
        ref,
        { classId, uid, count: safe, ...extra, updatedAt: serverTimestamp() },
        { merge: true }
      );
      // 값이 그대로면 이력을 남기지 않습니다 — 이름표만 고쳐 다시 저장하는
      // 경우까지 '지급'으로 세면 시계열이 부풀려집니다.
      if (before === safe || !byUid) return;
      tx.set(doc(collection(db, "classes", classId, "rewardEvents")), {
        classId,
        uid,
        delta: safe - before,
        count: safe,
        byUid,
        at: serverTimestamp(),
      });
    });
    return;
  }
  if (!mock.rewards) mock.rewards = [];
  if (!mock.rewardEvents) mock.rewardEvents = [];
  const existing = mock.rewards.find((r) => r.classId === classId && r.uid === uid);
  const before = existing?.count ?? 0;
  if (existing) replaceDoc(mock.rewards, existing, { count: safe, ...extra });
  else mock.rewards.push({ id: `${classId}_${uid}`, classId, uid, count: safe, ...extra });
  if (before !== safe) {
    mock.rewardEvents.push({
      id: `re${nextMockSeq()}_m`,
      classId,
      uid,
      delta: safe - before,
      count: safe,
      byUid: getCurrentUser()?.uid ?? null,
      at: new Date(),
    });
  }
  mockListeners.rewardEvents?.forEach((cb) => cb());
  mockListeners.rewards?.forEach((cb) => cb());
}

// [교사] 과일을 delta만큼 **더** 줍니다(빼려면 음수).
// -------------------------------------------------------------
// setStudentReward는 '몇 개로 맞춰라'는 절대값을 받습니다. 지금 몇 개인지
// 이미 화면에 들고 있는 자리(자리표·카드)에서는 그게 자연스럽지만, 손든 학생
// 목록처럼 총계를 모르는 자리에서는 개수를 알자고 rewards를 따로 구독해야
// 합니다. 여기서는 트랜잭션 안에서 읽은 값에 더하므로 부르는 쪽이 총계를
// 몰라도 되고, 동시에 두 곳에서 줘도 한 번이 묻히지 않습니다.
export async function addStudentReward(classId, uid, delta = 1, identity = null) {
  if (!classId || !uid || !delta) return;
  const extra = identity
    ? { name: identity.name || "", emoji: identity.emoji || "🙂" }
    : {};
  const clamp = (n) => Math.max(0, Math.min(REWARD_MAX, n));
  if (isFirebaseConfigured) {
    const ref = doc(db, "rewards", `${classId}_${uid}`);
    const byUid = getCurrentUser()?.uid ?? null;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const before = snap.exists() ? snap.data().count ?? 0 : 0;
      const next = clamp(before + delta);
      tx.set(
        ref,
        { classId, uid, count: next, ...extra, updatedAt: serverTimestamp() },
        { merge: true }
      );
      // 이미 최대라 값이 그대로면 이력을 남기지 않습니다(setStudentReward와 같은 기준).
      if (before === next || !byUid) return;
      tx.set(doc(collection(db, "classes", classId, "rewardEvents")), {
        classId,
        uid,
        delta: next - before,
        count: next,
        byUid,
        at: serverTimestamp(),
      });
    });
    return;
  }
  if (!mock.rewards) mock.rewards = [];
  if (!mock.rewardEvents) mock.rewardEvents = [];
  const existing = mock.rewards.find((r) => r.classId === classId && r.uid === uid);
  const before = existing?.count ?? 0;
  const next = clamp(before + delta);
  if (existing) replaceDoc(mock.rewards, existing, { count: next, ...extra });
  else mock.rewards.push({ id: `${classId}_${uid}`, classId, uid, count: next, ...extra });
  if (before !== next) {
    mock.rewardEvents.push({
      id: `re${nextMockSeq()}_m`,
      classId,
      uid,
      delta: next - before,
      count: next,
      byUid: getCurrentUser()?.uid ?? null,
      at: new Date(),
    });
  }
  mockListeners.rewardEvents?.forEach((cb) => cb());
  mockListeners.rewards?.forEach((cb) => cb());
}

// 학생 한 명의 과일 지급 이력 구독 → [{ uid, delta, count, byUid, at }] (오래된 순)
// -------------------------------------------------------------
// 총계(rewards)는 '지금 몇 개'만 알려 줘서 학생이 어떻게 달라지고 있는지는
// 보이지 않습니다. 이 이력을 날짜별로 묶으면 '수업마다 얼마나 받았나'가
// 드러나고, 그게 참여의 변화를 읽는 근거가 됩니다.
//
// 정렬을 서버에 맡기지 않고(where + orderBy는 복합 인덱스를 요구합니다)
// 받아서 여기서 정렬합니다 — 한 학생의 이력은 많아야 수백 건이라 이 편이
// 인덱스를 새로 배포하는 것보다 낫습니다.
export function subscribeStudentRewardEvents(classId, uid, callback) {
  if (!classId || !uid) {
    callback([]);
    return () => {};
  }
  const sortByAt = (list) => [...list].sort((a, b) => toDate(a.at) - toDate(b.at));
  if (isFirebaseConfigured) {
    return onSnapshot(
      query(collection(db, "classes", classId, "rewardEvents"), where("uid", "==", uid)),
      (snap) => callback(sortByAt(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      () => callback([])
    );
  }
  if (!mock.rewardEvents) mock.rewardEvents = [];
  if (!mockListeners.rewardEvents) mockListeners.rewardEvents = new Set();
  const emit = () =>
    callback(sortByAt(mock.rewardEvents.filter((e) => e.classId === classId && e.uid === uid)));
  mockListeners.rewardEvents.add(emit);
  emit();
  return () => mockListeners.rewardEvents.delete(emit);
}

// 여러 반에 걸친 한 학생의 과일 이력 — 학생 리포트에서 씁니다.
// 이력은 반마다 따로 있는 하위 컬렉션이라 반별로 구독해 합칩니다
// (subscribeRewardsForClasses와 같은 이유·같은 방식).
export function subscribeStudentRewardEventsForClasses(classIds, uid, callback) {
  const ids = [...new Set((classIds || []).filter(Boolean))];
  if (ids.length === 0 || !uid) {
    callback([]);
    return () => {};
  }
  const byClass = {};
  const emit = () =>
    callback(Object.values(byClass).flat().sort((a, b) => toDate(a.at) - toDate(b.at)));
  const unsubs = ids.map((cid) =>
    subscribeStudentRewardEvents(cid, uid, (list) => {
      byClass[cid] = list;
      emit();
    })
  );
  return () => unsubs.forEach((u) => u());
}

// 한 반의 과일 지급 이력 전체 — 교사 대시보드의 반 단위 흐름에 씁니다.
// 규칙상 담당 교사·관리자만 이 컬렉션을 나열할 수 있습니다.
export function subscribeClassRewardEvents(classId, callback) {
  if (!classId) {
    callback([]);
    return () => {};
  }
  const sortByAt = (list) => [...list].sort((a, b) => toDate(a.at) - toDate(b.at));
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "classes", classId, "rewardEvents"),
      (snap) => callback(sortByAt(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      () => callback([])
    );
  }
  if (!mock.rewardEvents) mock.rewardEvents = [];
  if (!mockListeners.rewardEvents) mockListeners.rewardEvents = new Set();
  const emit = () => callback(sortByAt(mock.rewardEvents.filter((e) => e.classId === classId)));
  mockListeners.rewardEvents.add(emit);
  emit();
  return () => mockListeners.rewardEvents.delete(emit);
}

// 오늘 지급분만 — 자리표의 과일 뱃지에 씁니다.
// -------------------------------------------------------------
// 뱃지가 누적 총계면 학기가 갈수록 숫자가 커지기만 해서, 수업 중에 보는
// 자리표에서는 '오늘 이 반이 어땠나'를 읽을 수 없습니다. 오늘 것만 세면
// 매일 0에서 다시 시작하므로 그날의 움직임이 그대로 보입니다.
// (누적 총계는 rewards에 그대로 있고, 과일 주기 창과 리포트가 씁니다)
//
// 반 전체 이력을 다 받아 걸러 내지 않고 at으로 범위를 좁혀 읽습니다 —
// 이 패널은 수업 내내 열려 있는데, 한 학기가 쌓이면 그게 매번 수천 건이
// 됩니다. at 한 필드만 쓰는 범위 조건이라 복합 인덱스도 필요 없습니다.
export function subscribeTodayRewardEvents(classId, callback) {
  if (!classId) {
    callback([]);
    return () => {};
  }
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const sortByAt = (list) => [...list].sort((a, b) => toDate(a.at) - toDate(b.at));
  if (isFirebaseConfigured) {
    return onSnapshot(
      query(
        collection(db, "classes", classId, "rewardEvents"),
        where("at", ">=", start)
      ),
      (snap) => callback(sortByAt(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      () => callback([])
    );
  }
  if (!mock.rewardEvents) mock.rewardEvents = [];
  if (!mockListeners.rewardEvents) mockListeners.rewardEvents = new Set();
  const emit = () =>
    callback(
      sortByAt(
        mock.rewardEvents.filter((e) => e.classId === classId && toDate(e.at) >= start)
      )
    );
  mockListeners.rewardEvents.add(emit);
  emit();
  return () => mockListeners.rewardEvents.delete(emit);
}

// =============================================================
// 과일 바구니 — 학생이 제 과일을 내놓아 반이 함께 모읍니다
// -------------------------------------------------------------
// classes/{classId}/fruitBasket/{uid} = { classId, uid, donated, entered,
//   enteredAt?, updatedAt }
//  · donated는 **지금 바구니에 든 내 몫**. 반의 바구니 = 문서들의 합.
//    내놓으면 늘고, **응모하기 전까지는** 되돌려 받아(기부 취소) 줄 수 있습니다.
//    응모한 뒤로는 줄지 않습니다(규칙이 막음).
//  · 내놓는 순간 rewards의 count가 **그만큼 줄어듭니다**(취소하면 그만큼 늘고) — 학생은 내놓은
//    것을 뺀 나머지만 가집니다(상단바 🍊 · 교사 화면의 누적도 함께 줄어듦).
//    두 쓰기는 **한 트랜잭션**이고, 규칙이 getAfter로 둘을 맞대어 봅니다 —
//    과일만 빼거나 바구니만 늘리는 쓰기는 거부됩니다(firestore.rules).
//  · 지급 이력(rewardEvents)에는 적지 않습니다 — 그 이력은 교사가 준 것의
//    기록이고, 규칙도 교사만 쓰게 잠가 두었습니다.
//  · 셈(합계·목표·응모)은 lib/fruitBasket.js.
// =============================================================

// 반의 바구니 구독 → [{ uid, donated, entered }]
export function subscribeFruitBasket(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "classes", classId, "fruitBasket"),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([])
    );
  }
  if (!mock.fruitBasket) mock.fruitBasket = [];
  if (!mockListeners.fruitBasket) mockListeners.fruitBasket = new Set();
  const emit = () => callback(mock.fruitBasket.filter((e) => e.classId === classId));
  mockListeners.fruitBasket.add(emit);
  emit();
  return () => mockListeners.fruitBasket.delete(emit);
}

// [학생] 제 과일 amount개를 바구니에 내놓습니다 → 남은 과일 수를 돌려줍니다.
// 가진 것보다 많으면 아무것도 안 하고 오류를 던집니다(트랜잭션 안에서
// 다시 읽어 판정하므로, 그 사이 교사가 −1 해도 음수가 되지 않습니다).
export async function donateFruits(classId, uid, amount) {
  const n = Math.floor(Number(amount));
  if (!classId || !uid || !Number.isFinite(n) || n <= 0) {
    throw new Error("내놓을 과일 수를 확인해 주세요.");
  }
  const short = () => new Error("가진 과일보다 많이 내놓을 수 없어요.");
  if (isFirebaseConfigured) {
    const rewardRef = doc(db, "rewards", `${classId}_${uid}`);
    const basketRef = doc(db, "classes", classId, "fruitBasket", uid);
    return runTransaction(db, async (tx) => {
      const r = await tx.get(rewardRef);
      const b = await tx.get(basketRef);
      const have = r.exists() ? r.data().count ?? 0 : 0;
      if (n > have) throw short();
      const before = b.exists() ? b.data().donated ?? 0 : 0;
      tx.update(rewardRef, { count: have - n, updatedAt: serverTimestamp() });
      tx.set(
        basketRef,
        {
          classId,
          uid,
          donated: before + n,
          entered: b.exists() ? b.data().entered === true : false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      return have - n;
    });
  }
  if (!mock.rewards) mock.rewards = [];
  if (!mock.fruitBasket) mock.fruitBasket = [];
  const r = mock.rewards.find((x) => x.classId === classId && x.uid === uid);
  const have = r?.count ?? 0;
  if (n > have) throw short();
  replaceDoc(mock.rewards, r, { count: have - n });
  const b = mock.fruitBasket.find((x) => x.classId === classId && x.uid === uid);
  if (b) replaceDoc(mock.fruitBasket, b, (e) => ({ donated: (e.donated ?? 0) + n }));
  else mock.fruitBasket.push({ id: uid, classId, uid, donated: n, entered: false });
  mockListeners.rewards?.forEach((cb) => cb());
  mockListeners.fruitBasket?.forEach((cb) => cb());
  return have - n;
}

// [학생] 기부 취소 — 바구니에 내놓은 과일 amount개를 되돌려 받습니다 →
// 돌려받은 뒤 가진 과일 수. **응모하기 전에만** 됩니다. 내놓은 것보다 많이,
// 또는 돌려받아 과일 천장(REWARD_MAX)을 넘게는 못 받습니다(트랜잭션 안에서
// 다시 읽어 판정 — 규칙도 같은 것을 봅니다).
export async function withdrawFruits(classId, uid, amount) {
  const n = Math.floor(Number(amount));
  if (!classId || !uid || !Number.isFinite(n) || n <= 0) {
    throw new Error("거둘 과일 수를 확인해 주세요.");
  }
  const check = (have, donated, entered) => {
    if (entered) throw new Error("이벤트에 응모한 뒤에는 과일을 거둘 수 없어요.");
    if (n > donated) throw new Error("내놓은 과일보다 많이 거둘 수 없어요.");
    if (have + n > REWARD_MAX) {
      throw new Error(`과일은 ${REWARD_MAX}개까지 가질 수 있어요. ${Math.max(0, REWARD_MAX - have)}개까지 거둘 수 있어요.`);
    }
  };
  // 스스로 되찾는 과일이라 축포에서 뺄 몫을 먼저 적어 둡니다(lib/selfFruitGain.js).
  const mark = expectSelfGain(classId, uid, n);
  if (isFirebaseConfigured) {
    const rewardRef = doc(db, "rewards", `${classId}_${uid}`);
    const basketRef = doc(db, "classes", classId, "fruitBasket", uid);
    try {
      return await runTransaction(db, async (tx) => {
        const r = await tx.get(rewardRef);
        const b = await tx.get(basketRef);
        const have = r.exists() ? r.data().count ?? 0 : 0;
        const donated = b.exists() ? b.data().donated ?? 0 : 0;
        check(have, donated, b.exists() && b.data().entered === true);
        tx.update(rewardRef, { count: have + n, updatedAt: serverTimestamp() });
        tx.update(basketRef, { donated: donated - n, updatedAt: serverTimestamp() });
        return have + n;
      });
    } catch (e) {
      dropSelfGain(classId, uid, mark);
      throw e;
    }
  }
  if (!mock.rewards) mock.rewards = [];
  if (!mock.fruitBasket) mock.fruitBasket = [];
  const r = mock.rewards.find((x) => x.classId === classId && x.uid === uid);
  const b = mock.fruitBasket.find((x) => x.classId === classId && x.uid === uid);
  const have = r?.count ?? 0;
  try {
    check(have, b?.donated ?? 0, b?.entered === true);
  } catch (e) {
    dropSelfGain(classId, uid, mark);
    throw e;
  }
  if (r) replaceDoc(mock.rewards, r, { count: have + n });
  else mock.rewards.push({ id: `${classId}_${uid}`, classId, uid, count: n });
  replaceDoc(mock.fruitBasket, b, (e) => ({ donated: (e.donated ?? 0) - n }));
  mockListeners.rewards?.forEach((cb) => cb());
  mockListeners.fruitBasket?.forEach((cb) => cb());
  return have + n;
}

// ── 이벤트 — 응모하기 · 응모하지 않기 · 선택 거두기 · 접수 ──────────────
// 바구니 문서에 { entered, declined, decidedAt, receivedAt, receivedBy }를
// 함께 적습니다. 학생의 선택(응모 · 응모 안 함)은 선생님이 **접수**하기
// 전까지 거둘 수 있고, 접수하면 굳습니다(규칙도 막음). 자리표의 초록 점은
// '골랐는데 아직 접수 안 됨'입니다(lib/fruitBasket.js의 isEventPending).
const eventErr = (msg) => new Error(msg);

// [학생] 응모하기 — 과일을 1개 이상 내놓았어야 합니다(규칙도 봄). 반 바구니의
// 목표(100개)는 여러 문서의 합이라 규칙이 셀 수 없어 화면이 판정합니다.
export async function enterFruitEvent(classId, uid) {
  if (!classId || !uid) return;
  const check = (b) => {
    if (b?.receivedBy) throw eventErr("선생님이 이미 접수했어요.");
    if ((b?.donated ?? 0) < 1) throw eventErr("과일을 1개 이상 내놓아야 응모할 수 있어요.");
  };
  if (isFirebaseConfigured) {
    const basketRef = doc(db, "classes", classId, "fruitBasket", uid);
    await runTransaction(db, async (tx) => {
      const b = await tx.get(basketRef);
      check(b.exists() ? b.data() : null);
      tx.update(basketRef, {
        entered: true,
        declined: false,
        decidedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    return;
  }
  if (!mock.fruitBasket) mock.fruitBasket = [];
  const b = mock.fruitBasket.find((x) => x.classId === classId && x.uid === uid);
  check(b);
  replaceDoc(mock.fruitBasket, b, { entered: true, declined: false, decidedAt: new Date() });
  mockListeners.fruitBasket?.forEach((cb) => cb());
}

// [학생] 응모하지 않기 — 내놓은 과일을 **모두 되돌려** 받고 '응모 안 함'으로
// 적습니다 → 돌려받은 개수. 돌려받아 과일 천장(REWARD_MAX)을 넘으면 넘지
// 않는 만큼만 돌려받고 나머지는 바구니에 남습니다(규칙이 100을 넘는 쓰기를
// 막으므로). 되찾은 몫은 축포에서 뺍니다.
export async function declineFruitEvent(classId, uid) {
  if (!classId || !uid) return 0;
  const check = (b) => {
    if (b?.receivedBy) throw eventErr("선생님이 이미 접수했어요.");
    if (b?.entered === true) throw eventErr("응모를 먼저 취소해 주세요.");
  };
  if (isFirebaseConfigured) {
    const rewardRef = doc(db, "rewards", `${classId}_${uid}`);
    const basketRef = doc(db, "classes", classId, "fruitBasket", uid);
    let mark = null;
    try {
      return await runTransaction(db, async (tx) => {
        const r = await tx.get(rewardRef);
        const b = await tx.get(basketRef);
        const data = b.exists() ? b.data() : null;
        check(data);
        const have = r.exists() ? r.data().count ?? 0 : 0;
        const donated = data?.donated ?? 0;
        const back = Math.max(0, Math.min(donated, REWARD_MAX - have));
        // 트랜잭션은 다시 돌 수 있어 몫을 새로 적습니다.
        dropSelfGain(classId, uid, mark);
        mark = expectSelfGain(classId, uid, back);
        if (back > 0) tx.update(rewardRef, { count: have + back, updatedAt: serverTimestamp() });
        tx.set(
          basketRef,
          {
            classId,
            uid,
            donated: donated - back,
            entered: false,
            declined: true,
            decidedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        return back;
      });
    } catch (e) {
      dropSelfGain(classId, uid, mark);
      throw e;
    }
  }
  if (!mock.rewards) mock.rewards = [];
  if (!mock.fruitBasket) mock.fruitBasket = [];
  const r = mock.rewards.find((x) => x.classId === classId && x.uid === uid);
  const b = mock.fruitBasket.find((x) => x.classId === classId && x.uid === uid);
  check(b);
  const have = r?.count ?? 0;
  const donated = b?.donated ?? 0;
  const back = Math.max(0, Math.min(donated, REWARD_MAX - have));
  expectSelfGain(classId, uid, back);
  if (back > 0) {
    if (r) replaceDoc(mock.rewards, r, { count: have + back });
    else mock.rewards.push({ id: `${classId}_${uid}`, classId, uid, count: back });
  }
  const patch = { donated: donated - back, entered: false, declined: true, decidedAt: new Date() };
  if (b) replaceDoc(mock.fruitBasket, b, patch);
  else mock.fruitBasket.push({ id: uid, classId, uid, ...patch });
  mockListeners.rewards?.forEach((cb) => cb());
  mockListeners.fruitBasket?.forEach((cb) => cb());
  return back;
}

// [학생] 고른 것 거두기(응모 취소 · 응모하지 않기 취소) — 선생님이 접수하기
// 전에만. 과일은 그대로입니다(응모를 취소하면 그때부터 다시 거둘 수 있음).
export async function cancelFruitEventChoice(classId, uid) {
  if (!classId || !uid) return;
  const check = (b) => {
    if (b?.receivedBy) throw eventErr("선생님이 이미 접수해서 바꿀 수 없어요.");
  };
  if (isFirebaseConfigured) {
    const basketRef = doc(db, "classes", classId, "fruitBasket", uid);
    await runTransaction(db, async (tx) => {
      const b = await tx.get(basketRef);
      if (!b.exists()) return;
      check(b.data());
      tx.update(basketRef, {
        entered: false,
        declined: false,
        decidedAt: null,
        updatedAt: serverTimestamp(),
      });
    });
    return;
  }
  const b = (mock.fruitBasket ?? []).find((x) => x.classId === classId && x.uid === uid);
  if (!b) return;
  check(b);
  replaceDoc(mock.fruitBasket, b, { entered: false, declined: false, decidedAt: null });
  mockListeners.fruitBasket?.forEach((cb) => cb());
}

// [교사] 이벤트 접수 — 고른 학생들(uids)의 선택을 받아 둡니다. 자리표의 초록
// 점이 꺼지고, 그 학생의 선택은 그 뒤로 못 바꿉니다. 한 번에 한 묶음
// (writeBatch — 반 학생 수라 500건 한도에 안 닿음). → 접수한 수
export async function receiveFruitEvent(classId, uids = []) {
  const list = [...new Set(uids ?? [])].filter(Boolean);
  if (!classId || list.length === 0) return 0;
  const me = getCurrentUser()?.uid ?? null;
  if (isFirebaseConfigured) {
    const batch = writeBatch(db);
    for (const u of list) {
      batch.update(doc(db, "classes", classId, "fruitBasket", u), {
        receivedAt: serverTimestamp(),
        receivedBy: me,
      });
    }
    await batch.commit();
    return list.length;
  }
  for (const u of list) {
    const b = (mock.fruitBasket ?? []).find((x) => x.classId === classId && x.uid === u);
    if (b) replaceDoc(mock.fruitBasket, b, { receivedAt: new Date(), receivedBy: me ?? "teacher" });
  }
  mockListeners.fruitBasket?.forEach((cb) => cb());
  return list.length;
}
