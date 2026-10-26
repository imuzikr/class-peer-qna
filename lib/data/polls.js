// =============================================================
// 투표 — classes/{cId}/polls/{pId} (+ votes/{uid})
// -------------------------------------------------------------
// 셈과 자료 모양은 lib/poll.js 머리 주석에 있습니다. 화면은 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 다시 내보냅니다.
//
// [읽는 범위] 투표는 수업마다 한두 개라, 반의 **최근 것 몇 장**을 구독합니다
// (`orderBy createdAt desc · limit` — 단일 필드라 복합 색인 없음). 학생은 열린
// 투표와 공유된 결과를 그 안에서 고릅니다. 표는 교사만 통째로 읽고, 학생은
// 제 표 한 장(문서 ID = uid)만.
// =============================================================
import {
  collection,
  doc,
  getDocs,
  limit as qLimit,
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
  POLL_TITLE_MAX,
  buildPollOptions,
  cleanPicks,
  pollKindOf,
  pollOptionsProblem,
  sortPolls,
} from "../poll";
import { getCurrentUser } from "../user";
import { mock, nextMockSeq } from "./shared";

const pollsCol = (classId) => collection(db, "classes", classId, "polls");
const pollRef = (classId, pollId) => doc(db, "classes", classId, "polls", pollId);
const votesCol = (classId, pollId) => collection(db, "classes", classId, "polls", pollId, "votes");
const voteRef = (classId, pollId, uid) => doc(db, "classes", classId, "polls", pollId, "votes", uid);
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// ── 데모 모드 ──
const mockSubs = new Set();
function mockPolls() {
  if (!mock.polls) mock.polls = [];
  return mock.polls;
}
function mockVotes() {
  if (!mock.pollVotes) mock.pollVotes = [];
  return mock.pollVotes;
}
function mockListen(emit) {
  mockSubs.add(emit);
  emit();
  return () => mockSubs.delete(emit);
}
function mockNotify() {
  mockSubs.forEach((fn) => fn());
}

// ── 투표 ──

// [교사] 투표 열기 — 열려 있던 투표를 닫고 새것을 엽니다(한 번에 하나).
// 닫기와 열기를 한 묶음으로 써서 둘 중 하나만 된 상태가 남지 않게 합니다.
export async function createPoll(classId, { kind, title, options }) {
  const clean = {
    kind: pollKindOf(kind),
    title: String(title ?? "").trim().slice(0, POLL_TITLE_MAX),
    options: buildPollOptions(options),
  };
  if (!classId || !clean.title) throw new Error("물음을 적어 주세요.");
  const problem = pollOptionsProblem(options);
  if (problem) throw new Error(problem);
  const byUid = getCurrentUser()?.uid ?? null;
  const base = { classId, ...clean, byUid, open: true, shared: false, results: {}, voters: 0, closedAt: null, sharedAt: null };
  if (isFirebaseConfigured) {
    const openSnap = await getDocs(query(pollsCol(classId), where("open", "==", true)));
    const batch = writeBatch(db);
    openSnap.docs.forEach((d) => batch.update(d.ref, { open: false, closedAt: serverTimestamp() }));
    const ref = doc(pollsCol(classId));
    batch.set(ref, { ...base, createdAt: serverTimestamp() });
    await batch.commit();
    return ref.id;
  }
  const list = mockPolls();
  const now = new Date();
  list.filter((p) => p.classId === classId && p.open).forEach((p) =>
    replaceDoc(list, p, { open: false, closedAt: now })
  );
  const id = `poll${nextMockSeq()}_m`;
  list.push({ id, ...base, createdAt: now });
  mockNotify();
  return id;
}

async function patchPoll(classId, pollId, patch, stampKeys = []) {
  if (!classId || !pollId) return;
  if (isFirebaseConfigured) {
    const data = { ...patch };
    stampKeys.forEach((k) => { data[k] = serverTimestamp(); });
    await updateDoc(pollRef(classId, pollId), data);
    return;
  }
  const list = mockPolls();
  const p = list.find((x) => x.id === pollId);
  if (p) {
    const data = { ...patch };
    stampKeys.forEach((k) => { data[k] = new Date(); });
    replaceDoc(list, p, data);
  }
  mockNotify();
}

// [교사] 투표 마치기 — 더는 못 고릅니다. 공유한 결과는 그대로 남습니다.
// 마칠 때의 수를 함께 적어 두면, 공유하지 않은 채 마쳤다가 나중에 공유해도
// 마지막 수가 그대로입니다.
export function closePoll(classId, pollId, tally = null) {
  const patch = { open: false };
  if (tally) Object.assign(patch, { results: tally.counts, voters: tally.voters });
  return patchPoll(classId, pollId, patch, ["closedAt"]);
}

