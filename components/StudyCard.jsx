"use client";

import { formatTime } from "@/lib/store";
import { stripHtml } from "@/lib/html";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

export default function StudyCard({ card, onClick, isTeacher = false }) {
  const isTeacherCard = card.authorId?.startsWith?.("teacher_");
  const preview = stripHtml(card.content ?? "").slice(0, 120);
  const attachCount = card.attachments?.length ?? 0;
  const thumbAtt = card.attachments?.find((a) => IMAGE_EXTS.has(a.ext));

  return (
    <article
      className="study-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      <div className="study-card-head">
        <span className="avatar avatar-sm" aria-hidden="true">
          {card.authorEmoji ?? (isTeacherCard ? "🧑‍🏫" : "🙂")}
        </span>
        <div className="study-card-author">
          {isTeacher && !isTeacherCard && card.authorStudentId ? (
            <>
              <span className="study-card-studentid">{card.authorStudentId}</span>
              <strong>{card.authorRealName || card.authorName}</strong>
            </>
          ) : (
            <strong>{card.authorRealName || card.authorName}</strong>
          )}
        </div>
        {attachCount > 0 && (
          <span className="study-card-attach-count" aria-label={`첨부 파일 ${attachCount}개`}>
            📎{attachCount}
          </span>
        )}
        <time className="study-card-time">{formatTime(card.createdAt)}</time>
      </div>

      {card.title && <p className="study-card-title">{card.title}</p>}

      {/* 이미지 첨부가 있으면 full-width 썸네일, 없으면 invisible 텍스트로 높이 유지 */}
      {thumbAtt ? (
        <div className="study-card-thumb-wrap">
          <img className="study-card-thumb" src={thumbAtt.dataUrl} alt="" aria-hidden="true" />
        </div>
      ) : (
        <p className="study-card-preview" aria-hidden="true">{preview}</p>
      )}
    </article>
  );
}
