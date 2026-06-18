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
import { readImageAsDataUrl, readFileAsDataUrl, formatFileSize } from "@/lib/image";
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
  const [attachments, setAttachments] = useState(isNew ? [] : (card.attachments ?? []));
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

  // 허용 확장자 → 표시용 레이블
  const FILE_EXTS = { html: "HTML", htm: "HTML", txt: "TXT", csv: "CSV", xlsx: "XLSX", xls: "XLS" };
  const MAX_FILE_BYTES = 200 * 1024; // 200KB (base64 후 ~270KB, Firestore 1MB 여유 확보)
  const MAX_ATTACH_COUNT = 3;

  async function handleFileAttach(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!FILE_EXTS[ext]) {
      alert("HTML, TXT, CSV, Excel(.xlsx/.xls) 파일만 첨부할 수 있습니다.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      alert(`파일 크기는 200KB 이하여야 합니다. (현재: ${Math.round(file.size / 1024)}KB)`);
      return;
    }
    if (attachments.length >= MAX_ATTACH_COUNT) {
      alert(`파일은 최대 ${MAX_ATTACH_COUNT}개까지 첨부할 수 있습니다.`);
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setAttachments((prev) => [
      ...prev,
      { id: `f${Date.now()}`, name: file.name, ext, size: file.size, dataUrl },
    ]);
  }

  function removeAttachment(id) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function downloadAttachment(att) {
    const a = document.createElement("a");
    a.href = att.dataUrl;
    a.download = att.name;
    a.click();
  }

  async function handleSave() {
    const html = sanitizeHtml(content);
    if (stripHtml(html).length === 0 && !imageUrl && attachments.length === 0) return;
    setSaving(true);
    try {
      if (isNew) {
        await addStudyCard(getCurrentUser(), board.id, { title: title.trim(), content: html, imageUrl, attachments });
      } else {
        await updateStudyCard(board.id, card.id, { title: title.trim(), content: html, imageUrl, attachments });
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

              {/* 파일 첨부 영역 (편집 모드) */}
              <div className="attach-files-section">
                <div className="attach-files-header">
                  <span className="attach-files-label">📎 파일 첨부</span>
                  <label className="btn-ghost attach-add-btn" title="HTML, TXT, CSV, Excel 파일 (최대 200KB, 3개)">
                    + 파일 추가
                    <input
                      type="file"
                      accept=".html,.htm,.txt,.csv,.xlsx,.xls"
                      onChange={handleFileAttach}
                      hidden
                    />
                  </label>
                </div>
                {attachments.length > 0 && (
                  <ul className="attach-file-list">
                    {attachments.map((att) => (
                      <li key={att.id} className="attach-file-item">
                        <span className={`attach-file-ext ext-${att.ext}`}>
                          {FILE_EXTS[att.ext] ?? att.ext.toUpperCase()}
                        </span>
                        <span className="attach-file-name">{att.name}</span>
                        <span className="attach-file-size">{formatFileSize(att.size)}</span>
                        <button
                          type="button"
                          className="attach-file-del"
                          onClick={() => removeAttachment(att.id)}
                          aria-label="삭제"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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

              {/* 파일 첨부 목록 (읽기 모드) */}
              {(card.attachments?.length ?? 0) > 0 && (
                <div className="attach-files-section">
                  <p className="attach-files-label">📎 첨부 파일</p>
                  <ul className="attach-file-list">
                    {card.attachments.map((att) => (
                      <li key={att.id} className="attach-file-item">
                        <span className={`attach-file-ext ext-${att.ext}`}>
                          {FILE_EXTS[att.ext] ?? att.ext.toUpperCase()}
                        </span>
                        <span className="attach-file-name">{att.name}</span>
                        <span className="attach-file-size">{formatFileSize(att.size)}</span>
                        <button
                          type="button"
                          className="btn-ghost attach-download-btn"
                          onClick={() => downloadAttachment(att)}
                        >
                          ⬇ 다운로드
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
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
