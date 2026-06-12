"use client";

// =============================================================
// 질문 상세 모달 — 2열 구조
//   [왼쪽] 질문 내용(서식 지원) + 첨부 이미지 미리보기 + 상태 토글
//   [오른쪽] 채팅형 대화방: 서식 입력 + 이미지 첨부 + 그리기
// =============================================================
import { useEffect, useRef, useState } from "react";
import {
  subscribeAnswers,
  addAnswer,
  formatTime,
  setQuestionResolved,
} from "@/lib/store";
import { getCurrentUser } from "@/lib/user";
import { sanitizeHtml, stripHtml } from "@/lib/html";
import { readImageAsDataUrl } from "@/lib/image";
import RichTextEditor, { IconImage, IconPen } from "./RichTextEditor";
import DrawingCanvas from "./DrawingCanvas";

export default function QuestionModal({ question, onClose }) {
  const user = getCurrentUser();
  const [answers, setAnswers] = useState([]);
  const [content, setContent] = useState(""); // 입력 중인 HTML
  const [answerImage, setAnswerImage] = useState(null); // 첨부 이미지
  const [drawing, setDrawing] = useState(false); // 그리기 캔버스 열림
  const [saving, setSaving] = useState(false);
  const [resetKey, setResetKey] = useState(0); // 전송 후 에디터 비우기
  const scrollRef = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribeAnswers(question.id, setAnswers);
    return unsubscribe;
  }, [question.id]);

  // 새 메시지가 오면 대화방을 맨 아래로 스크롤
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [answers]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 첨부할 수 있습니다.");
      return;
    }
    setAnswerImage(await readImageAsDataUrl(file));
    e.target.value = ""; // 같은 파일 재선택 가능하도록
  }

  async function handleSend() {
    const html = sanitizeHtml(content);
    const hasText = stripHtml(html).length > 0;
    // 글이 없어도 이미지만으로 전송 가능
    if ((!hasText && !answerImage) || saving) return;
    setSaving(true);
    try {
      await addAnswer(user, question.id, hasText ? html : "", answerImage);
      setContent("");
      setAnswerImage(null);
      setResetKey((k) => k + 1); // 에디터 비우기
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <button
          className="btn-close modal-close-float"
          onClick={onClose}
          aria-label="닫기"
        >
          ×
        </button>

        <div className="qa-grid">
          {/* ── 왼쪽: 질문 본문 + 첨부 이미지 ── */}
          <section className="qa-left">
            <div className="card-meta">
              <span className="keyword-chip"># {question.keyword}</span>
              <span>{question.authorName}</span>
              <span>·</span>
              <time>{formatTime(question.createdAt)}</time>
              {/* 상세 화면에서도 해결 상태를 바로 전환할 수 있습니다 */}
              <button
                type="button"
                className={`status-toggle qa-status ${
                  question.resolved ? "resolved" : "open"
                }`}
                onClick={() =>
                  setQuestionResolved(question.id, !question.resolved)
                }
                title="클릭해서 상태 바꾸기"
              >
                {question.resolved ? "✅ 해결됐어요" : "🙋 궁금해요"}
              </button>
            </div>
            <h3 className="qa-title">{question.title}</h3>
            <div
              className="qa-content"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(question.content),
              }}
            />

            {question.imageUrl && (
              <figure className="qa-figure">
                <figcaption>📎 첨부 이미지</figcaption>
                <img
                  src={question.imageUrl}
                  alt="질문 첨부 이미지"
                  className="qa-image"
                />
              </figure>
            )}
          </section>

          {/* ── 오른쪽: 채팅형 대화방 ── */}
          <section className="qa-right">
            <div className="chat-head">💬 대화 {answers.length + 1}개</div>

            <div className="chat-scroll" ref={scrollRef}>
              {/* 첫 메시지: 질문 */}
              <ChatMessage
                mine={question.authorId === user.uid}
                author={question.authorName}
                time={question.createdAt}
                badge="질문"
                html={question.content}
              />

              {answers.map((a) => (
                <ChatMessage
                  key={a.id}
                  mine={a.authorId === user.uid}
                  author={a.authorName}
                  time={a.createdAt}
                  html={a.content}
                  imageUrl={a.imageUrl}
                />
              ))}

              {answers.length === 0 && (
                <p className="chat-empty">
                  아직 답변이 없어요.
                  <br />첫 번째 답변을 남겨 보세요!
                </p>
              )}
            </div>

            {/* 입력 영역: 첨부 미리보기 + 도구 + 서식 에디터 + 전송 */}
            <div className="chat-compose">
              {answerImage && (
                <div className="chat-attach-preview">
                  <img src={answerImage} alt="첨부 미리보기" />
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setAnswerImage(null)}
                  >
                    ✕ 첨부 취소
                  </button>
                </div>
              )}
              {/* 입력창 — 하단 툴바에 첨부·그리기·서식 도구와 전송 버튼 */}
              <RichTextEditor
                key={resetKey}
                variant="chat"
                onChange={setContent}
                placeholder="의견을 공유해 볼까요?"
                onSend={handleSend}
                sendDisabled={
                  saving ||
                  (stripHtml(content).length === 0 && !answerImage)
                }
              >
                <label className="rte-tool" title="이미지 첨부">
                  <IconImage />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFile}
                    hidden
                  />
                </label>
                <button
                  type="button"
                  className="rte-tool"
                  title="그리기"
                  onClick={() => setDrawing(true)}
                >
                  <IconPen />
                </button>
              </RichTextEditor>
            </div>
          </section>
        </div>

        {/* 그리기 캔버스 — 완료하면 그림이 답변 첨부 이미지로 들어갑니다 */}
        {drawing && (
          <DrawingCanvas
            onSave={(dataUrl) => setAnswerImage(dataUrl)}
            onClose={() => setDrawing(false)}
          />
        )}
      </div>
    </div>
  );
}

// 채팅 말풍선 한 개 — 내 글은 오른쪽, 다른 사람 글은 왼쪽에 표시
function ChatMessage({ mine, author, time, html, imageUrl, badge }) {
  const hasText = stripHtml(html ?? "").length > 0;
  return (
    <div className={`chat-msg ${mine ? "mine" : ""}`}>
      <div className="chat-meta">
        {badge && <span className="chat-badge">{badge}</span>}
        <span>{author}</span> · <time>{formatTime(time)}</time>
      </div>
      <div className="chat-bubble">
        {hasText && (
          <div
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
          />
        )}
        {imageUrl && (
          <img src={imageUrl} alt="첨부 이미지" className="chat-image" />
        )}
      </div>
    </div>
  );
}
