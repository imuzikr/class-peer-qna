// =============================================================
// 수업 노트(코넬)
// -------------------------------------------------------------
// lib/store.js에서 떼어 낸 조각입니다. 화면은 지금까지처럼 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 그대로 다시 내보냅니다.
// =============================================================
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { CORNELL_BLOCK_MAX } from "../cornell";
import { marksToSave } from "../cornellMarks";
import { toDate, todayDateKey } from "../dates";
import { db, isFirebaseConfigured } from "../firebase";
import { getCurrentUser } from "../user";
import { mock, mockListeners } from "./shared";

// =============================================================
// 수업 노트(코넬) — classes/{classId}/cornellNotes/{uid}_{날짜}
// -------------------------------------------------------------
// 학생이 수업 중에 적는 필기입니다. 바로 위 lessonMemos(교사의 수업 메모)와
// 주인이 반대입니다 — 이쪽은 학생이 쓰고 교사가 읽습니다. 이름을 굳이
// 다르게 지은 것도 그래서입니다(한 부모 아래 lessonMemos/lessonNotes가
// 나란히 있으면 반드시 헷갈립니다).
//
// 코넬 노트의 세 칸을 그대로 담습니다 — 단서(cue) · 필기(notes) · 요약(summary).
// 하루 한 장으로 묶어 문서 ID를 `uid_날짜`로 못 박습니다(KWLS와 같은 방식).
// 복습 단위가 '차시'라 슬라이드마다 쪼개면 나중에 조각을 이어 붙여야 합니다.
//
// feedback 칸은 교사만 씁니다(규칙이 그 칸만 열어 둡니다). 학생이 이어서
// 저장해도 merge라 그 값은 그대로 남습니다.
// =============================================================
export const CORNELL_LIMITS = { cue: 1000, notes: 20000, summary: 2000 };
// 노트 한 장에 걸어 둘 자료 수 — 한 프로젝트의 공통 자료라 몇 개면 충분합니다.
export const CORNELL_MATERIAL_MAX = 12;

// [학생] 그 프로젝트의 학습 자료를 한 번 읽어 옵니다(문서 1건).
// -------------------------------------------------------------
// 방송 문서에 자료 목록을 통째로 싣지 않는 이유: 방송은 슬라이드를 넘길
// 때마다 덮어써지므로, 목록을 실어 나르면 그때마다 쓰기가 커집니다. 대신
// boardId만 싣고 여기서 한 번 읽습니다(studyBoards 읽기는 로그인 사용자에게
// 열려 있어 규칙을 건드리지 않습니다).
export async function fetchBoardHandouts(boardId) {
  if (!boardId) return [];
  let board = null;
  if (isFirebaseConfigured) {
    const snap = await getDoc(doc(db, "studyBoards", boardId));
    board = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } else {
    board = (mock.studyBoards ?? []).find((b) => b.id === boardId) ?? null;
  }
  if (!board) return [];
  const list = Array.isArray(board.materials) ? board.materials : [];
  return list
    .filter((m) => m && (m.file?.url || m.image))
    .map((m) => ({
      name: m.file?.name || m.text?.trim() || (m.image ? "사진 자료" : "자료"),
      url: m.file?.url || m.image,
      kind: m.file?.url ? "file" : "image",
    }))
    .slice(0, CORNELL_MATERIAL_MAX);
}

export function cornellNoteId(uid, date) {
  return `${uid}_${date}`;
}

