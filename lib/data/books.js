// =============================================================
// 책방 독서 활동
// -------------------------------------------------------------
// lib/store.js에서 떼어 낸 조각입니다. 화면은 지금까지처럼 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 그대로 다시 내보냅니다.
// =============================================================
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { toDate } from "../dates";
import { db, isFirebaseConfigured } from "../firebase";
import { sanitizeHtml, stripHtml } from "../html";
import { replaceDoc } from "../mockDocs";
import { initialSectionLocks } from "../paratext";
import {
  OPINION_PROMPT_MAX,
  OPINION_TEXT_MAX,
  clamp01,
  normalizeZones,
  opinionColor,
  renameZones,
  zonesFromNames,
} from "../opinion";
import { getCurrentUser } from "../user";
import { normalizeStudyGroups } from "./attendance";
import { mock, mockListeners, nextMockSeq } from "./shared";

// =============================================================
// 책방 — 닿소리 채우기 활동 (모둠 협동)
// -------------------------------------------------------------
// bookActivities/{actId}                          — 활동 (반별)
//   classId, title, topic(주제어/도서명), groupMode, maxPerGroup,
//   locked, createdBy
// bookActivities/{actId}/groups/{groupId}         — 모둠 메타 (문서ID=group_N)
//   groupIndex, groupName, memberUids[], members[], leaderUid
// bookActivities/{actId}/groups/{groupId}/words/{wordId}  — 단어 1개
//   cellKey('c0'~'c13'), text, authorId, authorName, createdAt
//
// [모둠 메타와 단어를 나눈 이유]
// 모둠 대시보드에는 전체 모둠 카드가 보여야 하지만(누가 어느 모둠인지),
// 활동 중 남의 모둠 '단어'는 보이면 안 됩니다. 한 문서에 같이 두면 카드를
// 읽는 순간 단어까지 딸려오므로, 읽기 권한을 따로 걸 수 있게 분리했습니다.
// 단어를 문서 1건씩 쪼갠 덕분에 한 모둠에서 동시에 입력해도 충돌이 없습니다.
//
// [모둠 구성 방식] groupMode
//   'solo'    — 개별 활동. 모둠 없이 학생마다 판을 하나씩 (아래 설명)
//   'teacher' — 교사가 사전 배정 (GroupComposer 직접 구성)
//   'random'  — 무작위 균등 배정 (GroupComposer 자동 구성)
//   'free'    — 학생이 빈 모둠에 스스로 참여 (교사는 모둠 수만 지정)
//
// [개별 활동을 '1인 모둠'으로 만드는 이유]
// 닿소리 채우기는 판(groups/{id})과 그 안의 낱말(words)로 이뤄집니다.
// 개별 활동을 위해 별도 컬렉션을 새로 파는 대신, 구성원이 한 명뿐인 판을
// 학생마다 하나씩 만듭니다. 그러면 학생 화면(ConsonantCanvas)·교사 전체
// 보기(ConsonantDashboard)·보안 규칙(isMyBookGroup으로 판정하는 낱말
// 읽기·쓰기)이 손댈 것 없이 그대로 동작합니다 — 규칙도 바꿀 필요가 없습니다.
// =============================================================
// 모둠을 짜는 다섯 갈래 — 갈라지는 기준은 '누가 언제 명단을 정하는가'입니다.
//   solo    개별 활동 — 모둠 없이 학생마다 판 하나(위의 '1인 모둠')
//   base    기본 모둠 — 반의 기본 모둠(자리표의 그 모둠)을 그대로 베낍니다
//   teacher 활동 모둠 — 이 활동만의 모둠. 빈 모둠만 만들고 교사가 짭니다
//   random  무작위   — 만들 때 지금 명단을 섞어 고르게 나눕니다
//   free    자유 구성 — 빈 모둠만 만들고 학생이 골라 들어갑니다
//
// 예전에는 'base'가 없고 teacher·random·free가 **모두** 기본 모둠을 베껴
// 왔습니다. 그래서 '이 활동만 다르게 묶고 싶다'는 경우에 늘 지우는 일부터
// 해야 했고, '무작위'는 이름과 달리 아무것도 섞지 않았습니다.
export const BOOK_GROUP_MODES = ["solo", "base", "teacher", "random", "free"];

// 활동 종류 — 'consonant'는 모둠 협동, 나머지는 개인 활동입니다.
// 개인 활동(paratext·raft·kwls·mindmap)은 모둠 대신 학생 1명당 문서 1개
// (entries/{uid})를 씁니다. 담기는 answers의 모양만 다를 뿐 저장 위치와
// 규칙은 같습니다(마인드맵은 칸 맵이 아니라 { layout, nodes }를 담습니다).
export const BOOK_ACTIVITY_TYPES = ["consonant", "paratext", "raft", "kwls", "mindmap", "opinion"];
export const BOOK_SOLO_TYPES = ["paratext", "raft", "kwls", "mindmap"];

// 모둠으로 진행할 수 있는 종류. 곁텍스트·RAFT는 여기 들지만 글은 여전히
// 학생마다 한 장입니다(자세한 이유는 addBookActivity의 grouped 주석 참고).
// KWLS·마인드맵은 혼자 자기 생각을 정리하는 활동이라 묶을 자리가 없습니다.
export const BOOK_GROUPABLE_TYPES = ["consonant", "paratext", "raft"];

// 반 전체가 **한 판을 함께** 쓰는 활동 — 모둠도, 학생마다의 기록(entries)도
// 없습니다. 지금은 '내 생각은요...' 하나입니다(메모는 opinionNotes 아래).
// 개인 활동(BOOK_SOLO_TYPES)과 갈라 두는 까닭: 그쪽은 '남의 답은 안 보인다'가
// 약속인데, 여기는 **서로 다 읽는 것**이 활동의 전부입니다.
export const BOOK_SHARED_TYPES = ["opinion"];

// 교사가 주제어(도서명)를 비워 둘 수 있는 활동 — 그러면 학생이 자기
// 화면에서 직접 적습니다(entries/{uid}.topic).
//
// 개인 활동 넷이 모두 여기 듭니다. 한때 KWLS·마인드맵은 '반이 같은 주제를
// 놓고 모으는 활동'이라 빼 두었는데, 실제 수업에서는 학생마다 다른 책·다른
// 주제로 하는 때가 그만큼 잦았습니다. 비워 두는 것은 어차피 교사의 선택이라,
// 정해 두고 싶으면 적으면 됩니다.
//
// 닿소리(consonant)는 여기 없습니다 — 그쪽은 판(group)마다 주제어를 두는
// 길이 따로 있습니다(groups/{gId}.topic).
export const BOOK_STUDENT_TOPIC_TYPES = ["paratext", "raft", "kwls", "mindmap"];

