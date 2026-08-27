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
} from "@/lib/activities";
import { cardProgress } from "./StudyProgressBoard";
import { IconLock } from "./StatusIcons";

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
      alert(
        "학생이 입력한 내용이 있어서 활동을 변경할 수 없어요.\n모든 학생 카드의 내용을 비운 후 다시 시도해 주세요."
      );
      return;
    }
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
        </>
      )}
    </aside>
  );
}
