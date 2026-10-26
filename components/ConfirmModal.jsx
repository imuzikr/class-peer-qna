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
        <div className="confirm-icon-wrap">
          <span className="confirm-icon">{iconNode}</span>
        </div>

        <h3 id="confirm-title" className="confirm-title">{title}</h3>

        {preview && (
          <p className="confirm-preview">"{preview}"</p>
        )}

        <p className="confirm-desc">{description}</p>

        {/* cancelLabel={null}이면 알리기만 하는 창 — 단추 하나(확인)가 줄을 다 씁니다 */}
        <div className="confirm-actions">
          {cancelLabel != null && (
            <button
              type="button"
              className="btn-ghost confirm-cancel"
              onClick={onClose}
              autoFocus
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={`confirm-confirm${danger ? " danger" : ""}`}
            onClick={onConfirm}
            autoFocus={cancelLabel == null}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
