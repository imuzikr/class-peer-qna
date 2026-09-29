"use client";

// =============================================================
// 파이썬 연계 활동을 크게 쓰는 창 — 셀 편집기(글 셀 · 코드 셀)
// -------------------------------------------------------------
// 파이썬 실행기와 연계한 프로젝트(`board.pyLinked`, 모둠 아님)의 활동 칸은
// **이 창에서만** 씁니다. 두 자리가 함께 씁니다.
//   · 공부방 카드(StudyMyActivityCard) — 칸을 누르거나 '파이썬 실행기' 단추
//   · 수업 노트 서랍의 오늘의 활동(LessonTaskPanel) — '크게 열어 쓰기'
// 한때 서랍(380px) 안의 셀 편집기에서 썼는데, 코드를 짜기에 너무 좁아 걷었습니다
// (선생님 요청). 서식 에디터로 쓰는 '크게 쓰기' 창과 **같은 껍데기**
// (`.study-act-modal`)라 두 프로젝트가 같은 모양의 창에서 씁니다.
//
// [body에 포털로] 서랍은 transform이 걸려 있어 그 안의 fixed가 서랍 기준으로
// 바뀝니다. 배경은 `.study-act-backdrop`(z 3010) — 서랍(3001) 위.
//
// [저장은 부르는 쪽] 셀 목록이 바뀌면 `onChange(html, opts)`로 올리기만 합니다
// (PyCellEditor 그대로 — 결과가 붙을 때 `{ flush: true }`). 닫을 때 남은 것을
// 쓰는 것도 부르는 쪽의 일입니다.
//
// [Esc] 창을 닫습니다. 다만 CodeMirror가 먼저 쓴 Esc(자동 완성 닫기 따위)는
// 비켜 줍니다 — 안 그러면 완성 목록을 닫으려다 창이 닫힙니다.
// =============================================================
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import PyCellEditor from "./PyCellEditor";

export default function PyCellModal({
  index,
  title,
  onTitleChange = null, // 없으면 제목은 글자로만(서랍 — 제목은 카드에서 고칩니다)
  initialHtml,
  onChange,
  onClose,
  status = null, // 머리의 저장 알약 — "saving" | "saved" | "error" | 그 밖은 안 그림
  codeAtEnd = 0,
  startInCode = false,
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="modal-backdrop study-act-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal study-act-modal study-act-modal--cells"
        role="dialog"
        aria-modal="true"
        aria-label={`활동 ${index + 1} 쓰기`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="study-act-modal-head">
          <span className="activity-dash-no">활동 {index + 1}</span>
          {onTitleChange ? (
            <input
              type="text"
              className="study-act-modal-title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder={`활동 ${index + 1}`}
              maxLength={80}
            />
          ) : (
            <strong className="study-act-modal-title study-act-modal-title--view">
              {title || `활동 ${index + 1}`}
            </strong>
          )}
          {(status === "saving" || status === "saved" || status === "error") && (
            <span className={`study-autosave-pill study-autosave-pill--${status}`}>
              {status === "saving" && "저장 중…"}
              {status === "saved" && "✓ 자동 저장됨"}
              {status === "error" && "저장 실패"}
            </span>
          )}
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="study-act-modal-body study-act-cells-body">
          <PyCellEditor
            initialHtml={initialHtml}
            onChange={onChange}
            codeAtEnd={codeAtEnd}
            startInCode={startInCode}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
