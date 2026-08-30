"use client";

// =============================================================
// 오늘 받은 과일 수 — 자리표 뱃지용
// -------------------------------------------------------------
// 자리표는 세 화면(공부방 '멋진 순간', 수업하기 자리표, 손들기 자리 확인)이
// 같은 SeatCell을 씁니다. 뱃지 숫자를 각 화면이 따로 계산하면 기준이
// 갈라지므로(어제 것까지 세는 화면이 하나 생기는 식) 여기 한 곳에 둡니다.
//
// 누적 총계(rewards.count)와 섞지 않는 것이 요점입니다. 총계는 과일 주기
// 모달이 '지금 몇 개'를 보여주고 ±1을 계산하는 데 그대로 씁니다 — 뱃지가
// 오늘 것으로 바뀌었다고 총계까지 오늘 것으로 바꾸면, 과일을 한 번 줄 때
// 누적이 오늘 값으로 덮여 지난 기록이 날아갑니다.
//
// 회수(delta 음수)도 그대로 더합니다. 오늘 주고 오늘 도로 거뒀으면 0이
// 되는 것이 맞고, 0이면 뱃지를 달지 않습니다(SeatCell).
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeTodayRewardEvents, todayDateKey } from "@/lib/store";

export function useTodayRewardCounts(classId) {
  const [events, setEvents] = useState([]);
  // 날짜가 바뀌면(자정을 넘겨 화면을 켜 둔 경우) 다시 구독해 0에서 시작합니다.
  const today = todayDateKey();

  useEffect(() => {
    if (!classId) {
      setEvents([]);
      return;
    }
    return subscribeTodayRewardEvents(classId, setEvents);
  }, [classId, today]);

  return useMemo(() => {
    const map = new Map();
    events.forEach((e) => {
      const n = typeof e.delta === "number" ? e.delta : 0;
      map.set(e.uid, (map.get(e.uid) ?? 0) + n);
    });
    return map;
  }, [events]);
}