function ensureMockBooks() {
  if (!mock.bookActivities) mock.bookActivities = [];
  if (!mock.bookGroups) mock.bookGroups = [];
  if (!mock.bookWords) mock.bookWords = [];
  if (!mock.bookEntries) mock.bookEntries = [];
  if (!mock.bookPeerReviews) mock.bookPeerReviews = [];
  if (!mock.bookOpinionNotes) mock.bookOpinionNotes = [];
  if (!mockListeners.bookActivities) mockListeners.bookActivities = new Set();
  if (!mockListeners.bookGroups) mockListeners.bookGroups = new Map();
  if (!mockListeners.bookWords) mockListeners.bookWords = new Map();
  if (!mockListeners.bookEntries) mockListeners.bookEntries = new Map();
  if (!mockListeners.bookPeerReviews) mockListeners.bookPeerReviews = new Map();
  if (!mockListeners.bookOpinionNotes) mockListeners.bookOpinionNotes = new Map();
}
function notifyBookActivities() {
  ensureMockBooks();
  mockListeners.bookActivities.forEach((cb) => cb());
}
function notifyBookGroups(actId) {
  ensureMockBooks();
  mockListeners.bookGroups.get(actId)?.forEach((cb) => cb());
}
function notifyBookWords(actId, groupId) {
  ensureMockBooks();
  mockListeners.bookWords.get(`${actId}_${groupId}`)?.forEach((cb) => cb());
}
function notifyBookEntries(actId) {
  ensureMockBooks();
  mockListeners.bookEntries.get(actId)?.forEach((cb) => cb());
}
function notifyBookPeerReviews(actId) {
  ensureMockBooks();
  mockListeners.bookPeerReviews.get(actId)?.forEach((cb) => cb());
}
function notifyOpinionNotes(actId) {
  ensureMockBooks();
  mockListeners.bookOpinionNotes.get(actId)?.forEach((cb) => cb());
}

// ─── 활동 ────────────────────────────────────────────────────
// 반의 활동 목록 구독 (만든 차례 — 오래된 것이 앞)
//
// 예전에는 최신 것을 앞에 놓았는데, 활동을 만들 때마다 목록 전체가 한 칸씩
// 밀려 어제 보던 활동이 다른 자리에 가 있었습니다. 수업은 만든 차례대로
// 흘러가므로 그 차례를 그대로 두는 편이 헷갈리지 않습니다.
// 가장 최근 활동이 필요한 곳은 목록의 '끝'을 봅니다(BookActivityStats).
export function subscribeBookActivities(classId, callback) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    const q = query(collection(db, "bookActivities"), where("classId", "==", classId));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => toDate(a.createdAt) - toDate(b.createdAt));
        callback(list);
      },
      (e) => { console.warn("[책방] 활동 목록을 읽지 못했어요:", e?.code, e?.message); callback([]); }
    );
  }
  ensureMockBooks();
  const emit = () =>
    callback(
      mock.bookActivities
        .filter((a) => a.classId === classId)
        // 만든 차례 — Firebase 분기와 같은 차례로 넘깁니다(목록이 이 순서에 기댑니다)
        .slice()
        .sort((a, b) => toDate(a.createdAt) - toDate(b.createdAt))
    );
  mockListeners.bookActivities.add(emit);
  emit();
  return () => mockListeners.bookActivities.delete(emit);
}

// [교사] 활동 만들기 — 모둠을 한 번에 만들어 둡니다.
// groupNames를 주면 그 이름으로, 없으면 '1모둠, 2모둠…'으로 붙습니다.
// 교사 배정·무작위 모드에서도 미리 만들어 두면 모둠 구성 때 이름이 유지됩니다.
// '무작위'로 만들 때 — 지금 반 명단을 섞어 고르게 나눕니다.
// 22명 5모둠이면 5·5·4·4·4로 앞쪽 모둠만 한 명 많게(모둠 구성 모달의
// 자동 구성과 같은 셈법입니다 — 두 곳의 결과가 달라 보이면 안 되니까요).
// 이름은 여기서 안 붙입니다. 아래 nameAt이 '1모둠·2모둠…' 또는 교사가 적어
// 둔 이름을 한 곳에서 붙입니다.
function randomGroupRows(members = [], count = 4) {
  const rows = (members ?? []).filter((s) => s?.uid);
  const n = Math.max(1, Math.floor(count) || 1);
  const bag = [...rows];
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  const size = Math.floor(bag.length / n);
  const extra = bag.length % n;
  const out = [];
  let at = 0;
  for (let i = 0; i < n; i += 1) {
    const take = size + (i < extra ? 1 : 0);
    const slice = bag.slice(at, at + take);
    at += take;
    out.push({
      name: null,
      memberUids: slice.map((s) => s.uid),
      members: slice.map((s) => ({
        uid: s.uid,
        name: s.name || "학생",
        studentId: s.studentId ?? null,
        emoji: s.emoji ?? "🙂",
      })),
    });
  }
  return out;
}

