"use client";

// =============================================================
// 공부방 오른쪽 "참여 보상" 패널 (교사 전용)
// -------------------------------------------------------------
// · 반에 입장한 학생 명단을 리스트로 보여 줍니다.
// · 각 행 오른쪽 끝의 + 버튼을 누르면 과일이 하나씩 추가됩니다.
//   과일은 아래 FRUITS 순서대로 채워지고, 10개가 차면 같은 순서를 반복해
//   최대 20개까지 표시됩니다(2줄 × 10개 그리드).
// · 실수 정정용으로 − 버튼도 제공합니다(과일이 있을 때만).
// · 실명이 보이므로 이 패널은 교사만 사용합니다(익명성 유지).
// =============================================================
import { useState } from "react";
import { REWARD_MAX } from "@/lib/store";
import StudentNotesModal from "./StudentNotesModal";
import RewardFruits from "./RewardFruits";

export default function StudyRewardPanel({ roster = [], onAward, classId = null }) {
  const [notesFor, setNotesFor] = useState(null); // 누가기록 모달 대상 학생

  return (
    <aside className="reward-panel" aria-label="멋진 순간">
      <div className="reward-head">
        <span className="reward-title">🍎 멋진 순간</span>
        <span className="reward-sub">＋로 과일을 주세요 · 최대 {REWARD_MAX}개</span>
      </div>

      {roster.length === 0 ? (
        <p className="reward-empty">
          아직 이 반에 입장한 학생이 없어요. 입장 코드를 알려 주세요.
        </p>
      ) : (
        <ul className="reward-list">
          {roster.map((s) => (
            <li key={s.uid} className="reward-row">
              <div className="reward-row-top">
                <span className="reward-avatar" aria-hidden="true">{s.emoji}</span>
                <span className="reward-name" title={s.name}>{s.name}</span>
                <button
                  type="button"
                  className="reward-note-btn"
                  onClick={() => setNotesFor(s)}
                  title={`${s.name} 누가기록`}
                  aria-label={`${s.name} 누가기록`}
                >
                  💬
                </button>
                <span className="reward-count">{s.count}</span>
                <span className="reward-actions">
                  {s.count > 0 && (
                    <button
                      type="button"
                      className="reward-btn reward-minus"
                      onClick={() => onAward(s.uid, s.count - 1)}
                      aria-label={`${s.name} 과일 빼기`}
                    >
                      −
                    </button>
                  )}
                  <button
                    type="button"
                    className="reward-btn reward-plus"
                    onClick={() => onAward(s.uid, Math.min(REWARD_MAX, s.count + 1))}
                    disabled={s.count >= REWARD_MAX}
                    aria-label={`${s.name} 과일 주기`}
                  >
                    ＋
                  </button>
                </span>
              </div>

              <RewardFruits count={s.count} />
            </li>
          ))}
        </ul>
      )}

      {notesFor && (
        <StudentNotesModal
          student={notesFor}
          classId={classId}
          onClose={() => setNotesFor(null)}
        />
      )}
    </aside>
  );
}