// [학생] 오늘(고른 날짜) 내 노트 한 장 구독
export function subscribeMyCornellNote(classId, uid, date, callback) {
  if (!classId || !uid || !date) { callback(null); return () => {}; }
  const id = cornellNoteId(uid, date);
  if (isFirebaseConfigured) {
    return onSnapshot(
      doc(db, "classes", classId, "cornellNotes", id),
      (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (e) => {
        console.warn("[수업 노트] 내 노트를 읽지 못했어요:", e?.code, e?.message);
        callback(null);
      }
    );
  }
  if (!mock.cornellNotes) mock.cornellNotes = [];
  if (!mockListeners.cornellNotes) mockListeners.cornellNotes = new Set();
  const emit = () => callback(mock.cornellNotes.find((n) => n.id === id) ?? null);
  mockListeners.cornellNotes.add(emit);
  emit();
  return () => mockListeners.cornellNotes.delete(emit);
}

// [학생] 내 노트 저장 — 같은 문서에 덮어씁니다(merge). 자동 저장이라 자주 불립니다.
// 칸마다 길이를 잘라 두는 이유: 규칙이 넘치면 통째로 거부하는데, 그러면
// 학생은 '저장이 안 된다'만 보게 됩니다. 넘칠 일이 거의 없지만 여기서 막습니다.
export async function saveCornellNote(classId, user, date, values = {}) {
  if (!classId || !user?.uid || !date) return;
  const id = cornellNoteId(user.uid, date);
  const data = {
    classId,
    uid: user.uid,
    date,
    lessonTitle: String(values.lessonTitle ?? "").slice(0, 200),
    cue: String(values.cue ?? "").slice(0, CORNELL_LIMITS.cue),
    notes: String(values.notes ?? "").slice(0, CORNELL_LIMITS.notes),
    summary: String(values.summary ?? "").slice(0, CORNELL_LIMITS.summary),
  };
  // 덩어리 목록이 오면 그것이 **진짜 값**이고, 위 cue/notes는 거울입니다
  // (부르는 쪽이 flattenBlocks로 만들어 함께 넘깁니다 — lib/cornell.js).
  // 거울을 남겨 두는 까닭은 보안 규칙이 그 두 칸의 길이를 보기 때문이고,
  // 아직 덩어리를 모르는 셈(잔디 히트맵의 '세 칸 채움')도 그대로 굴러갑니다.
  if (Array.isArray(values.blocks)) {
    data.blocks = values.blocks.slice(0, CORNELL_BLOCK_MAX).map((b) => ({
      id: String(b?.id ?? "").slice(0, 40),
      cue: String(b?.cue ?? "").slice(0, CORNELL_LIMITS.cue),
      notes: String(b?.notes ?? "").slice(0, CORNELL_LIMITS.notes),
    }));
  }
  // 그날 수업 프로젝트의 학습 자료를 노트에 함께 걸어 둡니다(이름 + 링크만).
  // 파일을 복제하지 않는 이유: 학생 수만큼 같은 파일이 쌓입니다. 대신 이름을
  // 남겨 두어, 나중에 그 파일이 지워져 링크가 깨져도 '무엇이었는지'는 압니다.
  if (Array.isArray(values.materials)) {
    data.materials = values.materials.slice(0, CORNELL_MATERIAL_MAX).map((m) => ({
      name: String(m.name ?? "").slice(0, 200),
      url: String(m.url ?? "").slice(0, 1000),
      kind: m.kind === "image" ? "image" : "file",
    }));
  }
  if (isFirebaseConfigured) {
    await setDoc(
      doc(db, "classes", classId, "cornellNotes", id),
      { ...data, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return;
  }
  if (!mock.cornellNotes) mock.cornellNotes = [];
  const idx = mock.cornellNotes.findIndex((n) => n.id === id);
  // **문서를 갈아 끼웁니다**(제자리에서 고치지 않고). Firestore는 읽을 때마다
  // 새 객체를 주는데 mock이 같은 객체를 고쳐 두면, 그 문서를 들고 있는 쪽이
  // 늘 같은 참조를 받아 React가 다시 그리지 않습니다 — 데모 모드에서 학생이
  // 필기를 고쳐도 그 노트를 그린 화면이 그대로 있던 일이 실제로 있었습니다
  // (하이라이트가 밀린 자리에 그대로 남았습니다).
  if (idx >= 0) {
    mock.cornellNotes[idx] = { ...mock.cornellNotes[idx], ...data, updatedAt: new Date() };
  } else {
    mock.cornellNotes.push({ id, ...data, createdAt: new Date(), updatedAt: new Date() });
  }
  mockListeners.cornellNotes?.forEach((cb) => cb());
}

// 날짜 내림차순(최근이 앞) — date는 'YYYY-MM-DD' 문자열이라 그냥 비교하면 됩니다.
function byCornellDateDesc(a, b) {
  return String(b.date ?? "").localeCompare(String(a.date ?? ""));
}

// [학생] 내 지난 노트 — 내가 속한 반들에서 내 것만.
// -------------------------------------------------------------
// collectionGroup("cornellNotes")를 쓰지 않는 이유: 그러려면 규칙에
// `{path=**}/cornellNotes` 그룹 규칙을 새로 열어야 하는데, 노트는 학생의
// 사적인 필기라 여는 문을 늘리고 싶지 않습니다. 학생이 속한 반은 많아야
// 두어 개라 반마다 리스너 하나면 충분합니다.
//
// where("uid","==") 하나만 걸고 정렬은 여기서 합니다 — 등호 필터와 다른
// 필드 정렬을 함께 걸면 복합 색인이 필요해집니다(한 학생의 노트는 한 학기에
// 많아야 수십 건이라 이 정도는 화면에서 줄 세우는 편이 낫습니다).
export function subscribeMyCornellNotes(classIds, uid, callback) {
  const ids = [...new Set((classIds ?? []).filter(Boolean))];
  if (!uid || ids.length === 0) { callback([]); return () => {}; }

  // 반마다 따로 오는 결과를 한 배열로 합쳐 내보냅니다.
  const byClass = new Map();
  const emit = () =>
    callback([...byClass.values()].flat().sort(byCornellDateDesc));

  if (isFirebaseConfigured) {
    const unsubs = ids.map((cId) =>
      onSnapshot(
        query(collection(db, "classes", cId, "cornellNotes"), where("uid", "==", uid)),
        (snap) => {
          byClass.set(cId, snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          emit();
        },
        (e) => {
          console.warn("[수업 노트] 지난 노트를 읽지 못했어요:", e?.code, e?.message);
          byClass.set(cId, []);
          emit();
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }
  if (!mock.cornellNotes) mock.cornellNotes = [];
  if (!mockListeners.cornellNotes) mockListeners.cornellNotes = new Set();
  const cb = () =>
    callback(
      mock.cornellNotes
        .filter((n) => n.uid === uid && ids.includes(n.classId))
        .sort(byCornellDateDesc)
    );
  mockListeners.cornellNotes.add(cb);
  cb();
  return () => mockListeners.cornellNotes.delete(cb);
}

// [교사] 이 반의 '하루치' 노트 — 수업이 끝나고 그날 것을 읽는 자리.
// -------------------------------------------------------------
// 반 전체를 기간 제한 없이 받으면 학생 수 × 수업 일수만큼 읽습니다(한 학기면
// 수천 건). 교사가 실제로 하는 일은 '오늘(또는 그날) 수업 노트를 읽고 한 마디
// 남기기'라, 날짜 하나로 좁히면 많아야 학생 수만큼입니다.
// 한 학생의 흐름을 보고 싶을 때는 아래 subscribeStudentCornellNotes로 갑니다.
export function subscribeClassCornellNotesOn(classId, date, callback) {
  if (!classId || !date) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      query(collection(db, "classes", classId, "cornellNotes"), where("date", "==", date)),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => {
        console.warn("[수업 노트] 반 노트를 읽지 못했어요:", e?.code, e?.message);
        callback([]);
      }
    );
  }
  if (!mock.cornellNotes) mock.cornellNotes = [];
  if (!mockListeners.cornellNotes) mockListeners.cornellNotes = new Set();
  const cb = () =>
    callback(mock.cornellNotes.filter((n) => n.classId === classId && n.date === date));
  mockListeners.cornellNotes.add(cb);
  cb();
  return () => mockListeners.cornellNotes.delete(cb);
}

// [교사] 한 학생의 지난 노트 전부 — 골라 들어갔을 때만 부릅니다.
export function subscribeStudentCornellNotes(classId, studentUid, callback) {
  if (!classId || !studentUid) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      query(collection(db, "classes", classId, "cornellNotes"), where("uid", "==", studentUid)),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byCornellDateDesc)),
      (e) => {
        console.warn("[수업 노트] 학생 노트를 읽지 못했어요:", e?.code, e?.message);
        callback([]);
      }
    );
  }
  if (!mock.cornellNotes) mock.cornellNotes = [];
  if (!mockListeners.cornellNotes) mockListeners.cornellNotes = new Set();
  const cb = () =>
    callback(
      mock.cornellNotes
        .filter((n) => n.classId === classId && n.uid === studentUid)
        .sort(byCornellDateDesc)
    );
  mockListeners.cornellNotes.add(cb);
  cb();
  return () => mockListeners.cornellNotes.delete(cb);
}

// [교사] 피드백 한 칸 — 규칙이 이 세 필드만 열어 두었으므로 다른 값을 함께
// 보내면 통째로 거부됩니다(본문은 학생의 것입니다). update로 쓰는 것도
// 그래서입니다 — merge set은 없는 문서를 만들어 버려 규칙의 create 갈래에
// 걸립니다(그 갈래는 feedback을 금지합니다).
// `marks`는 교사가 학생 글에서 짚은 대목입니다(`lib/cornellMarks.js`).
// 피드백과 **한 번에** 씁니다 — 규칙이 이 넷만 함께 바꾸도록 열어 두었고
// (`changedOnly`), 나눠 쓰면 글과 표시가 어긋난 순간이 생깁니다.
export async function saveCornellFeedback(classId, noteId, text, user, marks = []) {
  if (!classId || !noteId) return;
  const feedback = String(text ?? "").slice(0, 2000);
  const feedbackMarks = marksToSave(marks);
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "classes", classId, "cornellNotes", noteId), {
      feedback,
      feedbackAt: serverTimestamp(),
      feedbackBy: user?.uid ?? "",
      feedbackMarks,
    });
    return;
  }
  if (!mock.cornellNotes) mock.cornellNotes = [];
  const idx = mock.cornellNotes.findIndex((n) => n.id === noteId);
  if (idx >= 0) {
    // **문서를 갈아 끼웁니다**(제자리에서 고치지 않고). Firestore는 읽을 때마다
    // 새 객체를 주는데 mock이 같은 객체를 고쳐 두면, 그 문서를 들고 있는 쪽이
    // 늘 같은 참조를 받아 React가 다시 그리지 않습니다.
    mock.cornellNotes[idx] = {
      ...mock.cornellNotes[idx],
      feedback,
      feedbackAt: new Date(),
      feedbackBy: user?.uid ?? "",
      feedbackMarks,
    };
  }
  mockListeners.cornellNotes?.forEach((cb) => cb());
}