export async function addBookActivity(
  user,
  {
    classId,
    type = "consonant",
    title,
    topic,
    bookUrl = "",
    groupMode = "teacher",
    groupCount = 4,
    maxPerGroup = 6,
    groupNames = [],
    baseGroups = [],
    zones = [],         // '내 생각은요...'의 영역 이름들(2~4개)
    prompt = "",        // '내 생각은요...'의 함께 생각할 물음(선택)
    soloMembers = [],   // 개별 활동(groupMode: 'solo')일 때 반 학생 명단
  }
) {
  const kind = BOOK_ACTIVITY_TYPES.includes(type) ? type : "consonant";

  // 곁텍스트 읽기·RAFT 글쓰기도 모둠으로 진행할 수 있습니다. 다만 **글은
  // 학생마다 한 장 그대로**(entries/{uid})이고, 모둠이 정하는 것은 '누구와
  // 함께 보는가'입니다 — 화면의 흐름과 동료 평가의 범위. 그래서 저장 위치도
  // 보안 규칙도 손대지 않습니다.
  //
  // 표시는 `grouped: true` 한 칸입니다. groupMode로 판정하면 예전에 만든
  // 개인 활동이 전부 모둠 활동으로 둔갑합니다 — 그때도 방식과 상관없이
  // 'teacher'가 적혀 있었기 때문입니다.
  const grouped =
    BOOK_SOLO_TYPES.includes(kind) &&
    BOOK_GROUPABLE_TYPES.includes(kind) &&
    groupMode !== "solo";
  if ((BOOK_SOLO_TYPES.includes(kind) && !grouped) || BOOK_SHARED_TYPES.includes(kind)) groupCount = 0;

  // 닿소리 채우기의 '개별 활동' — 학생 한 명당 판 하나(1인 모둠)를 깝니다.
  // 판 이름은 학생 이름으로 두어 교사 화면에서 바로 알아볼 수 있게 합니다.
  // (곁텍스트·RAFT의 '개별 활동'은 판 자체가 없습니다 — 원래 자기 문서에
  //  쓰는 활동이라 1인 판을 깔 이유가 없습니다)
  const soloMode = kind === "consonant" && groupMode === "solo";
  const soloRows = soloMode
    ? (soloMembers ?? [])
        .filter((s) => s?.uid)
        .map((s) => ({
          name: s.name || "학생",
          memberUids: [s.uid],
          members: [{
            uid: s.uid,
            name: s.name || "학생",
            studentId: s.studentId ?? null,
            emoji: s.emoji ?? "🙂",
          }],
        }))
    : [];

  const defaultTitle =
    {
      paratext: "곁텍스트 읽기",
      raft: "RAFT 글쓰기",
      kwls: "KWLS로 성찰하기",
      mindmap: "마인드맵",
      opinion: "내 생각은요...",
    }[kind] ?? "닿소리 채우기";
  // 시작 명단 — 방식마다 다릅니다.
  //  기본 모둠  반의 모둠을 그대로(모둠 수도 거기서 정해집니다)
  //  무작위     지금 명단을 섞어 고르게 나눠 담습니다
  //  그 밖      빈 모둠만 — 교사가 짜거나(활동 모둠) 학생이 골라 들어갑니다(자유)
  const initialGroups = (BOOK_SOLO_TYPES.includes(kind) && !grouped) || BOOK_SHARED_TYPES.includes(kind)
    ? []
    : soloMode
    ? soloRows
    : groupMode === "base"
    ? normalizeStudyGroups(baseGroups)
    : groupMode === "random"
    ? randomGroupRows(soloMembers, groupCount)
    : [];
  if (groupMode === "base" && initialGroups.length > 0) groupCount = initialGroups.length;
  // 개별 활동은 명단이 곧 판의 개수입니다 — 명단이 비면 만들 판도 없습니다.
  if (soloMode) groupCount = soloRows.length;
  const nameAt = (i) => (groupNames[i - 1] || "").trim() || `${i}모둠`;
  const data = {
    classId,
    type: kind,
    title: (title || "").trim() || defaultTitle,
    topic: (topic || "").trim(),
    // 교사가 준 도서 정보 사이트 주소 (학생 화면의 '도서 정보' 버튼)
    bookUrl: (bookUrl || "").trim(),
    groupMode: BOOK_GROUP_MODES.includes(groupMode) ? groupMode : "teacher",
    groupSetName: soloMode
      ? `${((topic || "").trim() || (title || "").trim() || defaultTitle)} 개별 활동`
      : `${((topic || "").trim() || (title || "").trim() || defaultTitle)} 활동 모둠`,
    maxPerGroup,
    locked: false,
    createdBy: user.uid,
  };
  // 모둠으로 여는 곁텍스트·RAFT에만 찍습니다(닿소리는 원래 모둠 활동이라
  // 표시가 필요 없고, 표시를 남기면 두 곳을 맞춰야 할 값이 하나 늘어납니다).
  if (grouped) data.grouped = true;
  // 곁텍스트 읽기는 여덟 단계를 교사가 하나씩 열어 줍니다 — 만들 때는
  // 1단계(표지)만 열어 둡니다. 뜻과 저장 모양은 lib/paratext.js 참고.
  if (kind === "paratext") data.sectionLocks = initialSectionLocks();
  // '내 생각은요...' — 영역은 key(z1·z2…)로 짚고 이름만 화면에 씁니다
  // (lib/opinion.js). 모둠이 없어 방식은 늘 'solo'로 적어 둡니다.
  if (kind === "opinion") {
    data.zones = zonesFromNames(zones);
    data.prompt = String(prompt ?? "").trim().slice(0, OPINION_PROMPT_MAX);
    data.groupMode = "solo";
  }
  if (isFirebaseConfigured) {
    const ref = await addDoc(collection(db, "bookActivities"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    if (groupCount > 0) {
      const batch = writeBatch(db);
      for (let i = 1; i <= groupCount; i++) {
        const baseGroup = initialGroups[i - 1] ?? null;
        batch.set(doc(db, "bookActivities", ref.id, "groups", `group_${i}`), {
          activityId: ref.id,
          groupIndex: i,
          groupName: baseGroup?.name || nameAt(i),
          groupSetName: data.groupSetName,
          memberUids: baseGroup?.memberUids ?? [],
          members: baseGroup?.members ?? [],
          leaderUid: null,
          retired: false,
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
    return ref.id;
  }
  ensureMockBooks();
  const id = `ba${nextMockSeq()}_m`;
  mock.bookActivities.unshift({ id, ...data, createdAt: new Date() });
  for (let i = 1; i <= groupCount; i++) {
    const baseGroup = initialGroups[i - 1] ?? null;
    mock.bookGroups.push({
      id: `group_${i}`, activityId: id, groupIndex: i,
      groupName: baseGroup?.name || nameAt(i), groupSetName: data.groupSetName,
      memberUids: baseGroup?.memberUids ?? [], members: baseGroup?.members ?? [], leaderUid: null, retired: false,
    });
  }
  notifyBookActivities();
  return id;
}

// [교사] 활동 이름·주제어·도서 정보 주소 고치기 — 이미 진행 중인 활동도 됩니다.
// -------------------------------------------------------------
// 낱말·기록은 활동 id로 이어져 있고(words 문서의 activityId, 경로의 actId)
// 이름으로 찾는 곳이 한 군데도 없습니다. 그래서 이름을 바꿔도 학생이 넣은
// 낱말이 떨어져 나가지 않습니다 — 화면에 적히는 글자만 바뀝니다.
//
// 종류(type)·모둠 방식(groupMode)·모둠 수는 여기서 못 바꿉니다. 그건 이미
// 만들어 둔 판과 그 아래 낱말을 어디에 둘지가 달라지는 일이라, 고치는 게
// 아니라 새로 만드는 쪽이 맞습니다.
//
// groupSetName은 만들 때 주제어에서 지어 둔 이름이라 함께 고쳐 줍니다
// (모둠 구성 화면의 제목). 판마다 복사돼 있는 값은 그대로 두는데, 화면이
// 활동 문서의 값을 먼저 보므로 보이는 이름은 어긋나지 않습니다 —
// 26명짜리 개별 활동에서 판을 스물여섯 번 쓰지 않으려고요.
export async function renameBookActivity(actId, { title, topic, bookUrl, zoneNames, prompt }, activity = null) {
  const nextTitle = String(title ?? "").trim();
  const nextTopic = String(topic ?? "").trim();
  if (!actId || !nextTitle) return;
  const soloMode =
    activity && !BOOK_SOLO_TYPES.includes(activity.type) && activity.groupMode === "solo";
  const base = nextTopic || nextTitle;
  const patch = {
    title: nextTitle,
    topic: nextTopic,
    bookUrl: String(bookUrl ?? "").trim(),
    groupSetName: soloMode ? `${base} 개별 활동` : `${base} 활동 모둠`,
  };
  // '내 생각은요...' — 영역은 **이름만** 고칩니다(key·개수는 그대로라
  // 이미 붙은 메모가 제 영역에 남습니다). 물음도 여기서 고칩니다.
  if (activity?.type === "opinion") {
    if (Array.isArray(zoneNames)) patch.zones = renameZones(activity.zones, zoneNames);
    if (prompt !== undefined) patch.prompt = String(prompt ?? "").trim().slice(0, OPINION_PROMPT_MAX);
  }
  return updateBookActivity(actId, patch);
}

// [교사] 활동 수정 (주제어 변경, 잠금 토글 등)
export async function updateBookActivity(actId, patch) {
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "bookActivities", actId), patch);
    return;
  }
  ensureMockBooks();
  // mock은 문서를 **갈아 끼웁니다**(제자리에서 고치지 않고). Firestore는 읽을
  // 때마다 새 객체를 주는데 mock이 같은 객체를 고쳐 두면, 그 문서를 들고 있는
  // 쪽이 늘 같은 참조를 받아 React가 다시 그리지 않습니다 — 반 문서에서 겪은
  // 그 함정입니다. 실제로 데모 모드에서 교사가 곁텍스트 단계를 열어도 학생
  // 서랍이 잠긴 채로 있었습니다.
  const i = mock.bookActivities.findIndex((a) => a.id === actId);
  if (i >= 0) mock.bookActivities[i] = { ...mock.bookActivities[i], ...patch };
  notifyBookActivities();
}

// [교사] 활동 삭제 — 모둠·단어·개인 기록까지 함께 정리
// [교사] 활동 삭제 — 휴지통으로 보냅니다(즉시 지우지 않습니다).
// -------------------------------------------------------------
// 한때 여기서 낱말·모둠·기록을 곧바로 지웠습니다. 그러다 손이 미끄러져
// 한 반의 활동이 통째로 날아간 일이 있었는데, 앱 안에 되돌릴 길이 없어
// Firestore 시점 복구까지 갔다가 결국 못 살렸습니다(보존 창이 1시간뿐이라
// 그 사이에 지난 뒤였습니다).
//
// 그래서 지우는 대신 지웠다는 표시만 찍습니다. 목록에서는 사라지지만
// 자료는 그대로라 restoreBookActivity로 되돌아옵니다. 진짜로 없애는 것은
// purgeBookActivity — 휴지통 안에서 한 번 더 확인하고 부릅니다.
//
// 읽기가 늘지 않습니다: 목록 구독이 이미 이 반의 활동을 모두 받아 오므로,
// 화면에서 표시가 있는 것과 없는 것으로 나누기만 하면 됩니다. 조건을
// 붙여 따로 질의하면 복합 색인이 필요해집니다(CLAUDE.md 참고).
// [지운 표시가 둘인 이유] deleted(참·거짓)로 판정하고, deletedAt은 '언제'만
// 적어 둡니다. serverTimestamp()는 서버가 답하기 전까지 화면에 null로 와서,
// deletedAt만 보고 판정하면 지운 활동이 한 박자 되살아났다가 사라집니다.
// 불리언은 바로 쓰이므로 그 깜빡임이 없습니다.
export async function deleteBookActivity(actId) {
  const user = getCurrentUser();
  const patch = {
    deleted: true,
    deletedAt: isFirebaseConfigured ? serverTimestamp() : new Date(),
    deletedBy: user?.uid ?? null,
  };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "bookActivities", actId), patch);
    return;
  }
  ensureMockBooks();
  // mock은 문서를 갈아 끼웁니다 — 위 updateBookActivity의 설명 참고.
  const i = mock.bookActivities.findIndex((a) => a.id === actId);
  if (i >= 0) mock.bookActivities[i] = { ...mock.bookActivities[i], ...patch };
  notifyBookActivities();
}

