"use client";

// 새 질문 작성 모달 — 키워드 + 제목 + 내용(서식 지원) + 이미지 첨부 + 그리기
import { useState } from "react";
import { KEYWORDS, addQuestion } from "@/lib/store";
import { getCurrentUser } from "@/lib/user";
import { sanitizeHtml, stripHtml } from "@/lib/html";
import { readImageAsDataUrl } from "@/lib/image";
import RichTextEditor, { IconImage, IconPen } from "./RichTextEditor";
import DrawingCanvas from "./DrawingCanvas";

export default function NewQuestionForm({
  defaultKeyword,
  keywords = [], // 데이터에서 내려받은 키워드 목록 (이름 배열)
  initialContent = "", // 미리 채워 둘 내용 (파이썬 실행기의 '질문 만들기')
  onClose,
}) {
  // 아직 로드 전이면 기본 키워드로 폴백
  const list = keywords.length > 0 ? keywords : KEYWORDS;
  const [keyword, setKeyword] = useState(
    list.includes(defaultKeyword) ? defaultKeyword : list[0]
  );
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(initialContent); // 서식(HTML) 내용
  const [imageUrl, setImageUrl] = useState(null);
  const [drawing, setDrawing] = useState(false); // 그리기 캔버스 열림 여부
  const [saving, setSaving] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 첨부할 수 있습니다.");
      return;
    }
    setImageUrl(await readImageAsDataUrl(file));
    e.target.value = "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const html = sanitizeHtml(content);
    if (!title.trim() || stripHtml(html).length === 0) return;
    setSaving(true);
    try {
      await addQuestion(getCurrentUser(), {
        title: title.trim(),
        content: html,
        keyword,
        imageUrl,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>✏️ 새 질문 올리기</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="form-row">
            <select value={keyword} onChange={(e) => setKeyword(e.target.value)}>
              {list.map((kw) => (
                <option key={kw} value={kw}>
                  # {kw}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="질문 제목을 입력하세요"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* 서식 입력창 — 툴바에 이미지 첨부·그리기 도구 포함 */}
          <RichTextEditor
            variant="full"
            initialHtml={initialContent}
            onChange={setContent}
            placeholder="어떤 부분이 이해되지 않는지 구체적으로 적어 주세요. (예: 교과서 몇 쪽, 어떤 개념, 어디까지 풀었는지)"
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

          {imageUrl && (
            <div className="attach-row">
              <img
                src={imageUrl}
                alt="첨부 미리보기"
                className="attach-preview"
              />
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setImageUrl(null)}
              >
                ✕ 첨부 취소
              </button>
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "등록 중..." : "질문 등록"}
          </button>
        </form>

        {/* 그리기 캔버스 — 완료하면 그림이 첨부 이미지로 들어갑니다 */}
        {drawing && (
          <DrawingCanvas
            onSave={(dataUrl) => setImageUrl(dataUrl)}
            onClose={() => setDrawing(false)}
          />
        )}
      </div>
    </div>
  );
}
