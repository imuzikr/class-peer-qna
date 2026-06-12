"use client";

// 2단: 질문 카드 — 내용 일부만 미리 보여주고, 클릭하면 상세 모달이 열립니다.
// 오른쪽 위의 상태 토글(🙋 궁금해요 / ✅ 해결됐어요)을 누르면
// 카드를 열지 않고도 해결 상태를 전환할 수 있습니다.
import { formatTime, setQuestionResolved } from "@/lib/store";
import { stripHtml } from "@/lib/html";

export default function QuestionCard({ question, onClick }) {
  const resolved = !!question.resolved;

  function toggleResolved(e) {
    e.stopPropagation(); // 카드 클릭(모달 열기)으로 번지지 않도록
    setQuestionResolved(question.id, !resolved);
  }

  return (
    <article
      className={`question-card ${resolved ? "is-resolved" : ""}`}
      onClick={onClick}
    >
      <div className="card-meta">
        <span className="keyword-chip"># {question.keyword}</span>
        <span>{question.authorName}</span>
        <span>·</span>
        <time>{formatTime(question.createdAt)}</time>
        <button
          type="button"
          className={`status-toggle ${resolved ? "resolved" : "open"}`}
          onClick={toggleResolved}
          title="클릭해서 상태 바꾸기"
        >
          {resolved ? "✅ 해결됐어요" : "🙋 궁금해요"}
        </button>
      </div>
      <h3>{question.title}</h3>
      {/* 서식 태그를 제거한 순수 텍스트로 미리보기 */}
      <p className="card-preview">{stripHtml(question.content)}</p>
      {question.imageUrl && (
        <img
          src={question.imageUrl}
          alt="첨부 이미지 미리보기"
          className="card-thumb"
        />
      )}
      <div className="card-foot">
        💬 답변 {question.answerCount ?? 0}개
        {question.imageUrl && <span style={{ marginLeft: 8 }}>📎 이미지</span>}
      </div>
    </article>
  );
}
