"use client";

// =============================================================
// 열 개의 해시태그 — 슬라이드 아래 댓글
// -------------------------------------------------------------
// 쓰는 사람이 말머리를 고릅니다 — 좋아요 · 궁금해요 · 제안합니다. 무엇을
// 하려는 댓글인지 먼저 밝히면 '좋아요' 한 마디만 쌓이지 않고 묻고 제안하는
// 말이 섞입니다.
//
// [이름] 실명(학번 + 이름)으로 답니다 — 익명이면 함부로 씁니다.
// [고치기] 없습니다. 지우고 다시 씁니다(답이 달린 뒤 원래 글이 바뀌면
//   대화가 어긋납니다).
// [지우기] 쓴 사람과 선생님. **그 해시태그의 주인은 못 지웁니다** — 마음에 안 드는
//   '제안합니다'를 주인이 걷어 내면 댓글의 뜻이 없어집니다(규칙도 같음).
// =============================================================
import { useState } from "react";
import { addHashtagComment, deleteHashtagComment } from "@/lib/store";
import {
  HASHTAG_COMMENT_KINDS,
  HASHTAG_COMMENT_MAX,
  commentAuthorLabel,
  commentKindOf,
  sortComments,
  timeOf,
} from "@/lib/hashtag";
import ConfirmModal from "./ConfirmModal";

function whenLabel(c) {
  const t = timeOf(c?.createdAt, 0);
  if (!t) return "방금";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(t));
}

export default function HashtagComments({
  activityId,
  postUid,
  comments = [],
  user,
  isTeacher = false,
  canWrite = false,       // 지금 댓글을 달 수 있나(공개 · 잠기지 않음, 교사는 늘)
  closedNote = "",        // 못 달 때 까닭 한 줄
  highlightAfter = null,  // 이 시각 뒤에 온 남의 댓글은 '새 댓글'로 칠함
  ownerUid = null,
}) {
  const [kind, setKind] = useState("like");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const list = sortComments(comments);
  const seenMs = highlightAfter == null ? null : timeOf(highlightAfter, 0);

  async function submit(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError("");
    try {
      await addHashtagComment(activityId, user, { postUid, kind, text: body, byTeacher: isTeacher });
      setText("");
    } catch (err) {
      setError(`댓글을 달지 못했어요: ${err?.message ?? "알 수 없는 오류"}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const target = confirmDel;
    setConfirmDel(null);
    try {
      await deleteHashtagComment(activityId, target.id);
    } catch (err) {
      setError(`지우지 못했어요: ${err?.message ?? "알 수 없는 오류"}`);
    }
  }

  const hint = commentKindOf(kind).hint;

  return (
    <section className="htc" aria-label="댓글">
      <h3 className="htc-head">
        댓글 <b>{list.length}</b>
      </h3>

      {list.length === 0 ? (
        <p className="htc-empty">아직 댓글이 없어요.</p>
      ) : (
        <ul className="htc-list">
          {list.map((c) => {
            const k = commentKindOf(c.kind);
            const mine = c.authorId === user?.uid;
            const fresh =
              seenMs != null &&
              c.authorId !== ownerUid &&
              timeOf(c.createdAt, Date.now()) > seenMs;
            return (
              <li key={c.id} className={`htc-item${fresh ? " fresh" : ""}${c.byTeacher ? " teacher" : ""}`}>
                <div className="htc-meta">
                  <span className={`htc-kind htc-kind--${k.key}`}>{k.label}</span>
                  <strong className="htc-who">{commentAuthorLabel(c)}</strong>
                  <span className="htc-when">{whenLabel(c)}</span>
                  {fresh && <span className="htc-new">새 댓글</span>}
                  {(mine || isTeacher) && (
                    <button
                      type="button"
                      className="htc-del"
                      onClick={() => setConfirmDel(c)}
                      title={mine ? "내 댓글 지우기" : "선생님 권한으로 지우기"}
                    >
                      지우기
                    </button>
                  )}
                </div>
                <p className="htc-text">{c.text}</p>
              </li>
            );
          })}
        </ul>
      )}

      {canWrite ? (
        <form className="htc-form" onSubmit={submit}>
          <div className="htc-kinds" role="radiogroup" aria-label="댓글 말머리">
            {HASHTAG_COMMENT_KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                role="radio"
                aria-checked={kind === k.key}
                className={`htc-kind-btn htc-kind--${k.key}${kind === k.key ? " on" : ""}`}
                onClick={() => setKind(k.key)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e);
            }}
            rows={2}
            maxLength={HASHTAG_COMMENT_MAX}
            placeholder={`${hint} (${isTeacher ? "선생님" : "실명"}으로 달려요)`}
            aria-label="댓글 내용"
          />
          <div className="htc-form-foot">
            <span className="htc-count">
              {text.length} / {HASHTAG_COMMENT_MAX}
            </span>
            <button type="submit" className="btn-primary" disabled={!text.trim() || busy}>
              {busy ? "다는 중…" : "댓글 달기"}
            </button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      ) : (
        closedNote && <p className="htc-closed">{closedNote}</p>
      )}

      {confirmDel && (
        <ConfirmModal
          title="댓글 지우기"
          preview={confirmDel.text}
          description="지운 댓글은 되돌릴 수 없어요."
          confirmLabel="지우기"
          danger
          onConfirm={remove}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </section>
  );
}
