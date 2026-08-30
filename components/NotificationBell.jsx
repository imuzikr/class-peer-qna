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

  const unreadCount = items.filter((n) => !n.read).length;

  function handleClick(n) {
    if (!n.read) markNotificationRead(uid, n.id);
    // 반 공지는 열어 볼 글이 없습니다 — 내용이 알림 자체에 다 들어 있어서
    // 목록을 닫지 않고 읽음 처리만 합니다(누르자마자 사라지면 다 못 읽습니다).
    if (n.type === "class_notice" || !n.questionId) return;
    setOpen(false);
    router.push(`/board?open=${n.questionId}`);
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
            <p className="notif-empty">아직 알림이 없어요.</p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => {
                const label = LABELS[n.type] ?? { icon: "🔔", text: "알림" };
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={`notif-item${n.read ? "" : " unread"}`}
                      onClick={() => handleClick(n)}
                    >
                      <span className="notif-item-head">
                        <span aria-hidden="true">{label.icon}</span> {label.text}
                        <span className="notif-item-time">{formatTime(n.createdAt)}</span>
                      </span>
                      <span
                        className={`notif-item-sub${
                          n.type === "class_notice" ? " notif-item-sub--full" : ""
                        }`}
                      >
                        {n.type === "class_notice" ? n.text : n.questionTitle}
                      </span>
                      {n.type === "class_notice" && (n.senderName || n.className) && (
                        <span className="notif-item-from">
                          {[n.className, n.senderName].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
