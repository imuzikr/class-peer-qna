"use client";

// =============================================================
// 읽는중 전광판 — 곁텍스트 읽기 (교사 전용)
// -------------------------------------------------------------
// 격자와 껍데기는 `BookProgressBoard`에 있습니다. 여기서 정하는 것은
// **무엇이 한 줄인가**(여덟 단계)와 **칸 색을 어떻게 고르는가** 둘뿐입니다.
//
// 공부방 전광판에 없는 '쓰는 중'이 여기 있는 까닭: 한 단계가 여러 칸으로 된
// 것이 셋이라(제목 5칸 · 목차 3칸 · 머리말 2칸) '반쯤 쓴' 상태가 실제로
// 자주 생깁니다.
// =============================================================
import { useCallback, useMemo } from "react";
import BookProgressBoard from "./BookProgressBoard";
import {
  PARATEXT_SECTION_COUNT,
  isSectionDone,
  paratextDoneCount,
  paratextRows,
  paratextCellState,
} from "@/lib/paratext";

// 한 단계에서 그 학생이 채운 칸 수 / 전체 칸 수 — 툴팁에 씁니다.
// ('쓰는 중'이 왜 쓰는 중인지는 이 숫자라야 말이 됩니다)
function fieldCount(section, answers) {
  const filled = section.fields.filter(
    (f) => String(answers[f.key] ?? "").trim().length > 0
  ).length;
  return { filled, total: section.fields.length };
}

export default function ParatextProgressBoard({ activity, cards = [], onOpenStudent, onClose }) {
  // 줄과 칸 색은 교사 화면 왼쪽 카드의 조각 바와 **같은 정의**를 씁니다
  // (lib/paratext.js) — 한쪽만 고치면 같은 학생이 두 화면에서 다르게 보입니다.
  // 단계별 열기를 걷어 '잠김' 줄·칸이 없습니다(행에 locked가 없으면
  // BookProgressBoard가 배지 칸을 통째로 뺍니다 — RAFT와 같은 모양).
  const rows = useMemo(() => paratextRows(), []);

  const cellTip = useCallback((row, card, answers, i) => {
    const who = `${card.studentId ? `${card.studentId} ` : ""}${card.name}`;
    const step = `${i + 1}. ${row.label}`;
    const { filled, total } = fieldCount(row.section, answers);
    const many = total > 1 ? ` (${filled}/${total}칸)` : "";
    if (isSectionDone(row.section, answers)) return `${who} — ${step} 다 썼어요${many}`;
    if (filled > 0) return `${who} — ${step} 쓰는 중${many}`;
    return `${who} — ${step} 아직 시작 전`;
  }, []);

  const allDone = cards.filter(
    (c) => paratextDoneCount(c.entry?.answers) === PARATEXT_SECTION_COUNT
  ).length;

  return (
    <BookProgressBoard
      title="읽는중 전광판"
      activity={activity}
      cards={cards}
      rows={rows}
      cellState={paratextCellState}
      cellTip={cellTip}
      states={["done", "doing", "empty"]}
      summary={`여덟 단계 완성 ${allDone}명 / 전체 ${cards.length}명`}
      /* 가장 긴 이름이 '8. 시각자료'(62px)라 이름 칸에 그만큼은 있어야
         말줄임으로 잘리지 않습니다. 잠금 배지 칸(58px + 틈 7px)을 걷은 만큼
         232에서 뺐습니다 — 이름 칸 폭은 그대로입니다. */
      headWidth={168}
      onOpenStudent={onOpenStudent}
      onClose={onClose}
    />
  );
}