// ── 선생님 한 마디가 도착했다는 것을 학생이 알게 하기 ──────────
// -------------------------------------------------------------
// 선생님은 **수업이 끝난 뒤** 노트를 읽고 씁니다(그게 이 기능의 전제입니다).
// 그때쯤이면 학생의 '오늘'은 이미 넘어가 있어, 서랍이 오늘 노트만 보고
// 있으면 어제 것에 달린 한 마디를 영영 모릅니다. 그래서 서랍이 뜰 때
// **최근 14일치**를 훑어 '안 읽은 한 마디'가 있는지 봅니다.
//
// [왜 질의가 아니라 하루씩 읽는가]
// 질의로 좁히려면 uid 등호 + 날짜 범위가 되어 **복합 색인**이 필요하고,
// 등호만 걸면 그 반의 내 노트가 전부 옵니다(한 학기면 쉰 장 남짓 —
// 화면을 열 때마다 그만큼). 문서 ID가 `uid_날짜`로 못 박혀 있어 날짜만
// 알면 주소를 바로 만들 수 있으므로, 14개를 콕 집어 읽습니다. 색인도
// 질의도 없고 읽는 양이 **14건으로 늘 고정**입니다(노트가 쌓여도 그대로).
// 문서 ID 목록 한 방(`documentId() in [...]`)은 규칙이 거부합니다 —
// 그 이유와 실측 기록은 tests/rules/cornellNotes.test.mjs에 있습니다.
//
// 화면을 옮길 때마다 서랍이 다시 그려지므로 **세션 동안 짧게 캐시**합니다
// (책방 fetchConsonantProgress와 같은 생각). 5분이면 수업 중에 도착한
// 한 마디도 곧 눈에 띕니다.
export const CORNELL_RECENT_DAYS = 14;
const CORNELL_RECENT_TTL = 5 * 60 * 1000;
const cornellRecentCache = new Map(); // `${classId}_${uid}` → { at, notes }

