"use client";

// =============================================================
// 공부방 카드 통합 모달 — 읽기 + 수정 + 삭제 + 질문하기 + 관련 질문
// =============================================================
import { useState } from "react";
import {
  addStudyCard,
  updateStudyCard,
  deleteStudyCard,
  formatTime,
} from "@/lib/store";
import { getCurrentUser } from "@/lib/user";
import { sanitizeHtml, stripHtml } from "@/lib/html";
import { readImageAsDataUrl } from "@/lib/image";
import RichTextEditor, { IconImage, IconPen } from "./RichTextEditor";
import DrawingCanvas from "./DrawingCanvas";
import StudyQuestionPeek from "./StudyQuestionPeek";

export default function StudyCardModal({
  board,
  card = null,
  canEdit = false,
  mine = false,
  relatedQuestions = [],
  onClose,
  onAsk,
}) {
  const isNew = card === null;
  const boardKeywords = Array.isArray(board.keywords)
    ? board.keywords
    : board.keyword
    ? [board.keyword]
    : [];
  const linked = boardKeywords.length > 0;
  const isTeacherCard = card?.authorId?.startsWith?.("teacher_");

  const [title, setTitle] = useState(isNew ? "" : (card.title ?? ""));
  const [content, setContent] = useState(isNew ? "" : (card.content ?? ""));
  const [imageUrl, setImageUrl] = useState(isNew ? null : (card.imageUrl ?? null));
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showRelated, setShowRelated] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [peekQuestion, setPeekQuestion] = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 첨부할 수 있습니다.");
      return;
    }
    setImageUrl(await readImageAsDataUrl(file));
    e.target.value = "";
  }

  async function handleSave() {
    const html = sanitizeHtml(content);
    if (stripHtml(html).length === 0 && !imageUrl) return;
    setSaving(true);
    try {
      if (isNew) {
        await addStudyCard(getCurrentUser(), board.id, { title: title.trim(), content: html, imageUrl });
      } else {
        await updateStudyCard(board.id, card.id, { title: title.trim(), content: html, imageUrl });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await deleteStudyCard(board.id, card.id);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-study-card" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="modal-head">
          <h3>
            {isNew
              ? "✏️ 내 카드 작성하기"
              : canEdit
              ? "✏️ 내 카드 수정하기"
              : (card.authorRealName || card.authorName || "카드 보기")}
            <span className="study-form-board"># {board.title}</span>
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        {/* 작성자 정보 (기존 카드일 때) */}
        {!isNew && (
          <div className="study-card-meta">
            <span className="avatar avatar-sm" aria-hidden="true">
              {card.authorEmoji ?? (isTeacherCard ? "🧑‍🏫" : "🙂")}
            </span>
            <strong>{card.authorRealName || card.authorName}</strong>
            <time className="study-card-meta-time">{formatTime(card.createdAt)}</time>
          </div>
        )}

        {/* 본문 영역 */}
        <div className="study-card-modal-body">
          {canEdit ? (
            <>
              <input
                type="text"
                className="study-card-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="제목을 입력하세요"
                maxLength={60}
              />
              <RichTextEditor
                variant="full"
                initialHtml={isNew ? "" : card.content}
                onChange={setContent}
                placeholder="활동 결과물을 자유롭게 작성해 보세요. 글, 코드, 이미지 모두 담을 수 있어요."
              >
                <label className="rte-tool" title="이미지 첨부">
                  <IconImage />
                  <input type="file" accept="image/*" onChange={handleFile} hidden />
                </label>
                <button
                  type="button"
                  className="rte-tool"
                  title="그리기"
                  onClick={() => setDrawing(true)}
                >
                  <IconPen />
                </button>
              </RichTextEditor>

              {imageUrl && (
                <div className="attach-row">
                  <img src={imageUrl} alt="첨부 미리보기" className="attach-preview" />
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setImageUrl(null)}
                  >
                    ✕ 첨부 취소
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {card.title && (
                <h4 className="study-card-read-title">{card.title}</h4>
              )}
              <div
                className="study-card-body"
                dangerouslySetInnerHTML={{ __html: card.content }}
              />
              {card.imageUrl && (
                <img
                  src={card.imageUrl}
                  alt="첨부 이미지"
                  className="study-card-image"
                />
              )}
            </>
          )}
        </div>

        {/* 하단 액션 영역 */}
        <div className="study-card-modal-foot">
          {mine && linked && (
            <div className="study-card-modal-links">
              <button
                className="study-chip"
                onClick={() => onAsk?.(boardKeywords[0] ?? null)}
              >
                ❓ 질문하기
              </button>
              <button
                className={`study-chip ${showRelated ? "open" : ""}`}
                onClick={() => setShowRelated((v) => !v)}
                aria-expanded={showRelated}
              >
                🔗 관련 질문{relatedQuestions.length > 0 && ` (${relatedQuestions.length})`}
              </button>
            </div>
          )}

          {mine && linked && showRelated && (
            <div className="study-related study-related-modal">
              {relatedQuestions.length === 0 ? (
                <p className="study-related-empty">
                  아직 #{board.keyword} 키워드의 질문이 없어요. "질문하기"로
                  막힌 점을 올려 보세요.
                </p>
              ) : (
                relatedQuestions.map((q) => (
                  <button
                    key={q.id}
                    className="study-related-item"
                    onClick={() => setPeekQuestion(q)}
                  >
                    <span className={`mini-status ${q.resolved ? "done" : "open"}`}>
                      {q.resolved ? "✅" : "🙋"}
                    </span>
                    <span className="study-related-title">{q.title}</span>
                    <span className="study-related-preview">
                      {q.content?.replace(/<[^>]*>/g, "").slice(0, 60)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {canEdit && (
            <div className="study-card-modal-save-row">
              {!isNew && (
                confirmDelete ? (
                  <div className="study-delete-confirm">
                    <span className="study-delete-warn">
                      ⚠️ 이 카드는 삭제 후 복구할 수 없습니다.
                    </span>
                    <button className="study-chip danger" onClick={handleDelete}>
                      정말 삭제
                    </button>
                    <button className="study-chip ghost" onClick={() => setConfirmDelete(false)}>
                      취소
                    </button>
                  </div>
                ) : (
                  <button className="btn-primary" onClick={() => setConfirmDelete(true)}>
                    🗑 삭제
                  </button>
                )
              )}
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          )}
        </div>
      </div>

      {drawing && (
        <DrawingCanvas
          onSave={(dataUrl) => setImageUrl(dataUrl)}
          onClose={() => setDrawing(false)}
        />
      )}

      {peekQuestion && (
        <StudyQuestionPeek
          question={peekQuestion}
          onClose={() => { setPeekQuestion(null); setShowRelated(false); }}
          onBackToList={() => { setPeekQuestion(null); setShowRelated(true); }}
        />
      )}
    </div>
  );
}
