"use client";

// =============================================================
// 투표 — 늘 떠 있는 조각(떠 있는 동그라미 안에 그려 둡니다)
// -------------------------------------------------------------
// 창은 동그라미의 '투표' 행성이 창 이벤트 `poll:open`(POLL_OPEN_EVENT)으로
// 엽니다. 이 조각이 투표 · 표를 늘 들고 있어서:
//  · 학생 — 새 투표가 열리면, 결과가 공유되면 **저마다 한 번** 창을 저절로
//    엽니다(이 기기에 본 표시를 적어 둠 — `poll_seen:{반}:{uid}`). 불은
//    빨강(열린 투표에 아직 안 함) · 초록(공유된 결과를 아직 안 봄)이고,
//    동그라미가 그 불을 행성과 단추에 답니다(onLight).
//  · 교사 — 결과를 공유한 채 투표가 열려 있으면, 표가 바뀔 때마다 센 수를
//    투표 문서에 다시 적습니다(학생은 남의 표를 못 읽어 그 수로만 봅니다).
//    교사 화면이 떠 있는 동안만 따라가므로, 창을 닫아도 앱이 열려 있으면 됩니다.
//
// 읽는 것: 반의 최근 투표(학생 10장 · 교사 20장) + 학생은 지금 투표의 내 표
// 한 장, 교사는 '공유 중이면서 열린' 투표의 표.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  subscribeMyPollVote,
  subscribePollVotes,
  subscribePolls,
  syncPollResults,
} from "@/lib/store";
import {
  currentPoll,
  pollAutoOpenMark,
  pollResultsChanged,
  studentPollLight,
  tallyVotes,
} from "@/lib/poll";
import PollStudentModal from "./PollStudentModal";
import PollTeacherModal from "./PollTeacherModal";

export const POLL_OPEN_EVENT = "poll:open";

const SEEN_MAX = 60;
const seenKey = (classId, uid) => `poll_seen:${classId}:${uid}`;
function readSeen(classId, uid) {
  try {
    const v = JSON.parse(localStorage.getItem(seenKey(classId, uid)) || "[]");
    return new Set(Array.isArray(v) ? v : []);
  } catch { return new Set(); }
}
function writeSeen(classId, uid, set) {
  try {
    localStorage.setItem(seenKey(classId, uid), JSON.stringify([...set].slice(-SEEN_MAX)));
  } catch { /* 막힌 저장소 — 다음에 또 한 번 뜰 뿐 */ }
}

// 본 표시를 더해 적습니다(이미 다 있으면 그대로 — 렌더가 더 돌지 않게).
function addSeen(classId, uid, marks, setSeen) {
  if (!classId || !uid || !marks.length) return;
  setSeen((cur) => {
    if (marks.every((m) => cur.has(m))) return cur;
    const next = new Set(cur);
    marks.forEach((m) => next.add(m));
    writeSeen(classId, uid, next);
    return next;
  });
}

export default function PollCenter({ classId, user, isTeacher, onLight }) {
  const uid = user?.uid ?? null;
  const [polls, setPolls] = useState(null);
  const [mine, setMine] = useState({ for: null, vote: null });
  const [seen, setSeen] = useState(() => new Set());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setPolls(null);
    if (!classId || !uid) return undefined;
    return subscribePolls(classId, setPolls, isTeacher ? 20 : 10);
  }, [classId, uid, isTeacher]);

  useEffect(() => {
    if (!classId || !uid) return;
    setSeen(readSeen(classId, uid));
  }, [classId, uid]);

  // ── 학생 ──
  const poll = useMemo(() => (isTeacher ? null : currentPoll(polls ?? [])), [isTeacher, polls]);
  const pollId = poll?.id ?? null;
  useEffect(() => {
    if (isTeacher || !classId || !uid || !pollId) { setMine({ for: null, vote: null }); return undefined; }
    return subscribeMyPollVote(classId, pollId, uid, (v) => setMine({ for: pollId, vote: v }));
  }, [isTeacher, classId, uid, pollId]);
  const vote = mine.for === pollId ? mine.vote : null;
  const voteLoaded = !pollId || mine.for === pollId;

  // 처음 한 번만 저절로 — 내 표가 도착한 뒤에 판정합니다(이미 투표한 학생에게
  // 새로 고칠 때마다 뜨지 않게).
  useEffect(() => {
    if (isTeacher || polls === null || !voteLoaded || !poll) return;
    const mark = pollAutoOpenMark(poll, vote, seen);
    if (mark) setOpen(true);
  }, [isTeacher, polls, voteLoaded, poll, vote, seen]);

  // 창이 떠 있는 동안 지금 투표는 '본 것'(열린 것 · 공유된 결과 둘 다)
  const pId = poll?.id ?? null;
  const pOpen = !!poll?.open;
  const pShared = !!poll?.shared;
  useEffect(() => {
    if (!open || isTeacher || !pId) return;
    const marks = [];
    if (pOpen) marks.push(`${pId}:open`);
    if (pShared) marks.push(`${pId}:shared`);
    addSeen(classId, uid, marks, setSeen);
  }, [open, isTeacher, pId, pOpen, pShared, classId, uid]);

  const light = isTeacher || !voteLoaded ? null : studentPollLight(poll, vote, seen);
  useEffect(() => {
    onLight?.(light);
  }, [light, onLight]);

  // ── 교사 — 공유한 채 열린 투표의 수를 따라 적기 ──
  const syncTarget = useMemo(
    () => (isTeacher ? (polls ?? []).find((p) => p.open && p.shared) ?? null : null),
    [isTeacher, polls]
  );
  const syncId = syncTarget?.id ?? null;
  const [syncVotes, setSyncVotes] = useState({ for: null, list: [] });
  useEffect(() => {
    if (!isTeacher || !classId || !syncId) { setSyncVotes({ for: null, list: [] }); return undefined; }
    return subscribePollVotes(classId, syncId, (list) => setSyncVotes({ for: syncId, list }));
  }, [isTeacher, classId, syncId]);
  const syncTimer = useRef(null);
  useEffect(() => {
    if (!syncTarget || syncVotes.for !== syncTarget.id) return undefined;
    const tally = tallyVotes(syncTarget, syncVotes.list);
    if (!pollResultsChanged(syncTarget, tally)) return undefined;
    // 표가 몰려 들어올 때 한 번씩만 — 0.8초 모았다가 적습니다.
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      syncPollResults(classId, syncTarget.id, tally).catch((e) =>
        console.warn("[투표] 결과를 다시 적지 못했어요:", e?.code, e?.message)
      );
    }, 800);
    return () => clearTimeout(syncTimer.current);
  }, [classId, syncTarget, syncVotes]);

  // 동그라미의 '투표'가 부르면 엽니다.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(POLL_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(POLL_OPEN_EVENT, onOpen);
  }, []);

  if (!open || !classId || !uid) return null;
  return isTeacher ? (
    <PollTeacherModal classId={classId} onClose={() => setOpen(false)} />
  ) : (
    <PollStudentModal
      classId={classId}
      user={user}
      polls={polls}
      poll={poll}
      vote={vote}
      onClose={() => setOpen(false)}
    />
  );
}
