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
import { IconAsk, IconSolved, IconTrash, IconTeacher } from "./StatusIcons";

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

  const activities = board.activities ?? [];
  const isActivityCard = isNew && activities.length > 0;

  const [title, setTitle] = useState(isNew ? "" : (card.title ?? ""));
  const [content, setContent] = useState(isNew ? "" : (card.content ?? ""));
  const [imageUrl, setImageUrl] = useState(isNew ? null : (card.imageUrl ?? null));
  const [attachments, setAttachments] = useState(isNew ? [] : (card.attachments ?? []));
  const [activityTitles, setActivityTitles] = useState(() => activities.map((a) => a));
  const [activityContents, setActivityContents] = useState(() => activities.map(() => ""));
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
  const FILE_EXTS = {
    html: "HTML", htm: "HTML", txt: "TXT", csv: "CSV",
    xlsx: "XLSX", xls: "XLS", py: "PY",
    jpg: "JPG", jpeg: "JPG", png: "PNG", gif: "GIF", webp: "WEBP",
  };
  const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
  const MAX_FILE_BYTES = 200 * 1024;         // 200KB (텍스트/코드 계열)
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // 5MB (이미지는 압축 후 저장)
  const MAX_ATTACH_COUNT = 3;

  async function handleFileAttach(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!FILE_EXTS[ext]) {
      alert("HTML, TXT, CSV, Excel, Python, 이미지(JPG/PNG/GIF/WEBP) 파일만 첨부할 수 있습니다.");
      return;
    }
    const isImage = IMAGE_EXTS.has(ext);
    if (file.size > (isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES)) {
      alert(isImage
        ? `이미지 파일은 5MB 이하여야 합니다. (현재: ${(file.size / 1024 / 1024).toFixed(1)}MB)`
        : `파일 크기는 200KB 이하여야 합니다. (현재: ${Math.round(file.size / 1024)}KB)`
      );
      return;
    }
    if (attachments.length >= MAX_ATTACH_COUNT) {
      alert(`파일은 최대 ${MAX_ATTACH_COUNT}개까지 첨부할 수 있습니다.`);
      return;
    }
    // 이미지는 자동 압축(900px JPEG 80%), 그 외는 원본 그대로
    const dataUrl = isImage
      ? await readImageAsDataUrl(file)
      : await readFileAsDataUrl(file);
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
    let htmlToSave, titleToSave;

    if (isActivityCard) {
      htmlToSave = activityTitles
        .map((t, i) => {
          const c = sanitizeHtml(activityContents[i]);
          return `<div class="activity-section"><h4 class="activity-title">${t}</h4>${c}</div>`;
        })
        .join("");
      titleToSave = "";
      const hasContent = activityContents.some(
        (c) => stripHtml(sanitizeHtml(c)).trim().length > 0
      );
      if (!hasContent && !imageUrl && attachments.length === 0) return;
    } else {
      htmlToSave = sanitizeHtml(content);
      titleToSave = title.trim();
      if (stripHtml(htmlToSave).length === 0 && !imageUrl && attachments.length === 0) return;
    }

    setSaving(true);
    try {
      if (isNew) {
        await addStudyCard(getCurrentUser(), board.id, { title: titleToSave, content: htmlToSave, imageUrl, attachments });
      } else {
        await updateStudyCard(board.id, card.id, { title: titleToSave, content: htmlToSave, imageUrl, attachments });
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
              {isTeacherCard ? <IconTeacher size={22} /> : (card.authorEmoji ?? "🙂")}
            </span>
            <strong>{card.authorRealName || card.authorName}</strong>
            <time className="study-card-meta-time">{formatTime(card.createdAt)}</time>
          </div>
        )}

        {/* 본문 영역 */}
        <div className={`study-card-modal-body${isActivityCard ? " activity-mode" : ""}`}>
          {canEdit ? (
            <>
              {isActivityCard ? (
                /* 활동별 멀티 섹션 폼 — 2개씩 표시, 3개 이상은 스크롤 */
                <div className="activity-form-list">
                  {activities.map((act, i) => (
                    <div key={i} className="activity-form-section">
                      <input
                        type="text"
                        className="study-card-title-input"
                        value={activityTitles[i]}
                        onChange={(e) => {
                          const next = [...activityTitles];
                          next[i] = e.target.value;
                          setActivityTitles(next);
                        }}
                        placeholder={`활동 ${i + 1}`}
                        maxLength={80}
                      />
                      <RichTextEditor
                        variant="full"
                        initialHtml=""
                        onChange={(html) => {
                          setActivityContents((prev) => {
                            const next = [...prev];
                            next[i] = html;
                            return next;
                          });
                        }}
                        placeholder="내용을 입력해 주세요."
                      />
                    </div>
                  ))}
                </div>
              ) : (
                /* 기본 단일 편집 폼 */
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
                </>
              )}

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
                  {mine && (
                    <label className="btn-ghost attach-add-btn" title="HTML, TXT, CSV, Excel, Python 파일 (최대 200KB, 3개)">
                      + 파일 추가
                      <input
                        type="file"
                        accept=".html,.htm,.txt,.csv,.xlsx,.xls,.py,.jpg,.jpeg,.png,.gif,.webp"
                        onChange={handleFileAttach}
                        hidden
                      />
                    </label>
                  )}
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
                        {mine ? (
                          <button
                            type="button"
                            className="attach-file-del"
                            onClick={() => removeAttachment(att.id)}
                            aria-label="삭제"
                          >
                            ✕
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-ghost attach-download-btn"
                            onClick={() => downloadAttachment(att)}
                          >
                            ⬇ 다운로드
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : card ? (
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
          ) : null}
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
                      {q.resolved ? <IconSolved size={20} /> : <IconAsk size={20} />}
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
                    <IconTrash size={16} /> 삭제
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
