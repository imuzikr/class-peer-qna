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
//
// [첨부는 활동별로]
// 예전에는 카드 하나에 첨부 묶음이 하나뿐이라(페이지 맨 아래), 어느 활동에
// 낸 파일인지 알 수 없었습니다. 지금은 첨부마다 actIndex(몇 번째 활동인가)를
// 달아 그 활동 칸 안에서만 보여 줍니다. actIndex가 없는 예전 첨부는 첫 활동
// 것으로 봅니다(파일이 사라지지 않게).
//
// [교사 방송]
// 교사가 이 페이지를 열면 활동마다 '수업 시작'이 붙습니다 — RAFT 글쓰기·
// 곁텍스트 읽기와 같은 방식(useEntryCast)으로, 그 활동만 학급 전체 화면에
// 띄웁니다. 방송 중 다른 활동 버튼을 누르면 곧바로 그리로 전환됩니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { addStudyCard, updateStudyCard, deleteStudyCard, formatTime } from "@/lib/store";
import { useEntryCast } from "@/lib/useEntryCast";
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
  isTeacher = false,
  writerName = "",
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
  // 지금 크게 열어 쓰고 있는 활동 번호 (null이면 닫힘)
  const [editingAct, setEditingAct] = useState(null);
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

  // 이미지·파일 첨부 — actIndex(몇 번째 활동인가)를 함께 달아 둡니다.
  async function handleFileAttach(e, actIndex) {
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
      { id: `f${Date.now()}`, name: file.name, ext, size: file.size, dataUrl, actIndex },
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

  // 활동 i가 가진 첨부 — actIndex가 없는 예전 첨부는 첫 활동 것으로 봅니다.
  // (예전 카드는 첨부가 카드 전체에 하나로 달려 있어 소속 활동이 없습니다.
  //  버리면 파일이 화면에서 사라지므로 첫 칸에 모아 보여 줍니다.)
  function attachOf(i) {
    return attachments.filter((a) => (a.actIndex ?? 0) === i);
  }
  function fileAttachOf(i) {
    return attachOf(i).filter((a) => !IMAGE_EXTS.has(a.ext));
  }
  function imageItemsOf(i) {
    return [
      // 예전 카드의 대표 이미지(imageUrl)도 첫 활동에 붙여 보여 줍니다
      ...(i === 0 && imageUrl ? [{ id: "__main__", src: imageUrl, isMain: true }] : []),
      ...attachOf(i)
        .filter((a) => IMAGE_EXTS.has(a.ext))
        .map((a) => ({ id: a.id, src: a.dataUrl, isMain: false })),
    ];
  }

  const doneCount = activityContents.filter((c) => stripHtml(c ?? "").length >= DONE_MIN_CHARS).length;

  // ── 교사 방송 — 활동 하나를 학급 전체 화면에 띄우기 ──
  // 방송 대상은 '학생 uid + 활동 번호'로 구분합니다(RAFT 글쓰기와 같은 방식).
  const cast = useEntryCast(board.classId, isTeacher ? user : null);
  const castUid = card?.authorId ?? user?.uid ?? "";
  function buildCastPayload(i) {
    return {
      mode: "entry",
      activityTitle: board.title ?? "",
      topic: board.title ?? "",
      writerName: writerName || "",
      label: activityTitles[i] ?? activities[i] ?? `활동 ${i + 1}`,
      prompt: "",
      index: i,
      total: activities.length,
      // 방송 화면은 글자만 그리므로(이미지·서식 제외) 본문을 평문으로 보냅니다.
      fields: [{ label: "", text: stripHtml(activityContents[i] ?? "").trim() }],
    };
  }
  // 방송 중인 활동의 내용이 바뀌면(학생이 고치거나 교사가 예시를 적으면)
  // 잠깐 모았다가 다시 보내 학생 화면을 따라가게 합니다.
  const castIndex = cast.target ? cast.target.key : -1;
  const livePayload = useMemo(
    () => (castIndex >= 0 ? buildCastPayload(castIndex) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [castIndex, activityContents, activityTitles, writerName, board.title]
  );
  cast.useLiveUpdate(livePayload);

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
        {/* 삭제는 머리말 오른쪽 끝에 둡니다 — 활동 칸이 길어지면서 페이지
            맨 아래에 있던 버튼이 화면 밖으로 밀려 눌리지 않았습니다. */}
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

      {board.description && <p className="study-project-view-desc">{board.description}</p>}

      {/* 선생님이 붙인 참고 자료 — 평소엔 접혀 있고 눌러서 펼칩니다
          (왼쪽 패널의 '자료 제공'에서 넣습니다) */}
      {(board.materialText || board.materialImage) && (
        <details className="study-material-view">
          <summary>📎 선생님이 준 자료</summary>
          {board.materialText && (
            <p className="study-material-view-text">{board.materialText}</p>
          )}
          {board.materialImage && (
            <ZoomableImage
              src={board.materialImage}
              alt="선생님이 준 자료"
              className="study-material-view-img"
            />
          )}
        </details>
      )}

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
                {/* 교사 — 이 활동만 학급 전체 화면에 띄우기 */}
                {isTeacher && cast.canCast && (
                  <button
                    type="button"
                    className={`btn-ghost dash-cast-btn${cast.isCasting(castUid, i) ? " on" : ""}`}
                    onClick={() => cast.cast({ uid: castUid, key: i }, buildCastPayload(i))}
                    title={
                      cast.isCasting(castUid, i)
                        ? "학생 화면을 원래대로 되돌립니다"
                        : "이 활동을 학급 전체 화면에 띄웁니다"
                    }
                  >
                    {cast.isCasting(castUid, i) && (
                      <span className="broadcast-live-dot" aria-hidden="true" />
                    )}
                    {cast.isCasting(castUid, i) ? "발표 종료" : "발표 모드"}
                  </button>
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
                  {/* 칸 안에서 바로 쓰던 것을 미리보기로 바꿨습니다 — 글이
                      길어지면 칸이 한없이 늘어나 옆 활동과 높이가 어긋나고
                      화면 밖으로 밀렸습니다. 누르면 큰 모달에서 씁니다. */}
                  {/* button이 아니라 div입니다 — 학생 글에 <p>·<div> 같은
                      블록 요소가 들어 있어 button 안에 넣으면 유효하지 않은
                      중첩이 됩니다. 키보드로도 열 수 있게 role/tabIndex를 둡니다. */}
                  <div
                    className="study-mycard-preview"
                    role="button"
                    tabIndex={0}
                    onClick={() => setEditingAct(i)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setEditingAct(i);
                      }
                    }}
                    title="눌러서 크게 쓰기"
                  >
                    {stripHtml(activityContents[i] ?? "").trim() ||
                    htmlHasImage(activityContents[i] ?? "") ? (
                      <div
                        className="study-card-content study-mycard-preview-body"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeHtml(activityContents[i] ?? ""),
                        }}
                      />
                    ) : (
                      <p className="study-mycard-preview-empty">
                        눌러서 내용을 입력해 주세요.
                      </p>
                    )}
                    <span className="study-mycard-preview-open">✎ 크게 쓰기</span>
                  </div>
                </>
              )}

              {/* 첨부는 활동마다 따로 — 이 활동에 낸 파일만 여기에 모입니다 */}
              <ActivityAttach
                index={i}
                canEdit={!readOnly}
                files={fileAttachOf(i)}
                images={imageItemsOf(i)}
                total={attachments.length}
                onAttach={handleFileAttach}
                onRemove={removeAttachment}
                onRemoveMainImage={() => setImageUrl(null)}
                onDownload={downloadAttachment}
              />
            </section>
          );
        })}
      </div>

      {/* 업로드 진행률은 어느 활동에 넣든 한 곳에서 보여 줍니다 */}
      <UploadProgress pct={uploadPct} />

      {/* 질문 게시판과 연계된 프로젝트에서만 아래 줄이 생깁니다 */}
      {linked && (
        <div className="study-mycard-foot">
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
        </div>
      )}

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

      {/* 활동 하나를 큰 화면에서 쓰기 — 칸 미리보기를 누르면 열립니다.
          같은 state를 쓰므로 여기서 쓴 내용도 그대로 자동 저장됩니다. */}
      {editingAct !== null && (
        <ActivityEditorModal
          index={editingAct}
          title={activityTitles[editingAct] ?? activities[editingAct] ?? ""}
          html={activityContents[editingAct] ?? ""}
          autoStatus={autoStatus}
          onTitleChange={(v) =>
            setActivityTitles((prev) => {
              const next = [...prev];
              next[editingAct] = v;
              return next;
            })
          }
          onChange={(v) =>
            setActivityContents((prev) => {
              const next = [...prev];
              next[editingAct] = v;
              return next;
            })
          }
          onClose={() => setEditingAct(null)}
        />
      )}
    </section>
  );
}

