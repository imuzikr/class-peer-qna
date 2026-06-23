"use client";

export default function ConfirmModal({
  icon = "🗑",
  title,
  preview,       // 대상 이름/제목 미리보기 (선택)
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  danger = false,
  onConfirm,
  onClose,
}) {
  return (
    <div
      className="modal-backdrop confirm-backdrop"
      onClick={onClose}
    >
      <div
        className="confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-icon-wrap">
          <span className="confirm-icon">{icon}</span>
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
