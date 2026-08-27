"use client";

// =============================================================
// 공부방 — 내 카드 활동 페이지 (개인 활동, 활동이 있는 프로젝트 전용)
// -------------------------------------------------------------
// 예전엔 "내 카드"를 누르면 모든 활동을 모달 하나에 넣고 스크롤하며
// 썼습니다. 책방의 RAFT 글쓰기·곁텍스트 읽기처럼, 모달 대신 상세
// 페이지로 바꿨습니다 — 활동 3~4개가 한 화면에 나란히 카드로 놓이고,
// 각 칸에서 바로 씁니다(따로 눌러 여는 모달 없음).
//
// 저장은 자동입니다(입력을 멈추면 조용히 저장). 활동 없는 프로젝트나
// 모둠 카드, 남의 카드를 보는 경우는 이 페이지를 쓰지 않고 여전히
// StudyCardModal을 씁니다(components/StudyProjectView.jsx의 openSeat 참고).
// =============================================================
import { useEffect, useRef, useState } from "react";
import { addStudyCard, updateStudyCard, deleteStudyCard, formatTime } from "@/lib/store";
import { sanitizeHtml, stripHtml, htmlHasImage } from "@/lib/html";
import { parseActivitySections, isActivityLocked, DONE_MIN_CHARS } from "@/lib/activities";
import { formatFileSize } from "@/lib/image";
import { uploadImage, uploadFile, uploadDataUrl } from "@/lib/storageUpload";
import RichTextEditor from "./RichTextEditor";
import ZoomableImage from "./ZoomableImage";
import UploadProgress from "./UploadProgress";
import StudyQuestionPeek from "./StudyQuestionPeek";
import { IconAsk, IconSolved, IconLock, IconTrash } from "./StatusIcons";

const FILE_EXTS = {
  html: "HTML", htm: "HTML", txt: "TXT", csv: "CSV",
  xlsx: "XLSX", xls: "XLS", py: "PY",
  jpg: "JPG", jpeg: "JPG", png: "PNG", gif: "GIF", webp: "WEBP",
};
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const MAX_FILE_BYTES = 200 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACH_COUNT = 5;

