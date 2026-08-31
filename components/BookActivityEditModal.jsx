"use client";

// =============================================================
// 독서 활동 고치기 (교사 전용) — 이름·주제어·도서 정보 주소
// -------------------------------------------------------------
// 만들 때 쓰는 화면(BookActivityForm)과 나눠 두었습니다. 그쪽은 종류를
// 고르고 모둠을 몇 개로 나눌지까지 정하는 자리인데, 여기서 그걸 함께
// 보여 주면 '바꿀 수 없는 것'이 절반입니다.
//
// [바꿀 수 있는 것] 화면에 적히는 글자뿐입니다.
// 낱말·기록은 활동 id로 이어져 있어(words 문서의 activityId, 경로의 actId)
// 이름을 바꿔도 학생이 넣은 것이 떨어져 나가지 않습니다.
//
// [바꿀 수 없는 것] 종류·모둠 방식·모둠 수. 이미 만들어 둔 판과 그 아래
// 낱말을 어디에 둘지가 달라지는 일이라, 고치는 게 아니라 새로 만드는
// 쪽이 맞습니다. 그래서 아예 내놓지 않고, 무엇이 그대로인지만 적어 둡니다.
// =============================================================
import { useEffect, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { renameBookActivity, BOOK_SOLO_TYPES } from "@/lib/store";
import { safeBookUrl } from "@/lib/paratext";

export default function BookActivityEditModal({ activity, onClose, onDone }) {
  const [title, setTitle] = useState(activity.title ?? "");
  const [topic, setTopic] = useState(activity.topic ?? "");
  const [bookUrl, setBookUrl] = useState(activity.bookUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const isSolo = BOOK_SOLO_TYPES.includes(activity.type);
  const perStudent = !isSolo && activity.groupMode === "solo";
  // 만들 때와 같은 기준 — 학생이 자기 자리에서 직접 적을 길이 있는 활동만
  // 주제어를 비워 둘 수 있습니다(BookActivityForm의 topicRequired 참고).
  const topicRequired = !perStudent && activity.type !== "paratext";
  const urlBad = bookUrl.trim().length > 0 && !safeBookUrl(bookUrl);

  async function handleSubmit(e) {
    e.preventDefault();
    // 조합 중인 한글은 state에 늦게 들어오므로 입력칸의 실제 값을 먼저 읽습니다
    const nextTitle = (titleRef.current?.value ?? title).trim();
    if (!nextTitle || (topicRequired && !topic.trim()) || urlBad || saving) return;
    setSaving(true);
    setError("");
    try {
      await renameBookActivity(activity.id, { title: nextTitle, topic, bookUrl }, activity);
      onDone?.();
      onClose();
    } catch (err) {
      setError(`고치지 못했어요: ${err?.message ?? "알 수 없는 오류"}`);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <form
        className="modal modal-book-edit"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>활동 고치기</h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="book-field-row">
          <label className="book-field">
            <span>활동 이름</span>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={40}
            />
          </label>
          <label className="book-field">
            <span>
              주제어 · 도서명
              {!topicRequired && <em className="book-optional">선택</em>}
            </span>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={topicRequired ? "예: 어린 왕자" : "비워 두면 학생이 직접 적어요"}
              maxLength={30}
            />
          </label>
        </div>

        {isSolo && (
          <label className="book-field">
            <span>
              도서 정보 사이트 <em className="book-optional">선택</em>
            </span>
            <input
              type="text"
              inputMode="url"
              value={bookUrl}
              onChange={(e) => setBookUrl(e.target.value)}
              placeholder="예: www.yes24.com/product/goods/..."
            />
            {/* 만들기 화면과 같은 문구·같은 클래스 */}
            <em className="book-help">
              {urlBad
                ? "열 수 없는 주소예요. http:// 또는 https:// 로 시작하는 주소를 넣어 주세요."
                : "넣어 두면 학생 화면에 ‘도서 정보’ 버튼이 생겨 새 탭으로 열립니다."}
            </em>
          </label>
        )}

        {/* 무엇이 그대로인지 — 바꿀 수 없는 것을 빈칸으로 두면 '왜 없지'를
            먼저 묻게 됩니다. 없는 이유를 한 줄로 적어 둡니다. */}
        <p className="modal-book-edit-note">
          학생이 넣은 낱말과 기록은 그대로 남습니다. 활동 종류와 모둠 구성은
          여기서 바꿀 수 없어요 — 이미 만들어 둔 판이 달라지기 때문입니다.
        </p>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button
            type="submit"
            className="btn-primary"
            disabled={!title.trim() || (topicRequired && !topic.trim()) || urlBad || saving}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
