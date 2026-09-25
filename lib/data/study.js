// =============================================================
// 공부방 프로젝트(studyBoards) · 개인 카드 · 프로젝트 원본(studyTemplates)
// -------------------------------------------------------------
// lib/store.js에서 떼어 낸 조각입니다. 화면은 지금까지처럼 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 그대로 다시 내보냅니다.
// =============================================================
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { buildActivityTemplate, isTeacherAuthoredCard } from "../activities";
import { toDate } from "../dates";
import { db, isFirebaseConfigured } from "../firebase";
import { replaceDoc } from "../mockDocs";
import { deleteAttachedFiles } from "../storageUpload";
import { getCurrentUser } from "../user";
import { mock, mockListeners, nextMockSeq, notify, personalizeCards, sortByOldest } from "./shared";

// -------------------------------------------------------------
// 공부방 (Study) — 수업의 연장. 보드(컬럼) + 카드.
// -------------------------------------------------------------
//   studyBoards (컬렉션)
//     └ { title, type('notice'|'student'), description,
//         viewMode('shared'|'private'), editMode('open'|'locked'),
//         keyword(연계 키워드|null), order, createdAt, createdBy }
//   studyCards (컬렉션)
//     └ { boardId, content(HTML), imageUrl, authorId, authorName,
//         authorEmoji, authorRealName, createdAt, updatedAt }
//
// [설계] 학생은 한 보드에 카드 1개만 만듭니다(화면에서 제어).
//   viewMode='private'(기본)면 학생은 자기 카드만, 교사는 전부 봅니다.
//   editMode='locked'면 작성/수정이 막히고 보기 전용이 됩니다.
// -------------------------------------------------------------

export function notifyStudyBoards() {
  notify(
    mockListeners.studyBoards,
    [...mock.studyBoards].sort((a, b) => a.order - b.order)
  );
}

export function notifyStudyCards(boardId) {
  const list = personalizeCards(
    sortByOldest(mock.studyCards.filter((c) => c.boardId === boardId))
  );
  notify(mockListeners.studyCards.get(boardId) ?? new Set(), list);
  // 내 카드 구독자(리포트)도 갱신
  if (mockListeners.myCards) mockListeners.myCards.forEach((cb) => cb());
}

// 휴지통에 든 프로젝트인가 — 판정은 **deleted(참·거짓)로** 합니다.
// deletedAt은 '언제'만 적어 둔 것이라, serverTimestamp()가 서버 답을 받기
// 전까지 화면에 null로 옵니다. 그것만 보고 거르면 지운 프로젝트가 한 박자
// 되살아났다가 사라집니다(책방 휴지통에서 같은 이유로 겪은 일입니다).
const isLiveBoard = (b) => b.deleted !== true;

// 보드 목록 실시간 구독 (order 순) — 휴지통에 든 것은 빼고 돌려줍니다.
// -------------------------------------------------------------
// 화면마다 거르지 않고 여기서 한 번에 거릅니다. 이 목록을 받아 쓰는 곳이
// 공부방·수업하기(연결 대상)·전광판·책방·관리자까지 여남은 곳이라, 한 곳만
// 빠뜨려도 지운 프로젝트가 거기서만 살아 있게 됩니다. 질의에 조건을 붙이지
// 않는 이유는 여느 곳과 같습니다 — where + orderBy는 복합 색인을 요구합니다.
// 휴지통 화면은 fetchTrashedStudyBoards로 따로 가져옵니다.
export function subscribeStudyBoards(callback) {
  if (isFirebaseConfigured) {
    const q = query(collection(db, "studyBoards"), orderBy("order", "asc"));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(isLiveBoard));
    });
  }
  // Mock은 콜백을 그대로 리스너로 보관하고 notifyStudyBoards가 원본 배열을
  // 넘깁니다. 거르려면 한 겹 감싸야 합니다.
  const emit = () =>
    callback([...mock.studyBoards].sort((a, b) => a.order - b.order).filter(isLiveBoard));
  mockListeners.studyBoards.add(emit);
  emit();
  return () => mockListeners.studyBoards.delete(emit);
}

// [교사] 휴지통에 든 이 반의 프로젝트 — 휴지통을 열 때 한 번만 읽습니다.
// 늘 구독하지 않는 이유: 평소에는 볼 일이 없는 목록인데, 구독해 두면
// studyBoards를 한 벌 더 읽게 됩니다.
export async function fetchTrashedStudyBoards(classId) {
  if (!classId) return [];
  if (isFirebaseConfigured) {
    const snap = await getDocs(
      query(collection(db, "studyBoards"), where("classId", "==", classId))
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((b) => b.deleted === true)
      .sort((a, b) => toDate(b.deletedAt) - toDate(a.deletedAt));
  }
  return (mock.studyBoards ?? [])
    .filter((b) => b.classId === classId && b.deleted === true)
    .sort((a, b) => toDate(b.deletedAt) - toDate(a.deletedAt));
}

// 한 보드의 카드 목록 실시간 구독 (오래된 순)
export function subscribeStudyCards(boardId, callback) {
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "studyBoards", boardId, "cards"),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  if (!mockListeners.studyCards.has(boardId)) {
    mockListeners.studyCards.set(boardId, new Set());
  }
  mockListeners.studyCards.get(boardId).add(callback);
  callback(
    personalizeCards(
      sortByOldest(mock.studyCards.filter((c) => c.boardId === boardId))
    )
  );
  return () => mockListeners.studyCards.get(boardId)?.delete(callback);
}