function recentDateKeys(days, from = new Date()) {
  const keys = [];
  const d = new Date(from);
  for (let i = 0; i < days; i += 1) {
    keys.push(todayDateKey(d));
    d.setDate(d.getDate() - 1);
  }
  return keys;
}

export function invalidateMyRecentCornellNotes(classId, uid) {
  cornellRecentCache.delete(`${classId}_${uid}`);
}

export async function fetchMyRecentCornellNotes(
  classId,
  uid,
  { force = false, days = CORNELL_RECENT_DAYS } = {}
) {
  if (!classId || !uid) return [];
  const key = `${classId}_${uid}`;
  const hit = cornellRecentCache.get(key);
  if (!force && hit && Date.now() - hit.at < CORNELL_RECENT_TTL) return hit.notes;

  const dates = recentDateKeys(days);
  let notes = [];
  if (isFirebaseConfigured) {
    // 한 건이라도 실패하면(권한·네트워크) 그 날만 건너뜁니다 — 하나 때문에
    // 배지 전체가 사라지면 도착한 한 마디를 못 보게 됩니다.
    const snaps = await Promise.all(
      dates.map((d) =>
        getDoc(doc(db, "classes", classId, "cornellNotes", cornellNoteId(uid, d))).catch((e) => {
          console.warn("[수업 노트] 지난 노트를 못 읽었어요:", d, e?.code);
          return null;
        })
      )
    );
    notes = snaps.filter((s) => s?.exists()).map((s) => ({ id: s.id, ...s.data() }));
  } else {
    const want = new Set(dates);
    notes = (mock.cornellNotes ?? []).filter(
      (n) => n.classId === classId && n.uid === uid && want.has(n.date)
    );
  }
  notes.sort(byCornellDateDesc);
  cornellRecentCache.set(key, { at: Date.now(), notes });
  return notes;
}

