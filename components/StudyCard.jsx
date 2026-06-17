"use client";

// =============================================================
// 공부방 카드 — 한 학생(또는 교사)의 결과물 한 장.
// -------------------------------------------------------------
// · 작성자 프로필(실명 기본 표시 — 수업 결과물 맥락)
// · 본문(서식) + 첨부 이미지
// · 본인 카드(또는 교사)면 수정/삭제
// · 보드에 연계 키워드가 있고 본인 카드면:
//     "질문하기"(연계 키워드로 새 질문) + "관련 질문"(아코디언) 노출
// =============================================================
import { useState } from "react";
import { formatTime } from "@/lib/store";
import { stripHtml } from "@/lib/html";

export default function StudyCard({
  card,
  board,
  mine,
  canEdit,
  relatedQuestions = [],
  onEdit,
  onDelete,
  onAsk,
  onOpenQuestion,
}) {
  const [showRelated, setShowRelated] = useState(false);
  const linked = !!board.keyword;
  const isTeacherCard = card.authorId?.startsWith?.("teacher_");

  return (
    <article className="study-card">
      <div className="study-card-head">
        <span className="avatar avatar-sm" aria-hidden="true">
          {card.authorEmoji ?? (isTeacherCard ? "🧑‍🏫" : "🙂")}
        </span>
        {/* 수업 결과물이므로 실명을 기본 표시합니다 */}
        <strong className="study-card-author">
          {card.authorRealName || card.authorName}
        </strong>
        <time>{formatTime(card.createdAt)}</time>
      </div>

      <div
        className="study-card-body"
        dangerouslySetInnerHTML={{ __html: card.content }}
      />
      {card.imageUrl && (
        <img src={card.imageUrl} alt="첨부 이미지" className="study-card-image" />
      )}

      {(canEdit || (mine && linked)) && (
        <div className="study-card-foot">
          {mine && linked && (
            <>
              <button className="study-chip" onClick={() => onAsk?.(board.keyword)}>
                ❓ 질문하기
              </button>
              <button
                className={`study-chip ${showRelated ? "open" : ""}`}
                onClick={() => setShowRelated((v) => !v)}
                aria-expanded={showRelated}
              >
                🔗 관련 질문 {relatedQuestions.length > 0 && `(${relatedQuestions.length})`}
              </button>
            </>
          )}
          {canEdit && (
            <span className="study-card-manage">
              <button className="study-chip ghost" onClick={() => onEdit?.(card)}>
                수정
              </button>
              <button className="study-chip ghost" onClick={() => onDelete?.(card)}>
                삭제
              </button>
            </span>
          )}
        </div>
      )}

      {/* 관련 질문 아코디언 — 보드 키워드와 같은 키워드의 질문들 */}
      {mine && linked && showRelated && (
        <div className="study-related">
          {relatedQuestions.length === 0 ? (
            <p className="study-related-empty">
              아직 # {board.keyword} 키워드의 질문이 없어요. “질문하기”로
              막힌 점을 올려 보세요.
            </p>
          ) : (
            relatedQuestions.map((q) => (
              <button
                key={q.id}
                className="study-related-item"
                onClick={() => onOpenQuestion?.(q.id)}
              >
                <span className={`mini-status ${q.resolved ? "done" : "open"}`}>
                  {q.resolved ? "✅" : "🙋"}
                </span>
                <span className="study-related-title">{q.title}</span>
                <span className="study-related-preview">
                  {stripHtml(q.content)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </article>
  );
}