// ── 모둠 활동 보드 ─────────────────────────────────────────────
// 내가 속한 모둠의 카드만 구독 — 규칙상 학생은 memberUids array-contains
// 쿼리로만 모둠 카드를 읽을 수 있음('자기 모둠만' 모드).
export function subscribeMyGroupCards(boardId, uid, callback) {
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "studyBoards", boardId, "cards"),
      where("memberUids", "array-contains", uid)
    );
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([])
    );
  }
  if (!mockListeners.studyCards.has(boardId)) {
    mockListeners.studyCards.set(boardId, new Set());
  }
  const emit = () =>
    callback(
      mock.studyCards.filter(
        (c) => c.boardId === boardId && c.memberUids?.includes(uid)
      )
    );
  mockListeners.studyCards.get(boardId).add(emit);
  emit();
  return () => mockListeners.studyCards.get(boardId)?.delete(emit);
}

// [교사] 모둠 구성 저장 — 모둠 수만큼 카드를 만들고(문서 ID = group_순번),
// 이미 있는 순번의 카드는 작성 내용(제목·본문·첨부)을 유지한 채 모둠
// 명단·이름·대표만 갱신합니다(재구성). 모둠 수가 줄면 남는 카드는
// retired 처리(교사만 표시, 학생 구독에선 제외 — memberUids 비움).
// groups: [{ index(1부터), name, memberUids[], members[{uid,name,emoji}], leaderUid }]
export async function composeStudyGroups(user, boardId, groups, options = {}) {
  const groupSetName = options.groupSetName || groups[0]?.groupSetName || "활동 모둠";
  if (isFirebaseConfigured) {
    const snap = await getDocs(collection(db, "studyBoards", boardId, "cards"));
    const existingGroupCardIds = snap.docs
      .filter((d) => d.data().groupId)
      .map((d) => d.id);
    const batch = writeBatch(db);
    groups.forEach((g) => {
      const id = `group_${g.index}`;
      const ref = doc(db, "studyBoards", boardId, "cards", id);
      // 모둠명은 title(학생도 수정 가능)로 저장. 구성 시 교사가 정한 이름을
      // title에도 반영(재구성 시 편집기에 현재 title을 미리 불러오므로 학생
      // 변경분도 보존됨). groupName은 참고용으로 함께 저장.
      const groupFields = {
        groupId: `g${g.index}`,
        groupIndex: g.index,
        groupName: g.name,
        groupSetName,
        title: g.name,
        memberUids: g.memberUids,
        members: g.members,
        leaderUid: g.leaderUid ?? null,
        retired: false,
        updatedAt: serverTimestamp(),
      };
      if (existingGroupCardIds.includes(id)) {
        batch.set(ref, groupFields, { merge: true }); // 본문·첨부는 유지
      } else {
        batch.set(ref, {
          boardId,
          content: "",
          imageUrl: null,
          attachments: [],
          authorId: user.uid,
          authorName: "선생님",
          authorEmoji: "🧑‍🏫",
          createdAt: serverTimestamp(),
          ...groupFields,
        });
      }
    });
    // 줄어든 순번의 기존 모둠 카드 → 보관(retired)
    existingGroupCardIds.forEach((id) => {
      const idx = Number(id.replace("group_", ""));
      if (!groups.some((g) => g.index === idx)) {
        batch.set(
          doc(db, "studyBoards", boardId, "cards", id),
          { retired: true, memberUids: [], members: [], leaderUid: null, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }
    });
    await batch.commit();
    return;
  }
  // 데모 모드
  groups.forEach((g) => {
    const id = `group_${g.index}`;
    const groupFields = {
      groupId: `g${g.index}`,
      groupIndex: g.index,
      groupName: g.name,
      groupSetName,
      title: g.name,
      memberUids: g.memberUids,
      members: g.members,
      leaderUid: g.leaderUid ?? null,
      retired: false,
    };
    const existing = mock.studyCards.find(
      (c) => c.boardId === boardId && c.id === id
    );
    if (existing) replaceDoc(mock.studyCards, existing, groupFields);
    else
      mock.studyCards.push({
        id,
        boardId,
        title: g.name,
        content: "",
        imageUrl: null,
        attachments: [],
        authorId: user.uid,
        authorName: "선생님",
        authorEmoji: "🧑‍🏫",
        createdAt: new Date(),
        ...groupFields,
      });
  });
  mock.studyCards.forEach((c) => {
    if (
      c.boardId === boardId &&
      c.groupId &&
      !groups.some((g) => `group_${g.index}` === c.id)
    ) {
      replaceDoc(mock.studyCards, c, { retired: true, memberUids: [], members: [], leaderUid: null });
    }
  });
  mockListeners.studyCards.get(boardId)?.forEach((cb) => cb());
}

// 한 보드의 카드 목록을 한 번만 가져옴 (내보내기/다운로드용, 구독 아님)
export async function fetchStudyCardsOnce(boardId) {
  if (isFirebaseConfigured) {
    const q = query(
      collection(db, "studyBoards", boardId, "cards"),
      orderBy("createdAt", "asc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return sortByOldest(mock.studyCards.filter((c) => c.boardId === boardId));
}

// 카드 **한 장** 구독 — 수업 노트 서랍의 활동 칸이 씁니다.
// 서랍 뒤에 그 카드가 함께 열려 있을 수 있어(공부방 프로젝트 화면에서
// '파이썬 실행기' 단추로 연 경우) 한 번 읽고 끝내면, 카드 화면에서 고친
// 칸을 서랍이 옛 값으로 되써 버립니다. 문서 하나라 읽기는 늘 1건입니다.
// 없으면 null — 아직 한 번도 안 쓴 카드입니다(규칙이 반 학생의 개별
// 프로젝트 카드 get을 허용해, 없는 문서도 거부되지 않습니다).
export function subscribeStudyCard(boardId, cardId, callback) {
  if (!boardId || !cardId) {
    callback(null);
    return () => {};
  }
  if (isFirebaseConfigured) {
    return onSnapshot(
      doc(db, "studyBoards", boardId, "cards", cardId),
      (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => callback(null)
    );
  }
  if (!mockListeners.studyCards.has(boardId)) {
    mockListeners.studyCards.set(boardId, new Set());
  }
  // mock은 카드를 제자리에서 고치므로 **얕은 사본**을 넘깁니다 — 같은 참조를
  // 받으면 React가 다시 그리지 않습니다(반 문서에서 겪은 그 함정).
  // 작성자로도 찾습니다 — 데모에서 역할 전환으로 된 학생은 카드가 교사식 자동
  // ID로 생겨(`addStudyCard`의 역할 판정) uid로는 못 찾습니다. 실서비스는 규칙이
  // 학생 카드 ID를 uid로 못 박아 이 갈래가 필요 없습니다.
  const emit = () => {
    const c =
      mock.studyCards.find((x) => x.boardId === boardId && x.id === cardId) ??
      mock.studyCards.find((x) => x.boardId === boardId && x.authorId === cardId);
    callback(c ? { ...c } : null);
  };
  mockListeners.studyCards.get(boardId).add(emit);
  emit();
  return () => mockListeners.studyCards.get(boardId)?.delete(emit);
}

// 내 공부방 카드 전체 구독 — 학생 리포트에서 "내가 낸 카드"만 모읍니다.
// (모든 보드의 카드를 구독하면 반 격리 규칙에 막히므로, collectionGroup +
//  authorId==uid로 내 것만 읽습니다. 카드 규칙이 '본인 카드'를 허용.)
export function subscribeMyStudyCards(uid, callback) {
  if (isFirebaseConfigured) {
    const q = query(collectionGroup(db, "cards"), where("authorId", "==", uid));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => callback([])
    );
  }
  // 데모: 평면 배열에서 내 카드만
  const emit = () => callback((mock.studyCards ?? []).filter((c) => c.authorId === uid));
  const wrapper = () => emit();
  // 카드 변경 시 갱신 — 모든 보드 리스너 집합에 함께 걸어둠
  if (!mockListeners.myCards) mockListeners.myCards = new Set();
  mockListeners.myCards.add(wrapper);
  emit();
  return () => mockListeners.myCards.delete(wrapper);
}

// [교사] 여러 프로젝트의 카드를 한꺼번에 구독 → { boardId: cards[] }
// -------------------------------------------------------------
// 공부중 전광판의 학생 정보창이 '이 반 모든 프로젝트의 참여도'를 보여 주려고
// 씁니다. 반 전체 카드를 collectionGroup으로 한 번에 읽을 수는 없어서
// (카드에 classId가 없고, 반 격리 규칙이 보드 단위로 걸려 있음) 보드마다
// 하나씩 구독합니다. 반의 프로젝트 수는 보통 열 개 안쪽이고, 전광판을 연
// 동안에만 걸리므로 부담이 크지 않습니다.
export function subscribeCardsForBoards(boardIds, callback) {
  const ids = [...new Set((boardIds || []).filter(Boolean))];
  if (ids.length === 0) { callback({}); return () => {}; }
  if (isFirebaseConfigured) {
    const byBoard = {};
    const emit = () => callback({ ...byBoard });
    const unsubs = ids.map((bid) =>
      onSnapshot(
        collection(db, "studyBoards", bid, "cards"),
        (snap) => { byBoard[bid] = snap.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); },
        () => { byBoard[bid] = []; emit(); }
      )
    );
    return () => unsubs.forEach((u) => u());
  }
  const emit = () => {
    const byBoard = {};
    ids.forEach((bid) => {
      byBoard[bid] = (mock.studyCards ?? []).filter((c) => c.boardId === bid);
    });
    callback(byBoard);
  };
  if (!mockListeners.myCards) mockListeners.myCards = new Set();
  mockListeners.myCards.add(emit);
  emit();
  return () => mockListeners.myCards.delete(emit);
}

// [교사] 보드(프로젝트) 추가 (맨 뒤 순서로)
// -------------------------------------------------------------
// activities: 학생 개인 카드에 제시할 활동 이름 목록. 프로젝트를 만들 때
// 함께 정합니다(만든 뒤 '활동 설정'에서 언제든 고칠 수 있음).
//
// **첫 활동만 열린 채로 시작합니다** — 책방의 곁텍스트 읽기와 같은 모양입니다
// (거기도 만들면 1단계만 열립니다). 한때 전부 열어 두었는데, 같은 '한 칸씩
// 열어 주는' 진행인데 두 방이 서로 다르게 시작해 교사가 화면마다 다시
// 익혀야 했습니다. 수업 도중 더하는 활동은 지금까지처럼 nextActivityLocks가
// 잠근 채로 시작시킵니다.
export async function addStudyBoard(
  user,
  {
    title,
    type = "student",
    description = "",
    keywords = [],
    classId = null,
    activityType = "individual", // 'individual'(개별) | 'group'(모둠)
    activities = [],
    // 프로젝트 원본(studyTemplates)에서 시작한 복사본이면 그 원본의 id.
    // 가져오기 목록이 이 값으로 복사본을 숨기고 원본 하나만 세웁니다.
    templateId = null,
    // 파이썬 실행기와 연계 — 켜면 학생 카드에 '파이썬 실행기' 단추가 섭니다.
    pyLinked = false,
  }
) {
  const acts = (activities ?? []).filter((a) => String(a).trim().length > 0);
  const data = {
    classId: classId ?? null,
    title,
    type,
    description,
    keywords: keywords ?? [],
    activityType,
    activities: acts,
    activityLocks: acts.map((_, i) => i > 0), // 첫 활동만 열림
    pyLinked: !!pyLinked,

    viewMode: type === "notice" ? "shared" : "private", // notice는 학생 전체 공지, 학생 보드는 기본 비공개
    editMode: "open",
    createdBy: user.uid,
    // 원본 없이 만든 보드에는 칸 자체를 안 둡니다 — 지금까지의 모양 그대로.
    ...(templateId ? { templateId } : {}),
  };
  // 만든 보드의 id를 돌려줍니다 — 수업 준비에서 '수업 보드 추가'로 만든 뒤
  // 바로 그 보드를 수업 자료에 연결하려면 id가 필요합니다.
  if (isFirebaseConfigured) {
    const ref = await addDoc(collection(db, "studyBoards"), {
      ...data,
      order: Date.now(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }
  const maxOrder = Math.max(0, ...mock.studyBoards.map((b) => b.order));
  const id = `b${nextMockSeq()}_m`;
  mock.studyBoards.push({
    id,
    ...data,
    order: maxOrder + 1,
    createdAt: new Date(),
  });
  notifyStudyBoards();
  return id;
}

export async function ensureDefaultStudyBoard(user, classId) {
  if (!user || !classId) return null;
  if (isFirebaseConfigured) {
    const existing = await getDocs(
      query(
        collection(db, "studyBoards"),
        where("classId", "==", classId),
        where("type", "==", "notice"),
        limit(1)
      )
    );
    if (!existing.empty) return existing.docs[0].id;
  } else {
    const existing = mock.studyBoards.find((b) => b.classId === classId && b.type === "notice");
    if (existing) return existing.id;
  }

  return addStudyBoard(user, {
    title: "선생님 보드",
    type: "notice",
    description: "수업 안내와 자료를 올려 주세요.",
    classId,
  });
}

// [교사] 보드 순서 일괄 변경 — 드래그 앤 드롭 결과(id 배열)를 그대로 전달.
// (같은 반의 보드 id를 새 순서대로 넘기면 order를 0..n-1로 재배정)
export async function reorderStudyBoards(orderedIds) {
  if (isFirebaseConfigured) {
    await Promise.all(
      orderedIds.map((id, i) => updateDoc(doc(db, "studyBoards", id), { order: i }))
    );
    return;
  }
  orderedIds.forEach((id, i) => {
    const b = mock.studyBoards.find((x) => x.id === id);
    if (b) b.order = i;
  });
  notifyStudyBoards();
}

// [교사] 보드 복제 — 다른 반으로 보드를 복사합니다.
// 학생 기록(카드)은 복사하지 않고(초기화), 교사가 제시한 활동(activities)과
// 공개 범위(viewMode)·편집 상태(editMode)·제목·설명·키워드만 유지합니다.
export async function duplicateStudyBoard(board, targetClassId, user) {
  const data = {
    classId: targetClassId ?? null,
    title: board.title,
    type: board.type ?? "student",
    description: board.description ?? "",
    keywords: board.keywords ?? [],
    activities: board.activities ?? [], // 교사가 제시한 활동 유지
    // 활동 유형(개별/모둠)도 함께 옮깁니다 — 예전엔 빠져 있어서 모둠
    // 프로젝트를 복제하면 개별 활동으로 되돌아갔습니다.
    //
    // 잠금은 **옮기지 않고 첫 활동만 연 채로** 시작합니다. 원본의 잠금은
    // 그 반의 진도인데, 받는 반은 아직 진도가 0입니다. 예전에는 그대로
    // 복사해서, 활동을 다 열어 둔 반에서 복제하면 새 반에도 여덟 개가
    // 한꺼번에 열린 채로 도착했습니다. 새로 만들 때와 같은 모양이라
    // (첫 칸만 열림) 어느 길로 만들어도 시작하는 모습이 같습니다.
    activityLocks: (board.activities ?? []).map((_, i) => i > 0),
    activityType: board.activityType ?? "individual",
    pyLinked: !!board.pyLinked, // 파이썬 실행기 연계도 설계의 일부라 함께 갑니다
    viewMode: board.viewMode ?? "private", // 공개 범위 유지
    editMode: board.editMode ?? "open", // 편집 상태 유지
    createdBy: user.uid,
    // 원본에서 시작한 복사본을 다른 반으로 복제하면 **같은 원본의 복사본**
    // 입니다 — 칸을 이어받아야 가져오기 목록에서 원본 하나로 묶입니다.
    ...(board.templateId ? { templateId: board.templateId } : {}),
  };
  // 만든 프로젝트의 id를 돌려줍니다 — 수업 자료 편집에서 '다른 반에서
  // 가져오기'로 복사한 뒤 곧바로 그 수업에 연결하려면 id가 필요합니다.
  let newId;
  if (isFirebaseConfigured) {
    // 학생 카드(서브컬렉션)는 복사하지 않음 → 학생 기록 초기화
    const ref = await addDoc(collection(db, "studyBoards"), {
      ...data,
      order: Date.now(),
      createdAt: serverTimestamp(),
    });
    newId = ref.id;
  } else {
    const maxOrder = Math.max(0, ...mock.studyBoards.map((b) => b.order));
    newId = `b${nextMockSeq()}_m`;
    mock.studyBoards.push({
      id: newId,
      ...data,
      order: maxOrder + 1,
      createdAt: new Date(),
    });
    notifyStudyBoards();
  }
  await copyGuideCards(board, newId, user);
  return newId;
}

// 복제할 때 **교사 카드(안내·예시)는 함께 옮깁니다.**
// -------------------------------------------------------------
// 초기화되는 것은 '학생 기록'이지 교사가 만든 것이 아닙니다 — 활동 목록과
// 공개 범위를 그대로 가져가는 것과 같은 갈래입니다. 예전에는 카드 서브컬렉션을
// 통째로 건너뛰어 **새 반에만 안내 카드가 없었고**, 같은 프로젝트가 어느 길로
// 왔느냐에 따라 다르게 도착했습니다(`activityLocks`에서 겪은 그 문제).
//
// [작성자를 다시 적습니다] 규칙이 `request.resource.data.authorId == uid()`를
// **교사·관리자에게도 예외 없이** 요구합니다. 원본 카드를 그대로 옮기면 다른
// 교사가 만든 안내 카드일 때 쓰기가 거부됩니다. 교사 표시 이름은 늘 '선생님'
// 으로 맞춰져 있어(`lib/auth.js`) 다시 적어도 화면은 그대로입니다.
//
// [글만 옮기고 파일은 안 옮깁니다] 보드를 지우면 그 카드의 첨부를 함께
// 지웁니다(`purgeClass`·보드 삭제). 첨부를 참조만 복사해 두면 **원본 반을
// 지우는 순간 새 반의 링크가 깨집니다.** 보드의 학습 자료도 지금 복제에서
// 함께 안 옮기고 있어 결이 같습니다.
//
// [원본에 없으면 새로 한 장] 안내 카드가 생기기 전에 만든 프로젝트, 또는
// 교사가 지운 경우입니다. 새로 만들 때와 같은 모양으로 도착시킵니다.
async function copyGuideCards(srcBoard, newBoardId, user) {
  if (!srcBoard?.id || !newBoardId || !user) return;
  try {
    const cards = await fetchStudyCardsOnce(srcBoard.id);
    const guides = (cards ?? []).filter(isTeacherAuthoredCard);
    if (guides.length > 0) {
      for (const g of guides) {
        await addStudyCard(user, newBoardId, {
          title: g.title ?? "",
          content: g.content ?? "",
        });
      }
      return;
    }
    await addStudyCard(user, newBoardId, {
      title: "안내",
      content: buildActivityTemplate(srcBoard.activities ?? []),
    });
  } catch {
    // 안내 카드는 부가 기능이라 실패해도 복제 자체는 그대로 둡니다
    // (교사가 설정에서 '＋ 카드 추가'로 언제든 만들 수 있습니다).
  }
}

// =============================================================
// 프로젝트 원본 (studyTemplates) — 반에 안 묶인 선생님의 프로젝트
// -------------------------------------------------------------
// 프로젝트는 **선생님의 것**이고 반의 것이 아닙니다. 공부방의 '＋ 프로젝트
// 만들기'는 여기(원본)에 한 장을 만들고, 반에서 쓸 때 '우리 반에 가져오기'가
// 그 반에 **복사본**(studyBoards 문서, `templateId` = 원본 id)을 하나 만듭니다.
// 수업 자료(`lessons`)가 이미 이렇게 돌아갑니다 — 반에 안 묶이고 만든 선생님에게
// 붙어서, '수업 시작하기'로 비로소 특정 반과 만납니다. 그 짝입니다.
//
// [왜] 예전에는 프로젝트가 처음부터 반에 묶여서, 같은 프로젝트를 세 반에서
// 쓰면 문서가 셋이었고 '다른 반에서 가져오기' 목록에 같은 이름이 반 수만큼
// 늘어섰습니다. 지금은 원본이 하나라 그 목록에 **이름 하나**만 섭니다.
//
// [원본이 들고 있는 것] '무엇을 하는 프로젝트인가' — 제목·안내·활동 목록·
// 활동 유형·연계 키워드. 반마다 달라지는 것(학생 카드·활동 잠금·공개 범위·
// 학습 자료·진도)은 전부 **복사본**에 붙습니다.
//
// [원본을 고쳐도 복사본은 그대로입니다] 가져온 그 순간의 모습으로 굳습니다.
// 학생 카드는 활동을 **자리(몇 번째 칸)**로 읽고 쓰므로, 원본에서 활동을
// 지우거나 순서를 바꾼 것이 이미 나간 반에 번지면 쓴 글이 엉뚱한 칸으로
// 밀립니다. 원본을 지워도 복사본은 남습니다(`templateId`가 가리키는 곳만
// 사라질 뿐 — 학생 기록은 그대로).
//
// [앞으로 만드는 것부터] 이 구조가 생기기 전에 만든 프로젝트에는 원본이
// 없습니다(`templateId` 칸 자체가 없음). 자료를 옮기지 않았고, 가져오기
// 목록에서는 '원본 없는 프로젝트'로 반별로 따로 섭니다.
//
// [읽기] `ownerId` 등호 하나 + 화면 정렬 — 복합 색인이 필요 없습니다
// (수업 자료 목록과 같은 방식). 규칙도 수업 자료와 같습니다: 만든 선생님만.
// =============================================================
function notifyStudyTemplates() {
  const list = [...(mock.studyTemplates ?? [])];
  mockListeners.studyTemplates?.forEach((cb) => cb(list));
}

// 만든 차례(오래된 것이 앞). 최신순이면 하나 만들 때마다 목록이 통째로 한 칸씩
// 밀려 어제 누르던 원본이 매번 다른 자리에 있습니다(책방 활동 목록과 같은
// 까닭). `createdAt`이 아직 null(서버 대기)인 새 원본은 **지금**으로 봐 맨 끝에
// 섭니다 — 0으로 치면 맨 앞으로 튀었다가 시각이 오는 순간 뒤로 내려앉습니다.
function byTemplateCreated(a, b) {
  return toDate(a.createdAt) - toDate(b.createdAt);
}

export function subscribeMyStudyTemplates(uid, callback) {
  if (!uid) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const q = query(collection(db, "studyTemplates"), where("ownerId", "==", uid));
    return onSnapshot(
      q,
      (snap) => callback(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byTemplateCreated)
      ),
      (e) => {
        console.warn("[공부방] 프로젝트 원본을 읽지 못했어요:", e?.code, e?.message);
        callback([]);
      }
    );
  }
  if (!mock.studyTemplates) mock.studyTemplates = [];
  if (!mockListeners.studyTemplates) mockListeners.studyTemplates = new Set();
  const emit = (list) =>
    callback((list ?? mock.studyTemplates).filter((t) => t.ownerId === uid).sort(byTemplateCreated));
  mockListeners.studyTemplates.add(emit);
  emit();
  return () => mockListeners.studyTemplates.delete(emit);
}

// [교사] 원본 만들기 — 반에는 아무것도 안 생깁니다. 학생에게 보이려면
// '우리 반에 가져오기'(startStudyTemplateInClass)를 한 번 더 누릅니다.
export async function addStudyTemplate(
  user,
  {
    title,
    description = "",
    keywords = [],
    activityType = "individual",
    activities = [],
    pyLinked = false,
  }
) {
  const acts = (activities ?? []).map((a) => String(a).trim()).filter(Boolean);
  const data = {
    ownerId: user.uid,
    ownerName: user.realName || user.displayName || "선생님",
    title: String(title ?? "").trim(),
    description: String(description ?? "").trim(),
    keywords: keywords ?? [],
    activityType,
    activities: acts,
    pyLinked: !!pyLinked,
  };
  if (isFirebaseConfigured) {
    const ref = await addDoc(collection(db, "studyTemplates"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }
  if (!mock.studyTemplates) mock.studyTemplates = [];
  const id = `tpl${nextMockSeq()}_m`;
  mock.studyTemplates.push({ id, ...data, createdAt: new Date() });
  notifyStudyTemplates();
  return id;
}

// [교사] 원본 지우기 — **복사본은 그대로** 남습니다. 이미 그 원본으로 수업한
// 반의 학생 카드가 원본 하나 때문에 사라지면 안 됩니다. 사라지는 것은 다음
// 가져오기 목록의 그 한 줄뿐입니다.
export async function deleteStudyTemplate(templateId) {
  if (!templateId) return;
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "studyTemplates", templateId));
    return;
  }
  // mock은 배열을 **갈아 끼웁니다**(제자리에서 고치지 않고) — 같은 배열을
  // 들고 있는 쪽이 늘 같은 참조를 받아 React가 다시 그리지 않습니다.
  mock.studyTemplates = (mock.studyTemplates ?? []).filter((t) => t.id !== templateId);
  notifyStudyTemplates();
}

// [교사] 원본을 우리 반에 가져오기 — 이 반에 복사본 한 장을 만듭니다.
// -------------------------------------------------------------
// 새로 만들 때(`addStudyBoard`)와 **같은 모양**으로 도착합니다: 첫 활동만
// 열리고(`activityLocks`), 공개 범위는 비공개, 안내 카드가 한 장 깔립니다.
// 어느 길로 왔느냐에 따라 다르게 도착하면 교사가 화면마다 다시 익혀야
// 합니다(`activityLocks`와 안내 카드 복제에서 이미 겪은 문제).
export async function startStudyTemplateInClass(template, classId, user) {
  if (!template?.id || !classId || !user) return null;
  const acts = (template.activities ?? []).map((a) => String(a).trim()).filter(Boolean);
  const id = await addStudyBoard(user, {
    title: template.title,
    type: "student",
    description: template.description ?? "",
    keywords: template.keywords ?? [],
    classId,
    activityType: template.activityType ?? "individual",
    activities: acts,
    templateId: template.id,
    pyLinked: !!template.pyLinked,
  });
  // 활동이 없는 원본(수업 중에 이름만으로 만든 것)에는 안내 카드를 안 깝니다 —
  // 빈 '안내' 카드만 격자 맨 앞에 서게 됩니다. 예전 '+ 새 프로젝트'도 그랬습니다.
  if (id && acts.length > 0) {
    try {
      await addStudyCard(user, id, { title: "안내", content: buildActivityTemplate(acts) });
    } catch {
      // 안내 카드는 부가 기능이라 실패해도 시작 자체는 그대로 둡니다
      // (교사가 설정에서 '＋ 카드 추가'로 언제든 만들 수 있습니다).
    }
  }
  return id;
}

// [교사] 원본을 만들고 **곧바로 이 반에 불러옵니다** — 수업 중에 만드는 자리
// (수업 편집의 '+ 새 프로젝트' · 파이썬 실행기의 프로젝트 만들기)가 씁니다.
// 수업 중이라도 프로젝트는 **반에 안 묶인 원본**으로 만들고, 이 반에서 쓰는
// 것은 그 원본을 불러온 복사본입니다 — 공부방 '＋ 프로젝트 만들기'와 같은
// 규칙입니다. 한때 이 두 자리만 반에 곧바로 만들어, 가져오기 목록에 '원본
// 없는 프로젝트'가 계속 생겨났습니다. 누름은 지금까지처럼 한 번입니다.
export async function createStudyProjectInClass(user, classId, fields) {
  const t = {
    title: String(fields?.title ?? "").trim(),
    description: String(fields?.description ?? "").trim(),
    keywords: fields?.keywords ?? [],
    activityType: fields?.activityType ?? "individual",
    activities: (fields?.activities ?? []).map((a) => String(a).trim()).filter(Boolean),
    pyLinked: !!fields?.pyLinked,
  };
  const templateId = await addStudyTemplate(user, t);
  const boardId = await startStudyTemplateInClass({ id: templateId, ...t }, classId, user);
  return { templateId, boardId };
}

// [교사] 원본 고치기 — 원본 편집 창(StudyTemplateEditModal)과, 반 복사본에서
// 따라 적는 활동 목록(syncTemplateActivities)·연계(syncTemplateLinks)가 부릅니다.
export async function updateStudyTemplate(templateId, patch) {
  if (!templateId || !patch) return;
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "studyTemplates", templateId), patch);
    return;
  }
  // mock은 문서를 **갈아 끼웁니다** — 같은 객체를 고쳐 두면 그것을 들고 있는
  // 쪽이 늘 같은 참조를 받아 React가 다시 그리지 않습니다.
  mock.studyTemplates = (mock.studyTemplates ?? []).map((t) =>
    t.id === templateId ? { ...t, ...patch } : t
  );
  notifyStudyTemplates();
}

// [교사] 반 복사본의 활동을 고치면 **그 원본에도** 같은 활동 목록을 적습니다.
// -------------------------------------------------------------
// 원본 편집 창(StudyTemplateEditModal)도 있지만, 활동은 대개 반 복사본에서(수업 편집의 활동
// 칸 · 프로젝트의 활동 패널 · 파이썬 실행기) 고칩니다. 원본에 안 적으면 수업
// 중에 이름만으로 만든 원본은 영영 활동이 비어, 다른 반에서 불러오면 빈
// 프로젝트가 옵니다. 그래서 '프로젝트는 원본 하나'라는 규칙대로 활동 목록은
// 원본을 따라가게 둡니다.
//   · **다른 반의 복사본은 안 건드립니다** — 거기 학생 카드는 활동을 자리로
//     읽고 쓰므로, 남의 반 활동이 바뀌면 쓴 글이 엉뚱한 칸으로 밀립니다.
//     바뀐 원본은 **다음에 불러오는 반**부터 적용됩니다.
//   · 실패해도(남의 원본 · 원본이 지워짐) 반 복사본 저장은 그대로 둡니다 —
//     원본은 딸린 일이라 수업 중인 화면을 막지 않습니다.
export async function syncTemplateActivities(board, activities) {
  if (!board?.templateId) return;
  try {
    await updateStudyTemplate(board.templateId, {
      activities: (activities ?? []).map((a) => String(a).trim()).filter(Boolean),
    });
  } catch (e) {
    console.warn("[공부방] 원본 활동을 맞추지 못했어요:", e?.code, e?.message);
  }
}

// [교사] 편집 창에서 고친 **연계**(키워드 · 파이썬 실행기)를 원본에도 적습니다.
// 활동 목록과 같은 까닭입니다 — 연계도 프로젝트 설계의 일부라, 한 번 고치면
// **다음에 불러오는 반부터** 고친 대로 옵니다. 이미 나간 다른 반의 복사본은
// 안 건드립니다. 제목·안내는 반마다 달리 쓸 수 있어 맞추지 않습니다.
// 실패해도(남의 원본 · 지워진 원본) 반 복사본 저장은 그대로 둡니다.
export async function syncTemplateLinks(board, { keywords, pyLinked }) {
  if (!board?.templateId) return;
  try {
    await updateStudyTemplate(board.templateId, {
      keywords: keywords ?? [],
      pyLinked: !!pyLinked,
    });
  } catch (e) {
    console.warn("[공부방] 원본 연계를 맞추지 못했어요:", e?.code, e?.message);
  }
}

// [교사] 보드 설정/제목 수정 (viewMode, editMode, title, description, keyword)
export async function updateStudyBoard(boardId, patch) {
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "studyBoards", boardId), patch);
    return;
  }
  const target = mock.studyBoards.find((b) => b.id === boardId);
  if (target) replaceDoc(mock.studyBoards, target, patch);
  notifyStudyBoards();
}

