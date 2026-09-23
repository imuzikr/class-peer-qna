"use client";

// =============================================================
// 프로젝트 원본 창 (교사) — 내 원본 목록 · 이 반에서 시작하기
// -------------------------------------------------------------
// 프로젝트는 선생님의 것이고 반의 것이 아닙니다(lib/store.js의
// studyTemplates 절). 이 창은 그 원본을 한 줄에 하나씩 늘어놓고, 지금 보고
// 있는 반에서 쓰려면 '이 반에서 시작하기'로 복사본을 만듭니다.
//
// 줄마다 서는 것:
//   · 이 반에 이미 복사본이 있으면 '이 반에서 진행 중' + [열기]
//     (같은 원본을 한 반에 두 번 시작하지 않게 — 두 번 누르면 같은 이름의
//     프로젝트가 둘이 되어, 원본을 둔 까닭이 도로 무너집니다)
//   · 없으면 [이 반에서 시작하기]
//   · 다른 반 어디에서 쓰는 중인지(이름만) — 이미 받아 둔 보드 목록으로
//     셉니다(읽기가 늘지 않습니다).
//
// 원본을 지워도 **복사본은 그대로**입니다. 되묻는 창이 그것을 밝힙니다.
// =============================================================
import { useEffect, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { toDate } from "@/lib/store";
import { IconIndividual, IconGroup } from "./StatusIcons";
import ConfirmModal from "./ConfirmModal";

function dateLabel(value) {
  const d = value ? toDate(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export default function StudyTemplateModal({
  templates = [],
  className = "",
  classBoards = [],   // 지금 이 반의 프로젝트 — 복사본이 이미 있는지 봅니다
  usedIn = {},        // 원본 id → 그 원본을 쓰는 다른 반 이름들
  highlightId = null, // 방금 만든 원본 — 그 줄을 짚어 둡니다
  readOnly = false,   // 보관된 반 — 시작할 수 없습니다
  onStart,            // (template) => Promise
  onOpenBoard,        // (boardId) => void
  onDelete,           // (template) => Promise
  onCreate,           // 새 원본 만들기 창 열기
  onClose,
}) {
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const highlightRef = useRef(null);

  // 방금 만든 원본은 목록 끝에 섭니다(만든 차례) — 원본이 많으면 창 밖일 수
  // 있어 그 줄까지 굴려 둡니다.
  useEffect(() => {
    highlightRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [highlightId, templates.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !confirmDelete) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, confirmDelete]);

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
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal modal-study-templates"
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-tpl-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="study-tpl-title">📚 프로젝트 원본</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <p className="study-tpl-intro">
          프로젝트는 반이 아니라 선생님에게 붙어 있어요. 반에서 쓰려면
          {className ? ` ‘${className}’에서 ` : " "}
          <strong>이 반에서 시작하기</strong>를 누르세요 — 그 반에 복사본이 하나
          열리고, 학생 카드는 반마다 따로 쌓입니다.
        </p>

        {templates.length === 0 ? (
          <p className="study-tpl-empty">
            아직 만든 원본이 없어요. 아래 ‘＋ 새 원본 만들기’로 시작해 보세요.
          </p>
        ) : (
          <ul className="study-tpl-list">
            {templates.map((t) => {
              const inst = instanceOf.get(t.id);
              const others = usedIn[t.id] ?? [];
              const isGroup = t.activityType === "group";
              const acts = t.activities?.length ?? 0;
              const hl = t.id === highlightId;
              return (
                <li
                  key={t.id}
                  ref={hl ? highlightRef : undefined}
                  className={`study-tpl-row${hl ? " is-new" : ""}${inst ? " is-here" : ""}`}
                >
                  <span className="study-tpl-name">
                    <strong title={t.title}>{t.title}</strong>
                    <small>
                      <span className="study-tpl-kind">
                        {isGroup ? <IconGroup size={13} /> : <IconIndividual size={13} />}
                        {isGroup ? "모둠" : "개별"}
                      </span>
                      {` · 활동 ${acts}개`}
                      {dateLabel(t.createdAt) ? ` · ${dateLabel(t.createdAt)}` : ""}
                    </small>
                    {others.length > 0 && (
                      <small className="study-tpl-used">
                        다른 반에서 쓰는 중: {others.join(", ")}
                      </small>
                    )}
                  </span>

                  <span className="study-tpl-actions">
                    {inst ? (
                      <>
                        <span className="study-tpl-here">이 반에서 진행 중</span>
                        <button
                          type="button"
                          className="study-trash-btn"
                          onClick={() => onOpenBoard?.(inst.id)}
                        >
                          열기
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="study-tpl-start"
                        onClick={() => handleStart(t)}
                        disabled={readOnly || !!busyId}
                        title={
                          readOnly
                            ? "보관된 반에서는 시작할 수 없어요"
                            : `${className ? `‘${className}’` : "이 반"}에 복사본을 하나 열어요`
                        }
                      >
                        {busyId === t.id ? "여는 중…" : "이 반에서 시작하기"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="study-trash-btn danger"
                      onClick={() => setConfirmDelete(t)}
                      disabled={!!busyId}
                      aria-label={`‘${t.title}’ 원본 지우기`}
                    >
                      삭제
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="study-tpl-foot">
          <button type="button" className="btn-primary" onClick={onCreate}>
            ＋ 새 원본 만들기
          </button>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="원본 지우기"
          preview={confirmDelete.title}
          description={
            "원본만 지웁니다. 이미 반에서 시작한 프로젝트와 학생 카드는 그대로 남습니다.\n" +
            "다음부터 가져오기 목록과 이 창에서 이 원본이 사라집니다.\n" +
            "원본은 되돌릴 수 없습니다."
          }
          confirmLabel="원본 삭제"
          danger
          onConfirm={() => handleDelete(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
