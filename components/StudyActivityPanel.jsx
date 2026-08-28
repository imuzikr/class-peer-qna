"use client";

// =============================================================
// 공부방 왼쪽 사이드 패널 — 프로젝트 활동 추가·관리 (교사 전용)
// -------------------------------------------------------------
// KWL 패널을 대신해 이 자리에 놓입니다(KWL 패널은 components/KwlPanel.jsx에
// 코드 그대로 보관 중 — app/study/page.js의 KWL_PANEL_ENABLED를 true로
// 돌리면 다시 켤 수 있습니다).
//
// 프로젝트 상세 화면(StudyProjectView)에 있던 '⚙ 설정 → 활동 설정' 모달을
// 대체합니다 — 활동 이름 추가·수정·삭제와 열기/잠금을 이 패널 하나로
// 모읍니다(전에는 잠금 칩과 이름 편집 모달이 따로 있었습니다).
//
// 학생이 이미 낸 카드가 있으면(텍스트든 이미지든) 활동 구성을 바꿀 수
// 없습니다 — 활동 칸이 학생 카드의 실제 입력 칸이라, 바꾸면 이미 쓴
// 내용이 어느 칸에 속하는지 어긋나기 때문입니다(StudyProjectView가 전에
// 하던 검사를 그대로 옮겼습니다).
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeStudyCards, updateStudyBoard, updateStudyCard } from "@/lib/store";
import { stripHtml, htmlHasImage } from "@/lib/html";
import {
  buildActivityTemplate,
  nextActivityLocks,
  isActivityLocked,
  isTeacherAuthoredCard,
  boardMaterials,
} from "@/lib/activities";
import { uploadImage } from "@/lib/storageUpload";
import { backdropClose } from "@/lib/modal";
import { cardProgress } from "./StudyProgressBoard";
import UploadProgress from "./UploadProgress";
import { IconLock, IconPen } from "./StatusIcons";
import ConfirmModal from "./ConfirmModal";

const MATERIAL_MAX_IMAGE = 5 * 1024 * 1024;

function blankMaterial() {
  return { id: `m${Date.now()}`, actIndex: null, text: "", image: null };
}

// 자료 목록을 저장할 모양으로 다듬습니다 — 글도 이미지도 없는 줄은 버립니다.
// 저장할 때와 '바뀌었는가'를 볼 때 같은 함수를 써야, 화면에만 있는 빈 줄이
// 편집으로 잡히지 않습니다.
function cleanMaterials(list) {
  return (list ?? [])
    .map((m) => ({
      id: m.id,
      actIndex: typeof m.actIndex === "number" ? m.actIndex : null,
      text: (m.text ?? "").trim(),
      image: m.image ?? null,
    }))
    .filter((m) => m.text || m.image);
}

