"use client";

// =============================================================
// 프로젝트 원본 목록 (교사) — '수업 관리' 창의 프로젝트 탭
// -------------------------------------------------------------
// 프로젝트는 선생님의 것이고 반의 것이 아닙니다(lib/store.js의
// studyTemplates 절). 수업 자료도 반에 안 묶인 선생님의 것이라, 두 목록을
// 한 창에 탭으로 나란히 둡니다 — '내가 만들어 둔 것'을 한곳에서 봅니다.
//
// 줄 모양은 수업 탭의 줄(.lesson-row)과 **같습니다** — 제목 · 딸림글 ·
// 오른쪽 단추 · 🗑. 탭만 바꿔 오가는 자리라 두 목록이 다른 모양이면 다른
// 종류의 물건처럼 읽힙니다.
//
// 줄마다 서는 것:
//   · 이 반에 이미 복사본이 있으면 '연결된 프로젝트' + [열기]
//     (같은 원본을 한 반에 두 번 시작하지 않게 — 두 번 누르면 같은 이름의
//     프로젝트가 둘이 되어, 원본을 둔 까닭이 도로 무너집니다)
//   · 없으면 [우리 반에 가져오기]
//   · 다른 반 어디에서 쓰는 중인지(이름만) — 이미 받아 둔 보드 목록으로
//     셉니다(읽기가 늘지 않습니다).
//
// 원본을 지워도 **복사본은 그대로**입니다. 되묻는 창이 그것을 밝힙니다.
// =============================================================
import { useEffect, useRef, useState } from "react";
import { IconIndividual, IconGroup, IconTrash } from "./StatusIcons";
import ConfirmModal from "./ConfirmModal";
import LegacyProjectMigrate from "./LegacyProjectMigrate";

export default function StudyTemplateList({
  templates = [],
  className = "",
  classBoards = [],   // 지금 이 반의 프로젝트 — 복사본이 이미 있는지 봅니다
  usedIn = {},        // 원본 id → 그 원본을 쓰는 다른 반 이름들
  highlightId = null, // 방금 만든 원본 — 그 줄을 짚어 둡니다
  readOnly = false,   // 보관된 반 — 시작할 수 없습니다
  onStart,            // (template) => Promise
  onOpenBoard,        // (boardId) => void
  onDelete,           // (template) => Promise
  // 원본 없이 만든 옛 프로젝트 묶음(lib/projectNames.js의 groupLegacyProjects)
  // — 있으면 목록 맨 위에 '원본으로 묶기' 줄이 섭니다.
  legacyGroups = [],
  classNameOf,
  onMigrateLegacy,    // (group) => Promise
  onLegacyDone,       // (묶은 개수) => void
}) {
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const highlightRef = useRef(null);

  // 방금 만든 원본은 목록 끝에 섭니다(만든 차례) — 원본이 많으면 목록 칸
  // 밖일 수 있어 그 줄까지 굴려 둡니다.
  useEffect(() => {
    highlightRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [highlightId, templates.length]);

  // 원본 id → 이 반의 복사본
  const instanceOf = new Map();
  classBoards.forEach((b) => {
    if (b.templateId && !instanceOf.has(b.templateId)) instanceOf.set(b.templateId, b);
  });

  async function handleStart(t) {
    if (busyId) return;
    setBusyId(t.id);
    try {
      await onStart?.(t);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(t) {
    setConfirmDelete(null);
    if (busyId) return;
    setBusyId(t.id);
    try {
      await onDelete?.(t);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="lesson-list">
        <LegacyProjectMigrate
          groups={legacyGroups}
          classNameOf={classNameOf}
          onMigrate={onMigrateLegacy}
          onDone={onLegacyDone}
        />
        {templates.length === 0 ? (
          <p className="empty-note">
            아직 만든 프로젝트가 없어요. 위에서 새로 만들어 보세요.
          </p>
        ) : (
          templates.map((t) => {
            const inst = instanceOf.get(t.id);
            const others = usedIn[t.id] ?? [];
            const isGroup = t.activityType === "group";
            const acts = t.activities?.length ?? 0;
            const hl = t.id === highlightId;
            return (
              <div
                key={t.id}
                ref={hl ? highlightRef : undefined}
                className={`lesson-row tpl-row${hl ? " is-new" : ""}`}
              >
                <div className="lesson-row-main">
                  <strong title={t.title}>{t.title}</strong>
                  <span className="tpl-meta">
                    {isGroup ? <IconGroup size={13} /> : <IconIndividual size={13} />}
                    {isGroup ? "모둠" : "개별"} · {acts > 0 ? `활동 ${acts}개` : "활동 없음"}
                  </span>
                  {others.length > 0 && (
                    <span className="tpl-used">다른 반에서 쓰는 중: {others.join(", ")}</span>
                  )}
                </div>
                <div className="lesson-row-actions">
                  {inst ? (
                    <>
                      <span className="tpl-here">연결된 프로젝트</span>
                      <button
                        type="button"
                        className="btn-ghost lesson-edit-btn"
                        onClick={() => onOpenBoard?.(inst.id)}
                      >
                        열기
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleStart(t)}
                      disabled={readOnly || !!busyId}
                      title={
                        readOnly
                          ? "보관된 반에는 가져올 수 없어요"
                          : `${className ? `‘${className}’` : "이 반"}에 복사본을 하나 열어요`
                      }
                    >
                      {busyId === t.id ? "가져오는 중…" : "우리 반에 가져오기"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-ghost qa-delete"
                    onClick={() => setConfirmDelete(t)}
                    disabled={!!busyId}
                    aria-label={`‘${t.title}’ 원본 삭제`}
                  >
                    <IconTrash size={18} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="프로젝트 원본 삭제"
          preview={confirmDelete.title}
          description={
            "원본만 지웁니다. 이미 반에서 시작한 프로젝트와 학생 카드는 그대로 남습니다.\n" +
            "다음부터 이 목록과 가져오기 목록에서 이 원본이 사라집니다.\n" +
            "원본은 되돌릴 수 없습니다."
          }
          confirmLabel="원본 삭제"
          danger
          onConfirm={() => handleDelete(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