// 한 마디가 와 있는데 아직 안 본 것인가.
// feedbackAt이 없는 옛 기록은 '봤다'로 봅니다 — 언제 온 것인지 알 수 없는
// 것을 계속 새 것으로 두면 배지가 영영 안 꺼집니다.
// 이 노트를 읽고 과일을 줬다는 도장 — 수업 노트 화면의 과일 단추만 찍습니다.
// -------------------------------------------------------------
// 지급 이력(rewardEvents)에는 **어느 화면에서 줬는지가 안 남습니다.** 자리표에서
// 준 것, 발표 모드에서 준 것, 손들기의 '🍎 확인'이 전부 같은 모양으로 쌓여,
// '이 노트를 읽고 준 과일'만 골라낼 길이 없습니다. 그래서 답을 노트에 함께
// 적어 둡니다 — 묻는 화면이 이미 읽고 있는 문서라 **읽기가 안 늡니다.**
//
// 노트가 없으면(그날 안 쓴 학생) 찍을 자리도 없습니다. 규칙이 노트 생성을
// '본인'에게만 열어 두어 교사가 대신 만들 수 없고, 애초에 읽을 노트가 없으니
// 이 도장이 뜻하는 일도 일어나지 않았습니다.
export async function markCornellNoteRewarded(classId, noteId, user) {
  if (!classId || !noteId) return;
  const by = user?.uid ?? getCurrentUser()?.uid ?? "";
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "classes", classId, "cornellNotes", noteId), {
      rewardedAt: serverTimestamp(),
      rewardedBy: by,
    });
    return;
  }
  const idx = (mock.cornellNotes ?? []).findIndex((n) => n.id === noteId);
  // mock은 **문서를 갈아 끼웁니다**(제자리에서 고치지 않고) — 같은 객체를
  // 고쳐 두면 그 문서를 들고 있는 쪽이 늘 같은 참조를 받아 React가 다시
  // 그리지 않습니다(saveCornellFeedback과 같은 함정).
  if (idx >= 0) {
    mock.cornellNotes[idx] = { ...mock.cornellNotes[idx], rewardedAt: new Date(), rewardedBy: by };
  }
  mockListeners.cornellNotes?.forEach((cb) => cb());
}

