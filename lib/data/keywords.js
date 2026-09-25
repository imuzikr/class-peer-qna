// =============================================================
// 키워드
// -------------------------------------------------------------
// lib/store.js에서 떼어 낸 조각입니다. 화면은 지금까지처럼 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 그대로 다시 내보냅니다.
// =============================================================
import {
  addDoc,
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
  writeBatch,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase";
import { replaceDoc } from "../mockDocs";
import {
  DEFAULT_KEYWORDS,
  mock,
  mockListeners,
  nextMockSeq,
  notify,
  notifyQuestions,
} from "./shared";

// -------------------------------------------------------------
// 키워드 (Keywords) — 관리자 기능 대비 데이터 구조
// -------------------------------------------------------------
// keywords 컬렉션: { name, order }
// order 값으로 정렬하므로 드래그 앤 드롭 순서 변경은 order만
// 바꾸면 됩니다. 아래 CRUD 함수들은 데이터 계층만 미리 준비해
// 둔 것으로, 관리자 UI는 나중에 붙입니다.

// 키워드 목록 실시간 구독 ({id, name, order} 배열 전달)
export function subscribeKeywords(callback) {
  if (isFirebaseConfigured) {
    const q = query(collection(db, "keywords"), orderBy("order", "asc"));
    return onSnapshot(q, (snap) => {
      if (snap.empty) {
        // 컬렉션이 비어 있으면 기본 키워드를 한 번 심습니다
        seedDefaultKeywords();
        return;
      }
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  mockListeners.keywords.add(callback);
  callback([...mock.keywords].sort((a, b) => a.order - b.order));
  return () => mockListeners.keywords.delete(callback);
}

let keywordsSeeded = false;
async function seedDefaultKeywords() {
  if (keywordsSeeded) return;
  keywordsSeeded = true;
  try {
    // keywords 컬렉션이 "비어 있음"은 두 가지 경우를 구분 못 합니다:
    //  1) 앱을 처음 써서 한 번도 시드한 적이 없음 → 기본값을 심어야 함
    //  2) 교사가 키워드를 전부(마지막 "기타"까지) 의도적으로 지움
    //     → 다시 심으면 안 됨(지워도 곧바로 되살아나는 것처럼 보임)
    // meta/keywordsSeeded 문서로 "한 번이라도 시드했는지"를 영구 기록해
    // 구분합니다. 문서가 있으면(과거에 시드됨) 다시 심지 않습니다.
    const flagRef = doc(db, "meta", "keywordsSeeded");
    const flagSnap = await getDoc(flagRef);
    if (flagSnap.exists()) return;

    // 규칙상 생성은 교사만 가능 — 학생이 먼저 접속하면 권한 거부가 납니다.
    // 그 경우 화면은 클라이언트 DEFAULT_KEYWORDS 폴백으로 채워지고,
    // 교사가 로그인하면 이때 실제로 시드됩니다(재시도 위해 플래그 해제).
    await Promise.all([
      ...DEFAULT_KEYWORDS.map((name, i) =>
        addDoc(collection(db, "keywords"), { name, order: i })
      ),
      setDoc(flagRef, { seededAt: serverTimestamp() }),
    ]);
  } catch (e) {
    keywordsSeeded = false;
    console.warn("[keywords] 기본 시드 보류(교사 로그인 시 생성):", e?.message);
  }
}

function notifyKeywords() {
  notify(
    mockListeners.keywords,
    [...mock.keywords].sort((a, b) => a.order - b.order)
  );
}

// [관리자] 키워드 추가 (맨 뒤 순서로)
export async function addKeyword(name) {
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "keywords"), {
      name,
      order: Date.now(), // 충분히 큰 값 → 맨 뒤
    });
    return;
  }
  const maxOrder = Math.max(0, ...mock.keywords.map((k) => k.order));
  mock.keywords.push({ id: `k${nextMockSeq()}_m`, name, order: maxOrder + 1 });
  notifyKeywords();
}

// 질문 문서의 keyword는 키워드 id가 아니라 이름 문자열을 그대로 저장합니다.
// 키워드 이름이 바뀌거나 키워드가 지워지면, 그 이름을 쓰던 질문들도 함께
// 옮겨 줘야 합니다 — 안 그러면 옛 이름 그대로 남아 어떤 키워드 목록에도
// 안 걸리는 '유령 질문'이 됩니다.
async function reassignQuestionsKeyword(oldName, newName) {
  if (!oldName || oldName === newName) return;
  if (isFirebaseConfigured) {
    const snap = await getDocs(query(collection(db, "questions"), where("keyword", "==", oldName)));
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { keyword: newName }));
    await batch.commit();
    return;
  }
  let changed = false;
  mock.questions.forEach((q) => {
    if (q.keyword === oldName) { q.keyword = newName; changed = true; }
  });
  if (changed) notifyQuestions();
}

// [관리자] 키워드 이름 변경 — 이 키워드로 이미 등록된 질문의 keyword 문자열도
// 새 이름으로 함께 바꿉니다(그래야 질문이 여전히 이 키워드 아래 보입니다).
export async function renameKeyword(id, name) {
  if (isFirebaseConfigured) {
    const oldName = (await getDoc(doc(db, "keywords", id))).data()?.name ?? null;
    await updateDoc(doc(db, "keywords", id), { name });
    await reassignQuestionsKeyword(oldName, name);
    return;
  }
  const k = mock.keywords.find((x) => x.id === id);
  if (!k) return;
  const oldName = k.name;
  replaceDoc(mock.keywords, k, { name });
  notifyKeywords();
  await reassignQuestionsKeyword(oldName, name);
}

// [관리자] 키워드 삭제 — 이 키워드를 쓰던 질문은 모두 '기타'로 재분류합니다
// (호출부는 삭제 전에 counts로 사용 여부를 확인해 확인 모달 문구를 정합니다).
export async function deleteKeyword(id, name) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "keywords", id));
    await reassignQuestionsKeyword(name, "기타");
    return;
  }
  mock.keywords = mock.keywords.filter((x) => x.id !== id);
  notifyKeywords();
  await reassignQuestionsKeyword(name, "기타");
}

// [관리자] 순서 일괄 변경 — 드래그 앤 드롭 결과(id 배열)를 그대로 전달
export async function reorderKeywords(orderedIds) {
  if (isFirebaseConfigured) {
    await Promise.all(
      orderedIds.map((id, i) => updateDoc(doc(db, "keywords", id), { order: i }))
    );
    return;
  }
  orderedIds.forEach((id, i) => {
    const k = mock.keywords.find((x) => x.id === id);
    if (k) k.order = i;
  });
  notifyKeywords();
}