export default function StudyMyActivityCard({
  board,
  user,
  card = null,
  canEdit = false,
  canDelete = false,
  onBack,
  onAsk,
  relatedQuestions = [],
}) {
  const isNew = card === null;
  const activities = board.activities ?? [];
  const boardKeywords = Array.isArray(board.keywords)
    ? board.keywords
    : board.keyword
    ? [board.keyword]
    : [];
  const linked = boardKeywords.length > 0;

  const savedSections = useRef(null);
  if (savedSections.current === null) {
    savedSections.current = isNew ? [] : parseActivitySections(card?.content);
  }
  const [activityContents, setActivityContents] = useState(() =>
    activities.map((_, i) => savedSections.current[i]?.content ?? "")
  );
  const [activityTitles, setActivityTitles] = useState(() =>
    activities.map((a, i) => savedSections.current[i]?.title || a)
  );
  const [imageUrl, setImageUrl] = useState(isNew ? null : (card.imageUrl ?? null));
  const [attachments, setAttachments] = useState(isNew ? [] : (card.attachments ?? []));
  const [uploadPct, setUploadPct] = useState(null);
  const [autoStatus, setAutoStatus] = useState("idle"); // idle | saving | saved | error
  const [showRelated, setShowRelated] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [peekQuestion, setPeekQuestion] = useState(null);

  const cardIdRef = useRef(card?.id ?? null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const dirtyRef = useRef(false);
  const flushRef = useRef(null);
  const idleTimerRef = useRef(null);
  const baselineSigRef = useRef(null);

  function sigOf() {
    return JSON.stringify({ activityContents, activityTitles, imageUrl, attachments });
  }
  function showSavedThenHide() {
    setAutoStatus("saved");
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setAutoStatus("idle"), 1600);
  }

  function buildPayload() {
    const htmlToSave = activities
      .map((act, i) => {
        const t = activityTitles[i] ?? act;
        const c = sanitizeHtml(activityContents[i] ?? "");
        return `<div class="activity-section"><h4 class="activity-title">${t}</h4>${c}</div>`;
      })
      .join("");
    const hasContent = activityContents.some((c) => {
      const sc = sanitizeHtml(c ?? "");
      return stripHtml(sc).trim().length > 0 || htmlHasImage(sc);
    });
    return { htmlToSave, valid: hasContent || !!imageUrl || attachments.length > 0 };
  }

  async function persist(htmlToSave) {
    const payload = { title: "", content: htmlToSave, imageUrl, attachments };
    if (cardIdRef.current) {
      await updateStudyCard(board.id, cardIdRef.current, payload);
    } else {
      const newId = await addStudyCard(user, board.id, payload);
      cardIdRef.current = newId ?? user.uid;
    }
  }

  async function flushSave() {
    if (!canEdit) return;
    const { htmlToSave, valid } = buildPayload();
    if (!valid) return;
    if (savingRef.current) { pendingRef.current = true; return; }
    savingRef.current = true;
    dirtyRef.current = false;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setAutoStatus("saving");
    try {
      await persist(htmlToSave);
      baselineSigRef.current = sigOf();
      showSavedThenHide();
    } catch {
      dirtyRef.current = true;
      setAutoStatus("error");
    } finally {
      savingRef.current = false;
      if (pendingRef.current) { pendingRef.current = false; flushRef.current?.(); }
    }
  }
  flushRef.current = flushSave;

  useEffect(() => {
    const sig = sigOf();
    if (baselineSigRef.current === null) {
      baselineSigRef.current = sig;
      return;
    }
    if (sig === baselineSigRef.current) return;
    const { valid } = buildPayload();
    if (!canEdit || !valid) return;
    dirtyRef.current = true;
    const t = setTimeout(() => flushRef.current?.(), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityContents, activityTitles, imageUrl, attachments, canEdit]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (dirtyRef.current) flushRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete() {
    if (!card) return;
    await deleteStudyCard(board.id, card.id);
    onBack();
  }

  // 이미지·파일 첨부
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
  function removeAttachment(id) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }
  function downloadAttachment(att) {
    const a = document.createElement("a");
    a.href = att.dataUrl;
    a.download = att.name;
    a.click();
  }
  const fileAttachments = attachments.filter((a) => !IMAGE_EXTS.has(a.ext));
  const imageItems = [
    ...(imageUrl ? [{ id: "__main__", src: imageUrl, isMain: true }] : []),
    ...attachments.filter((a) => IMAGE_EXTS.has(a.ext)).map((a) => ({ id: a.id, src: a.dataUrl, isMain: false })),
  ];

  const doneCount = activityContents.filter((c) => stripHtml(c ?? "").length >= DONE_MIN_CHARS).length;

  return (
    <section className="study-mycard-page">
      <div className="study-mycard-head">
        <button type="button" className="btn-ghost" onClick={onBack}>← 프로젝트로</button>
        <h2 className="study-mycard-title">{board.title}</h2>
        <span className="paratext-progress">{doneCount} / {activities.length}개</span>
        {canEdit && autoStatus !== "idle" && (
          <span className={`study-autosave-pill study-autosave-pill--${autoStatus}`}>
            {autoStatus === "saving" && "저장 중…"}
            {autoStatus === "saved" && "✓ 자동 저장됨"}
            {autoStatus === "error" && "저장 실패"}
          </span>
        )}
        {!canEdit && (
          <span className="paratext-saved locked">
            <IconLock size={14} /> 보기 전용
          </span>
        )}
        {card && (
          <time className="study-mycard-time">{formatTime(card.createdAt)}</time>
        )}
      </div>

      {board.description && <p className="study-project-view-desc">{board.description}</p>}

      <p className="activity-form-hint">
        활동마다 {DONE_MIN_CHARS}자 이상 작성해야 ‘제출’로 인정됩니다.
      </p>

      <div className="raft-grid study-mycard-grid">
        {activities.map((act, i) => {
          const actLocked = isActivityLocked(board, i);
          const readOnly = !canEdit || actLocked;
          const n = stripHtml(activityContents[i] ?? "").length;
          const done = n >= DONE_MIN_CHARS;
          return (
            <section
              key={i}
              className={`raft-col study-mycard-col${done ? " filled" : ""}${actLocked ? " locked" : ""}`}
            >
              <header className="study-mycard-col-head">
                <span className="activity-dash-no">활동 {i + 1}</span>
                {actLocked ? (
                  <span className="activity-dash-lock">🔒 잠김</span>
                ) : (
                  <span className={`activity-dash-count${done ? " ok" : ""}`}>
                    {n}/{DONE_MIN_CHARS}자
                  </span>
                )}
              </header>

              {readOnly ? (
                <>
                  <p className="study-mycard-col-title">{activityTitles[i] ?? act}</p>
                  {stripHtml(activityContents[i] ?? "").trim() || htmlHasImage(activityContents[i] ?? "") ? (
                    <div
                      className="study-card-content study-mycard-col-body"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(activityContents[i] ?? "") }}
                    />
                  ) : (
                    <p className="activity-form-locked-note">
                      {actLocked ? "선생님이 이 활동을 열어 주면 입력할 수 있어요." : "아직 쓰지 않았어요."}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <input
                    type="text"
                    className="study-card-title-input"
                    value={activityTitles[i] ?? act}
                    onChange={(e) => {
                      const next = [...activityTitles];
                      next[i] = e.target.value;
                      setActivityTitles(next);
                    }}
                    placeholder={`활동 ${i + 1}`}
                    maxLength={80}
                  />
                  <div className="study-mycard-editor">
                    <RichTextEditor
                      variant="full"
                      initialHtml={savedSections.current[i]?.content ?? ""}
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
                </>
              )}
            </section>
          );
        })}
      </div>

      {canEdit && (
        <>
          <UploadProgress pct={uploadPct} />
          <div className="attach-files-section">
            <div className="attach-files-header">
              <span className="attach-files-label">📎 파일 첨부</span>
              <label className="btn-ghost attach-add-btn" title={`HTML, TXT, CSV, Excel, Python, 이미지 파일 (최대 200KB/5MB, ${MAX_ATTACH_COUNT}개)`}>
                + 파일 추가
                <input
                  type="file"
                  accept=".html,.htm,.txt,.csv,.xlsx,.xls,.py,.jpg,.jpeg,.png,.gif,.webp"
                  onChange={handleFileAttach}
                  hidden
                />
              </label>
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
                    <button type="button" className="attach-file-del" onClick={() => removeAttachment(att.id)} aria-label="삭제">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {imageItems.length > 0 && (
            <div className="attach-image-grid">
              {imageItems.map((item) => (
                <div key={item.id} className="attach-image-cell">
                  <ZoomableImage src={item.src} alt="첨부 이미지" className="attach-image-grid-thumb" />
                  <button
                    type="button"
                    className="attach-image-grid-del"
                    onClick={() => (item.isMain ? setImageUrl(null) : removeAttachment(item.id))}
                    aria-label="삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!canEdit && attachments.length > 0 && (
        <div className="attach-files-section">
          <p className="attach-files-label">📎 첨부 파일</p>
          <ul className="attach-file-list">
            {attachments.map((att) => (
              <li key={att.id} className="attach-file-item">
                <span className={`attach-file-ext ext-${att.ext}`}>
                  {FILE_EXTS[att.ext] ?? att.ext.toUpperCase()}
                </span>
                <span className="attach-file-name">{att.name}</span>
                <span className="attach-file-size">{formatFileSize(att.size)}</span>
                <button type="button" className="btn-ghost attach-download-btn" onClick={() => downloadAttachment(att)}>
                  ⬇ 다운로드
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="study-mycard-foot">
        {linked && (
          <div className="study-card-modal-links">
            <button className="study-chip" onClick={() => onAsk?.(boardKeywords[0] ?? null)}>
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
        {canDelete && card && (
          confirmDelete ? (
            <span className="study-project-delete-confirm">
              <span>이 카드는 삭제 후 복구할 수 없습니다.</span>
              <button className="study-chip danger" onClick={handleDelete}>정말 삭제</button>
              <button className="study-chip" onClick={() => setConfirmDelete(false)}>취소</button>
            </span>
          ) : (
            <button className="study-chip danger" onClick={() => setConfirmDelete(true)}>
              <IconTrash size={15} /> 삭제
            </button>
          )
        )}
      </div>

      {linked && showRelated && (
        <div className="study-related">
          {relatedQuestions.length === 0 ? (
            <p className="study-related-empty">
              아직 관련 질문이 없어요. "질문하기"로 막힌 점을 올려 보세요.
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

      {peekQuestion && (
        <StudyQuestionPeek
          question={peekQuestion}
          onClose={() => { setPeekQuestion(null); setShowRelated(false); }}
          onBackToList={() => { setPeekQuestion(null); setShowRelated(true); }}
        />
      )}
    </section>
  );
}