// [교사] 휴지통에서 되돌리기 — 표시만 지우면 그대로 돌아옵니다.
export async function restoreBookActivity(actId) {
  const patch = { deleted: false, deletedAt: null, deletedBy: null };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "bookActivities", actId), patch);
    return;
  }
  ensureMockBooks();
  // mock은 문서를 갈아 끼웁니다 — 위 updateBookActivity의 설명 참고.
  const i = mock.bookActivities.findIndex((a) => a.id === actId);
  if (i >= 0) mock.bookActivities[i] = { ...mock.bookActivities[i], ...patch };
  notifyBookActivities();
}

// [교사] 완전 삭제 — 되돌릴 수 없습니다. 휴지통에서만 부릅니다.
// 낱말 → 모둠 → 기록 → 활동 순서로 지웁니다. 중간에 끊겨도 활동 문서가
// 마지막까지 남아 있어야 무엇이 덜 지워졌는지 찾아갈 수 있습니다
// (반대로 하면 부모 없는 낱말만 남아 아무도 못 찾습니다).
export async function purgeBookActivity(actId) {
  if (isFirebaseConfigured) {
    const groups = await getDocs(collection(db, "bookActivities", actId, "groups"));
    for (const g of groups.docs) {
      const words = await getDocs(collection(g.ref, "words"));
      await Promise.all(words.docs.map((w) => deleteDoc(w.ref)));
      await deleteDoc(g.ref);
    }
    // 개인 활동(곁텍스트 읽기·RAFT·KWLS·마인드맵)의 학생 기록
    const entries = await getDocs(collection(db, "bookActivities", actId, "entries"));
    await Promise.all(entries.docs.map((e) => deleteDoc(e.ref)));
    // '내 생각은요...'의 메모
    const notes = await getDocs(collection(db, "bookActivities", actId, "opinionNotes"));
    await Promise.all(notes.docs.map((n) => deleteDoc(n.ref)));
    await deleteDoc(doc(db, "bookActivities", actId));
    return;
  }
  ensureMockBooks();
  mock.bookActivities = mock.bookActivities.filter((a) => a.id !== actId);
  mock.bookGroups = mock.bookGroups.filter((g) => g.activityId !== actId);
  mock.bookWords = mock.bookWords.filter((w) => w.activityId !== actId);
  mock.bookEntries = mock.bookEntries.filter((e) => e.activityId !== actId);
  mock.bookOpinionNotes = mock.bookOpinionNotes.filter((n) => n.activityId !== actId);
  notifyBookActivities();
  notifyBookGroups(actId);
  notifyBookEntries(actId);
  notifyOpinionNotes(actId);
}

// ─── 모둠 ────────────────────────────────────────────────────
// 활동의 모둠 목록 구독 — 대시보드에서 전체 모둠 카드를 보여줍니다.
export function subscribeBookGroups(actId, callback) {
  if (!actId) { callback([]); return () => {}; }
  const sortAndSend = (list) => {
    callback(
      list
        .filter((g) => !g.retired)
        .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0))
    );
  };
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "bookActivities", actId, "groups"),
      (snap) => sortAndSend(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => { console.warn("[책방] 모둠 목록을 읽지 못했어요:", e?.code, e?.message); callback([]); }
    );
  }
  ensureMockBooks();
  if (!mockListeners.bookGroups.has(actId)) mockListeners.bookGroups.set(actId, new Set());
  const emit = () => sortAndSend(mock.bookGroups.filter((g) => g.activityId === actId));
  mockListeners.bookGroups.get(actId).add(emit);
  emit();
  return () => mockListeners.bookGroups.get(actId)?.delete(emit);
}

