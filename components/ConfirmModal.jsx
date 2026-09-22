"use client";

import { backdropClose } from "@/lib/modal";
import { IconTrash } from "./StatusIcons";

export default function ConfirmModal({
  icon,
  title,
  preview,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  danger = false,
  // 그림을 감싼 동그라미 색. 기본은 붉은 기(지우기) — 이 창이 태어난 자리가
  // 삭제 확인이라 지금까지 부르는 곳이 모두 그쪽입니다. 지우는 일이 아닌
  // 되묻기('멋진 순간'처럼 주는 일)만 'reward'로 바꿔 부릅니다.
  // **기본값을 바꾸지 마세요** — 열두 곳이 이 값을 그대로 쓰고 있습니다.
  iconTone = "danger",
  onConfirm,
  onClose,
}) {
  const iconNode = icon !== undefined ? icon : <IconTrash size={40} />;

  return (
    <div
      className="modal-backdrop confirm-backdrop"
      {...backdropClose(onClose)}
    >
      <div
        className="confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`confirm-icon-wrap confirm-icon-wrap--${iconTone}`}>
          <span className="confirm-icon">{iconNode}</span>
        </div>

        <h3 id="confirm-title" className="confirm-title">{title}</h3>

        {preview && (
          <p className="confirm-preview">"{preview}"</p>
        )}

        <p className="confirm-desc">{description}</p>

        <div className="confirm-actions">
          <button
            type="button"
            className="btn-ghost confirm-cancel"
            onClick={onClose}
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-confirm${danger ? " danger" : ""}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