export default function StudyActivityPanel({
  board,
  isTeacher,
  classRoster = [],
  mobileOpen,
  onMobileClose,
}) {
  const boardId = board?.id ?? null;
  const isNotice = board?.type === "notice";
  const isGroup = board?.activityType === "group";
  const activities = useMemo(() => board?.activities ?? [], [board]);
  const activitiesKey = activities.join(" ");

  const [cards, setCards] = useState([]);
  const [draft, setDraft] = useState(activities.length ? [...activities] : [""]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // 학생 카드 내용 검사(활동 변경 가능 여부)용 — 교사가 볼 때만 필요
  useEffect(() => {
    if (!isTeacher || !boardId || isNotice) {
      setCards([]);
      return;
    }
    return subscribeStudyCards(boardId, setCards);
  }, [isTeacher, boardId, isNotice]);

  // 프로젝트가 바뀌면(패널은 프로젝트를 넘나들며 계속 떠 있는 채이므로)
  // 이전 프로젝트에 남아 있던 미저장 초안이 새 프로젝트로 새지 않도록
  // 무조건 다시 맞춥니다. 같은 프로젝트 안에서 활동이 바뀐 경우(다른 곳에서
  // 잠금만 바뀐 경우 등)에는 편집 중인 이름을 덮어쓰지 않습니다.
  const prevBoardIdRef = useRef(boardId);
  useEffect(() => {
    const boardChanged = prevBoardIdRef.current !== boardId;
    prevBoardIdRef.current = boardId;
    if (!boardChanged && dirty) return;
    setDraft(activities.length ? [...activities] : [""]);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, activitiesKey]);

  // 활동마다 몇 명이 제출했는지 (공부중 전광판과 같은 기준) — isTeacher가
  // 아닐 때도 이 훅은 항상 호출해야 합니다. 아래 '교사만 렌더링' 분기보다
  // 먼저 선언해 두지 않으면, 개발용 역할 전환(RoleSwitcher)으로 같은
  // 컴포넌트 인스턴스에서 isTeacher만 바뀔 때 렌더마다 훅 호출 개수가
  // 달라져 React가 훅 순서 오류를 던집니다.
  const doneCounts = useMemo(() => {
    if (classRoster.length === 0) return [];
    const rows = classRoster.map((s) => {
      const card = cards.find((c) =>
        isGroup ? c.memberUids?.includes(s.uid) : c.authorId === s.uid
      );
      return cardProgress(card, activities);
    });
    return activities.map((_, i) => rows.filter((d) => d[i]).length);
  }, [classRoster, cards, activities, isGroup]);

  if (!isTeacher) return null;

  function setDraftAt(i, value) {
    setDraft((prev) => prev.map((a, j) => (j === i ? value : a)));
    setDirty(true);
  }
  function removeDraftAt(i) {
    setDraft((prev) => (prev.length === 1 ? [""] : prev.filter((_, j) => j !== i)));
    setDirty(true);
  }
  function addDraft() {
    setDraft((prev) => [...prev, ""]);
    setDirty(true);
  }
  function cancelDraft() {
    setDraft(activities.length ? [...activities] : [""]);
    setDirty(false);
  }

  // 활동 하나의 잠금을 켜고 끕니다 — 이름 편집(저장 필요)과 달리 즉시 반영됩니다.
  async function toggleLock(i, lockedNext) {
    const next = activities.map((_, j) =>
      j === i ? lockedNext : board.activityLocks?.[j] === true
    );
    await updateStudyBoard(boardId, { activityLocks: next });
  }

  async function handleSave() {
    const newActivities = draft.map((a) => a.trim()).filter(Boolean);
    const studentCards = cards.filter((c) => !isTeacherAuthoredCard(c));
    // 텍스트 없이 붙여넣은 이미지만 있는 카드도 '이미 쓴 내용'입니다.
    const hasContent = studentCards.some((c) => {
      const html = c.content ?? "";
      return stripHtml(html).trim().length > 0 || htmlHasImage(html);
    });
    if (hasContent) {
      setSaveError(
        "학생이 입력한 내용이 있어서 활동을 변경할 수 없어요. 모든 학생 카드의 내용을 비운 뒤 다시 시도해 주세요."
      );
      return;
    }
    setSaveError("");
    setSaving(true);
    try {
      // 수업 도중 새로 추가한 활동은 잠긴 채로 시작합니다 — 교사가 열어 줘야
      // 학생이 입력할 수 있습니다(이름이 그대로인 활동은 지금 상태 유지).
      await updateStudyBoard(boardId, {
        activities: newActivities,
        activityLocks: nextActivityLocks(activities, board.activityLocks ?? [], newActivities),
      });
      if (newActivities.length > 0) {
        const templateHtml = buildActivityTemplate(newActivities);
        await Promise.all(
          studentCards.map((c) =>
            updateStudyCard(boardId, c.id, {
              title: c.title ?? "",
              content: templateHtml,
              imageUrl: c.imageUrl ?? null,
              attachments: c.attachments ?? [],
            })
          )
        );
      }
      setDirty(false);
    } catch (e) {
      setSaveError(`활동을 저장하지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className={`study-activity-panel${mobileOpen ? " study-activity-panel--open" : ""}`}>
      {onMobileClose && (
        <button className="study-activity-mobile-close" onClick={onMobileClose} aria-label="닫기">
          ×
        </button>
      )}

      <div className="study-activity-panel-head">
        <span className="study-activity-panel-title">🧩 프로젝트 활동</span>
        {board && (
          <span className="study-activity-panel-project" title={board.title}>
            {board.title}
          </span>
        )}
      </div>

      {!board ? (
        <p className="study-activity-panel-empty">
          프로젝트를 열면 이곳에서 활동을 추가·수정할 수 있어요.
        </p>
      ) : isNotice ? (
        <p className="study-activity-panel-empty">
          수업 자료 프로젝트에는 활동이 없어요.
        </p>
      ) : (
        <>
          <p className="study-activity-panel-hint">
            학생 개인 카드에 이 순서대로 입력 칸이 만들어져요. 자물쇠를 눌러
            열고 잠글 수 있어요.
          </p>
          <div className="study-activity-panel-list">
            {draft.map((act, i) => {
              const savedActLocked = isActivityLocked(board, i);
              const isSaved = i < activities.length;
              return (
                <div className="study-activity-row" key={i}>
                  {isSaved && (
                    <button
                      type="button"
                      className={`study-activity-lock${savedActLocked ? " locked" : ""}`}
                      onClick={() => toggleLock(i, !savedActLocked)}
                      title={savedActLocked ? "눌러서 열기" : "눌러서 잠그기"}
                      aria-pressed={!savedActLocked}
                      aria-label={`활동 ${i + 1} ${savedActLocked ? "열기" : "잠그기"}`}
                    >
                      <IconLock size={13} />
                    </button>
                  )}
                  <input
                    className="study-activity-row-input"
                    value={act}
                    onChange={(e) => setDraftAt(i, e.target.value)}
                    placeholder={`활동 ${i + 1} 내용을 입력하세요`}
                  />
                  {isSaved && classRoster.length > 0 && (
                    <span className="study-activity-row-count">
                      {doneCounts[i] ?? 0}/{classRoster.length}
                    </span>
                  )}
                  <button
                    type="button"
                    className="study-activity-row-del"
                    onClick={() => removeDraftAt(i)}
                    aria-label={`활동 ${i + 1} 삭제`}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" className="study-activity-panel-add" onClick={addDraft}>
            + 활동 추가
          </button>
          {dirty && (
            <div className="study-activity-panel-actions">
              <button type="button" className="study-activity-panel-cancel" onClick={cancelDraft}>
                취소
              </button>
              <button
                type="button"
                className="study-activity-panel-save"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          )}

          {saveError && (
            <p className="form-error study-activity-panel-error" role="alert">{saveError}</p>
          )}

          {/* 자료 제공 — 늘 맨 아래(margin-top: auto). 버튼만 있고, 누르면
              화면 가운데 모달이 열립니다. */}
          <MaterialSection board={board} activities={activities} />
        </>
      )}
    </aside>
  );
}

// 프로젝트에 붙이는 참고 자료 — 학생 활동 화면 맨 위에 펼쳐 볼 수 있는
// 상자로 나타납니다(StudyMyActivityCard). 보드 문서에 바로 저장합니다.
//
// 자료마다 '어느 활동의 것인지'를 골라 둡니다 — 활동이 여러 개인 프로젝트에서
// 자료를 여러 장 올리면, 학생 쪽에서 어느 활동을 보라고 준 자료인지 알 수
// 없었습니다. '전체'는 활동을 가리지 않는 공통 자료입니다.
//
// 버튼은 패널 맨 아래에 두되, 실제 작성은 화면 가운데 모달에서 합니다 —
// 사이드 패널 폭(약 260px)에서 펼치면 설명 글 입력칸이 손바닥만 해서 몇 줄만
// 써도 답답했고, 활동 목록까지 밀려 내려가 자료를 쓰는 동안 활동이 안
// 보였습니다.
function MaterialSection({ board, activities }) {
  const boardId = board?.id ?? null;
  const saved = boardMaterials(board);
  const savedKey = JSON.stringify(saved);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(saved);
  const [pct, setPct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [closeAsk, setCloseAsk] = useState(false);

  // 다른 프로젝트로 옮겨 가거나 저장이 반영되면 그 프로젝트의 자료로 맞춥니다
  useEffect(() => {
    setItems(boardMaterials(board));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, savedKey]);

  // '바뀌었는가'는 다듬은 결과끼리 비교합니다 — 모달을 열 때 미리 깔아 두는
  // 빈 줄이 편집으로 잡혀 저장 버튼이 켜지거나 닫을 때 확인창이 뜨면 안 됩니다.
  const cleaned = cleanMaterials(items);
  const dirty = JSON.stringify(cleaned) !== JSON.stringify(cleanMaterials(saved));
  const hasMaterial = saved.length > 0;

  function patch(id, changes) {
    setItems((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  }
  function addItem() {
    setItems((prev) => [...prev, blankMaterial()]);
  }
  function removeItem(id) {
    setItems((prev) => prev.filter((m) => m.id !== id));
  }

  async function handleImage(e, id) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MATERIAL_MAX_IMAGE) {
      setError(`이미지는 5MB 이하여야 해요. (지금 파일: ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }
    setError("");
    setPct(0);
    try {
      patch(id, { image: await uploadImage(file, { onProgress: setPct }) });
    } catch {
      setError("이미지 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPct(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      // 예전 단일 자료 필드는 목록으로 옮겨졌으니 비웁니다(중복 표시 방지)
      await updateStudyBoard(boardId, {
        materials: cleaned,
        materialText: "",
        materialImage: null,
      });
    } catch (e) {
      setError(`자료를 저장하지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setSaving(false);
    }
  }

  // 열자마자 바로 쓸 수 있게 빈 자료 줄을 하나 깔아 둡니다 — '자료 추가'를
  // 한 번 더 눌러야 입력칸이 나오던 단계를 없앴습니다. 이미 올린 자료가
  // 있으면 그것들을 그대로 보여 줍니다.
  function openModal() {
    const base = boardMaterials(board);
    setItems(base.length ? base : [blankMaterial()]);
    setError("");
    setOpen(true);
  }

  // 모달을 닫을 때 저장하지 않은 편집분이 있으면 한 번 물어봅니다 — 넓은
  // 입력칸에서 길게 쓰다 배경을 잘못 눌러 통째로 날리는 일을 막습니다.
  function requestClose() {
    if (dirty) {
      setCloseAsk(true);
      return;
    }
    discardAndClose();
  }
  function discardAndClose() {
    setCloseAsk(false);
    setItems(boardMaterials(board));
    setError("");
    setOpen(false);
  }

  return (
    <div className="study-material">
      <button
        type="button"
        className="study-material-toggle"
        onClick={openModal}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="study-material-label">
          📎 자료 제공
          {hasMaterial && (
            <span className="study-material-count">{saved.length}</span>
          )}
        </span>
        <span className="study-material-caret" aria-hidden="true">＋</span>
      </button>

      {open && (
        <div className="modal-backdrop" {...backdropClose(requestClose)}>
          <div
            className="modal study-material-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="study-material-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3 id="study-material-title">
                📎 자료 제공
                {board?.title && (
                  <span className="study-material-modal-project">{board.title}</span>
                )}
              </h3>
              <button className="btn-close" onClick={requestClose} aria-label="닫기">
                ×
              </button>
            </div>

            <div className="study-material-body">
              <p className="study-material-hint">
                학생 활동 화면 맨 위에 접힌 상자로 보여 줍니다. 자료마다 어느
                활동의 것인지 골라 주세요.
              </p>

              {items.length === 0 && (
                <p className="study-material-hint">아직 올린 자료가 없어요.</p>
              )}

              {items.map((m, n) => (
                <div className="study-material-item" key={m.id}>
                  <div className="study-material-item-head">
                    <select
                      className="study-material-select"
                      value={typeof m.actIndex === "number" ? m.actIndex : ""}
                      onChange={(e) =>
                        patch(m.id, {
                          actIndex: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      aria-label={`자료 ${n + 1}의 활동`}
                    >
                      <option value="">전체 활동</option>
                      {activities.map((act, i) => (
                        <option key={i} value={i}>
                          활동 {i + 1}. {act}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="study-activity-row-del"
                      onClick={() => removeItem(m.id)}
                      aria-label={`자료 ${n + 1} 삭제`}
                    >
                      ✕
                    </button>
                  </div>

                  <textarea
                    className="study-material-text"
                    value={m.text ?? ""}
                    onChange={(e) => patch(m.id, { text: e.target.value })}
                    placeholder="설명·참고 글을 적어 주세요."
                    maxLength={2000}
                  />

                  {m.image ? (
                    <div className="study-material-image">
                      <img src={m.image} alt="제공 자료" />
                      <button
                        type="button"
                        className="attach-image-grid-del"
                        onClick={() => patch(m.id, { image: null })}
                        aria-label="이미지 삭제"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <label className="study-material-image-add">
                      + 이미지 올리기
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.gif,.webp"
                        onChange={(e) => handleImage(e, m.id)}
                        hidden
                      />
                    </label>
                  )}
                </div>
              ))}

              <UploadProgress pct={pct} />

              <button type="button" className="study-material-add" onClick={addItem}>
                + 자료 추가
              </button>

              {error && (
                <p className="form-error" role="alert">{error}</p>
              )}
            </div>

            <div className="study-material-modal-foot">
              <button type="button" className="study-material-cancel" onClick={requestClose}>
                닫기
              </button>
              <button
                type="button"
                className="study-material-save"
                onClick={handleSave}
                disabled={saving || !dirty}
              >
                {saving ? "저장 중..." : dirty ? "자료 저장" : "저장됨"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 저장하지 않고 닫으려 할 때 — 브라우저 confirm 대신 앱 안의 모달 */}
      {closeAsk && (
        <ConfirmModal
          icon={<IconPen size={40} />}
          title="저장하지 않고 닫을까요?"
          description="아직 저장하지 않은 자료 편집 내용이 있어요. 닫으면 사라집니다."
          confirmLabel="닫기"
          cancelLabel="계속 쓰기"
          danger
          onConfirm={discardAndClose}
          onClose={() => setCloseAsk(false)}
        />
      )}
    </div>
  );
}
