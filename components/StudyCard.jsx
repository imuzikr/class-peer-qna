"use client";

import { formatTime, getDirectoryUser } from "@/lib/store";
import { stripHtml } from "@/lib/html";
import { cardActivitySummary } from "@/lib/activities";
import { IconTeacher } from "./StatusIcons";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

// 답변 반응(QuestionModal)과 같은 3종 — 이모지·필드명 매핑도 lib/store.js의
// CARD_REACTION_FIELDS와 짝을 맞춥니다.
const CARD_REACTIONS = [
  { kind: "thumbsUp", emoji: "👍", field: "thumbsUpIds" },
  { kind: "heart", emoji: "❤️", field: "heartIds" },
  { kind: "smile", emoji: "😊", field: "smileIds" },
];

export default function StudyCard({
  card,
  onClick,
  isTeacher = false,
  activities,
  myUid = null,
  onReact,
  topReacted = false,
  onAward,
  rewardCount = 0,
  rewardMax = 100,
}) {
  // 모둠 카드 — 모둠명 + 구성원(대표 👑)을 헤더에 표시
  const isGroupCard = !!card.groupId;
  // 교사 카드: 데모는 "teacher_" 접두, 실서비스는 작성자명이 "선생님"(예약어)
  const isTeacherCard =
    card.authorId?.startsWith?.("teacher_") || card.authorName === "선생님";
  // 학생에게는 익명 닉네임만, 교사에게는 디렉터리의 실명·학번을 보여줍니다.
  // (교사 본인 카드는 실명 대신 항상 "선생님")
  const dirUser = isTeacher && !isTeacherCard ? getDirectoryUser(card.authorId) : null;
  const displayName = dirUser?.realName || card.authorName;
  const studentId = dirUser?.studentId ?? card.authorStudentId ?? null;
  const preview = stripHtml(card.content ?? "").slice(0, 120);
  const attachCount = card.attachments?.length ?? 0;
  const thumbAtt = card.attachments?.find((a) => IMAGE_EXTS.has(a.ext));
  // 이미지가 첨부돼 있을 때만 썸네일 표시 — 본문 이미지(imageUrl) 또는 이미지 첨부
  const thumbSrc = card.imageUrl || thumbAtt?.dataUrl || null;
  const summary =
    activities?.length > 0 ? cardActivitySummary(card, activities) : null;

  // 반응은 남의 카드에만 — 모둠 카드는 '내 모둠 카드'인지로 판정합니다
  // (모둠원끼리는 같은 카드를 공유하므로 자기 모둠엔 반응할 수 없음).
  const isMine = myUid != null
    && (isGroupCard ? card.memberUids?.includes(myUid) : card.authorId === myUid);
  const reactable = !!myUid && !isMine && !!onReact;

  // 과일 주기 — 교사 전용, 실제 학생이 쓴 카드에만(모둠 카드는 대표 한 명이
  // 아니라 여러 명이 함께 쓴 카드라 한 사람에게 몰아 줄 수 없어 제외).
  const canAward = isTeacher && !isGroupCard && !isTeacherCard && !!onAward;
  const rewardMaxed = rewardCount >= rewardMax;

  return (
    <article
      className={`study-card${topReacted ? " study-card-top" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      <div className="study-card-head">
        <span className="avatar avatar-sm" aria-hidden="true">
          {isGroupCard ? "👥" : isTeacherCard ? <IconTeacher size={22} /> : (card.authorEmoji ?? "🙂")}
        </span>
        <div className="study-card-author">
          {isGroupCard ? (
            <strong>
              {card.title || card.groupName}
              {card.retired && <span className="study-card-retired"> · 보관됨</span>}
            </strong>
          ) : isTeacher && !isTeacherCard && studentId ? (
            <>
              <span className="study-card-studentid">{studentId}</span>
              <strong>{displayName}</strong>
            </>
          ) : (
            <strong>{displayName}</strong>
          )}
        </div>
        {attachCount > 0 && (
          <span className="study-card-attach-count" aria-label={`첨부 파일 ${attachCount}개`}>
            📎{attachCount}
          </span>
        )}
        <time className="study-card-time">{formatTime(card.createdAt)}</time>
      </div>

      {summary && (
        <div className="study-card-progress">
          <div className="study-card-progress-bar">
            {summary.segments.map((on, i) => (
              <div key={i} className="study-card-progress-col">
                <span className={`study-card-progress-seg${on ? " on" : ""}`} />
                <span className="study-card-progress-chars">{summary.lengths[i]}자</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 모둠 구성원 — 대표는 👑 */}
      {isGroupCard && card.members?.length > 0 && (
        <p className="study-card-members">
          {card.members
            .map((m) => (m.uid === card.leaderUid ? `👑 ${m.name}` : m.name))
            .join(" · ")}
        </p>
      )}

      {card.title && <p className="study-card-title">{card.title}</p>}

      {/* 이미지가 첨부됐을 때만 썸네일, 없으면 invisible 텍스트로 높이 유지 */}
      {thumbSrc ? (
        <div className="study-card-thumb-wrap">
          <img className="study-card-thumb" src={thumbSrc} alt="" aria-hidden="true" />
        </div>
      ) : (
        <p className="study-card-preview" aria-hidden="true">{preview}</p>
      )}

      {/* 반응 — 정답 개념이 없는 공부방에서도 서로의 결과물에 가볍게 응원을
          남길 수 있게. + 교사 전용 과일 주기(오른쪽). 카드 클릭(모달 열기)과
          겹치지 않게 버블링을 막습니다. */}
      <div className="study-card-reactions" onClick={(e) => e.stopPropagation()}>
        <div className="study-card-reactions-left">
          {CARD_REACTIONS.map((r) => {
            const active = (card[r.field] ?? []).includes(myUid);
            return (
              <button
                key={r.kind}
                type="button"
                className={`chat-reaction-btn${active ? " active" : ""}`}
                onClick={() => onReact?.(r.kind, active)}
                disabled={!reactable}
                title={isMine ? "내 카드에는 반응할 수 없어요" : active ? "반응 취소" : "반응 남기기"}
              >
                <span className="chat-reaction-emoji">{r.emoji}</span>
                <span className="chat-reaction-count">{(card[r.field] ?? []).length}</span>
              </button>
            );
          })}
        </div>
        {canAward && (
          <button
            type="button"
            className="study-card-award-btn"
            onClick={() => onAward?.()}
            disabled={rewardMaxed}
            title={rewardMaxed ? "이미 최대 개수예요" : `과일 주기 (현재 ${rewardCount}개)`}
            aria-label={rewardMaxed ? "이미 최대 개수예요" : `과일 주기 (현재 ${rewardCount}개)`}
          >
            🍎
          </button>
        )}
      </div>
    </article>
  );
}
