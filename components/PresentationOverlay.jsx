"use client";

// =============================================================
// 발표 강제 전환 오버레이 — 교사가 보드 발표 모드·카드 크게 보기를 켜면
// 그 반 학생 전원의 화면이 이 화면으로 강제 전환됩니다(교사 화면은
// 그대로). 학생 쪽에는 닫기 버튼이 없고, 교사가 방송을 끝내면(또는
// 모달을 닫으면) 자동으로 사라집니다.
// =============================================================
import { sanitizeHtml } from "@/lib/html";

export default function PresentationOverlay({ broadcast }) {
  // 수업하기 — 선생님 화면 전체가 아니라 '슬라이드만' 화면 가득 띄웁니다.
  // (오른쪽 수업 메모는 교사 전용이라 방송에 담기지 않습니다)
  if (broadcast.mode === "lesson") {
    return (
      <div
        className="broadcast-overlay broadcast-overlay--lesson"
        role="alertdialog"
        aria-modal="true"
        aria-label="선생님 수업 화면"
      >
        {broadcast.imageUrl ? (
          <img
            className="broadcast-slide-img"
            src={broadcast.imageUrl}
            alt={`슬라이드 ${(broadcast.slideIndex ?? 0) + 1}`}
          />
        ) : (
          <p className="broadcast-lesson-wait">선생님이 수업을 준비하고 있어요.</p>
        )}
      </div>
    );
  }

  const isGroup = !!broadcast.isGroupCard;
  const html = sanitizeHtml(broadcast.content || "");
  const hasText = html.replace(/<[^>]*>/g, "").trim().length > 0;

  return (
    <div className="broadcast-overlay" role="alertdialog" aria-modal="true" aria-label="선생님 발표 화면">
      <div className="broadcast-bar">
        <span className="broadcast-live-dot" aria-hidden="true" />
        선생님이 화면을 보여주고 있어요
        {broadcast.boardTitle && <span className="broadcast-board"># {broadcast.boardTitle}</span>}
        {broadcast.mode === "carousel" && typeof broadcast.idx === "number" && (
          <span className="broadcast-progress">{broadcast.idx + 1} / {broadcast.total}</span>
        )}
      </div>

      <div className="broadcast-body">
        <div className="present-slide broadcast-slide">
          <div className="broadcast-who">
            <span aria-hidden="true">{isGroup ? "👥" : "🙂"}</span>
            <strong>{broadcast.displayName}</strong>
            {isGroup && broadcast.members?.length > 0 && (
              <span className="present-group-members">
                {broadcast.members.map((m) => m.name).join(" · ")}
              </span>
            )}
          </div>
          {broadcast.title && <h2 className="present-slide-title">{broadcast.title}</h2>}
          {hasText ? (
            <div
              className="present-slide-content study-card-body"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="present-empty">아직 작성한 내용이 없어요.</p>
          )}
        </div>
      </div>
    </div>
  );
}
