"use client";

// =============================================================
// 과일 아이콘 나열 — 고정 순서(10종)로 그립니다.
// 20개(REWARD_STAR)가 차면 별(⭐) 하나로 접어 아바타 옆 뱃지로 표시하고,
// 과일 뱃지는 나머지(count % 20)부터 새로 시작합니다.
// (멋진 순간 패널·발표 모드·대시보드 공통)
// =============================================================
import { REWARD_STAR } from "@/lib/store";

export const FRUITS = ["🍎", "🍊", "🍋", "🍇", "🍓", "🍑", "🍈", "🍉", "🍒", "🥝"];

// **다음에 더해질 과일**. 주는 단추가 늘 사과였더니, 화면에는 열 가지가
// 줄지어 있는데 누르는 자리만 사과라 '사과를 준다'로 읽혔습니다. 지금 개수를
// 넣으면 이 다음에 붙을 과일이 나옵니다 — 위의 나열과 순서가 같아야 하므로
// 여기 한 곳에서만 셉니다(RewardFruits가 i번째를 FRUITS[i % 10]으로 그리니,
// count개를 가진 사람의 다음 과일은 FRUITS[count % 10]입니다).
// 별로 접히는 20개 주기와도 어긋나지 않습니다 — (count % 20) % 10 === count % 10.
export function nextFruit(count = 0) {
  const n = FRUITS.length;
  return FRUITS[(((count || 0) % n) + n) % n];
}
// **방금 준 과일** — 빼기 단추가 없앨 것입니다.
// 하나도 없으면 뺄 것이 없으므로(그때 빼기 단추는 꺼져 있습니다) 첫 과일을
// 그대로 돌려줍니다. 음수로 되돌아 가면 🥝(열째)가 나와, 아무 관계 없는
// 과일이 꺼진 단추에 붙어 '왜 키위지?' 하게 됩니다.
export function lastFruit(count = 0) {
  return nextFruit(Math.max(1, count || 0) - 1);
}

// count → 별 개수 (과일 20개 = ⭐ 1개)
export function rewardStars(count = 0) {
  return Math.floor((count || 0) / REWARD_STAR);
}

export default function RewardFruits({ count = 0, className = "reward-fruits" }) {
  const rest = (count || 0) % REWARD_STAR; // 별로 접힌 뒤 남은 과일만 표시
  if (rest <= 0) return null;
  return (
    <div className={className} aria-label={`과일 ${count}개`}>
      {Array.from({ length: rest }).map((_, i) => (
        <span key={i} className="reward-fruit">
          {FRUITS[i % FRUITS.length]}
        </span>
      ))}
    </div>
  );
}