// 활동 하나를 크게 쓰는 모달 — 칸 안에서 쓰던 것을 옮겼습니다.
// 저장 버튼은 없습니다(부모가 입력이 멈추면 자동 저장). 그래서 머리말에
// 자동 저장 상태를 그대로 비춰 주어, 닫아도 되는지 알 수 있게 합니다.
function ActivityEditorModal({
  index,
  title,
  html,
  autoStatus,
  onTitleChange,
  onChange,
  onClose,
}) {
  // 열 때의 내용만 편집기에 심습니다(RichTextEditor는 비제어 컴포넌트라,
  // 타자 도중 initialHtml이 바뀌면 커서가 튑니다).
  const initialRef = useRef(html);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chars = stripHtml(html ?? "").length;
  const done = chars >= DONE_MIN_CHARS;

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal study-act-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`활동 ${index + 1} 쓰기`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="study-act-modal-head">
          <span className="activity-dash-no">활동 {index + 1}</span>
          <input
            type="text"
            className="study-act-modal-title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={`활동 ${index + 1}`}
            maxLength={80}
          />
          <span className={`activity-dash-count${done ? " ok" : ""}`}>
            {chars}/{DONE_MIN_CHARS}자
          </span>
          {autoStatus !== "idle" && (
            <span className={`study-autosave-pill study-autosave-pill--${autoStatus}`}>
              {autoStatus === "saving" && "저장 중…"}
              {autoStatus === "saved" && "✓ 자동 저장됨"}
              {autoStatus === "error" && "저장 실패"}
            </span>
          )}
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="study-act-modal-body">
          <RichTextEditor
            variant="full"
            initialHtml={initialRef.current}
            onChange={onChange}
            placeholder="내용을 입력해 주세요."
          />
        </div>
      </div>
    </div>
  );
}

