// =============================================================
// 수업 메모(교사)
// -------------------------------------------------------------
// lib/store.js에서 떼어 낸 조각입니다. 화면은 지금까지처럼 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 그대로 다시 내보냅니다.
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
  updateDoc,
} from "firebase/firestore";
import { toDate, todayDateKey } from "../dates";
import { db, isFirebaseConfigured } from "../firebase";
import { replaceDoc } from "../mockDocs";
import { mock, mockListeners, nextMockSeq } from "./shared";

// =============================================================
// 수업 메모 — classes/{classId}/lessonMemos
// -------------------------------------------------------------
// 수업 중에 교사가 짧게 적어 두는 메모입니다. 누가기록(studentNotes)과
// 다릅니다 — 그쪽은 '학생 한 명에 대한 기록'이고 이쪽은 '그 수업 시간에
// 대한 메모'라 학생과 엮이지 않습니다. 학생은 읽지 못합니다.
//
// text에는 서식이 붙은 HTML이 들어옵니다(글머리 기호·번호 목록·굵게·밑줄).
// 서식이 붙기 전에 적은 메모는 순수 텍스트 그대로 남아 있어, 읽는 쪽에서
// lib/html.js의 richHtml()이 둘을 함께 다룹니다. 아래 길이 제한도 태그를
// 포함한 길이입니다 — 화면(LessonMemoModal)에서 미리 막으므로 여기까지
// 넘어오지 않습니다.
// =============================================================
const LESSON_MEMO_MAX = 2000; // 규칙(firestore.rules)과 같은 값

// 지난 메모 목록이 몇 건까지 남는가 — 한 반을 펼쳐 볼 때.
// 50이던 것을 올렸습니다. 수업 진도를 차시마다 적으면(주 2회 × 16주 = 32건)
// 여기에 그날그날의 메모가 섞여 학기 중반에 한도를 넘고, 초반 진도가
// **목록에서 사라졌습니다**(달력으로는 여전히 찾을 수 있지만 날짜를 짚어
// 들어가야 합니다). 한 학기가 통째로 목록에 들어오는 값입니다.
export const LESSON_MEMO_HISTORY = 200;

// 달력이 **다른 반까지 함께** 읽을 때 쓰는 한도 — 여기는 50 그대로입니다.
// 달력을 한 번 켜면 맡은 반 수만큼 리스너가 걸려(여섯 반이면 여섯), 위
// 값을 그대로 쓰면 한 번에 1,200건을 읽습니다. 달력이 답하는 물음은
// '그날 수업이 있었나'라 최근 것만으로 충분합니다.
export const LESSON_MEMO_CALENDAR = 50;

// 메모의 '언제 일'인가 — 교사가 적은 날짜가 있으면 그것, 없으면(예전 메모)
// 쓴 시각의 날짜. 목록 정렬과 화면 표시가 같은 값을 보게 여기 한 곳에 둡니다.
export function lessonMemoDate(memo) {
  return memo?.date || todayDateKey(toDate(memo?.createdAt) || new Date());
}

// 페이지는 **시작·마지막 두 칸**입니다(`pageFrom`·`pageTo`). 한쪽만 적어도
// 되고 둘 다 비어도 됩니다 — '112쪽부터'만 아는 날도, '119쪽까지'만 정해 둔
// 날도 있습니다.
//
// 옛 메모는 `pages` 한 칸에 '112~119'처럼 적혀 있어, 여기서 갈라 읽습니다
// (자료를 옮기는 일이 없습니다). 가르는 글자는 물결·붙임표 네 가지이고,
// 그중 아무것도 없으면 통째로 '시작'으로 봅니다.
export function lessonMemoPages(memo) {
  const from = String(memo?.pageFrom ?? "").trim();
  const to = String(memo?.pageTo ?? "").trim();
  if (from || to) return { from, to };
  const raw = String(memo?.pages ?? "").trim();
  if (!raw) return { from: "", to: "" };
  const m = raw.match(/^(.*?)\s*[~\-–—]\s*(.*)$/);
  return m ? { from: m[1].trim(), to: m[2].trim() } : { from: raw, to: "" };
}

