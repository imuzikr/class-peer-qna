"use client";

// =============================================================
// 물음표 전광판 — 물음표로 책 읽기 (교사 전용)
// -------------------------------------------------------------
// 격자와 껍데기는 `BookProgressBoard`(곁텍스트 · RAFT · KWLS 전광판과 같은
// 것)입니다. 여기서 정하는 것은 세 줄(궁금증 · 이유 · 나의 생각)과 칸 색뿐.
//
// 물음표가 여럿이어도 줄은 셋입니다 — 학생마다 개수가 달라 줄을 늘리면
// 격자가 맞지 않습니다. 칸 색은 '적은 물음표 가운데 몇 개를 채웠나'
// (다 채움 초록 · 일부 주황)이고 개수는 툴팁이 말합니다(lib/qmark.js).
// =============================================================
import { useCallback, useMemo } from "react";
import BookProgressBoard from "./BookProgressBoard";
import {
  QMARK_MIN_PICKS,
  normalizeQmarkAnswers,
  qmarkStartedAsks,
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
      const n = a.picks.length;
      const t = a.thought.trim().length;
      return `${who} — ${step} 고른 물음 ${n} / ${QMARK_MIN_PICKS} · ${t ? `생각 ${t}자` : "생각 아직"}`;
    }
    // 물음표가 여럿이라 '몇 개 가운데 몇 개'로 적습니다
    const asks = qmarkStartedAsks(a);
    const n = asks.filter((x) => x[row.key].trim()).length;
    return asks.length === 0
      ? `${who} — ${step} 아직 안 썼어요`
      : `${who} — ${step} 물음표 ${asks.length}개 가운데 ${n}개 썼어요`;
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
