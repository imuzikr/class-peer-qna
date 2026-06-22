"use client";

// 3단: 공지사항 패널 — 실시간 공지 목록 + 공지 작성(서식 지원)
import { useState } from "react";
import { addNotice, formatTime } from "@/lib/store";
import { getCurrentUser, isAdmin } from "@/lib/user";
import { sanitizeHtml, stripHtml } from "@/lib/html";
import { useCurrentUser } from "@/lib/useCurrentUser";
import RichTextEditor from "./RichTextEditor";

export default function NoticePanel({ notices }) {
  const user = useCurrentUser();
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(""); // 서식(HTML) 내용
  const [resetKey, setResetKey] = useState(0);

  async function handleSubmit(e) {
    e.preventDefault();
    const html = sanitizeHtml(content);
    if (!title.trim() || stripHtml(html).length === 0) return;
    await addNotice(getCurrentUser(), {
      title: title.trim(),
      content: html,
    });
    setTitle("");
    setContent("");
    setResetKey((k) => k + 1);
    setWriting(false);
  }

  return (
    <aside className="notice-col">
      <h2>
        📢 공지사항
        {/* 공지 작성은 관리자/교사 전용 (isAdmin 관문) */}
        {isAdmin(user) && (
          <button className="btn-ghost" onClick={() => setWriting(!writing)}>
            {writing ? "닫기" : "+ 작성"}
          </button>
        )}
      </h2>

      {writing && (
        <form
          className="form-grid"
          onSubmit={handleSubmit}
          style={{ marginBottom: 14 }}
        >
          <input
            type="text"
            placeholder="공지 제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <RichTextEditor
            key={resetKey}
            variant="full"
            small
            onChange={setContent}
            placeholder="공지 내용"
          />
          <button type="submit" className="btn-primary">
            공지 등록
          </button>
        </form>
      )}

      {notices.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-sub)" }}>
          등록된 공지가 없습니다.
        </p>
      )}
      {notices.map((n) => (
        <div className="notice-item" key={n.id}>
          <h4>{n.title}</h4>
          <div className="notice-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.content) }} />
          {/* 공지 작성자는 항상 "선생님"으로 표시됩니다 */}
          <time>
            👩‍🏫 {n.authorName ?? "선생님"} · {formatTime(n.createdAt)}
          </time>
        </div>
      ))}
    </aside>
  );
}