// 저장용 한 줄 — `112~119` · `112` · `~119`. 사람이 읽는 `p.`는 안 붙입니다
// (그건 아래 `lessonMemoProgress`가 그릴 때 붙입니다).
export function pagesText(from, to) {
  const a = String(from ?? "").trim();
  const b = String(to ?? "").trim();
  if (a && b) return `${a}~${b}`;
  if (a) return a;
  return b ? `~${b}` : "";
}

// 진도 한 줄 — `조건문 · p.112~119`. 읽는 자리가 셋이라(지난 메모 패널 ·
// 달력의 펼친 메모 · 나중에 표로 뽑을 때) 짓는 곳을 여기 하나로 둡니다.
// 둘 다 비면 `null` — 호출부는 그때 아무것도 안 그립니다. 진도 칸이 없는
// 예전 메모가 그렇습니다.
// 페이지에 이미 'p'나 '쪽'을 적었으면 앞의 `p.`를 안 붙입니다 — `p.p.112`가
// 되면 안 됩니다.
export function lessonMemoProgress(memo) {
  const topic = String(memo?.topic ?? "").trim();
  const { from, to } = lessonMemoPages(memo);
  if (!topic && !from && !to) return null;
  const withP = (s) => (/^(p\.?|쪽|page)/i.test(s) ? s : `p.${s}`);
  // 마지막만 있으면 '~p.119'(119쪽까지) — 어느 쪽을 적은 것인지 남깁니다.
  const pages = from && to ? `${withP(from)}~${to}` : from ? withP(from) : to ? `~${withP(to)}` : "";
  return { topic, pages, from, to, label: [topic, pages].filter(Boolean).join(" · ") };
}

// 최신순 — '언제 일'인가 기준. 같은 날이면 나중에 쓴 것이 위로.
//
// [질의는 그대로 createdAt 순입니다]
// date로 orderBy하면 그 필드가 없는 예전 메모가 결과에서 통째로 빠집니다
// (Firestore는 정렬 필드가 없는 문서를 건너뜁니다). 한 반을 200건까지만
// 받으므로 정렬은 화면에서 하는 편이 안전하고 색인도 늘지 않습니다.
function sortLessonMemos(list) {
  return [...list].sort((a, b) => {
    const d = lessonMemoDate(b).localeCompare(lessonMemoDate(a));
    return d !== 0 ? d : toDate(b.createdAt) - toDate(a.createdAt);
  });
}

// max — 몇 건까지 받을까. 부르는 자리마다 다릅니다(위 두 상수 참고):
// 한 반을 펼쳐 보는 곳은 기본값(200), 달력이 다른 반을 훑는 곳은 50.
export function subscribeLessonMemos(classId, callback, max = LESSON_MEMO_HISTORY) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      query(
        collection(db, "classes", classId, "lessonMemos"),
        orderBy("createdAt", "desc"),
        limit(max)
      ),
      (snap) => callback(sortLessonMemos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      () => callback([])
    );
  }
  if (!mock.lessonMemos) mock.lessonMemos = [];
  if (!mockListeners.lessonMemos) mockListeners.lessonMemos = new Set();
  const emit = () =>
    callback(
      sortLessonMemos(mock.lessonMemos.filter((m) => m.classId === classId))
        .slice(0, max)
    );
  mockListeners.lessonMemos.add(emit);
  emit();
  return () => mockListeners.lessonMemos.delete(emit);
}

// date — 이 메모가 '어느 수업의 일'인가. 수업이 끝난 뒤 떠올라 적는 일이
// 잦아, 쓴 시각(createdAt)만으로는 언제 일인지 알 수 없습니다(누가기록과
// 같은 이유·같은 방식). 비워 두면 오늘로 둡니다.
// ── 진도 칸(topic·pages) ────────────────────────────────────
// 수업 진도를 적을 때만 채우는 두 칸입니다. 본문(text) 안에 글자로 섞어 두면
// 앱이 어디부터 어디까지가 주제인지 알 수 없어, 표로 뽑거나 골라 볼 수
// 없습니다. `date`가 이미 제 칸이라 달력이 되는 것과 같은 이유로 갈라 둡니다.
//
// **규칙(firestore.rules)은 안 건드립니다.** `lessonMemos`의 create/update가
// classId·authorId·text·createdAt만 검사하고 필드 목록을 못 박아 두지 않아,
// 칸을 늘려도 그대로 통과합니다(확인함).
//
// 본문은 여전히 있어야 합니다 — 규칙이 `text.size() > 0`을 요구하므로 주제·
// 페이지만 채우고 저장할 수는 없습니다. 화면에서 미리 막습니다.
export const LESSON_TOPIC_MAX = 60;
export const LESSON_PAGES_MAX = 30; // `pages` 거울 한 줄의 길이
export const LESSON_PAGE_MAX = 12;  // 시작·마지막 한 칸씩

