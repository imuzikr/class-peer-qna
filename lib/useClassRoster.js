"use client";
// =============================================================
// 반 명단 훅 — 소속 구독 + 명단 짓기
// -------------------------------------------------------------
// `subscribeClassMembers`를 거는 effect와 명단을 짓는 useMemo가 화면마다
// 같은 모양으로 되풀이돼 있었습니다(공부방 · 책방 · 손든 학생 자리 확인 ·
// 상단바 반 공지). 명단의 모양은 lib/roster.js가 정합니다.
//
// 디렉터리와 과일은 **받아서** 씁니다 — 페이지마다 이미 다른 데 쓰려고
// 구독해 두고 있어, 훅이 또 구독하면 같은 컬렉션에 리스너가 둘이 됩니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeClassMembers } from "./store";
import { buildClassRoster } from "./roster";

// 그 반 소속 uid 목록. 반이 없거나 `enabled`가 거짓이면 빈 배열.
// 주의: 첫 답이 오기 전에도 빈 배열입니다 — '없다'와 '아직 모른다'를 갈라야
// 하는 자리(빈 값으로 화면을 통째로 바꾸는 곳)에서는 쓰지 마세요.
export function useClassMembers(classId, enabled = true) {
  const [uids, setUids] = useState([]);
  useEffect(() => {
    if (!enabled || !classId) {
      setUids([]);
      return undefined;
    }
    return subscribeClassMembers(classId, setUids);
  }, [classId, enabled]);
  return uids;
}

// { memberUids, roster } — roster는 학번순, 칸마다 { uid, name, studentId,
// emoji, email, count }.
export function useClassRoster(classId, { enabled = true, directory = [], rewards = [] } = {}) {
  const memberUids = useClassMembers(classId, enabled);
  const roster = useMemo(
    () => buildClassRoster(memberUids, directory, rewards),
    [memberUids, directory, rewards]
  );
  return { memberUids, roster };
}