// [교사] 모둠 구성 — GroupComposer가 넘겨준 배열을 저장.
// 재구성해도 이미 입력한 단어(words 하위 컬렉션)는 그대로 남습니다.
export async function composeBookGroups(user, actId, groups, options = {}) {
  const groupSetName = options.groupSetName || groups[0]?.groupSetName || "활동 모둠";
  if (isFirebaseConfigured) {
    const snap = await getDocs(collection(db, "bookActivities", actId, "groups"));
    const existingIds = snap.docs.map((d) => d.id);
    const batch = writeBatch(db);
    groups.forEach((g) => {
      const id = `group_${g.index}`;
      const fields = {
        activityId: actId,
        groupIndex: g.index,
        groupName: g.name,
        groupSetName,
        memberUids: g.memberUids,
        members: g.members,
        leaderUid: g.leaderUid ?? null,
        retired: false,
        updatedAt: serverTimestamp(),
      };
      const ref = doc(db, "bookActivities", actId, "groups", id);
      if (existingIds.includes(id)) batch.set(ref, fields, { merge: true });
      else batch.set(ref, { ...fields, createdAt: serverTimestamp() });
    });
    const keep = new Set(groups.map((g) => `group_${g.index}`));
    existingIds.filter((id) => !keep.has(id)).forEach((id) => {
      batch.set(doc(db, "bookActivities", actId, "groups", id), { retired: true }, { merge: true });
    });
    await batch.commit();
    return;
  }
  ensureMockBooks();
  const keep = new Set(groups.map((g) => `group_${g.index}`));
  mock.bookGroups.forEach((g) => {
    if (g.activityId === actId && !keep.has(g.id)) g.retired = true;
  });
  groups.forEach((g) => {
    const id = `group_${g.index}`;
    const existing = mock.bookGroups.find((x) => x.activityId === actId && x.id === id);
    const fields = {
      groupIndex: g.index, groupName: g.name, groupSetName, memberUids: g.memberUids,
      members: g.members, leaderUid: g.leaderUid ?? null, retired: false,
    };
    if (existing) replaceDoc(mock.bookGroups, existing, fields);
    else mock.bookGroups.push({ id, activityId: actId, ...fields });
  });
  notifyBookGroups(actId);
}

// [교사] 개별 활동(닿소리) — **판이 없는 학생에게 판을 하나씩 더합니다.**
//
// 활동을 시작한 뒤 반에 들어온 학생에게는 판이 없습니다. 판은 만들 때의
// 명단으로 한 번에 찍히기 때문입니다(위 createBookActivity의 soloRows).
//
// **`composeBookGroups`를 쓰지 마세요.** 그 함수는 넘긴 목록이 곧 전부라,
// 목록에 없는 판을 물리고(retired) **문서 id를 `group_{index}`로 가정해**
// 씁니다. 그런데 `npm run books:to-solo`로 옮긴 활동의 판은 id가
// `solo_<uid>`입니다 — 거기서 그 함수를 부르면 빈 `group_N`들이 새로 생기고
// 멀쩡한 `solo_*` 판이 전부 물러나, 학생들의 낱말이 화면에서 통째로
// 사라집니다(낱말 문서가 지워지는 것은 아니지만 앱 안에 되돌릴 길이 없습니다).
// 실제로 그렇게 짰다가 고친 자리입니다.
//
// 그래서 여기서는 **있는 판은 건드리지 않고 없는 것만 더합니다.** 물릴 일도,
// 남의 id를 넘겨짚을 일도 없습니다.
//
// 새 판의 id는 `solo_<uid>`입니다 — 학생마다 하나뿐이라 `group_N`과도, 서로
// 와도 부딪히지 않습니다(to-solo 스크립트가 쓰는 이름과 같습니다).
// 그 id가 이미 있으면(반에서 뺐다가 다시 넣은 학생) **되살립니다** — 새로
// 만들면 그 학생이 전에 넣은 낱말이 묻힙니다.
//
// 돌려주는 값은 실제로 손댄 판의 개수입니다.
export async function addSoloBookBoards(user, actId, students = []) {
  const rows = (students ?? []).filter((s) => s?.uid);
  if (rows.length === 0) return 0;
  const rowFields = (s, index, setName) => ({
    activityId: actId,
    groupIndex: index,
    groupName: s.name || "학생",
    groupSetName: setName,
    memberUids: [s.uid],
    members: [{
      uid: s.uid,
      name: s.name || "학생",
      studentId: s.studentId ?? null,
      emoji: s.emoji ?? "🙂",
    }],
    leaderUid: null,
    retired: false,
  });

  if (isFirebaseConfigured) {
    // 물린 판까지 **전부** 봅니다 — 번호를 살아 있는 판에서만 세면 물린 판과
    // 같은 번호를 다시 매겨, 나중에 되살릴 때 둘이 겹칩니다.
    const snap = await getDocs(collection(db, "bookActivities", actId, "groups"));
    const byId = new Map(snap.docs.map((d) => [d.id, d.data() ?? {}]));
    let next = snap.docs.reduce((m, d) => Math.max(m, d.data()?.groupIndex ?? 0), 0);
    const setName =
      snap.docs.map((d) => d.data()?.groupSetName).find(Boolean) || "개별 활동";
    const batch = writeBatch(db);
    rows.forEach((s) => {
      const id = `solo_${s.uid}`;
      const ref = doc(db, "bookActivities", actId, "groups", id);
      const old = byId.get(id);
      if (old) {
        // 이미 있는 판 — 번호는 그대로 두고 되살리기만 합니다(낱말 보존)
        batch.set(
          ref,
          { ...rowFields(s, old.groupIndex ?? ++next, setName), updatedAt: serverTimestamp() },
          { merge: true }
        );
      } else {
        batch.set(ref, { ...rowFields(s, ++next, setName), createdAt: serverTimestamp() });
      }
    });
    await batch.commit();
    return rows.length;
  }

  ensureMockBooks();
  let next = mock.bookGroups
    .filter((g) => g.activityId === actId)
    .reduce((m, g) => Math.max(m, g.groupIndex ?? 0), 0);
  const setName =
    mock.bookGroups.find((g) => g.activityId === actId && g.groupSetName)?.groupSetName
    || "개별 활동";
  rows.forEach((s) => {
    const id = `solo_${s.uid}`;
    const existing = mock.bookGroups.find((g) => g.activityId === actId && g.id === id);
    if (existing) replaceDoc(mock.bookGroups, existing, rowFields(s, existing.groupIndex ?? ++next, setName));
    else mock.bookGroups.push({ id, ...rowFields(s, ++next, setName) });
  });
  notifyBookGroups(actId);
  return rows.length;
}

// [학생] 자유 구성 모드에서 모둠 참여 — 자기 정보만 명단에 넣습니다.
export async function joinBookGroup(actId, groupId, user) {
  const me = { uid: user.uid, name: user.realName || user.displayName, emoji: user.emoji ?? "🙂" };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "bookActivities", actId, "groups", groupId), {
      memberUids: arrayUnion(user.uid),
      members: arrayUnion(me),
    });
    return;
  }
  ensureMockBooks();
  const g = mock.bookGroups.find((x) => x.activityId === actId && x.id === groupId);
  if (g && !g.memberUids.includes(user.uid)) {
    replaceDoc(mock.bookGroups, g, { memberUids: [...g.memberUids, user.uid], members: [...g.members, me] });
  }
  notifyBookGroups(actId);
}

