"use client";

// =============================================================
// 상단바 알림 벨 — 새 답변 / 답변 채택(이해됐어요) / 반 공지 / 모둠 메모
// -------------------------------------------------------------
// **두 곳을 함께 구독해 한 목록으로 보여 줍니다.**
//  · users/{uid}/notifications — Cloud Functions가 씁니다(답변·공지)
//  · groupMemos 중 내가 받은 안 읽은 것 — 모둠 친구가 직접 씁니다
//
// 왜 나뉘어 있나: 알림함은 **본인만** 읽고 쓸 수 있게 잠가 둔 자리라
// (교사도 못 읽습니다) 학생끼리 서로의 알림함에 쓰게 열 수 없습니다.
// 서버 함수로 우회할 수도 있지만 그러면 메모 하나 때문에 Cloud Functions
// 배포가 걸립니다. 그래서 메모는 제 컬렉션에 두고 **여기서 합칩니다.**
// 두 갈래는 id 공간이 달라 `_src`로 갈라 두고, 읽음 처리도 저마다입니다.
//
// 클릭하면: 답변 알림은 질문 게시판, 모둠 메모는 공부방의 '우리 모둠'
// (`/study?memo=<보낸사람>`)으로 갑니다. 반 공지는 갈 곳이 없습니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  subscribeMyNotifications,
  subscribeMyUnreadMemos,
  markGroupMemoRead,
  markNotificationRead,
  markAllNotificationsRead,
  pruneOldNotifications,
  formatTime,
  toDate,
} from "@/lib/store";
import { stripHtml } from "@/lib/html";

const LABELS = {
  new_answer: { icon: "💬", text: "새 답변이 달렸어요" },
  answer_understood: { icon: "💡", text: "내 답변이 채택됐어요" },
  class_notice: { icon: "📢", text: "선생님 공지" },
  group_memo: { icon: "✉️", text: "모둠 친구의 메모" },
};

export default function NotificationBell({ uid }) {
  const router = useRouter();
  const [notifs, setNotifs] = useState([]);
  const [memos, setMemos] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!uid) { setNotifs([]); return; }
    return subscribeMyNotifications(uid, setNotifs);
  }, [uid]);

  useEffect(() => {
    if (!uid) { setMemos([]); return; }
    return subscribeMyUnreadMemos(uid, setMemos);
  }, [uid]);

  // 두 갈래를 한 목록으로 — 최신순. 메모는 알림함 문서가 아니므로 여기서
  // 알림처럼 보이도록 모양을 맞춰 둡니다(_src로 갈라 읽음 처리를 나눔).
  const items = useMemo(() => {
    const a = notifs.map((n) => ({ ...n, _src: "notif" }));
    const b = memos.map((m) => ({
      id: m.id,
      _src: "memo",
      type: "group_memo",
      createdAt: m.createdAt,
      fromUid: m.fromUid,
      // 서식은 알림 줄에서 걷어 냅니다 — 목록은 한 줄짜리 미리보기입니다
      text: stripHtml(m.html || "").slice(0, 80),
      senderName: m.fromName,
    }));
    return [...a, ...b].sort(
      (x, y) => (toDate(y.createdAt)?.getTime() ?? 0) - (toDate(x.createdAt)?.getTime() ?? 0)
    );
  }, [notifs, memos]);

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

  // 두 구독 다 안 읽은 것만 올라오므로 그 수가 곧 뱃지 수입니다.
  const unreadCount = items.length;
  const [markingAll, setMarkingAll] = useState(false);

  // 알림 본문을 누르면 그 글이 있는 곳으로 갑니다. 여기서는 읽음 처리를 하지
  // 않습니다 — 읽음은 '읽음' 버튼으로만. 질문을 보러 갔다 돌아왔을 때
  // 알림이 사라져 있으면, 무엇을 보고 온 것인지 되짚을 자리가 없어집니다.
  // (모둠 메모만 예외입니다 — 그 대화를 여는 순간 읽음이 되는 것이 자연스러워
  //  '우리 모둠' 창이 스스로 처리합니다. 읽고 답까지 했는데 배지가 남으면
  //  무엇이 남은 것인지 알 수 없습니다.)
  function handleOpen(n) {
    if (n._src === "memo") {
      setOpen(false);
      router.push(`/study?memo=${n.fromUid}`);
      return;
    }
    // 반 공지는 열어 볼 글이 없습니다 — 내용이 알림 자체에 다 들어 있습니다.
    if (n.type === "class_notice" || !n.questionId) return;
    setOpen(false);
    router.push(`/board?open=${n.questionId}`);
  }

  // 한 건 읽음 — 읽으면 목록에서 빠집니다(안 읽은 것만 구독하므로).
  // 갈래마다 쓰는 곳이 달라 여기서 나눕니다.
  function handleRead(e, n) {
    e.stopPropagation();
    if (n._src === "memo") markGroupMemoRead(n.id).catch(() => {});
    else markNotificationRead(uid, n.id).catch(() => {});
  }

  async function handleReadAll() {
    if (markingAll || items.length === 0) return;
    setMarkingAll(true);
    try {
      await Promise.all([
        markAllNotificationsRead(uid),
        ...memos.map((m) => markGroupMemoRead(m.id)),
      ]);
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
                const isMemo = n._src === "memo";
                // 반 공지와 모둠 메모는 본문이 알림 줄에 그대로 들어갑니다
                const isNotice = n.type === "class_notice" || isMemo;
                // 반 공지는 열어 볼 글이 없어 눌러도 갈 곳이 없습니다 —
                // 누를 수 있는 것처럼 보이지 않도록 버튼이 아닌 칸으로 그립니다.
                // 모둠 메모는 '우리 모둠' 창으로 갑니다.
                const canOpen = isMemo || (!isNotice && !!n.questionId);
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
                  <li key={`${n._src}_${n.id}`} className="notif-row">
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