// [교사] 보드 삭제 (보드에 속한 카드와 첨부 파일도 함께 정리)
// [교사] 프로젝트 삭제 — 곧바로 지우지 않고 휴지통 표시만 찍습니다.
// -------------------------------------------------------------
// 프로젝트 하나에는 반 학생 전원의 카드가 달려 있습니다. 손이 미끄러져
// 지우면 한 반의 활동이 통째로 날아가는데, 책방 활동에서 실제로 그 일이
// 있었고 앱 안에 되돌릴 길이 없었습니다. 같은 자리를 여기에도 둡니다.
// 진짜로 없애는 것은 purgeStudyBoard입니다(휴지통에서 한 번 더 확인).
export async function deleteStudyBoard(boardId) {
  const user = getCurrentUser();
  const patch = {
    deleted: true,
    deletedAt: isFirebaseConfigured ? serverTimestamp() : new Date(),
    deletedBy: user?.uid ?? null,
  };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "studyBoards", boardId), patch);
    return;
  }
  const b = (mock.studyBoards ?? []).find((x) => x.id === boardId);
  if (b) replaceDoc(mock.studyBoards, b, patch);
  notifyStudyBoards();
}

// [교사] 휴지통에서 되돌리기
export async function restoreStudyBoard(boardId) {
  const patch = { deleted: false, deletedAt: null, deletedBy: null };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "studyBoards", boardId), patch);
    return;
  }
  const b = (mock.studyBoards ?? []).find((x) => x.id === boardId);
  if (b) replaceDoc(mock.studyBoards, b, patch);
  notifyStudyBoards();
}