// [학생] 모둠에서 나가기 — 저장된 객체와 같아야 지워지므로 명단에서 찾아 넘깁니다.
export async function leaveBookGroup(actId, groupId, user, storedMember = null) {
  if (isFirebaseConfigured) {
    const patch = { memberUids: arrayRemove(user.uid) };
    if (storedMember) patch.members = arrayRemove(storedMember);
    await updateDoc(doc(db, "bookActivities", actId, "groups", groupId), patch);
    return;
  }
  ensureMockBooks();
  const g = mock.bookGroups.find((x) => x.activityId === actId && x.id === groupId);
  if (g) {
    replaceDoc(mock.bookGroups, g, {
      memberUids: g.memberUids.filter((u) => u !== user.uid),
      members: g.members.filter((m) => m.uid !== user.uid),
    });
  }
  notifyBookGroups(actId);
}

// [개별 활동] 판마다 다른 주제어 — 학생이 자기 판 한가운데를 두 번 눌러 적습니다.
//
// 개별 활동은 판 하나가 곧 학생 한 명이라, 읽는 책도 저마다 다를 수 있습니다.
// 그래서 주제어를 활동이 아니라 '판'에 둡니다. 활동의 topic은 교사가 적어 둔
// 기본값으로 남고, 판에 topic이 있으면 그것이 우선합니다(화면에서 판단).
//
// 규칙에서 개별 활동일 때 그 판의 구성원(= 본인)에게만 topic 한 필드 수정을
// 허용합니다 — 낱말과 달리 남의 글로 둔갑할 수 있는 값이 아니고, 고칠 수 있는
// 범위가 자기 판 하나로 끝나기 때문입니다.
export async function setBookGroupTopic(actId, groupId, topic) {
  const text = (topic ?? "").trim().slice(0, 40);
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "bookActivities", actId, "groups", groupId), { topic: text });
    return;
  }
  ensureMockBooks();
  const g = mock.bookGroups.find((x) => x.activityId === actId && x.id === groupId);
  if (g) g.topic = text;
  notifyBookGroups(actId);
}

// ─── 단어 ────────────────────────────────────────────────────
// 한 모둠의 단어 구독 (자기 모둠 판 / 교사 집계 화면 공통)
export function subscribeGroupWords(actId, groupId, callback) {
  if (!actId || !groupId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "bookActivities", actId, "groups", groupId, "words"),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => { console.warn("[책방] 단어를 읽지 못했어요:", e?.code, e?.message); callback([]); }
    );
  }
  ensureMockBooks();
  const key = `${actId}_${groupId}`;
  if (!mockListeners.bookWords.has(key)) mockListeners.bookWords.set(key, new Set());
  const emit = () =>
    callback(mock.bookWords.filter((w) => w.activityId === actId && w.groupId === groupId));
  mockListeners.bookWords.get(key).add(emit);
  emit();
  return () => mockListeners.bookWords.get(key)?.delete(emit);
}

// 단어 추가 — 문서 1건이라 같은 모둠에서 동시에 입력해도 서로 덮어쓰지 않습니다.
export async function addConsonantWord(actId, groupId, { cellKey, text }, user) {
  const data = {
    activityId: actId,
    groupId,
    cellKey,
    text: text.trim(),
    authorId: user.uid,
    authorName: user.realName || user.displayName,
  };
  if (isFirebaseConfigured) {
    await addDoc(collection(db, "bookActivities", actId, "groups", groupId, "words"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return;
  }
  ensureMockBooks();
  mock.bookWords.push({ id: `bw${nextMockSeq()}_m`, ...data, createdAt: new Date() });
  notifyBookWords(actId, groupId);
}

export async function deleteConsonantWord(actId, groupId, wordId) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "bookActivities", actId, "groups", groupId, "words", wordId));
    return;
  }
  ensureMockBooks();
  mock.bookWords = mock.bookWords.filter((w) => w.id !== wordId);
  notifyBookWords(actId, groupId);
}

// ─── 곁텍스트 읽기 — 개인 기록 ────────────────────────────────
// bookActivities/{actId}/entries/{uid} — 학생 1명당 문서 1개
//   문서 ID를 학생 uid로 두어 '한 사람이 여러 장을 만드는 일'을 막습니다
//   (닿소리 활동의 모둠 카드가 문서ID=uid인 것과 같은 방식).
//   answers는 lib/paratext.js가 정한 칸 키를 그대로 담는 한 겹 맵입니다.

// [교사] 이 활동에 들어온 학생 기록 전체 — 학생별 카드에 진행 상황을 표시합니다.
export function subscribeParatextEntries(actId, callback) {
  if (!actId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "bookActivities", actId, "entries"),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => {
        console.warn("[책방] 곁텍스트 기록을 읽지 못했어요:", e?.code, e?.message);
        callback([]);
      }
    );
  }
  ensureMockBooks();
  if (!mockListeners.bookEntries.has(actId)) mockListeners.bookEntries.set(actId, new Set());
  const emit = () => callback(mock.bookEntries.filter((e) => e.activityId === actId));
  mockListeners.bookEntries.get(actId).add(emit);
  emit();
  return () => mockListeners.bookEntries.get(actId)?.delete(emit);
}

