"use client";

// =============================================================
// 손들기 대화 한 줄기 — 시간순 말풍선 (lib/signalThread.js의 threadEntries)
// -------------------------------------------------------------
// 쓰는 곳 셋: 학생 손바닥 창 · 교사 손든 학생 목록(QuestionSignalButton) ·
// 자리표의 '손들고 대화한 이력' 창(SignalHistoryModal). 한 모양을 함께 써야
// 같은 대화가 화면마다 다르게 안 보입니다.
//   viewer   'student' | 'teacher' — 그쪽의 말이 오른쪽(내 말)
//   whoName  상대가 학생일 때 '학생' 대신 쓸 이름(이력 창)
//   stamp    시각 적는 법 — 기본은 '방금 전'꼴, 이력 창은 날짜까지
// 첫 줄(손든 물음)은 태그 알약 + 메모, 메모가 없으면 '내용 없이 손을 들었어요'.
// =============================================================
import { formatTime } from "@/lib/store";
import { questionTagOf } from "@/lib/questionTags";

export default function SignalThread({ entries, viewer, compact = false, listRef, whoName, stamp }) {
  const timeOf = stamp ?? ((at) => formatTime(new Date(at)));
  return (
    <ol className={`qsig-thread${compact ? " qsig-thread--compact" : ""}`} ref={listRef}>
      {entries.map((m, i) => {
        const isFirst = m.first || (i === 0 && m.id === "first");
        const mineSide = m.from === viewer;
        const tag = isFirst ? questionTagOf(m.tag) : null;
        const who = m.from === "teacher"
          ? (viewer === "teacher" ? "나" : "선생님")
          : (viewer === "student" ? "나" : whoName || "학생");
        return (
          <li key={m.id} className={`qsig-msg qsig-msg--${m.from}${mineSide ? " qsig-msg--mine" : ""}`}>
            <span className="qsig-msg-bubble">
              {tag && (
                <span className={`qsig-tag qsig-tag--${m.tag} on`}>
                  <span aria-hidden="true">{tag.emoji}</span>
                  {tag.label}
                </span>
              )}
              {m.text
                ? <span className="qsig-msg-text">{m.text}</span>
                : isFirst && <span className="qsig-msg-empty">내용 없이 손을 들었어요</span>}
            </span>
            <span className="qsig-msg-meta">
              {who} · {m.at ? timeOf(m.at) : "보내는 중"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
