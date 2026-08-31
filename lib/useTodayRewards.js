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

  return useMemo(() => netRewardsByUid(events), [events]);
}

// 지급 이력 → uid별 '오늘 순증'(회수 뺀 값).
//
// '오늘' 패널(StudyTodayFeed)도 이 함수를 씁니다 — 예전엔 그쪽이 따로 세면서
// 회수 건을 통째로 건너뛰어(격려의 자리가 아니라는 이유로), 같은 화면에서
// 자리표는 2개인데 패널은 3개로 보이는 학생이 생겼습니다. 흐름에 회수 줄을
// 띄우지 않는 것과, 합계에서 회수를 빼지 않는 것은 다른 이야기입니다.
export function netRewardsByUid(events) {
  const map = new Map();
  (events ?? []).forEach((e) => {
    const n = typeof e.delta === "number" ? e.delta : 0;
    map.set(e.uid, (map.get(e.uid) ?? 0) + n);
  });
  return map;
}
