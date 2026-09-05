"use client";

// =============================================================
// 성찰중 전광판 — KWLS로 성찰하기 (교사 전용)
// -------------------------------------------------------------
// 격자와 껍데기는 `BookProgressBoard`에 있습니다(곁텍스트·RAFT 전광판과
// 같은 것). 여기서 정하는 것은 네 칸(K·W·L·S)과 칸 색뿐입니다.
//
// [잠금 칸이 없습니다] KWLS에는 단계별 잠금이 없고 활동 전체 잠금(`locked`)
// 뿐이라, 줄마다 같은 배지를 네 번 그리게 되므로 칸 자체를 뺍니다.
//
// [칸 색은 둘] 칸마다 글 한 덩이라 썼거나 안 썼거나입니다 — '쓰는 중'을
// 가르려면 글자 수 선을 새로 정해야 하는데, KWLS는 한 줄로 끝나는 칸도
// 많아 그 선이 '덜 썼다'를 잘못 말하게 됩니다.
// =============================================================
import { useCallback, useMemo } from "react";
import BookProgressBoard from "./BookProgressBoard";
import { kwlsRows, kwlsCellState, kwlsDone } from "@/lib/kwls";

export default function KwlsProgressBoard({ activity, cards = [], onOpenStudent, onClose }) {
  const rows = useMemo(() => kwlsRows(), []);

  const cellTip = useCallback((row, card, answers, i) => {
    const who = `${card.studentId ? `${card.studentId} ` : ""}${card.name}`;
    const step = `${i + 1}. ${row.label}`;
    const text = String(answers[row.key] ?? "").trim();
    if (!text) return `${who} — ${step} 아직 안 썼어요`;
    return `${who} — ${step} 썼어요 (${text.length}자)`;
  }, []);

  const allDone = cards.filter((c) => kwlsDone(c.entry?.answers)).length;

  return (
    <BookProgressBoard
      title="성찰중 전광판"
      activity={activity}
      cards={cards}
      rows={rows}
      cellState={kwlsCellState}
      cellTip={cellTip}
      /* 이 활동에 없는 색은 범례에서도 뺍니다 — 안 쓰는 색을 남겨 두면
         없는 상태를 화면에서 찾게 됩니다. */
      states={["done", "empty"]}
      summary={`네 칸 완성 ${allDone}명 / 전체 ${cards.length}명`}
      /* 가장 긴 이름이 '2. 알기를 원하는 것'이라 곁텍스트·RAFT보다 넓습니다 */
      headWidth={216}
      onOpenStudent={onOpenStudent}
      onClose={onClose}
    />
  );
}
