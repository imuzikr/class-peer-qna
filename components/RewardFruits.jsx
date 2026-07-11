"use client";

// =============================================================
// 과일 아이콘 나열 — 고정 순서(10종)로 count개를 그립니다.
// 10개가 차면 같은 순서를 반복합니다. (멋진 순간 패널·대시보드 공통)
// =============================================================
export const FRUITS = ["🍎", "🍊", "🍋", "🍇", "🍓", "🍑", "🍈", "🍉", "🍒", "🥝"];

export default function RewardFruits({ count = 0, className = "reward-fruits" }) {
  if (count <= 0) return null;
  return (
    <div className={className} aria-label={`과일 ${count}개`}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="reward-fruit">
          {FRUITS[i % FRUITS.length]}
        </span>
      ))}
    </div>
  );
}
