"use client";

// =============================================================
// 상단바 알림 벨 — 새 답변 / 답변 채택(이해됐어요) 인앱 알림
// -------------------------------------------------------------
// users/{uid}/notifications를 구독합니다(Cloud Functions가 씀).
// 클릭하면 읽음 처리 후 해당 질문을 질문 게시판에서 열어 줍니다.
// =============================================================
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  subscribeMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  pruneOldNotifications,
  formatTime,
} from "@/lib/store";

const LABELS = {
  new_answer: { icon: "💬", text: "새 답변이 달렸어요" },
  answer_understood: { icon: "💡", text: "내 답변이 채택됐어요" },
  class_notice: { icon: "📢", text: "선생님 공지" },
};

export default function NotificationBell({ uid }) {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!uid) { setItems([]); return; }
    return subscribeMyNotifications(uid, setItems);
  }, [uid]);

  // 읽은 지 오래된 알림 정리 — 접속할 때 한 번, 자기 것만. 화면에는 최근
  // 20개만 보여서 눈에 안 띌 뿐 문서는 계속 쌓입니다(반 공지가 생기면서
  // 한 번에 학생 수만큼 늘어납니다). 실패해도 무시합니다 — 정리가 안 된다고
  // 알림 표시를 막을 이유는 없습니다.
  useEffect(() => {
    if (!uid) return;
    pruneOldNotifications(uid).catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // 목록에는 안 읽은 것만 올라오므로(subscribeMyNotifications) 그 수가 곧 뱃지 수입니다.
  const unreadCount = items.length;
  const [markingAll, setMarkingAll] = useState(false);

  // 알림 본문을 누르면 그 질문으로 갑니다. 여기서는 읽음 처리를 하지
  // 않습니다 — 읽음은 '읽음' 버튼으로만. 질문을 보러 갔다 돌아왔을 때
  // 알림이 사라져 있으면, 무엇을 보고 온 것인지 되짚을 자리가 없어집니다.
  function handleOpen(n) {
    // 반 공지는 열어 볼 글이 없습니다 — 내용이 알림 자체에 다 들어 있습니다.
    if (n.type === "class_notice" || !n.questionId) return;
    setOpen(false);
    router.push(`/board?open=${n.questionId}`);
  }

  // 한 건 읽음 — 읽으면 목록에서 빠집니다(안 읽은 것만 구독하므로).
  function handleRead(e, n) {
    e.stopPropagation();
    markNotificationRead(uid, n.id).catch(() => {});
  }

  async function handleReadAll() {
    if (markingAll || items.length === 0) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(uid);
    } catch {
      /* 실패하면 목록이 그대로 남습니다 — 다시 누르면 됩니다 */
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn-ghost notif-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="알림"
        aria-label={unreadCount > 0 ? `알림 ${unreadCount}건` : "알림"}
      >
        🔔
        {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-dropdown" role="menu">
          {items.length === 0 ? (
            <p className="notif-empty">읽지 않은 알림이 없어요.</p>
          ) : (
            <>
            <div className="notif-tools">
              <span className="notif-tools-count">읽지 않음 {items.length}</span>
              <button
                type="button"
                className="notif-readall"
                onClick={handleReadAll}
                disabled={markingAll}
              >
                {markingAll ? "처리 중…" : "모두 읽음"}
              </button>
            </div>
            <ul className="notif-list">
              {items.map((n) => {
                const label = LABELS[n.type] ?? { icon: "🔔", text: "알림" };
                const isNotice = n.type === "class_notice";
                // 반 공지는 열어 볼 글이 없어 눌러도 갈 곳이 없습니다 —
                // 누를 수 있는 것처럼 보이지 않도록 버튼이 아닌 칸으로 그립니다.
                const canOpen = !isNotice && !!n.questionId;
                const body = (
                  <>
                    <span className="notif-item-head">
                      <span aria-hidden="true">{label.icon}</span> {label.text}
                      <span className="notif-item-time">{formatTime(n.createdAt)}</span>
                    </span>
                    <span
                      className={`notif-item-sub${isNotice ? " notif-item-sub--full" : ""}`}
                    >
                      {isNotice ? n.text : n.questionTitle}
                    </span>
                    {isNotice && (n.senderName || n.className) && (
                      <span className="notif-item-from">
                        {[n.className, n.senderName].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={n.id} className="notif-row">
                    {canOpen ? (
                      <button
                        type="button"
                        className="notif-item unread"
                        onClick={() => handleOpen(n)}
                      >
                        {body}
                      </button>
                    ) : (
                      <div className="notif-item unread notif-item--static">{body}</div>
                    )}
                    {/* 읽음은 본문과 따로입니다 — 질문을 보러 갔다고 해서
                        알림이 사라지면, 돌아왔을 때 무엇을 보고 온 것인지
                        되짚을 자리가 없어집니다. 치우는 것은 학생이 정합니다. */}
                    <button
                      type="button"
                      className="notif-read-btn"
                      onClick={(e) => handleRead(e, n)}
                      title="읽음으로 표시하고 목록에서 치우기"
                    >
                      읽음
                    </button>
                  </li>
                );
              })}
            </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