// 독서 활동 한 건 — 수업 노트 서랍이 '오늘의 활동'을 그릴 때 씁니다(문서 1건).
// `subscribeBookActivities`(반의 활동 전부)를 서랍에서 쓰지 않는 이유는,
// 여기서 필요한 것이 **그 활동 하나**뿐이기 때문입니다.
export async function fetchBookActivity(actId) {
  if (!actId) return null;
  if (isFirebaseConfigured) {
    const snap = await getDoc(doc(db, "bookActivities", actId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }
  ensureMockBooks();
  return mock.bookActivities.find((a) => a.id === actId) ?? null;
}

// 반의 독서 활동 목록을 **한 번만** 읽습니다 — 교사가 수업 모드에서 무엇을
// 보낼지 고르는 데 씁니다. 구독으로 두면 수업 모드가 떠 있는 내내 연결이
// 살아 있는데, 고르개를 한 번 펴 보는 일에 그만한 값이 없습니다.
export async function fetchBookActivities(classId) {
  if (!classId) return [];
  if (isFirebaseConfigured) {
    const snap = await getDocs(
      query(collection(db, "bookActivities"), where("classId", "==", classId))
    );
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => toDate(a.createdAt) - toDate(b.createdAt));
    return list;
  }
  ensureMockBooks();
  return mock.bookActivities
    .filter((a) => a.classId === classId)
    .slice()
    .sort((a, b) => toDate(a.createdAt) - toDate(b.createdAt));
}

// [학생] 내 기록 하나를 **한 번만** 읽습니다 — 서랍은 구독이 아니라 한 번
// 읽고 자동 저장합니다(공부방 카드와 같은 방식).
export async function fetchMyBookEntry(actId, uid) {
  if (!actId || !uid) return null;
  if (isFirebaseConfigured) {
    const snap = await getDoc(doc(db, "bookActivities", actId, "entries", uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }
  ensureMockBooks();
  return mock.bookEntries.find((e) => e.activityId === actId && e.authorId === uid) ?? null;
}

// [학생] 내 기록 하나 — 없으면 null. 입력 화면이 처음 열릴 때 불러옵니다.
export function subscribeMyParatextEntry(actId, uid, callback) {
  if (!actId || !uid) { callback(null); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      doc(db, "bookActivities", actId, "entries", uid),
      (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (e) => {
        console.warn("[책방] 내 곁텍스트 기록을 읽지 못했어요:", e?.code, e?.message);
        callback(null);
      }
    );
  }
  ensureMockBooks();
  if (!mockListeners.bookEntries.has(actId)) mockListeners.bookEntries.set(actId, new Set());
  const emit = () =>
    callback(
      mock.bookEntries.find((e) => e.activityId === actId && e.authorId === uid) ?? null
    );
  mockListeners.bookEntries.get(actId).add(emit);
  emit();
  return () => mockListeners.bookEntries.get(actId)?.delete(emit);
}

// [학생] 내 기록 저장 — 같은 문서에 덮어씁니다(merge). 자동 저장이라 자주 불립니다.
// [학생] 자기 기록의 주제어(도서명) — 교사가 활동을 만들 때 비워 둔 경우,
// 읽는 책이 학생마다 달라 각자 적습니다(닿소리 '개별 활동'과 같은 이치).
// 자기 문서(entries/{uid})에만 쓰므로 규칙을 넓히지 않아도 됩니다.
export async function saveParatextTopic(actId, user, topic) {
  const text = String(topic ?? "").trim().slice(0, 40);
  if (!actId || !user?.uid) return;
  const data = {
    activityId: actId,
    authorId: user.uid,
    authorName: user.realName || user.displayName || "이름 미설정",
    topic: text,
  };
  if (isFirebaseConfigured) {
    await setDoc(
      doc(db, "bookActivities", actId, "entries", user.uid),
      { ...data, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return;
  }
  ensureMockBooks();
  const found = mock.bookEntries.find(
    (e) => e.activityId === actId && e.authorId === user.uid
  );
  if (found) replaceDoc(mock.bookEntries, found, data, { updatedAt: new Date() });
  else mock.bookEntries.push({ id: user.uid, ...data, answers: {}, updatedAt: new Date() });
  notifyBookEntries(actId);
}

export async function saveParatextEntry(actId, user, answers) {
  const data = {
    activityId: actId,
    authorId: user.uid,
    // 교사 화면에서 누구 것인지 보여야 하므로 실명을 함께 둡니다
    // (곁텍스트는 익명 게시물이 아니라 제출물이라 학생 본인·교사만 읽습니다)
    authorName: user.realName || user.displayName || "이름 미설정",
    answers,
  };
  if (isFirebaseConfigured) {
    await setDoc(
      doc(db, "bookActivities", actId, "entries", user.uid),
      { ...data, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return;
  }
  ensureMockBooks();
  const found = mock.bookEntries.find(
    (e) => e.activityId === actId && e.authorId === user.uid
  );
  if (found) replaceDoc(mock.bookEntries, found, data, { updatedAt: new Date() });
  else mock.bookEntries.push({ id: user.uid, ...data, updatedAt: new Date() });
  notifyBookEntries(actId);
}

// ─── 동료 평가 — 모둠 친구의 발표를 듣고 남기는 한 마디 ──────────────
// 문서 ID는 `받는사람_쓴사람`입니다. 한 사람이 한 친구에게 **한 장만** 쓰고
// 그 장을 고쳐 씁니다 — 같은 친구에게 여러 장이 쌓이면 무엇이 마지막
// 생각인지 알 수 없고, 발표 한 번에 코멘트가 다섯 장씩 붙습니다.
//
// 읽는 사람은 받은 학생·쓴 학생·담당 교사뿐입니다(규칙). 반 전체가 서로
// 다 보게 하면 먼저 쓴 코멘트를 보고 따라 쓰게 됩니다. 대신 쓴 사람 이름은
// 남깁니다 — 익명이면 함부로 씁니다.
//
// groupId를 문서에 적는 이유: 규칙은 모둠을 뒤져 찾을 수 없어서, '어느
// 모둠에서 쓴 것인지'를 문서가 스스로 말해야 합니다. 규칙은 그 모둠 명단에
// 쓴 사람과 받는 사람이 둘 다 들어 있는지 확인합니다.
export function peerReviewId(toUid, fromUid) {
  return `${toUid}_${fromUid}`;
}

// [학생] 이 활동에서 내가 쓴 것 + 내가 받은 것.
// 쿼리를 둘로 나눈 이유는 규칙 때문입니다 — 한 번에 받으려면 활동의 모든
// 코멘트를 훑어야 하는데, 그건 남의 평가까지 읽는 일이라 규칙이 막습니다.
export function subscribeMyPeerReviews(actId, uid, callback) {
  if (!actId || !uid) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      query(collection(db, "bookActivities", actId, "peerReviews"), where("fromUid", "==", uid)),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => {
        console.warn("[책방] 내가 쓴 동료 평가를 읽지 못했어요:", e?.code, e?.message);
        callback([]);
      }
    );
  }
  ensureMockBooks();
  if (!mockListeners.bookPeerReviews.has(actId)) mockListeners.bookPeerReviews.set(actId, new Set());
  const emit = () =>
    callback(mock.bookPeerReviews.filter((r) => r.activityId === actId && r.fromUid === uid));
  mockListeners.bookPeerReviews.get(actId).add(emit);
  emit();
  return () => mockListeners.bookPeerReviews.get(actId)?.delete(emit);
}

export function subscribeReceivedPeerReviews(actId, uid, callback) {
  if (!actId || !uid) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      query(collection(db, "bookActivities", actId, "peerReviews"), where("toUid", "==", uid)),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => {
        console.warn("[책방] 받은 동료 평가를 읽지 못했어요:", e?.code, e?.message);
        callback([]);
      }
    );
  }
  ensureMockBooks();
  if (!mockListeners.bookPeerReviews.has(actId)) mockListeners.bookPeerReviews.set(actId, new Set());
  const emit = () =>
    callback(mock.bookPeerReviews.filter((r) => r.activityId === actId && r.toUid === uid));
  mockListeners.bookPeerReviews.get(actId).add(emit);
  emit();
  return () => mockListeners.bookPeerReviews.get(actId)?.delete(emit);
}

// [교사] 이 활동의 동료 평가 전부 — 학생 카드를 열었을 때 그 학생이 받은
// 것을 함께 보여 주려고. 규칙이 담당 교사에게 전체를 열어 둡니다.
export function subscribeAllPeerReviews(actId, callback) {
  if (!actId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "bookActivities", actId, "peerReviews"),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => {
        console.warn("[책방] 동료 평가를 읽지 못했어요:", e?.code, e?.message);
        callback([]);
      }
    );
  }
  ensureMockBooks();
  if (!mockListeners.bookPeerReviews.has(actId)) mockListeners.bookPeerReviews.set(actId, new Set());
  const emit = () => callback(mock.bookPeerReviews.filter((r) => r.activityId === actId));
  mockListeners.bookPeerReviews.get(actId).add(emit);
  emit();
  return () => mockListeners.bookPeerReviews.get(actId)?.delete(emit);
}

const PEER_REVIEW_MAX = 4000; // 규칙과 같은 한도 (서식 HTML 포함 길이)

export async function savePeerReview(actId, user, { toUid, toName = "", groupId, html }) {
  if (!actId || !user?.uid || !toUid || !groupId) return;
  const body = sanitizeHtml(String(html ?? "")).slice(0, PEER_REVIEW_MAX);
  if (!stripHtml(body).trim()) return; // 빈 글은 저장하지 않습니다
  const id = peerReviewId(toUid, user.uid);
  const data = {
    activityId: actId,
    groupId,
    toUid,
    toName: String(toName ?? "").slice(0, 40),
    fromUid: user.uid,
    fromName: user.realName || user.displayName || "이름 미설정",
    html: body,
  };
  if (isFirebaseConfigured) {
    await setDoc(
      doc(db, "bookActivities", actId, "peerReviews", id),
      { ...data, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return;
  }
  ensureMockBooks();
  const found = mock.bookPeerReviews.find((r) => r.id === id && r.activityId === actId);
  if (found) replaceDoc(mock.bookPeerReviews, found, data, { updatedAt: new Date() });
  else mock.bookPeerReviews.push({ id, ...data, updatedAt: new Date() });
  notifyBookPeerReviews(actId);
}

export async function deletePeerReview(actId, toUid, fromUid) {
  if (!actId || !toUid || !fromUid) return;
  const id = peerReviewId(toUid, fromUid);
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "bookActivities", actId, "peerReviews", id));
    return;
  }
  ensureMockBooks();
  mock.bookPeerReviews = mock.bookPeerReviews.filter(
    (r) => !(r.id === id && r.activityId === actId)
  );
  notifyBookPeerReviews(actId);
}