// [교사] 결과 공유 — 지금 센 수를 적고 학생에게 엽니다. 거두면 학생 화면에서
// 막대가 사라집니다(적어 둔 수는 그대로 — 다시 공유할 때 새로 셉니다).
export function sharePollResults(classId, pollId, tally) {
  return patchPoll(classId, pollId, { shared: true, results: tally.counts, voters: tally.voters }, ["sharedAt"]);
}
export function unsharePollResults(classId, pollId) {
  return patchPoll(classId, pollId, { shared: false });
}
// [교사] 공유한 채 표가 바뀌면 — 교사 화면이 다시 센 수를 적습니다.
export function syncPollResults(classId, pollId, tally) {
  return patchPoll(classId, pollId, { results: tally.counts, voters: tally.voters });
}

// [교사] 지우기 — 표(하위 컬렉션)도 한 묶음으로 함께. 안 지우면 주인 없는 표가
// 반 아래에 남습니다(Firestore는 하위 컬렉션을 함께 지우지 않습니다).
export async function deletePoll(classId, pollId) {
  if (!classId || !pollId) return;
  if (isFirebaseConfigured) {
    const votes = await getDocs(votesCol(classId, pollId));
    const batch = writeBatch(db);
    votes.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(pollRef(classId, pollId));
    await batch.commit();
    return;
  }
  const list = mockPolls();
  const i = list.findIndex((p) => p.id === pollId);
  if (i >= 0) list.splice(i, 1);
  const votes = mockVotes();
  for (let j = votes.length - 1; j >= 0; j--) {
    if (votes[j].classId === classId && votes[j].pollId === pollId) votes.splice(j, 1);
  }
  mockNotify();
}

// [학생 · 교사] 이 반의 최근 투표(최근 것이 위). 학생은 그 안에서 열린 것 ·
// 공유된 것을, 교사는 목록 전부를 씁니다.
export function subscribePolls(classId, callback, max = 20) {
  if (!classId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      query(pollsCol(classId), orderBy("createdAt", "desc"), qLimit(max)),
      (snap) => callback(sortPolls(rows(snap))),
      (e) => { console.warn("[투표] 투표 목록을 읽지 못했어요:", e?.code, e?.message); callback([]); }
    );
  }
  return mockListen(() =>
    callback(sortPolls(mockPolls().filter((p) => p.classId === classId)).slice(0, max))
  );
}

// ── 표 ──

// [교사] 한 투표의 표 전부.
export function subscribePollVotes(classId, pollId, callback) {
  if (!classId || !pollId) { callback([]); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      votesCol(classId, pollId),
      (snap) => callback(rows(snap)),
      (e) => { console.warn("[투표] 표를 읽지 못했어요:", e?.code, e?.message); callback([]); }
    );
  }
  return mockListen(() =>
    callback(mockVotes().filter((v) => v.classId === classId && v.pollId === pollId))
  );
}

// [학생] 내 표 한 장(없으면 null).
export function subscribeMyPollVote(classId, pollId, uid, callback) {
  if (!classId || !pollId || !uid) { callback(null); return () => {}; }
  if (isFirebaseConfigured) {
    return onSnapshot(
      voteRef(classId, pollId, uid),
      (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (e) => { console.warn("[투표] 내 표를 읽지 못했어요:", e?.code, e?.message); callback(null); }
    );
  }
  return mockListen(() =>
    callback(mockVotes().find((v) => v.classId === classId && v.pollId === pollId && v.uid === uid) ?? null)
  );
}

// [학생] 투표하기 — 처음이면 새로, 열려 있는 동안은 다시 골라 바꿉니다
// (같은 문서를 통째로 덮어씀). 규칙이 '열린 투표 · 제 자리 · 고른 수'를 봅니다.
export async function submitPollVote(classId, poll, uid, picks) {
  if (!classId || !poll?.id || !uid) return;
  const clean = cleanPicks(poll, picks);
  if (!clean.length) throw new Error("항목을 골라 주세요.");
  const data = { classId, pollId: poll.id, uid, picks: clean };
  if (isFirebaseConfigured) {
    await setDoc(voteRef(classId, poll.id, uid), { ...data, at: serverTimestamp() });
    return;
  }
  const list = mockVotes();
  const mine = list.find((v) => v.classId === classId && v.pollId === poll.id && v.uid === uid);
  if (mine) replaceDoc(list, mine, { ...data, at: new Date() });
  else list.push({ id: uid, ...data, at: new Date() });
  mockNotify();
}
