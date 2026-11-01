"use client";

// =============================================================
// 독서 활동 머리말의 공통 조각
// -------------------------------------------------------------
// 독서 활동은 하나씩 따로 생겨나 머리말을 화면마다 손으로 짰더니, 같은 것이
// 화면마다 다른 차례 · 다른 말 · 다른 모양이 되었습니다(브레인 라이팅만 반이
// 맨 앞, KWLS · 물음표만 '한 눈에 보기'가 가운데 칸, 넷만 저장 실패를 안 알림 …).
// 같은 것을 여기 한 곳에서 짓습니다 — 새 활동은 이 조각을 쓰면 저절로 맞습니다.
//
//  · BookBoardHead  — 교사 화면 머리말 두 줄(차례는 아래 주석)
//  · BookInfoLink   — '도서 정보' 단추(교사 · 학생 공용)
//  · BookSaveStatus — 학생 화면의 저장 표시(잠김 · 저장 중 · 저장됨 · 실패)
//  · BookLockedNote — 학생 화면 머리말 아래의 잠김 안내 한 줄
// =============================================================

import { safeBookUrl } from "@/lib/paratext";
import { IconBook, IconLock, IconPeople } from "./StatusIcons";

export const BOOK_LOCKED_TEACHER = "지금은 잠겨 있어 학생이 고칠 수 없어요.";
export const BOOK_LOCKED_STUDENT = "지금은 잠겨 있어 고칠 수 없어요. 쓴 내용은 그대로 남아 있습니다.";
export const BOOK_NO_STUDENTS = "아직 이 반에 들어온 학생이 없어요. 학생이 반에 들어오면 목록이 생깁니다.";
export const BOOK_PICK_STUDENT = "왼쪽에서 학생을 골라 주세요.";
export const BOOK_PICK_GROUP_STUDENT = "왼쪽 모둠 카드에서 학생 이름을 눌러 주세요.";

// 도서 정보 — 활동에 주소가 있을 때만. 열 수 없는 주소(javascript: 등)는 안 그립니다.
export function BookInfoLink({ url }) {
  const href = safeBookUrl(url);
  if (!href) return null;
  return (
    <a className="btn-primary book-info-btn" href={href} target="_blank" rel="noopener noreferrer">
      <IconBook size={15} /> 도서 정보
    </a>
  );
}

// 학생 화면 머리의 저장 표시 — 저장은 늘 저절로라 '제출'이 없고, 이 한 줄이
// 지금 상태를 말합니다. **실패를 숨기지 않습니다** — 예전에 넷이 실패를
// 'idle'로 삼켜 학생은 저장된 줄 알았습니다. 글은 화면에 그대로 있고, 다시
// 고치면 다시 저장합니다.
//   status: "idle" | "saving" | "saved" | "error"
export function BookSaveStatus({ status, locked }) {
  if (locked) {
    return (
      <span className="paratext-saved locked">
        <IconLock size={14} /> 잠김
      </span>
    );
  }
  if (status === "saving") return <span className="paratext-saved" aria-live="polite">저장 중…</span>;
  if (status === "saved") return <span className="paratext-saved" aria-live="polite">저장됨</span>;
  if (status === "error") {
    return (
      <span
        className="paratext-saved err"
        role="alert"
        title="쓴 글은 화면에 그대로 있어요. 연결을 확인하고 한 글자만 고치면 다시 저장합니다."
      >
        저장하지 못했어요
      </span>
    );
  }
  return null;
}

// 학생 화면 머리말 아래의 잠김 안내 — 활동마다 남는 것이 달라 뒷말만 받습니다.
export function BookLockedNote({ children = BOOK_LOCKED_STUDENT }) {
  return (
    <p className="book-locked-note">
      <IconLock size={15} /> {children}
    </p>
  );
}

// =============================================================
// 교사 화면 머리말 — 모든 독서 활동이 같은 두 줄 · 같은 차례입니다.
//   첫 줄: 활동 이름 · ← 활동 목록 · 기록 관리(classTools)
//   둘째 줄 왼쪽: 활동 모둠(모둠 활동만) · 주제어 · 반 · 진행 요약 · 살펴보기 ·
//                 활동별 조작(동료 평가 · 공개하기 …) · 잠김 안내
//   둘째 줄 오른쪽: (남는 폭을 채우는 방송 막대) · 도서 정보 · 한 눈에 보기 ·
//                 활동별 오른쪽 도구(보기 전환 · 전체 보기 …) — 이 셋은 한 덩이
// 차례는 곁텍스트 읽기의 머리말이 기준입니다(선생님이 RAFT를 그 모양으로 맞추며
// 정한 것). 한 화면만 차례를 바꾸지 마세요 — 바꾸려면 여기서 함께 바뀝니다.
// =============================================================
export default function BookBoardHead({
  activity,
  onBack,
  classTools = null,
  classPicker = null,
  className = "",
  onCompose = null,        // 활동 모둠 짜기 — 없으면 단추를 안 그림
  topicFallback = null,    // 주제어가 비었을 때 옅게 적을 말 — 없으면 배지를 안 그림
  summary = null,          // 진행 요약(글자)
  onOpenBoard = null,      // 살펴보기(전광판) — 없으면 단추를 안 그림
  boardTitle = "",
  actions = null,          // 활동별 조작 — 진행 요약 · 살펴보기 뒤, 잠김 앞
  locked = !!activity?.locked,
  lockedText = BOOK_LOCKED_TEACHER,
  bookUrl = activity?.bookUrl,
  onOverview = null,       // 한 눈에 보기 — 고른 학생이 없으면 overviewDisabled
  overviewDisabled = false,
  right = null,            // 오른쪽 끝의 활동별 도구
  wide = null,             // 둘째 줄의 남는 폭을 채우는 것(방송 막대 — .books-head-row > .cast-bar)
}) {
  const topic = (activity?.topic ?? "").trim();
  return (
    <div className="books-head">
      <div className="books-head-title">
        <h1 className="book-group-title">{activity?.title}</h1>
        <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
        {classTools}
      </div>
      <div className="books-head-row">
        <div className="books-head-main">
          {onCompose && (
            <button type="button" className="btn-ghost" onClick={onCompose}>
              <IconPeople size={15} /> 활동 모둠
            </button>
          )}
          {(topic || topicFallback) && (
            <span className={`book-group-topic${topic ? "" : " soft"}`}>{topic || topicFallback}</span>
          )}
          {classPicker ?? (className && <span className="book-group-class">{className}</span>)}
          {summary != null && <span className="paratext-sum">{summary}</span>}
          {onOpenBoard && (
            <button type="button" className="group-filter-act" onClick={onOpenBoard} title={boardTitle}>
              살펴보기
            </button>
          )}
          {actions}
          {locked && (
            <span className="book-locked-note book-locked-chip">
              <IconLock size={14} /> {lockedText}
            </span>
          )}
        </div>
        {wide}
        {/* 오른쪽 도구는 한 덩이로 — 따로 두면 줄의 남는 폭이 그 사이에 나뉘어
            '도서 정보'가 줄 가운데에 떠 있었습니다(곁텍스트 · RAFT · KWLS · 물음표). */}
        <div className="books-head-tools">
          <BookInfoLink url={bookUrl} />
          {onOverview && (
            <button
              type="button"
              className="btn-ghost entry-overview-btn"
              onClick={onOverview}
              disabled={overviewDisabled}
              title="선택한 학생의 활동을 큰 창에서 한꺼번에 봅니다 — 이전 · 다음으로 다른 학생도"
            >
              한 눈에 보기
            </button>
          )}
          {right}
        </div>
      </div>
    </div>
  );
}
