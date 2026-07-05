"use client";

// =============================================================
// 공부방 카드 통합 모달 — 읽기 + 수정 + 삭제 + 질문하기 + 관련 질문
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useState } from "react";
import {
  addStudyCard,
  updateStudyCard,
  deleteStudyCard,
  formatTime,
  getDirectoryRealName,
} from "@/lib/store";
import { getCurrentUser, isAdmin } from "@/lib/user";
import { sanitizeHtml, stripHtml } from "@/lib/html";
import { formatFileSize } from "@/lib/image";
import { uploadImage, uploadFile, uploadDataUrl } from "@/lib/storageUpload";
import dynamic from "next/dynamic";
import RichTextEditor, { IconImage, IconPen } from "./RichTextEditor";

// 그리기 캔버스는 무거워 열 때만 로딩
const DrawingCanvas = dynamic(() => import("./DrawingCanvas"), { ssr: false });
import StudyQuestionPeek from "./StudyQuestionPeek";
import ZoomableImage from "./ZoomableImage";
import UploadProgress from "./UploadProgress";
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
  const isTeacherCard =
    card?.authorId?.startsWith?.("teacher_") || card?.authorName === "선생님";
  // 학생에겐 익명 닉네임만, 교사에겐 디렉터리의 실명을 표시 (교사 카드는 "선생님")
  const cardDisplayName = card
    ? (isAdmin(getCurrentUser()) && !isTeacherCard
        ? getDirectoryRealName(card.authorId)
        : null) || card.authorName
    : "";

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
  const [uploadPct, setUploadPct] = useState(null); // 첨부 업로드 진행률

  // 이미지 첨부 — 예전엔 단일 imageUrl을 계속 교체했지만, 지금은 다른
  // 첨부와 동일하게 attachments 배열에 누적됩니다(업로드 순서대로 표시).
  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 첨부할 수 있습니다.");
      e.target.value = "";
      return;
    }
    if (attachments.length >= MAX_ATTACH_COUNT) {
      alert(`이미지는 최대 ${MAX_ATTACH_COUNT}개까지 첨부할 수 있습니다.`);
      e.target.value = "";
      return;
    }
    const rawExt = (file.name || "").split(".").pop()?.toLowerCase();
    const ext = IMAGE_EXTS.has(rawExt) ? rawExt : "jpg";
    setUploadPct(0);
    try {
      const url = await uploadImage(file, { onProgress: setUploadPct });
      setAttachments((prev) => [
        ...prev,
        { id: `f${Date.now()}`, name: file.name || "image.jpg", ext, size: file.size, dataUrl: url },
      ]);
    } catch {
      alert("이미지 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setUploadPct(null);
    }
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
  const MAX_ATTACH_COUNT = 5;

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
    // 이미지는 압축 후 업로드, 그 외 파일은 원본 업로드 → 다운로드 URL 저장
    let dataUrl;
    setUploadPct(0);
    try {
      dataUrl = isImage
        ? await uploadImage(file, { onProgress: setUploadPct })
        : await uploadFile(file, { onProgress: setUploadPct });
    } catch {
      alert("파일 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
      return;
    } finally {
      setUploadPct(null);
    }
    setAttachments((prev) => [
      ...prev,
      { id: `f${Date.now()}`, name: file.name, ext, size: file.size, dataUrl },
    ]);
  }

  // 그리기 결과는 첨부 이미지(attachments)로 추가 → 위 '이미지 첨부'와 함께 보존됩니다.
  async function handleDrawingSave(dataUrl) {
    if (attachments.length >= MAX_ATTACH_COUNT) {
      alert(`파일은 최대 ${MAX_ATTACH_COUNT}개까지 첨부할 수 있습니다.`);
      return;
    }
    setUploadPct(0);
    try {
      const url = await uploadDataUrl(dataUrl, "drawing.png", { onProgress: setUploadPct });
      setAttachments((prev) => [
        ...prev,
        { id: `f${Date.now()}`, name: "그림.png", ext: "png", size: 0, dataUrl: url },
      ]);
    } catch {
      alert("그림 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setUploadPct(null);
    }
  }

  function removeAttachment(id) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  // 첨부를 두 그룹으로 나눠 보여줍니다: 파일 목록(문서류) + 이미지 그리드(사진·그림).
  // 메인 이미지(imageUrl)와 이미지 첨부를 한 그리드에 합쳐 보여주되,
  // 실제 저장 필드는 그대로(imageUrl/attachments 분리) 유지합니다.
  const fileAttachments = attachments.filter((a) => !IMAGE_EXTS.has(a.ext));
  const imageItems = [
    ...(imageUrl ? [{ id: "__main__", src: imageUrl, isMain: true }] : []),
    ...attachments
      .filter((a) => IMAGE_EXTS.has(a.ext))
      .map((a) => ({ id: a.id, src: a.dataUrl, isMain: false })),
  ];
  const cardFileAttachments = (card?.attachments ?? []).filter((a) => !IMAGE_EXTS.has(a.ext));
  const cardImageItems = [
    ...(card?.imageUrl ? [{ id: "__main__", src: card.imageUrl }] : []),
    ...(card?.attachments ?? [])
      .filter((a) => IMAGE_EXTS.has(a.ext))
      .map((a) => ({ id: a.id, src: a.dataUrl })),
  ];

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
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal modal-study-card" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="modal-head">
          <h3>
            {isNew || canEdit ? (
              <span className="study-form-title-pen">
                <IconPen size={18} /> {isNew ? "내 카드 작성하기" : "내 카드 수정하기"}
              </span>
            ) : (
              cardDisplayName || "카드 보기"
            )}
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
            <strong>{cardDisplayName}</strong>
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

              <UploadProgress pct={uploadPct} />

              {/* 파일 첨부 목록 (문서류만 — 이미지는 아래 그리드로) */}
              <div className="attach-files-section">
                <div className="attach-files-header">
                  <span className="attach-files-label">📎 파일 첨부</span>
                  {mine && (
                    <label className="btn-ghost attach-add-btn" title={`HTML, TXT, CSV, Excel, Python, 이미지 파일 (최대 200KB/5MB, ${MAX_ATTACH_COUNT}개)`}>
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
                {fileAttachments.length > 0 && (
                  <ul className="attach-file-list">
                    {fileAttachments.map((att) => (
                      <li key={att.id} className="attach-file-item">
                        <span className={`attach-file-ext ext-${att.ext}`}>
                          {FILE_EXTS[att.ext] ?? att.ext.toUpperCase()}
                        </span>
                        <span className="attach-file-name">{att.name}</span>
                        <span className="attach-file-size">{formatFileSize(att.size)}</span>
                        {mine && (
                          <button
                            type="button"
                            className="attach-file-del"
                            onClick={() => removeAttachment(att.id)}
                            aria-label="삭제"
                          >
                            ✕
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 이미지·그림 그리드 (2열) — 메인 이미지 + 이미지 첨부를 함께 표시 */}
              {imageItems.length > 0 && (
                <div className="attach-image-grid">
                  {imageItems.map((item) => (
                    <div key={item.id} className="attach-image-cell">
                      <ZoomableImage
                        src={item.src}
                        alt="첨부 이미지"
                        className="attach-image-grid-thumb"
                      />
                      {mine && (
                        <button
                          type="button"
                          className="attach-image-grid-del"
                          onClick={() =>
                            item.isMain ? setImageUrl(null) : removeAttachment(item.id)
                          }
                          aria-label="삭제"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : card ? (
            <>
              {card.title && (
                <h4 className="study-card-read-title">{card.title}</h4>
              )}
              <div
                className="study-card-body"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.content) }}
              />

              {/* 파일 첨부 목록 (읽기 모드, 문서류만) */}
              {cardFileAttachments.length > 0 && (
                <div className="attach-files-section">
                  <p className="attach-files-label">📎 첨부 파일</p>
                  <ul className="attach-file-list">
                    {cardFileAttachments.map((att) => (
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

              {/* 이미지·그림 그리드 (읽기 모드, 2열) */}
              {cardImageItems.length > 0 && (
                <div className="attach-image-grid">
                  {cardImageItems.map((item) => (
                    <div key={item.id} className="attach-image-cell">
                      <ZoomableImage
                        src={item.src}
                        alt="첨부 이미지"
                        className="attach-image-grid-thumb"
                      />
                    </div>
                  ))}
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
          onSave={handleDrawingSave}
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
