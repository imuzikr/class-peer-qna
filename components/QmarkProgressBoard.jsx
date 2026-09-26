"use client";

// =============================================================
// 물음표 전광판 — 물음표로 책 읽기 (교사 전용)
// -------------------------------------------------------------
// 격자와 껍데기는 `BookProgressBoard`(곁텍스트 · RAFT · KWLS 전광판과 같은
// 것)입니다. 여기서 정하는 것은 세 줄(궁금증 · 이유 · 나의 생각)과 칸 색뿐.
//
// '나의 생각' 한 줄이 다섯 물음을 대신합니다 — 물음마다 줄을 세우면 고르지
// 않은 물음이 모두 '안 씀'으로 칠해져, 두 개만 골라 다 한 학생이 덜 한
// 것처럼 보입니다(lib/qmark.js의 qmarkRows).
// =============================================================
import { useCallback, useMemo } from "react";
import BookProgressBoard from "./BookProgressBoard";
import {
  QMARK_MIN_PICKS,
  normalizeQmarkAnswers,
  qmarkAnsweredPicks,
  qmarkRows,
  qmarkCellState,
  qmarkDone,
} from "@/lib/qmark";

export default function QmarkProgressBoard({ activity, cards = [], onOpenStudent, onClose }) {
  const rows = useMemo(() => qmarkRows(), []);

  const cellTip = useCallback((row, card, answers, i) => {
    const who = `${card.studentId ? `${card.studentId} ` : ""}${card.name}`;
    const step = `${i + 1}. ${row.label}`;
    const a = normalizeQmarkAnswers(answers);
    if (row.key === "thoughts") {
      const n = qmarkAnsweredPicks(a).length;
      return `${who} — ${step} ${n} / ${QMARK_MIN_PICKS}개 답함${a.picks.length > n ? ` (고른 것 ${a.picks.length}개)` : ""}`;
    }
    const text = a[row.key].trim();
    return text ? `${who} — ${step} 썼어요 (${text.length}자)` : `${who} — ${step} 아직 안 썼어요`;
  }, []);

  const allDone = cards.filter((c) => qmarkDone(c.entry?.answers)).length;

  return (
    <BookProgressBoard
      title="물음표 전광판"
      activity={activity}
      cards={cards}
      rows={rows}
      cellState={qmarkCellState}
      cellTip={cellTip}
      states={["done", "doing", "empty"]}
      summary={`완성 ${allDone}명 / 전체 ${cards.length}명`}
      headWidth={170}
      onOpenStudent={onOpenStudent}
      onClose={onClose}
    />
  );
}