// '이 노트에 과일을 줬나' — **두 화면이 함께 보는 판정 하나**입니다.
// 기록 관리 수업 노트 탭의 카드 색(초록)과, 수업 노트 창의 과일 단추를
// 걷는 판정이 이 함수 하나를 씁니다.
// -------------------------------------------------------------
// **도장 하나면 충분합니다.** `rewardedAt`을 찍는 곳은 수업 노트 창의 과일
// 단추 하나뿐이라(`markCornellNoteRewarded`), 이 값이 있다는 것 자체가 이미
// '그 노트를 읽고 줬다'는 뜻입니다 — 자리표·발표 모드에서 준 과일은 여기
// 안 남습니다. 지급 이력(`rewardEvents`)으로 세면 안 되는 까닭이 그것이고,
// 그래서 답을 노트에 적어 둔 것입니다.
//
// **'오늘 줬나'로 보지 않습니다.** 이 단추가 막는 것은 *그 노트에 대한*
// 중복 지급이지 그 학생에 대한 지급이 아닙니다 — 자리표·발표 모드·손들기의
// '🍎 확인'은 그대로 열려 있고, 그쪽으로 준 과일은 도장을 안 남깁니다.
// 한때 날짜를 함께 봤는데(`isCornellRewardedToday`), 그러면 카드 색과 단추가
// 서로 다른 물음에 답해 화면을 설명하는 문장이 늘 둘이었고, **자정을 넘기는
// 순간 어제 준 노트의 단추가 되살아났습니다**(창을 열어 둔 채로도).
//
// **한때 '피드백을 쓴 날과 같은 날인가'까지 봤습니다.** 도장이 없던 시절
// 지급 이력으로 세던 흔적인데, 도장이 생긴 뒤로는 덧붙은 조건이 두 가지를
// 망가뜨렸습니다 — (ㄱ) 피드백 없이 격려만 준 노트가 안 초록이고,
// (ㄴ) `saveCornellFeedback`이 저장할 때마다 `feedbackAt`을 새로 찍으므로
// **다음 날 피드백을 고치면 초록이던 카드가 살구빛으로 돌아갑니다.**
// 지금은 '줬나' 하나만 봅니다.
export function isCornellRewarded(note) {
  return !!note?.rewardedAt;
}

export function isCornellFeedbackUnread(note) {
  if (!String(note?.feedback ?? "").trim()) return false;
  if (!note.feedbackSeenAt) return true;
  if (!note.feedbackAt) return false;
  return toDate(note.feedbackSeenAt) < toDate(note.feedbackAt);
}

// 학생이 자기 노트에 '읽음' 도장을 찍습니다.
// -------------------------------------------------------------
// 브라우저(localStorage)가 아니라 노트 문서에 적는 이유: 폰에서 읽은 것을
// 노트북이 몰라 배지가 다시 뜨면, 읽었는데 안 읽은 것처럼 보입니다.
// 규칙의 학생 갈래는 변경 키 화이트리스트가 아니라 '본인 것 + 칸 길이 +
// 피드백 불변'만 보므로 이 필드 하나는 그대로 통과합니다(규칙 시험으로 확인).
export async function markCornellFeedbackSeen(classId, uid, date) {
  if (!classId || !uid || !date) return;
  const id = cornellNoteId(uid, date);
  const now = new Date();
  // 캐시에도 곧바로 반영 — 다음 화면에서 배지가 되살아나지 않게.
  const hit = cornellRecentCache.get(`${classId}_${uid}`);
  const found = hit?.notes.find((n) => n.id === id);
  if (found) found.feedbackSeenAt = now;

  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "classes", classId, "cornellNotes", id), {
      feedbackSeenAt: serverTimestamp(),
    });
    return;
  }
  const mockFound = (mock.cornellNotes ?? []).find((n) => n.id === id);
  if (mockFound) mockFound.feedbackSeenAt = now;
  mockListeners.cornellNotes?.forEach((cb) => cb());
}
