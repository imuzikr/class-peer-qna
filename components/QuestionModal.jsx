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
  setUnderstoodAnswer,
} from "@/lib/store";
import { getCurrentUser, isAdmin } from "@/lib/user";
import { isFirebaseConfigured } from "@/lib/firebase";
import { sanitizeHtml, stripHtml } from "@/lib/html";
import { readImageAsDataUrl } from "@/lib/image";
import RichTextEditor, { IconImage, IconPen } from "./RichTextEditor";
import DrawingCanvas from "./DrawingCanvas";
import MeTooButton from "./MeTooButton";
import NewQuestionForm from "./NewQuestionForm";
import AuthorBadge from "./AuthorBadge";

export default function QuestionModal({ question, keywords = [], onClose }) {
  const user = getCurrentUser();
  const mine = question.authorId === user.uid; // 내가 쓴 질문인지
  const [answers, setAnswers] = useState([]);
  const [content, setContent] = useState(""); // 입력 중인 HTML
  const [answerImage, setAnswerImage] = useState(null); // 첨부 이미지
  const [drawing, setDrawing] = useState(false); // 그리기 캔버스 열림
  const [editing, setEditing] = useState(false); // 질문 수정 모달 열림
  const [saving, setSaving] = useState(false);
  const [resetKey, setResetKey] = useState(0); // 전송 후 에디터 비우기
  const scrollRef = useRef(null);
  const understoodAnswerId = question.understoodAnswerId ?? null;

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

  function handleUnderstood(answerId) {
    setUnderstoodAnswer(
      question.id,
      understoodAnswerId === answerId ? null : answerId
    );
  }

  const canManageUnderstood =
    question.authorId === user.uid || isAdmin(user) || !isFirebaseConfigured;

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
            {/* 본문은 스크롤되고, 아래 qa-foot은 항상 보입니다 */}
            <div className="qa-left-scroll">
              <div className="card-meta">
                <span className="keyword-chip"># {question.keyword}</span>
                {/* 작성자 프로필 — 관리자는 클릭해서 실명 확인 가능 */}
                <AuthorBadge
                  name={question.authorName}
                  emoji={question.authorEmoji}
                  realName={question.authorRealName}
                  uid={question.authorId}
                />
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
            </div>

            {/* 왼쪽 하단 고정 — 나도 궁금해요 + (내 글이면) 수정 버튼 */}
            <div className="qa-foot">
              <MeTooButton question={question} />
              {mine && (
                <button
                  type="button"
                  className="btn-ghost qa-edit"
                  onClick={() => setEditing(true)}
                  title="질문 내용 고치기"
                >
                  ✏️ 수정
                </button>
              )}
            </div>
          </section>

          {/* ── 오른쪽: 채팅형 대화방 ── */}
          <section className="qa-right">
            <div className="chat-head">💬 대화 {answers.length + 1}개</div>

            <div className="chat-scroll" ref={scrollRef}>
              {/* 첫 메시지: 질문 */}
              <ChatMessage
                mine={question.authorId === user.uid}
                author={question.authorName}
                emoji={question.authorEmoji}
                realName={question.authorRealName}
                uid={question.authorId}
                time={question.createdAt}
                badge="질문"
                html={question.content}
              />

              {answers.map((a) => (
                <ChatMessage
                  key={a.id}
                  mine={a.authorId === user.uid}
                  author={a.authorName}
                  emoji={a.authorEmoji}
                  realName={a.authorRealName}
                  uid={a.authorId}
                  time={a.createdAt}
                  html={a.content}
                  imageUrl={a.imageUrl}
                  understood={understoodAnswerId === a.id}
                  showUnderstoodIcon
                  canMarkUnderstood={canManageUnderstood && a.authorId !== user.uid}
                  onToggleUnderstood={() => handleUnderstood(a.id)}
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

        {/* 질문 수정 — 작성 폼을 수정 모드로 재사용합니다 */}
        {editing && (
          <NewQuestionForm
            question={question}
            keywords={keywords}
            onClose={() => setEditing(false)}
          />
        )}
      </div>
    </div>
  );
}

function IconTipsAndUpdates() {
  return (
    <svg
      className="understood-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 10H2V8h2v2Zm18 0h-2V8h2v2ZM5.65 5.05 4.25 3.65l1.4-1.4 1.4 1.4-1.4 1.4Zm12.7 0-1.4-1.4 1.4-1.4 1.4 1.4-1.4 1.4ZM11 22c-.55 0-1.02-.2-1.41-.59C9.2 21.02 9 20.55 9 20h6c0 .55-.2 1.02-.59 1.41-.39.39-.86.59-1.41.59h-2Zm-3-3v-2h8v2H8Zm.25-3c-1.32-.78-2.36-1.78-3.11-3A7.1 7.1 0 0 1 4 9.25c0-2.2.78-4.08 2.34-5.64C7.9 2.05 9.78 1.27 12 1.27s4.1.78 5.66 2.34C19.22 5.17 20 7.05 20 9.25c0 1.4-.38 2.65-1.14 3.75-.75 1.22-1.79 2.22-3.11 3H8.25Zm.65-2h6.2c.9-.58 1.61-1.28 2.13-2.11.51-.84.77-1.72.77-2.64 0-1.65-.59-3.06-1.76-4.24C15.06 3.84 13.65 3.25 12 3.25s-3.06.59-4.24 1.76C6.59 6.19 6 7.6 6 9.25c0 .92.26 1.8.77 2.64.52.83 1.23 1.53 2.13 2.11Z" />
    </svg>
  );
}

// 채팅 말풍선 한 개 — 내 글은 오른쪽, 다른 사람 글은 왼쪽에 표시
function ChatMessage({
  mine,
  author,
  emoji,
  realName,
  uid,
  time,
  html,
  imageUrl,
  badge,
  understood = false,
  showUnderstoodIcon = false,
  canMarkUnderstood = false,
  onToggleUnderstood,
}) {
  const hasText = stripHtml(html ?? "").length > 0;
  return (
    <div className={`chat-msg ${mine ? "mine" : ""} ${understood ? "understood" : ""}`}>
      <div className="chat-meta">
        {badge && <span className="chat-badge">{badge}</span>}
        {showUnderstoodIcon && (
          canMarkUnderstood ? (
            <button
              type="button"
              className={`understood-bulb ${understood ? "on" : ""}`}
              onClick={onToggleUnderstood}
              aria-label={
                understood
                  ? "이해됐어요 표시 해제"
                  : "이 답변으로 이해됐어요 표시"
              }
              title={
                understood
                  ? "이해됐어요 표시 해제"
                  : "이 답변으로 이해됐어요"
              }
            >
              <IconTipsAndUpdates />
            </button>
          ) : (
            <span
              className={`understood-bulb readonly ${understood ? "on" : ""}`}
              title={understood ? "질문자가 이해됐어요로 표시한 답변" : "답변"}
            >
              <IconTipsAndUpdates />
            </span>
          )
        )}
        {/* 작성자 프로필 — 관리자는 클릭해서 실명 확인 가능 */}
        <AuthorBadge name={author} emoji={emoji} realName={realName} uid={uid} />
        {" · "}
        <time>{formatTime(time)}</time>
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
