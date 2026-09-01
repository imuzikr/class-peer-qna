"use client";

// =============================================================
// 과일을 받은 순간 알아채기 — 학생 화면의 축포용
// -------------------------------------------------------------
// 총계(rewards/{classId}_{uid})를 구독하다가 값이 **늘어난 순간**만 잡습니다.
//
// [처음 값은 축하하지 않습니다] 화면을 열면 구독이 곧바로 지금 개수를
// 알려 줍니다. 그것은 '지금 받은 것'이 아니라 '이미 갖고 있던 것'이라,
// 그대로 두면 학생이 공부방에 들어올 때마다 축포가 터집니다. 그래서 첫
// 값은 기준점으로만 삼고 지나갑니다(prev === null).
//
// [줄어드는 경우] 교사가 회수하면 값이 줄어드는데, 그때는 아무 일도 하지
// 않고 기준점만 새 값으로 옮깁니다. 회수한 뒤 다시 줄 때 그 차이만큼
// 축하해야 하기 때문입니다.
//
// [반을 옮기면] classId가 바뀌면 기준점을 비웁니다 — 다른 반의 개수와
// 비교하면 엉뚱한 크기의 축포가 터집니다.
// =============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeMyClassRewardCount } from "@/lib/store";

export function useRewardCelebration(classId, uid, enabled = true) {
  const [amount, setAmount] = useState(0); // 방금 늘어난 개수 — 0이면 조용
  const prevRef = useRef(null);

  useEffect(() => {
    prevRef.current = null;
    if (!enabled || !classId || !uid) return;
    return subscribeMyClassRewardCount(classId, uid, (n) => {
      const prev = prevRef.current;
      prevRef.current = n;
      if (prev === null) return; // 처음 받아 온 값 = 기준점
      if (n > prev) setAmount(n - prev);
    });
  }, [enabled, classId, uid]);

  const clear = useCallback(() => setAmount(0), []);
  return [amount, clear];
}
