"use client";

// =============================================================
// 책방 모둠 — 여러 활동이 함께 쓰는 작은 도구들
// -------------------------------------------------------------
// 닿소리 채우기만 모둠이 있던 때는 모둠을 다루는 코드가 그 화면 안에만
// 있었습니다. 곁텍스트 읽기·RAFT 글쓰기도 모둠으로 할 수 있게 되면서
// '내 모둠 찾기'와 '모둠 목록 받기'를 세 화면이 함께 쓰게 되어 여기로
// 모았습니다.
//
// **모둠으로 묶여도 글은 학생마다 한 장**입니다(entries/{uid}). 모둠이
// 하는 일은 '누구와 함께 보는가'를 정하는 것 — 화면의 흐름과 동료 평가의
// 범위입니다. 그래서 저장 위치도, 보안 규칙도 그대로입니다.
// =============================================================
import { useEffect, useState } from "react";
import { subscribeBookGroups } from "@/lib/store";

// 모둠으로 진행할 수 있는 활동 종류.
// KWLS·마인드맵은 빠져 있습니다 — 그 둘은 혼자 자기 생각을 정리하는 활동이라
// 모둠으로 묶을 자리가 없습니다(묶어도 화면에서 달라지는 것이 없습니다).
export const BOOK_GROUPABLE_TYPES = ["consonant", "paratext", "raft"];

// 이 활동이 '모둠으로' 진행되는가.
//
// 닿소리는 원래부터 모둠 활동이라 문서에 표시가 없어도 모둠입니다
// (groupMode: 'solo'만 예외 — 그때는 1인 판을 학생마다 하나씩 둡니다).
// 곁텍스트·RAFT는 **`grouped: true`가 찍힌 활동만** 모둠입니다. 예전에
// 만든 활동에는 이 표시가 없어 지금까지처럼 개인 활동으로 열립니다 —
// groupMode 값으로 판정하면 옛 활동이 전부 모둠 활동으로 둔갑합니다
// (만들 때 방식과 상관없이 'teacher'가 적혀 있어서).
export function isGroupedActivity(activity) {
  if (!activity) return false;
  if (activity.type === "consonant") return activity.groupMode !== "solo";
  return activity.grouped === true;
}

// 동료 평가가 지금 열려 있는가.
//
// **표시가 없으면 잠김**입니다. 활동을 만들자마자 열려 있으면 아직 아무도
// 발표하지 않았는데 코멘트가 쌓입니다 — 동료 평가는 '발표를 듣는 시간'에만
// 여는 것이라, 교사가 한 번 눌러 열어야 시작합니다.
// 규칙도 같은 판정입니다(firestore.rules의 peerReviewOpen) — 한쪽만 고치면
// 화면은 쓸 수 있다고 하는데 저장이 거부됩니다.
export function isPeerReviewOpen(activity) {
  return activity?.peerReviewLocked === false;
}

// 모둠 목록 구독 — 모둠 활동일 때만 겁니다(개인 활동은 모둠이 아예 없습니다).
export function useBookGroups(activityId, enabled = true) {
  const [groups, setGroups] = useState([]);
  useEffect(() => {
    if (!enabled || !activityId) {
      setGroups([]);
      return undefined;
    }
    return subscribeBookGroups(activityId, setGroups);
  }, [activityId, enabled]);
  return groups;
}

// 내가 든 모둠 (없으면 null)
export function myBookGroup(groups = [], uid = null) {
  if (!uid) return null;
  return (
    groups.find((g) => (g.memberUids ?? []).includes(uid)) ??
    groups.find((g) => (g.members ?? []).some((m) => m?.uid === uid)) ??
    null
  );
}

// 모둠의 명단 — 지금 반 명단(roster)에 있는 학생만 남깁니다.
// 모둠에 저장된 members는 배정 당시 스냅샷이라, 반에서 빠진 학생이 그대로
// 남아 보였습니다(닿소리 모둠 카드에서 같은 이유로 거르고 있습니다).
export function groupMembers(group, roster = null) {
  const list = group?.members ?? [];
  if (!roster) return list;
  const alive = new Set(roster.map((s) => s.uid));
  return list.filter((m) => m?.uid && alive.has(m.uid));
}
