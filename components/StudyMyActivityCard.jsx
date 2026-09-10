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
import {
  parseActivitySections,
  buildActivityHtml,
  isActivityLocked,
  boardMaterials,
  materialLabel,
  DONE_MIN_CHARS,
} from "@/lib/activities";
import { formatFileSize } from "@/lib/image";
import { uploadImage, uploadFile, uploadDataUrl } from "@/lib/storageUpload";
import RichTextEditor from "./RichTextEditor";
import ZoomableImage from "./ZoomableImage";
import UploadProgress from "./UploadProgress";
import StudyQuestionPeek from "./StudyQuestionPeek";
import { nextFruit } from "./RewardFruits";
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

// 화살표 툴팁에 적을 이름 — 학번이 있으면 앞에 붙입니다(명단과 같은 차례)
function seatLabel(seat) {
  const id = String(seat?.studentId ?? "").trim();
  const name = seat?.name ?? "학생";
  return id ? `${id} ${name}` : name;
}

export default function StudyMyActivityCard({
  board,
  user,
  card = null,
  canEdit = false,
  canDelete = false,
  isTeacher = false,
  writerName = "",
  // 누구의 카드인가 — 머리말 칩에 씁니다. 내 카드면(isMine) 안 답니다.
  writerStudentId = null,
  writerEmoji = "",
  isMine = false,
  // 앞·뒤 학생 — 교사가 카드를 넘겨 볼 때. 갈 곳이 없으면 null입니다.
  prevWriter = null,
  nextWriter = null,
  onPrevWriter = null,
  onNextWriter = null,
  onBack,        // 이 프로젝트의 카드 그리드로
  onBackToList,  // 공부방 첫 화면(프로젝트 목록)으로 — 없으면 버튼도 안 보임
  onAsk,
  relatedQuestions = [],
  // 과일 주기 — 활동 칸 머리의 단추. 줄 수 없는 자리(내 카드·교사 카드·
  // 보관된 반)에서는 부모가 onAward를 안 내려 주므로 단추도 안 섭니다.
  rewardCount = 0,
  rewardMax = Infinity,
  onAward = null,
}) {
  const isNew = card === null;
  const activities = board.activities ?? [];
  // 선생님이 붙인 참고 자료(활동별) — 예전 단일 자료도 함께 읽힙니다
  const materials = boardMaterials(board);
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
  // 우리가 마지막으로 저장한 HTML — 밖에서 바뀐 것과 가리기 위한 기준입니다.
  const lastSavedHtmlRef = useRef(card?.content ?? "");
  // 그때의 칸별 값 — '이 칸을 학생이 그 뒤에 건드렸나'를 칸마다 가릅니다.
  const lastSavedPartsRef = useRef({
    contents: activities.map((_, i) => savedSections.current[i]?.content ?? ""),
    titles: activities.map((a, i) => savedSections.current[i]?.title || a),
  });
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
    // 짜는 자리는 lib/activities.js 한 곳입니다 — 실행기의 '활동으로 보내기'가
    // 같은 카드를 다시 쓰므로, 두 곳이 다른 모양을 만들면 되읽을 때 어긋납니다.
    const titles = activities.map((act, i) => activityTitles[i] ?? act);
    const contents = activities.map((_, i) => activityContents[i] ?? "");
    const htmlToSave = buildActivityHtml(titles, contents);
    const hasContent = contents.some((c) => {
      const sc = sanitizeHtml(c ?? "");
      return stripHtml(sc).trim().length > 0 || htmlHasImage(sc);
    });
    return {
      htmlToSave,
      parts: { titles, contents },
      valid: hasContent || !!imageUrl || attachments.length > 0,
    };
  }

  async function persist(htmlToSave, parts) {
    const payload = { title: "", content: htmlToSave, imageUrl, attachments };
    lastSavedHtmlRef.current = htmlToSave;
    if (parts) lastSavedPartsRef.current = parts;
    if (cardIdRef.current) {
      await updateStudyCard(board.id, cardIdRef.current, payload);
    } else {
      const newId = await addStudyCard(user, board.id, payload);
      cardIdRef.current = newId ?? user.uid;
    }
  }

  async function flushSave() {
    if (!canEdit) return;
    const { htmlToSave, parts, valid } = buildPayload();
    if (!valid) return;
    if (savingRef.current) { pendingRef.current = true; return; }
    savingRef.current = true;
    dirtyRef.current = false;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setAutoStatus("saving");
    try {
      await persist(htmlToSave, parts);
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

  // ── 밖에서 카드가 바뀌면 화면에 들여옵니다 ──────────────────
  // 이 컴포넌트는 카드 내용을 **마운트 때 한 번만** 읽어 상태로 들고 있었습니다.
  // 파이썬 실행기의 '활동으로 보내기'가 생기면서 그 사이에 같은 카드가 밖에서
  // 바뀌는 길이 열렸는데, 화면은 그대로라 학생이 보낸 코드가 **아무 데도 안
  // 보였습니다**(그 상태로 자동 저장이 돌면 보낸 것을 덮어쓰기까지 합니다).
  // `card`는 이미 구독으로 살아 오므로 새로 읽는 문서는 없습니다.
  //
  // 들여오지 않는 세 경우 — 셋 다 **학생이 쓰던 글을 지키기 위해서**입니다.
  //  · 우리가 방금 저장한 것과 같음(내가 쓴 것이 돌아온 것뿐)
  //  · 지금 쓰는 중인 칸 — 그 칸만 그대로 둡니다(아래 '칸마다 따로' 참고)
  //  · '크게 쓰기' 창이 떠 있음 — 그 에디터는 비제어라 마운트 때 한 번만
  //    읽으므로, 밑에서 값을 갈아 끼우면 화면과 상태가 어긋납니다
  //    (그 창이 떠 있는 동안은 실행기의 2단도 접혀 보낼 수 없습니다)
  //
  // [칸마다 따로 봅니다] 예전에는 안 보낸 글이 하나라도 있으면(dirty) 통째로
  // 비켜 주었는데, 그 뒤 자동 저장이 **옛 상태를 그대로 써서 방금 들어온
  // 코드를 지웠습니다**. 지금은 '마지막으로 저장한 값 그대로인 칸'만
  // 들여옵니다 — 학생이 고치는 중인 칸은 그대로 두고, 나머지 칸으로 들어온
  // 것은 받아들입니다.
  useEffect(() => {
    const incoming = card?.content ?? "";
    if (card?.id) cardIdRef.current = card.id;
    if (incoming === lastSavedHtmlRef.current) return;
    if (savingRef.current) return;
    if (editingAct !== null) return;

    const secs = parseActivitySections(incoming);
    savedSections.current = secs;
    const known = lastSavedPartsRef.current;
    const incContents = activities.map((_, i) => secs[i]?.content ?? "");
    const incTitles = activities.map((a, i) => secs[i]?.title || a);
    const nextContents = incContents.map((inc, i) => {
      const mine = activityContents[i] ?? "";
      return mine === (known.contents[i] ?? "") ? inc : mine;
    });
    const nextTitles = incTitles.map((inc, i) => {
      const mine = activityTitles[i] ?? activities[i];
      return mine === (known.titles[i] ?? activities[i]) ? inc : mine;
    });
    lastSavedHtmlRef.current = incoming;
    lastSavedPartsRef.current = { contents: incContents, titles: incTitles };
    setActivityContents(nextContents);
    setActivityTitles(nextTitles);
    // 기준점은 **들어온 값**입니다 — 들여온 그대로면 되저장하지 않고, 안 보낸
    // 글이 남아 섞였으면 곧 그 섞인 결과가 저장됩니다
    // (`sigOf()`와 **같은 모양**이어야 합니다).
    baselineSigRef.current = JSON.stringify({
      activityContents: incContents,
      activityTitles: incTitles,
      imageUrl,
      attachments,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.content, card?.id, editingAct]);

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

  // 과일 주기 — 교사가 남의 카드를 볼 때만. 활동 칸마다 단추가 서지만 주는
  // 대상은 이 카드의 주인 한 사람이라, 어느 칸에서 눌러도 같은 일입니다
  // (활동 2의 답을 읽다가 그 자리에서 바로 줄 수 있게 하려는 것입니다).
  const canAward = isTeacher && !isMine && !!onAward;
  const rewardMaxed = rewardCount >= rewardMax;

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

  // ← → 로도 넘깁니다 — 카드가 여덟 칸이라 마우스를 위로 올리는 일이
  // 잦습니다. 글을 쓰는 중(입력칸·서식 에디터)에는 비켜 줍니다.
  useEffect(() => {
    if (!onPrevWriter && !onNextWriter) return undefined;
    function onKey(e) {
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (el?.isContentEditable) return;
      if (e.key === "ArrowLeft" && prevWriter) onPrevWriter?.();
      else if (e.key === "ArrowRight" && nextWriter) onNextWriter?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrevWriter, onNextWriter, prevWriter, nextWriter]);

  return (
    <section className="study-mycard-page">
      <div className="study-mycard-head">
        {/* 제목이 맨 앞, 돌아가는 길은 그 뒤에 두 단계로 —
            '프로젝트로'는 이 프로젝트의 카드 그리드, '프로젝트 목록으로'는
            공부방 첫 화면입니다. 한 단계씩 되짚지 않고 바로 목록으로
            나갈 수 있게 둘을 나란히 둡니다. */}
        <h2 className="study-mycard-title">{board.title}</h2>
        <button type="button" className="btn-ghost study-project-back" onClick={onBack}>
          ← 프로젝트로
        </button>
        {onBackToList && (
          <button type="button" className="btn-ghost study-project-back" onClick={onBackToList}>
            ← 프로젝트 목록으로
          </button>
        )}
        <span className="paratext-progress study-mycard-head-rest">
          {doneCount} / {activities.length}개
        </span>
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

      {/* 누구의 카드인가 — 제목 줄 바로 아래. 교사가 학생 자리를 눌러
          들어오면 화면 어디에도 이름이 없어, 옆 자리로 옮겨 다니다 보면
          지금 누구를 보는 중인지 놓칩니다. 내 카드일 때는 안 답니다
          (내 것을 보면서 내 이름을 읽을 이유가 없습니다). */}
      {writerName && !isMine && (
        <p className="study-mycard-who">
          <span className="study-mycard-who-chip">
            {writerEmoji && (
              <span className="avatar avatar-sm" aria-hidden="true">{writerEmoji}</span>
            )}
            {writerStudentId && <em>{writerStudentId}</em>}
            <strong>{writerName}</strong>
          </span>
          {/* 옆 학생으로 — 이름 바로 뒤에 붙여 둡니다. 떼어 놓으면 한 명
              넘길 때마다 손이 화면을 가로질러 오갑니다(수업 노트 크게 보기의
              ‹ ›와 같은 생각). 갈 곳이 없으면 꺼지고, 툴팁이 **갈 학생을
              미리** 적습니다. */}
          {(onPrevWriter || onNextWriter) && (
            <span className="study-mycard-who-nav">
              <button
                type="button"
                onClick={onPrevWriter}
                disabled={!prevWriter}
                aria-label="앞 학생"
                title={prevWriter ? `${seatLabel(prevWriter)} (←)` : "앞 학생 — 더 앞은 없어요"}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={onNextWriter}
                disabled={!nextWriter}
                aria-label="다음 학생"
                title={nextWriter ? `${seatLabel(nextWriter)} (→)` : "다음 학생 — 더 뒤는 없어요"}
              >
                ›
              </button>
            </span>
          )}
        </p>
      )}

      {board.description && <p className="study-project-view-desc">{board.description}</p>}

      {/* 선생님이 붙인 참고 자료 — 평소엔 접혀 있고 눌러서 펼칩니다
          (왼쪽 패널의 '자료 제공'에서 넣습니다). 자료가 여럿이면 어느
          활동의 것인지 제목을 달고, 사이를 옅은 선으로 갈라 둡니다. */}
      {materials.length > 0 && (
        <details className="study-material-view">
          <summary>
            📎 선생님이 준 자료
            {materials.length > 1 && (
              <span className="study-material-view-count">{materials.length}개</span>
            )}
          </summary>
          {materials.map((m) => (
            <section className="study-material-view-item" key={m.id}>
              <h4 className="study-material-view-label">
                {materialLabel(m, activities)}
              </h4>
              {m.text && <p className="study-material-view-text">{m.text}</p>}
              {m.image && (
                <ZoomableImage
                  src={m.image}
                  alt={`${materialLabel(m, activities)} 자료`}
                  className="study-material-view-img"
                />
              )}
              {/* 사진이 아닌 첨부(PDF·PPTX·엑셀…)는 열어 봐야 아는 것들이라
                  이름을 단 링크로 내놓습니다. 새 탭으로 여는 이유: 여기서
                  바로 열면 쓰던 활동 카드를 벗어나게 됩니다. */}
              {m.file?.url && (
                <a
                  className="study-material-view-file"
                  href={m.file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="study-material-view-file-name">
                    📎 {m.file.name || "첨부 파일"}
                  </span>
                  {m.file.size > 0 && (
                    <span className="study-material-view-file-size">
                      {formatFileSize(m.file.size)}
                    </span>
                  )}
                </a>
              )}
            </section>
          ))}
        </details>
      )}

      {/* '활동마다 n자 이상' 안내 줄은 뺐습니다 — 같은 기준을 활동 칸마다
          '7/10자'로 이미 보여 주고 있어, 넓은 띠로 한 번 더 말할 이유가
          없습니다(그만큼 활동 칸이 아래로 밀렸습니다). */}

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
                {/* 활동 번호와 과일 단추는 **한 덩이**로 묶습니다. 이 줄이
                    space-between이라 그냥 나란히 두면 넷이 고르게 흩어져
                    '0/10자'가 가운데를 벗어납니다(지금 배치가 흐트러짐). */}
                <span className="study-mycard-col-no">
                  <span className="activity-dash-no">활동 {i + 1}</span>
                  {canAward && (
                    <button
                      type="button"
                      className="study-card-award-btn study-mycard-award"
                      onClick={onAward}
                      disabled={rewardMaxed}
                      title={
                        rewardMaxed
                          ? "이미 최대 개수예요"
                          : `${writerName || "이 학생"}에게 과일 주기 (현재 ${rewardCount}개)`
                      }
                      aria-label="과일 주기"
                    >
                      {nextFruit(rewardCount)}
                    </button>
                  )}
                </span>
                {actLocked ? (
                  <span className="activity-dash-lock">
                    <IconLock size={12} /> 잠김
                  </span>
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
