"use client";

// =============================================================
// 한 줄 정리(회고) 모달 — "해결됐어요"를 누르는 순간 떠서,
// 질문이 해결된 뒤 바로 끝나지 않고 "내 것으로 만드는" 한 박자를 만듭니다.
// -------------------------------------------------------------
// [설계 의도] 단순히 "이해한 내용을 요약"하라고 하면 답변을 베껴 쓰기
// 쉽습니다(= 지식 축적). 그래서 묻는 것은 정답이 아니라 "이해의 전환점"
// 입니다. 무엇이 막혔는데 어떻게 풀렸는지는 학생 본인만 쓸 수 있는
// 문장이라, 사고와 이해를 되짚는 생성적(generative) 회고가 됩니다.
//   · learned : 막혔던 점이 어떻게 이해됐는지 (사고 과정 / 메타인지)
//   · next    : 아직 더 알고 싶은 점 (선택) — 복습·관련 질문의 씨앗
// 둘 다 비워도 "그냥 해결"할 수 있게 건너뛰기를 둡니다(강요 X).
// =============================================================
import { useState } from "react";
import { addReflection, setQuestionResolved } from "@/lib/store";

export default function ReflectionModal({ question, user, onClose }) {
  const [learned, setLearned] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  // 회고를 저장하고 해결 상태로 전환
  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const l = learned.trim();
      const n = next.trim();
      if (l || n) {
        await addReflection(user, question.id, { learned: l, next: n });
      }
      await setQuestionResolved(question.id, true);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // 회고 없이 해결만 (강요하지 않음)
  async function handleSkip() {
    if (saving) return;
    setSaving(true);
    try {
      await setQuestionResolved(question.id, true);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-reflect"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>🎉 해결됐어요! 잠깐, 내 걸로 만들어 볼까요?</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <p className="reflect-lead">
          정답을 옮겨 적지 않아도 괜찮아요. 친구에게 설명하듯, 어디서 막혔다가
          어떻게 이해됐는지 내 말로 적어 보세요.
        </p>

        <div className="reflect-field">
          <label htmlFor="reflect-learned">
            막혔던 점이 어떻게 이해됐나요?
          </label>
          <textarea
            id="reflect-learned"
            value={learned}
            onChange={(e) => setLearned(e.target.value)}
            placeholder="예: 계수가 음수라 헷갈렸는데, 완전제곱식으로 바꾸면 꼭짓점이 바로 보인다는 걸 알게 됐어요."
            autoFocus
          />
        </div>

        <div className="reflect-field">
          <label htmlFor="reflect-next">
            아직 더 알고 싶은 점이 있나요?{" "}
            <span className="hint">선택 — 다음 학습의 실마리가 돼요</span>
          </label>
          <textarea
            id="reflect-next"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="예: 최솟값일 때도 같은 방법으로 구할 수 있는지 궁금해요."
          />
        </div>

        <div className="reflect-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={handleSkip}
            disabled={saving}
          >
            건너뛰기
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "저장 중..." : "정리하고 해결 완료"}
          </button>
        </div>
      </div>
    </div>
  );
}
