"use client";

// =============================================================
// 발표 모드 — 학생 카드를 매우 크게 띄우고 순서대로 넘겨보는 모달 (교사 전용)
// -------------------------------------------------------------
// · 좌우 화살표(‹ ›) + 키보드 ← → 이동, Esc 닫기
// · 상단에 진행 위치(n / 총원)와 학생 실명 표시
// · 하단에 🍎 과일 주기 버튼 — 발표를 보며 바로 '멋진 순간' 부여
// =============================================================
import { useEffect, useState } from "react";
import {
  subscribeClassRewards,
  setStudentReward,
  getDirectoryRealName,
  REWARD_MAX,
} from "@/lib/store";
import { sanitizeHtml } from "@/lib/html";
import ZoomableImage from "./ZoomableImage";
import RewardFruits from "./RewardFruits";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

export default function StudyPresentModal({ board, cards = [], onClose }) {
  const [idx, setIdx] = useState(0);
  const [rewardMap, setRewardMap] = useState({}); // uid -> count
  const total = cards.length;
  const card = cards[Math.min(idx, total - 1)];

  // 이번 반의 과일 보상 구독 (실시간)
  useEffect(() => {
    if (!board.classId) return;
    return subscribeClassRewards(board.classId, (list) => {
      const m = {};
      list.forEach((r) => { m[r.uid] = r.count ?? 0; });
      setRewardMap(m);
    });
  }, [board.classId]);

  // 키보드: ← → 이동, Esc 닫기
  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(total - 1, i + 1));
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total, onClose]);

  if (!card) return null;

  const displayName = getDirectoryRealName(card.authorId) || card.authorName || "익명";
  const count = rewardMap[card.authorId] ?? 0;

  const fileAtts = (card.attachments ?? []).filter((a) => !IMAGE_EXTS.has(a.ext));
  const imgs = [
    ...(card.imageUrl ? [{ id: "__main__", src: card.imageUrl }] : []),
    ...(card.attachments ?? [])
      .filter((a) => IMAGE_EXTS.has(a.ext))
      .map((a) => ({ id: a.id, src: a.dataUrl })),
  ];
  const hasText = sanitizeHtml(card.content || "").replace(/<[^>]*>/g, "").trim().length > 0;

  function awardFruit() {
    if (count >= REWARD_MAX) return;
    setStudentReward(board.classId, card.authorId, count + 1);
  }

  return (
    <div className="modal-backdrop present-backdrop" onClick={onClose}>
      <div className="present-modal" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 — 학생 실명 + 진행 위치 */}
        <div className="present-head">
          <div className="present-who">
            <span className="present-avatar" aria-hidden="true">{card.authorEmoji || "🙂"}</span>
            <strong className="present-name">{displayName}</strong>
            <span className="present-progress">{idx + 1} / {total}</span>
            <span className="present-board"># {board.title}</span>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {/* 본문 */}
        <div className="present-body" key={card.id}>
          {card.title && <h2 className="present-title">{card.title}</h2>}
          {hasText && (
            <div
              className="present-content study-card-body"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.content) }}
            />
          )}
          {imgs.length > 0 && (
            <div className="present-images">
              {imgs.map((it) => (
                <ZoomableImage key={it.id} src={it.src} alt="첨부 이미지" className="present-image" />
              ))}
            </div>
          )}
          {fileAtts.length > 0 && (
            <ul className="present-files">
              {fileAtts.map((a) => (
                <li key={a.id}>📎 {a.name}</li>
              ))}
            </ul>
          )}
          {!hasText && imgs.length === 0 && fileAtts.length === 0 && (
            <p className="present-empty">아직 작성한 내용이 없어요.</p>
          )}
        </div>

        {/* 하단 — 과일 주기 */}
        <div className="present-foot">
          <div className="present-fruits">
            <RewardFruits count={count} className="reward-fruits present-fruit-strip" />
            <span className="present-fruit-count">🍎 {count}개</span>
          </div>
          <button
            className="btn-primary present-award"
            onClick={awardFruit}
            disabled={count >= REWARD_MAX}
          >
            🍎 과일 주기{count >= REWARD_MAX ? " (최대)" : ""}
          </button>
        </div>

        {/* 좌우 이동 화살표 */}
        <button
          className="present-nav present-prev"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          aria-label="이전 학생"
        >
          ‹
        </button>
        <button
          className="present-nav present-next"
          onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
          disabled={idx >= total - 1}
          aria-label="다음 학생"
        >
          ›
        </button>
      </div>
    </div>
  );
}