// [교사] 동료 평가 열기/잠그기 — 활동 전체 잠금(locked)과 별개입니다.
// 수업 중 '이제 그만 쓰고 이야기하자'로 닫는 자리라, 글쓰기까지 함께 잠기면
// 안 됩니다. 값이 없는 옛 활동은 '열림'으로 봅니다.
export async function setPeerReviewLocked(actId, locked) {
  return updateBookActivity(actId, { peerReviewLocked: !!locked });
}

// ─── 내 생각은요... — 메모지 ─────────────────────────────────────
// bookActivities/{actId}/opinionNotes/{noteId}
//   { activityId, authorId, authorName, studentId, byTeacher,
//     text, zone, x, y, color, createdAt, updatedAt, movedAt }
//
// 반 전체가 서로 읽습니다(활동의 뜻이 그것입니다). 그래서 이름표(학번·이름)를
// 메모에 함께 적어 둡니다 — 읽는 학생마다 급우 프로필을 따로 읽지 않게요
// (닿소리 낱말이 authorName을 들고 있는 것과 같은 방식).
// 한 학생이 **여러 장** 붙일 수 있습니다. 문서 id는 자동입니다.
// 자리(zone·x·y)의 뜻은 lib/opinion.js의 머리말 참고.
export function subscribeOpinionNotes(actId, callback) {
  if (!actId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      collection(db, "bookActivities", actId, "opinionNotes"),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => { console.warn("[책방] 메모를 읽지 못했어요:", e?.code, e?.message); callback([]); }
    );
  }
  ensureMockBooks();
  const emit = () => callback(mock.bookOpinionNotes.filter((n) => n.activityId === actId));
  if (!mockListeners.bookOpinionNotes.has(actId)) mockListeners.bookOpinionNotes.set(actId, new Set());
  mockListeners.bookOpinionNotes.get(actId).add(emit);
  emit();
  return () => mockListeners.bookOpinionNotes.get(actId)?.delete(emit);
}

function cleanNoteText(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n").trim().slice(0, OPINION_TEXT_MAX);
}

// 메모 붙이기 — 학생은 자기 이름으로, 교사는 '선생님'으로(byTeacher).
export async function addOpinionNote(actId, user, { text, zone, x, y, color, byTeacher = false }) {
  const body = cleanNoteText(text);
  if (!actId || !user?.uid || !body) return null;
  const data = {
    activityId: actId,
    authorId: user.uid,
    authorName: byTeacher ? "선생님" : user.realName || user.displayName || "이름 없음",
    studentId: byTeacher ? null : user.studentId ?? null,
    byTeacher: !!byTeacher,
    text: body,
    zone: String(zone ?? ""),
    x: clamp01(x),
    y: clamp01(y),
    color: opinionColor(color).key,
  };
  if (isFirebaseConfigured) {
    const ref = await addDoc(collection(db, "bookActivities", actId, "opinionNotes"), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      movedAt: serverTimestamp(),
    });
    return ref.id;
  }
  ensureMockBooks();
  const id = `on${nextMockSeq()}_m`;
  const now = new Date();
  mock.bookOpinionNotes.push({ id, ...data, createdAt: now, updatedAt: now, movedAt: now });
  notifyOpinionNotes(actId);
  return id;
}

// 글·색 고치기 — 쓴 사람만(규칙이 막습니다). 자리는 moveOpinionNote로.
export async function updateOpinionNote(actId, noteId, { text, color }) {
  const patch = {};
  if (text !== undefined) {
    const body = cleanNoteText(text);
    if (!body) return;
    patch.text = body;
  }
  if (color !== undefined) patch.color = opinionColor(color).key;
  if (Object.keys(patch).length === 0) return;
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "bookActivities", actId, "opinionNotes", noteId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  ensureMockBooks();
  const found = mock.bookOpinionNotes.find((n) => n.id === noteId);
  if (found) replaceDoc(mock.bookOpinionNotes, found, patch, { updatedAt: new Date() });
  notifyOpinionNotes(actId);
}

// 자리 옮기기 — 쓴 사람과 담당 교사(교사는 칠판 앞에서 메모를 모아 정리합니다).
// movedAt이 겹쳐 그릴 차례를 정합니다(방금 옮긴 것이 위로).
export async function moveOpinionNote(actId, noteId, { zone, x, y }) {
  const patch = { zone: String(zone ?? ""), x: clamp01(x), y: clamp01(y) };
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "bookActivities", actId, "opinionNotes", noteId), {
      ...patch,
      movedAt: serverTimestamp(),
    });
    return;
  }
  ensureMockBooks();
  const found = mock.bookOpinionNotes.find((n) => n.id === noteId);
  if (found) replaceDoc(mock.bookOpinionNotes, found, patch, { movedAt: new Date() });
  notifyOpinionNotes(actId);
}

// 떼어 내기 — 쓴 사람(잠기기 전) · 담당 교사.
export async function deleteOpinionNote(actId, noteId) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "bookActivities", actId, "opinionNotes", noteId));
    return;
  }
  ensureMockBooks();
  mock.bookOpinionNotes = mock.bookOpinionNotes.filter((n) => n.id !== noteId);
  notifyOpinionNotes(actId);
}

// 활동 문서의 영역을 손질해 돌려줍니다(화면이 늘 2~4개를 받게).
export function opinionZonesOf(activity) {
  return normalizeZones(activity?.zones);
}
