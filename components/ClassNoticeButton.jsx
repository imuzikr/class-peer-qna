"use client";

// =============================================================
// 반 공지 보내기 (교사 전용) — 상단바 확성기 버튼
// -------------------------------------------------------------
// 지금 보고 있는 반의 학생들에게만 인앱 알림을 보냅니다. 받는 사람은 서버가
// memberships로 정하므로(functions의 sendClassNotice), 화면에서 반을 잘못
// 고르지 않는 한 다른 반 학생에게 갈 일이 없습니다.
//
// 공지사항 게시판(notices)과 다른 자리입니다. 그쪽은 질문방에 남아 있는
// 글이고 전체 공유라 누구나 봅니다. 여기는 "지금 이 반에 알려야 하는 것"을
// 알림으로 밀어 주는 것이라, 남기지 않고 알림으로만 갑니다.
//
// 되돌릴 수 없는 동작이라(보낸 알림은 학생 문서에 이미 들어감) 보내기 전에
// 몇 명에게 가는지 보여 주고 한 번 더 확인합니다.
// =============================================================
import { useEffect, useRef, useState } from "react";
import { sendClassNotice, subscribeClassNotices, formatTime } from "@/lib/store";

const MAX_LEN = 500; // 서버(NOTICE_MAX_LEN)와 같은 값

export default function ClassNoticeButton({ classId, className = "", memberCount = 0 }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }
  const [history, setHistory] = useState([]); // 이 반에 보낸 공지(최신순)
  const wrapRef = useRef(null);
  const fieldRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 열면 바로 쓸 수 있게 — 공지는 짧게 급히 보내는 일이 많습니다
  useEffect(() => {
    if (open) fieldRef.current?.focus();
    else setResult(null);
  }, [open]);

  // 발송 이력은 팝오버가 열려 있는 동안만 구독합니다. 이 버튼은 상단바에
  // 있어 어느 화면에나 떠 있는데, 닫힌 채로 계속 듣고 있을 이유가 없습니다.
  useEffect(() => {
    if (!open || !classId) { setHistory([]); return; }
    return subscribeClassNotices(classId, setHistory);
  }, [open, classId]);

  async function handleSend() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await sendClassNotice(classId, body);
      setText("");
      setResult({ ok: true, message: `${res?.sent ?? 0}명에게 보냈어요.` });
    } catch (err) {
      // 서버가 이유를 문구로 돌려줍니다(권한·보관된 반·글자 수 등)
      setResult({ ok: false, message: err?.message || "보내지 못했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  // Ctrl/⌘+Enter로 보내기 — 앱의 다른 입력칸과 같은 약속입니다
  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  const left = MAX_LEN - text.length;

  return (
    <div className="notice-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn-ghost notice-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={className ? `${className}에 공지 보내기` : "반 공지 보내기"}
        aria-label="반 공지 보내기"
      >
        📢
      </button>

      {open && (
        <div className="notice-pop" role="dialog" aria-label="반 공지 보내기">
          <div className="notice-pop-head">
            <strong>📢 반 공지</strong>
            <span className="notice-pop-target">
              {className || "이 반"} · 학생 {memberCount}명
            </span>
          </div>

          <textarea
            ref={fieldRef}
            className="notice-pop-field"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
            onKeyDown={handleKeyDown}
            rows={4}
            placeholder="학생들에게 알릴 내용을 적어 주세요."
          />

          <div className="notice-pop-foot">
            <span className={`notice-pop-left${left <= 50 ? " warn" : ""}`}>{left}자 남음</span>
            <button
              type="button"
              className="btn-primary notice-pop-send"
              onClick={handleSend}
              disabled={busy || !text.trim()}
            >
              {busy ? "보내는 중…" : "보내기"}
            </button>
          </div>

          {result && (
            <p className={`notice-pop-result${result.ok ? " ok" : " bad"}`}>{result.message}</p>
          )}
          <p className="notice-pop-hint">
            보낸 공지는 되돌릴 수 없어요. Ctrl(⌘)+Enter로도 보낼 수 있어요.
          </p>

          {/* 보낸 이력 — 학생은 '읽음'으로 치우면 그만이지만, 교사에게는
              무엇을 언제 보냈는지 남아 있어야 같은 공지를 두 번 보내거나
              보냈는지 헷갈리는 일이 없습니다. */}
          <div className="notice-log">
            <div className="notice-log-head">보낸 공지</div>
            {history.length === 0 ? (
              <p className="notice-log-empty">아직 이 반에 보낸 공지가 없어요.</p>
            ) : (
              <ul className="notice-log-list">
                {history.map((n) => (
                  <li key={n.id} className="notice-log-item">
                    <div className="notice-log-meta">
                      <span className="notice-log-time">{formatTime(n.sentAt)}</span>
                      <span className="notice-log-count">{n.sentCount ?? 0}명</span>
                    </div>
                    <p className="notice-log-text">{n.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
