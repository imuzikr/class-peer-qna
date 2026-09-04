"use client";

// =============================================================
// 모둠 고르기 (학생) — '자유 구성'으로 연 곁텍스트 읽기·RAFT 글쓰기
// -------------------------------------------------------------
// 자유 구성은 학생이 직접 모둠에 들어가는 방식입니다. 닿소리에서는 모둠
// 카드 격자가 그 일을 하는데(BookGroupBoard), 이 두 활동은 활동을 열면
// 곧바로 자기 글 화면이라 들어갈 자리가 없었습니다.
//
// 그래서 글 화면 맨 위에 한 줄로 둡니다 — 모둠에 들기 전에도 글은 쓸 수
// 있고(글은 어차피 각자 한 장), 모둠에 들면 이 줄이 모둠원 명단으로
// 바뀝니다. '고르기 전에는 아무것도 못 한다'로 만들지 않으려고요.
// =============================================================
import { useState } from "react";
import { joinBookGroup } from "@/lib/store";
import { IconGroup } from "./StatusIcons";

export default function GroupJoinRow({ activity, groups = [], user, maxPerGroup = 6 }) {
  const [busy, setBusy] = useState(null);
  if (!user || groups.length === 0) return null;

  async function join(g) {
    setBusy(g.id);
    try {
      await joinBookGroup(activity.id, g.id, user);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mates-row mates-row--join">
      <span className="mates-label"><IconGroup size={15} /> 모둠 고르기</span>
      <div className="mates-chips">
        {groups.map((g) => {
          const n = (g.members ?? []).length;
          const full = n >= maxPerGroup;
          return (
            <button
              key={g.id}
              type="button"
              className="mates-chip mates-chip--join"
              onClick={() => join(g)}
              disabled={full || busy === g.id}
              title={
                full
                  ? "이 모둠은 자리가 찼어요"
                  : `${g.groupName || `${g.groupIndex}모둠`}에 들어갑니다`
              }
            >
              {g.groupName || `${g.groupIndex}모둠`}
              <em>
                {n}/{maxPerGroup}
              </em>
            </button>
          );
        })}
      </div>
      <span className="mates-hint">함께할 모둠을 골라 주세요. 먼저 써도 괜찮아요.</span>
    </div>
  );
}
