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
  PARATEXT_SECTIONS,
  PARATEXT_SECTION_COUNT,
  isSectionDone,
  isSectionStarted,
  isSectionLocked,
  paratextDoneCount,
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
  const rows = useMemo(
    () =>
      PARATEXT_SECTIONS.map((s) => ({
        key: s.key,
        letter: s.letter,
        label: s.ko,
        hint: s.prompt,
        locked: isSectionLocked(activity, s.key),
        section: s,
      })),
    [activity]
  );

  // 차례에 뜻이 있습니다 — **쓴 것이 가장 셉니다**(잠근 뒤에도 쓴 것은 쓴 것),
  // 그다음이 잠김입니다. 공부방 전광판의 cellState와 같은 차례라, 두 화면이
  // 같은 칸을 다르게 읽지 않습니다.
  const cellState = useCallback((row, answers) => {
    if (isSectionDone(row.section, answers)) return "done";
    if (row.locked) return "locked";
    return isSectionStarted(row.section, answers) ? "doing" : "empty";
  }, []);

  const cellTip = useCallback((row, card, answers, i) => {
    const who = `${card.studentId ? `${card.studentId} ` : ""}${card.name}`;
    const step = `${i + 1}. ${row.label}`;
    const { filled, total } = fieldCount(row.section, answers);
    const many = total > 1 ? ` (${filled}/${total}칸)` : "";
    if (isSectionDone(row.section, answers)) return `${who} — ${step} 다 썼어요${many}`;
    if (row.locked) {
      return filled > 0
        ? `${who} — ${step} 잠김 (쓰다 만 것 ${filled}/${total}칸)`
        : `${who} — ${step} 잠김 (아직 열지 않음)`;
    }
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
      cellState={cellState}
      cellTip={cellTip}
      states={["done", "doing", "empty", "locked"]}
      summary={`여덟 단계 완성 ${allDone}명 / 전체 ${cards.length}명`}
      /* 가장 긴 이름이 '8. 시각자료'(62px)라 이름 칸에 그만큼은 있어야
         말줄임으로 잘리지 않습니다 — 208px일 때 60px이라 2px 모자랐습니다(실측). */
      headWidth={232}
      onOpenStudent={onOpenStudent}
      onClose={onClose}
    />
  );
}
