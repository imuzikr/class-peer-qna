"use client";

import { formatTime } from "@/lib/store";
import { stripHtml } from "@/lib/html";

export default function StudyCard({ card, onClick, isTeacher = false }) {
  const isTeacherCard = card.authorId?.startsWith?.("teacher_");
  const preview = stripHtml(card.content ?? "").slice(0, 120);

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
        <time className="study-card-time">{formatTime(card.createdAt)}</time>
      </div>
      {card.title && <p className="study-card-title">{card.title}</p>}
      {preview && <p className="study-card-preview" aria-hidden="true">{preview}</p>}
    </article>
  );
}
