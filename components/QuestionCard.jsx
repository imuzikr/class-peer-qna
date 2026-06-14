"use client";

// 2단: 질문 카드 — 내용 일부만 미리 보여주고, 클릭하면 상세 모달이 열립니다.
// 상태(🙋 궁금해요 / ✅ 해결됐어요)는 표시 전용 배지입니다.
// 해결 처리는 반드시 상세 모달의 회고 흐름을 거치도록 했기 때문에,
// 카드에서 모달 없이 해결로 바꾸는 동작은 두지 않습니다.
import { formatTime } from "@/lib/store";
import { stripHtml } from "@/lib/html";
import { getCurrentUser, isAdmin } from "@/lib/user";
import { isPinnedQuestion } from "@/lib/questionRanking";
import MeTooButton from "./MeTooButton";
import AuthorBadge from "./AuthorBadge";

export default function QuestionCard({ question, onClick }) {
  const user = getCurrentUser();
  const resolved = !!question.resolved;
  const mine = question.authorId === user.uid;
  const pinned = isPinnedQuestion(question);
  const showPending = question.reflectionPending && (mine || isAdmin(user));

  return (
    <article
      className={`question-card ${resolved ? "is-resolved" : ""} ${
        pinned ? "is-pinned" : ""
      }`}
      onClick={onClick}
    >
      <div className="card-meta">
        <span className="keyword-chip"># {question.keyword}</span>
        {pinned && (
          <span className="pin-chip" title="나도 궁금해요 5회 이상">
            📌 상단 고정
          </span>
        )}
        {/* 작성자 프로필 — 관리자는 클릭해서 실명 확인 가능 */}
        <AuthorBadge
          name={question.authorName}
          emoji={question.authorEmoji}
          realName={question.authorRealName}
          uid={question.authorId}
        />
        <span>·</span>
        <time>{formatTime(question.createdAt)}</time>
        <span
          className={`status-badge ${resolved ? "resolved" : "open"}`}
          title={resolved ? "해결된 질문" : "아직 궁금한 질문"}
        >
          {resolved ? "✅ 해결됐어요" : "🙋 궁금해요"}
        </span>
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
          {/* 회고 대기 배지 — 작성자 본인과 교사에게만 표시됩니다 */}
          {showPending && (
            <span
              className={`reflect-pending-badge ${mine ? "mine" : "teacher"}`}
              title={mine ? "회고를 아직 남기지 않았어요" : "이 학생이 아직 회고를 남기지 않았어요"}
            >
              📝 {mine ? "회고 남기기" : "회고 대기"}
            </span>
          )}
        </span>
        {/* 카드 오른쪽 아래 — 모달을 열지 않고도 누를 수 있습니다 */}
        <MeTooButton question={question} />
      </div>
    </article>
  );
}