// [교사] 완전히 지우기 — 학생 카드와 첨부 파일까지 되돌릴 수 없이 없앱니다.
export async function purgeStudyBoard(boardId) {
  if (isFirebaseConfigured) {
    // Firestore는 서브컬렉션을 자동 삭제하지 않으므로 cards를 먼저 일괄 삭제합니다.
    const cardsSnap = await getDocs(
      collection(db, "studyBoards", boardId, "cards")
    );
    await Promise.all(cardsSnap.docs.map((d) => deleteAttachedFiles(d.data())));
    await Promise.all(cardsSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "studyBoards", boardId));
    return;
  }
  mock.studyBoards = mock.studyBoards.filter((b) => b.id !== boardId);
  mock.studyCards = mock.studyCards.filter((c) => c.boardId !== boardId);
  notifyStudyBoards();
}

// 카드 추가. content는 서식(HTML), imageUrl은 첨부 이미지(선택), attachments는 파일 첨부 목록
export async function addStudyCard(user, boardId, { title = "", content, imageUrl = null, attachments = [] }) {
  const data = {
    boardId,
    title: title ?? "",
    content,
    imageUrl: imageUrl ?? null,
    attachments: attachments ?? [],
    authorId: user.uid,
    authorName: user.displayName,
    authorEmoji: user.emoji ?? null,
    // 실명·이메일·학번 등 식별 정보는 카드에 저장하지 않음
    // — 교사는 사용자 디렉터리(users/{uid})로 확인
  };
  // 교사는 한 보드에 카드를 여러 개 올릴 수 있음(예시·자료 등) → 자동 ID.
  // 학생은 문서 ID=uid로 고정해 "보드당 1개"를 문서 수준에서 보장(중복 제출 방지).
  const isTeacherUser = user.role === "admin" || user.role === "teacher";
  if (isFirebaseConfigured) {
    if (isTeacherUser) {
      // 교사는 자동 ID → 생성된 카드 ID를 돌려줍니다(자동저장이 이후 갱신에 사용).
      const ref = await addDoc(collection(db, "studyBoards", boardId, "cards"), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    }
    // 학생은 문서 ID=uid로 고정 → uid가 곧 카드 ID입니다.
    await setDoc(doc(db, "studyBoards", boardId, "cards", user.uid), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return user.uid;
  }
  // mock: 교사는 매번 새 카드, 학생은 기존 카드 교체(없으면 추가)
  const existing = isTeacherUser
    ? null
    : mock.studyCards.find((c) => c.boardId === boardId && c.authorId === user.uid);
  if (existing) {
    replaceDoc(mock.studyCards, existing, data, { updatedAt: new Date() });
    notifyStudyCards(boardId);
    return existing.id;
  }
  const newId = isTeacherUser ? `card${nextMockSeq()}_m` : user.uid;
  mock.studyCards.push({
    id: newId,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  notifyStudyCards(boardId);
  return newId;
}

// 카드 수정 — 작성자 본인(또는 교사)만 호출하도록 화면에서 제어
// 넘어온 필드만 갱신합니다(부분 수정).
// -------------------------------------------------------------
// 예전에는 네 필드를 늘 함께 덮어썼습니다. 그래서 제목만 바꾸려고
// { title }만 넘기면 content가 undefined가 되어 Firestore가 문서 수정을
// 통째로 거부했고(=제목도 안 바뀜), 데모 모드에서는 본문·이미지·첨부가
// 빈 값으로 지워졌습니다. 보드 제목을 바꿀 때 학생 카드 제목을 따라
// 맞추는 자리(StudyProjectView.commitTitle)가 정확히 이 경우입니다.
export async function updateStudyCard(boardId, cardId, fields = {}) {
  const patch = {};
  if (fields.title !== undefined) patch.title = fields.title ?? "";
  if (fields.content !== undefined) patch.content = fields.content ?? "";
  if (fields.imageUrl !== undefined) patch.imageUrl = fields.imageUrl ?? null;
  if (fields.attachments !== undefined) patch.attachments = fields.attachments ?? [];
  if (Object.keys(patch).length === 0) return;
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "studyBoards", boardId, "cards", cardId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  const target = mock.studyCards.find(
    (c) => c.boardId === boardId && c.id === cardId
  );
  if (target) replaceDoc(mock.studyCards, target, patch, { updatedAt: new Date() });
  notifyStudyCards(boardId);
}

// 카드에 다는 작은 반응 — 질문 게시판 답변의 반응(setAnswerReaction)과
// 같은 방식입니다. meTooIds처럼 배열 토글이라, 같은 사람이 같은 이모티콘을
// 다시 누르면 취소되고 종류가 다르면 동시에 여러 개를 누를 수 있습니다.
// 자기 카드에는 반응할 수 없습니다(규칙에서도 막음).
export const CARD_REACTION_FIELDS = {
  thumbsUp: "thumbsUpIds",
  heart: "heartIds",
  smile: "smileIds",
};

export async function setCardReaction(boardId, cardId, kind, uid, on) {
  const field = CARD_REACTION_FIELDS[kind];
  if (!field || !boardId || !cardId || !uid) return;
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "studyBoards", boardId, "cards", cardId), {
      [field]: on ? arrayUnion(uid) : arrayRemove(uid),
    });
    return;
  }
  const target = mock.studyCards.find(
    (c) => c.boardId === boardId && c.id === cardId
  );
  if (target) {
    const ids = new Set(target[field] ?? []);
    if (on) ids.add(uid);
    else ids.delete(uid);
    target[field] = [...ids];
  }
  notifyStudyCards(boardId);
}

// 카드 삭제 — 첨부된 이미지·파일(Storage)도 함께 삭제합니다.
export async function deleteStudyCard(boardId, cardId) {
  if (isFirebaseConfigured) {
    const cardRef = doc(db, "studyBoards", boardId, "cards", cardId);
    const cardSnap = await getDoc(cardRef);
    await deleteAttachedFiles(cardSnap.data());
    await deleteDoc(cardRef);
    return;
  }
  mock.studyCards = mock.studyCards.filter(
    (c) => !(c.boardId === boardId && c.id === cardId)
  );
  notifyStudyCards(boardId);
}
