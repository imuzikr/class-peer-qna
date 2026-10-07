"use client";

// =============================================================
// 돌발 퀴즈 — 교사 창과 학생 창이 함께 쓰는 조각
// -------------------------------------------------------------
// 물음(제목 · 글/코드 · 설명)과 답 하나를 읽기 전용으로 그립니다. 두 창이
// 따로 그리면 같은 퀴즈가 교사와 학생 화면에서 다른 모양이 됩니다.
// =============================================================
import { sanitizeHtml } from "@/lib/html";
import { quizKindLabel, splitQuizDesc } from "@/lib/popQuiz";
import { formatTime } from "@/lib/store";

// 물음 — 설명의 ``` 은 코드 블록으로(lib/popQuiz.js의 splitQuizDesc).
export function PopQuizQuestion({ quiz, compact = false }) {
  if (!quiz) return null;
  const parts = splitQuizDesc(quiz.desc);
  return (
    <div className={`pq-question${compact ? " pq-question--compact" : ""}`}>
      <div className="pq-question-head">
        <span className={`pq-kind pq-kind--${quiz.kind === "code" ? "code" : "text"}`}>
          {quizKindLabel(quiz.kind)}
        </span>
        <h4 className="pq-title">{quiz.title}</h4>
      </div>
      {parts.length > 0 && (
        <div className="pq-desc">
          {parts.map((p, i) =>
            p.type === "code" ? (
              <pre key={i} className="pq-desc-code"><code>{p.text}</code></pre>
            ) : (
              <p key={i} className="pq-desc-text">{p.text}</p>
            )
          )}
        </div>
      )}
      {!compact && (quiz.boardTitle || quiz.createdAt) && (
        <p className="pq-meta">
          {quiz.boardTitle ? `${quiz.boardTitle} · ` : ""}
          {formatTime(quiz.createdAt)}
          {quiz.open ? "" : " · 마침"}
        </p>
      )}
    </div>
  );
}

// 답 한 장 — 글은 정화한 HTML, 코드는 글자 그대로 + 실행 결과.
export function PopQuizAnswerBody({ answer }) {
  if (!answer) return null;
  if (answer.kind === "code") {
    return (
      <div className="pq-answer pq-answer--code">
        <pre className="pq-answer-code"><code>{answer.text}</code></pre>
        {answer.output ? (
          <div className="pq-answer-out">
            <span className="pq-answer-out-label">실행 결과</span>
            <pre>{answer.output}</pre>
          </div>
        ) : (
          <p className="pq-answer-noout">실행 결과 없이 보냈어요.</p>
        )}
      </div>
    );
  }
  return (
    <div
      className="pq-answer pq-answer--text study-card-content"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(answer.text ?? "") }}
    />
  );
}

// 상태 알약 — 두 창이 같은 말을 씁니다.
export function PopQuizStatus({ answer, quizOpen = true }) {
  const st = answer?.status;
  if (st === "rewarded") return <span className="pq-status pq-status--done">🍊 과일 받음</span>;
  if (st === "submitted") return <span className="pq-status pq-status--sent">보냄 · 확인 전</span>;
  if (st === "returned") return <span className="pq-status pq-status--returned">반송됨</span>;
  return <span className="pq-status pq-status--none">{quizOpen ? "아직 안 보냄" : "보내지 않음"}</span>;
}

// 접고 펴는 삼각형 — 선 그림(글자 ▸는 기기 글꼴에 따라 점처럼 작아짐).
export function Caret({ open }) {
  return (
    <svg className={`pq-caret${open ? " open" : ""}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
