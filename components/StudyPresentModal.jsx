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

// 본문 HTML에서 삽입된 이미지(src)들을 추출 / 이미지 태그를 제거한 텍스트만 남김
function extractImgSrcs(html) {
  const out = [];
  const re = /<img[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}
function stripImgTags(html) {
  return html.replace(/<img[^>]*>/gi, "");
}

export default function StudyPresentModal({ board, cards = [], onClose }) {
  const [idx, setIdx] = useState(0);
  const [rewardMap, setRewardMap] = useState({}); // uid -> count
  const [showImage, setShowImage] = useState(false); // 이미지 보기 토글
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

  // 카드가 바뀌면 이미지 보기 토글은 닫힌 상태로 초기화
  useEffect(() => {
    setShowImage(false);
  }, [idx]);

  if (!card) return null;

  const displayName = getDirectoryRealName(card.authorId) || card.authorName || "익명";
  const count = rewardMap[card.authorId] ?? 0;

  const fileAtts = (card.attachments ?? []).filter((a) => !IMAGE_EXTS.has(a.ext));
  // 삽입된 이미지 = 본문에 넣은 이미지 + 대표 이미지 + 이미지 첨부 (읽기 순서대로)
  const safeContent = sanitizeHtml(card.content || "");
  const allImages = [
    ...extractImgSrcs(safeContent),
    ...(card.imageUrl ? [card.imageUrl] : []),
    ...(card.attachments ?? [])
      .filter((a) => IMAGE_EXTS.has(a.ext))
      .map((a) => a.dataUrl),
  ];
  // 본문 텍스트 — 발표 화면에서는 이미지를 인라인으로 펼치지 않음(이미지 보기 버튼으로)
  const textHtml = stripImgTags(safeContent);
  const hasText = textHtml.replace(/<[^>]*>/g, "").trim().length > 0;

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
          {/* 상단 첨부 정보 — 항상 같은 높이로 고정(첨부 없는 카드도 위치 일정).
              이미지는 인라인으로 펼치지 않고 '이미지 보기' 버튼으로 확인 */}
          <div className="present-attach-info">
            {allImages.length > 0 && (
              <button
                type="button"
                className={`present-img-btn${showImage ? " on" : ""}`}
                onClick={() => setShowImage((v) => !v)}
              >
                🖼 {showImage ? "이미지 숨기기" : "이미지 보기"}
                <span className="present-img-count">{allImages.length}</span>
              </button>
            )}
            {fileAtts.length > 0 && (
              <span className="present-attach-chip">📎 첨부파일 {fileAtts.length}</span>
            )}
          </div>

          {card.title && <h2 className="present-title">{card.title}</h2>}
          {hasText && (
            <div
              className="present-content study-card-body"
              dangerouslySetInnerHTML={{ __html: textHtml }}
            />
          )}

          {/* 이미지 보기 — 삽입된 첫 번째 이미지를 중앙에 크게 */}
          {showImage && allImages.length > 0 && (
            <div className="present-image-view">
              <ZoomableImage
                src={allImages[0]}
                alt="삽입된 이미지"
                className="present-image-single"
              />
            </div>
          )}

          {!hasText && allImages.length === 0 && fileAtts.length === 0 && (
            <p className="present-empty">아직 작성한 내용이 없어요.</p>
          )}
        </div>

        {/* 하단 — 과일 주기 */}
        <div className="present-foot">
          <div className="present-fruits">
            <RewardFruits count={count} className="reward-fruits present-fruit-strip" />
            <span className="present-fruit-count">{count}개</span>
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