// **진짜 값은 `pageFrom`·`pageTo`이고, `pages`는 거울입니다**(수업 노트의
// blocks ↔ cue/notes와 같은 방식). 한 칸짜리로 적힌 옛 메모를 읽는 곳이
// 아직 있고, 나중에 표로 뽑을 때도 한 줄이 필요해 함께 적어 둡니다 —
// 읽을 때는 `lessonMemoPages`가 어느 쪽이든 갈라 줍니다.
function progressFields(extra) {
  const from = String(extra?.pageFrom ?? "").trim().slice(0, LESSON_PAGE_MAX);
  const to = String(extra?.pageTo ?? "").trim().slice(0, LESSON_PAGE_MAX);
  return {
    topic: String(extra?.topic ?? "").trim().slice(0, LESSON_TOPIC_MAX),
    pageFrom: from,
    pageTo: to,
    pages: pagesText(from, to).slice(0, LESSON_PAGES_MAX),
  };
}

export async function addLessonMemo(classId, user, text, date = null, extra = null) {
  const body = String(text ?? "").trim().slice(0, LESSON_MEMO_MAX);
  if (!classId || !body) return;
  const day = date || todayDateKey();
  const prog = progressFields(extra);
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "classes", classId, "lessonMemos"), {
      classId,
      text: body,
      date: day,
      ...prog,
      authorId: user?.uid ?? null,
      authorName: user?.realName || user?.displayName || "선생님",
      createdAt: serverTimestamp(),
    });
    return;
  }
  if (!mock.lessonMemos) mock.lessonMemos = [];
  mock.lessonMemos.push({
    id: `lm${nextMockSeq()}_m`,
    classId,
    text: body,
    date: day,
    ...prog,
    authorId: user?.uid ?? null,
    authorName: user?.realName || user?.displayName || "선생님",
    createdAt: new Date(),
  });
  mockListeners.lessonMemos?.forEach((cb) => cb());
}

// extra를 주지 않으면 진도 칸은 **손대지 않습니다** — 진도와 상관없는 자리
// (체크 줄 켜고 끄기 등)에서 본문만 고치러 올 때 주제·페이지가 지워지면
// 안 됩니다. 빈 문자열을 담아 넘기면 그때는 지웁니다(칸을 비운 것).
export async function updateLessonMemo(classId, memoId, text, date = null, extra = null) {
  const body = String(text ?? "").trim().slice(0, LESSON_MEMO_MAX);
  if (!classId || !memoId || !body) return;
  // date를 주지 않으면 원래 날짜를 그대로 둡니다 — 내용만 고치러 온 경우
  // 날짜가 오늘로 밀리면 안 됩니다.
  const patch = date ? { text: body, date } : { text: body };
  if (extra) Object.assign(patch, progressFields(extra));
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "classes", classId, "lessonMemos", memoId), patch);
    return;
  }
  const m = (mock.lessonMemos ?? []).find((x) => x.id === memoId);
  if (m) replaceDoc(mock.lessonMemos, m, patch);
  mockListeners.lessonMemos?.forEach((cb) => cb());
}

export async function deleteLessonMemo(classId, memoId) {
  if (!classId || !memoId) return;
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "classes", classId, "lessonMemos", memoId));
    return;
  }
  mock.lessonMemos = (mock.lessonMemos ?? []).filter((x) => x.id !== memoId);
  mockListeners.lessonMemos?.forEach((cb) => cb());
}
