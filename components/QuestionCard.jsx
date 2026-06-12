"use client";

// 2단: 질문 카드 — 내용 일부만 미리 보여주고, 클릭하면 상세 모달이 열립니다.
// 오른쪽 위의 상태 토글(🙋 궁금해요 / ✅ 해결됐어요)을 누르면
// 카드를 열지 않고도 해결 상태를 전환할 수 있습니다.
import { formatTime, setQuestionResolved } from "@/lib/store";
import { stripHtml } from "@/lib/html";
import MeTooButton from "./MeTooButton";
import AuthorBadge from "./AuthorBadge";

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
        {/* 작성자 프로필 — 관리자는 클릭해서 실명 확인 가능 */}
        <AuthorBadge
          name={question.authorName}
          emoji={question.authorEmoji}
          realName={question.authorRealName}
          uid={question.authorId}
        />
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
      {/* 본문(왼쪽) + 첨부/그리기 이미지 섬네일(오른쪽) */}
      <div className="card-body">
        <div className="card-main">
          <h3>{question.title}</h3>
          {/* 서식 태그를 제거한 순수 텍스트로 미리보기 */}
          <p className="card-preview">{stripHtml(question.content)}</p>
        </div>
        {question.imageUrl && (
          <img
            src={question.imageUrl}
            alt="첨부 이미지 미리보기"
            className="card-thumb"
          />
        )}
      </div>
      <div className="card-foot">
        <span>
          💬 답변 {question.answerCount ?? 0}개
          {question.imageUrl && (
            <span style={{ marginLeft: 8 }}>📎 이미지</span>
          )}
        </span>
        {/* 카드 오른쪽 아래 — 모달을 열지 않고도 누를 수 있습니다 */}
        <MeTooButton question={question} />
      </div>
    </article>
  );
}