// 활동 한 칸의 첨부 영역 — 그 활동에 낸 파일·이미지만 다룹니다.
// 활동 칸 맨 아래에 붙고(margin-top: auto), 첨부가 없고 편집도 못 하는
// 경우엔 아예 그리지 않아 읽기 전용 칸이 지저분해지지 않게 합니다.
function ActivityAttach({
  index,
  canEdit,
  files,
  images,
  total,
  onAttach,
  onRemove,
  onRemoveMainImage,
  onDownload,
}) {
  if (!canEdit && files.length === 0 && images.length === 0) return null;
  const full = total >= MAX_ATTACH_COUNT;
  return (
    <div className="study-act-attach">
      <div className="study-act-attach-head">
        <span className="study-act-attach-label">📎 파일 첨부</span>
        {canEdit && (
          <label
            className={`btn-ghost attach-add-btn${full ? " disabled" : ""}`}
            title={
              full
                ? `파일은 카드당 최대 ${MAX_ATTACH_COUNT}개까지 첨부할 수 있어요.`
                : `HTML, TXT, CSV, Excel, Python, 이미지 파일 (최대 200KB/5MB, ${MAX_ATTACH_COUNT}개)`
            }
          >
            + 파일 추가
            <input
              type="file"
              accept=".html,.htm,.txt,.csv,.xlsx,.xls,.py,.jpg,.jpeg,.png,.gif,.webp"
              onChange={(e) => onAttach(e, index)}
              disabled={full}
              hidden
            />
          </label>
        )}
      </div>

      {files.length > 0 && (
        <ul className="attach-file-list">
          {files.map((att) => (
            <li key={att.id} className="attach-file-item">
              <span className={`attach-file-ext ext-${att.ext}`}>
                {FILE_EXTS[att.ext] ?? att.ext.toUpperCase()}
              </span>
              <span className="attach-file-name">{att.name}</span>
              <span className="attach-file-size">{formatFileSize(att.size)}</span>
              {canEdit ? (
                <button
                  type="button"
                  className="attach-file-del"
                  onClick={() => onRemove(att.id)}
                  aria-label="삭제"
                >
                  ✕
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-ghost attach-download-btn"
                  onClick={() => onDownload(att)}
                >
                  ⬇ 다운로드
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <div className="attach-image-grid study-act-images">
          {images.map((item) => (
            <div key={item.id} className="attach-image-cell">
              <ZoomableImage src={item.src} alt="첨부 이미지" className="attach-image-grid-thumb" />
              {canEdit && (
                <button
                  type="button"
                  className="attach-image-grid-del"
                  onClick={() => (item.isMain ? onRemoveMainImage() : onRemove(item.id))}
                  aria-label="삭제"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
