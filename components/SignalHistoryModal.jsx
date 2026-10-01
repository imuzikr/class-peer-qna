"use client";

// =============================================================
// 손들고 대화한 이력 — 한 학생이 이 반에서 손들고 나눈 대화 전부 (교사 전용)
// -------------------------------------------------------------
// 자리표의 과일 창(StudentToolsPopover)에서 엽니다. 손들기 대화의 말은 지우지
// 않고 쌓으므로(classes/{cId}/signalMessages) 그 학생 것을 **한 번** 읽어
// 줄기(손 한 번)마다 묶어 보여 줍니다 — 최근 것이 위, 줄기 안은 시간순.
// **줄기마다 접고 폅니다**(선생님 요청) — 머리줄(날짜 · 첫 물음 한 줄 · 말
// 수)이 여닫는 단추이고, 처음에는 맨 위(가장 최근) 대화만 펴 둡니다. 손을
// 여러 번 든 학생은 대화가 길게 쌓여 한참 굴려야 옛 대화에 닿았습니다.
// 셈은 lib/signalThread.js의 groupHistory, 말풍선은 SignalThread(손바닥 창과
// 같은 모양).
//
// body에 포털로 띄웁니다 — 자리표는 다른 모달 안(손든 학생 자리 확인 ·
// 확대 창)에도 서므로 그 창 안에 그리면 넘침에 잘립니다. z-index는 과일
// 팝오버(320) 위.
// =============================================================
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import { fetchSignalHistory } from "@/lib/store";
import { dateKeyLabel, dateKeyOf } from "@/lib/dates";
import { groupHistory } from "@/lib/signalThread";
import SignalThread from "./SignalThread";

const clock = (at) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// 접힌 줄에 세울 첫 물음 한 줄 — 글이 없으면(내용 없이 손들기) 태그 · '내용 없음'
const firstLine = (entries) => {
  const first = entries.find((e) => e.from === "student") ?? entries[0];
  const text = String(first?.text ?? "").replace(/\s+/g, " ").trim();
  return text || "내용 없이 손들기";
};

export default function SignalHistoryModal({ classId, student, onClose }) {
  const [threads, setThreads] = useState(null); // null = 읽는 중
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(() => new Set()); // 펼친 줄기 id

  useEffect(() => {
    let alive = true;
    setThreads(null);
    setError(null);
    fetchSignalHistory(classId, student.uid)
      .then((rows) => {
        if (!alive) return;
        const list = groupHistory(rows);
        setThreads(list);
        // 처음에는 가장 최근 대화만 펴 둡니다.
        setOpen(new Set(list.length ? [list[0].threadId] : []));
      })
      .catch((e) => {
        console.warn("[손들기] 이력을 읽지 못했어요:", e?.code, e?.message);
        if (alive) { setThreads([]); setError(e?.code || "unknown"); }
      });
    return () => { alive = false; };
  }, [classId, student.uid]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="modal-backdrop signal-history-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal signal-history-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${student.name} 손들고 대화한 이력`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 className="head-icon">
            🖐️ 손들고 대화한 이력
            <span className="signal-history-who">
              {student.studentId ? `${student.studentId} ` : ""}{student.name}
            </span>
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="signal-history-body">
          {threads === null ? (
            <p className="signal-history-empty">불러오는 중…</p>
          ) : error ? (
            <p className="signal-history-empty">이력을 읽지 못했어요({error}).</p>
          ) : threads.length === 0 ? (
            <p className="signal-history-empty">아직 손들고 나눈 대화가 없어요.</p>
          ) : (
            threads.map((t) => {
              const isOpen = open.has(t.threadId);
              const bodyId = `sighist-${t.threadId}`;
              return (
                <section key={t.threadId} className={`signal-history-thread${isOpen ? " open" : ""}`}>
                  <button
                    type="button"
                    className="signal-history-head"
                    aria-expanded={isOpen}
                    aria-controls={bodyId}
                    onClick={() => setOpen((prev) => {
                      const next = new Set(prev);
                      if (next.has(t.threadId)) next.delete(t.threadId);
                      else next.add(t.threadId);
                      return next;
                    })}
                  >
                    {/* 글자(▸)는 기기 글꼴에 따라 점처럼 작아져 선으로 그립니다 */}
                    <svg className="signal-history-caret" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                      <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="signal-history-date">
                      {t.startAt ? `${dateKeyLabel(dateKeyOf(new Date(t.startAt)))} ${clock(t.startAt)}` : "날짜 모름"}
                    </span>
                    {/* 접힌 동안만 — 펴면 대화 첫 줄이 곧 이것입니다 */}
                    {!isOpen && <span className="signal-history-preview">{firstLine(t.entries)}</span>}
                    <small className="signal-history-count">말 {t.entries.length}개</small>
                  </button>
                  {isOpen && (
                    <div id={bodyId} className="signal-history-thread-body">
                      <SignalThread entries={t.entries} viewer="teacher" whoName={student.name} stamp={clock} />
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
        <p className="signal-history-note">
          손을 들 때 적은 물음부터 선생님과 주고받은 말까지 남습니다. 학생 화면에는 이 이력이 보이지 않습니다.
        </p>
      </div>
    </div>,
    document.body
  );
}
