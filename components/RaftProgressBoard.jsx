"use client";

// =============================================================
// 글쓰는중 전광판 — RAFT 글쓰기 (교사 전용)
// -------------------------------------------------------------
// 격자와 껍데기는 `BookProgressBoard`에 있습니다(곁텍스트 전광판과 같은 것).
//
// **다섯 줄입니다** — R·A·F·T 네 요소에 **글쓰기**를 더합니다. 넷은 계획이고
// 글쓰기가 이 활동의 결과물이라, 넷만 보여 주면 '다 정해 놓고 아직 안 쓴
// 학생'이 다 한 것처럼 보입니다(학생 카드의 네모 넷이 실제로 그렇습니다 —
// 거기서는 아래 '글 n자'가 그것을 말해 주지만 격자에는 그럴 자리가 없습니다).
//
// [잠금 칸이 없습니다] 곁텍스트는 단계마다 열고 잠그지만(`sectionLocks`)
// RAFT에는 그런 것이 없고 활동 전체 잠금(`locked`)뿐입니다 — 줄마다 같은
// 배지를 다섯 번 그리게 되므로 칸 자체를 뺍니다(`row.locked`를 null로).
//
// [칸 색]
// R·A·F·T는 짧은 한 칸이라 썼거나 안 썼거나 둘뿐입니다. 글쓰기만 '쓰는 중'이
// 있는데, 기준은 공부방이 이미 쓰는 값(`DONE_MIN_CHARS`)을 그대로 씁니다 —
// 이 앱에서 '충분히 썼다'는 선은 한 곳에만 있어야 합니다.
// =============================================================
import { useCallback, useMemo } from "react";
import BookProgressBoard from "./BookProgressBoard";
import { DONE_MIN_CHARS } from "@/lib/activities";
import {
  RAFT_COLUMNS,
  RAFT_WRITING,
  raftDone,
  raftWritingChars,
} from "@/lib/raft";

export default function RaftProgressBoard({ activity, cards = [], onOpenStudent, onClose }) {
  const rows = useMemo(
    () => [
      ...RAFT_COLUMNS.map((c) => ({
        key: c.key,
        letter: c.letter,
        label: c.ko,
        hint: c.prompt,
        locked: null, // 잠금 개념이 없는 활동 — 배지 칸을 통째로 뺍니다
        writing: false,
      })),
      {
        key: RAFT_WRITING.key,
        // 글쓰기에는 RAFT 글자가 없습니다. 억지로 한 글자를 만들어 넣으면
        // 네 요소의 R·A·F·T와 같은 무게로 읽혀 다섯 요소처럼 보입니다.
        letter: "",
        label: RAFT_WRITING.ko,
        hint: RAFT_WRITING.prompt,
        locked: null,
        writing: true,
      },
    ],
    []
  );

  const cellState = useCallback((row, answers) => {
    if (row.writing) {
      const n = raftWritingChars(answers);
      if (n >= DONE_MIN_CHARS) return "done";
      return n > 0 ? "doing" : "empty";
    }
    return String(answers[row.key] ?? "").trim() ? "done" : "empty";
  }, []);

  const cellTip = useCallback((row, card, answers, i) => {
    const who = `${card.studentId ? `${card.studentId} ` : ""}${card.name}`;
    const step = `${i + 1}. ${row.label}`;
    if (row.writing) {
      const n = raftWritingChars(answers);
      if (n >= DONE_MIN_CHARS) return `${who} — ${step} 썼어요 (${n}자)`;
      if (n > 0) return `${who} — ${step} 쓰는 중 (${n}자, ${DONE_MIN_CHARS}자 필요)`;
      return `${who} — ${step} 아직 시작 전`;
    }
    const text = String(answers[row.key] ?? "").trim();
    return text ? `${who} — ${step}: ${text}` : `${who} — ${step} 아직 안 정했어요`;
  }, []);

  const allDone = cards.filter((c) => raftDone(c.entry?.answers)).length;

  return (
    <BookProgressBoard
      title="글쓰는중 전광판"
      activity={activity}
      cards={cards}
      rows={rows}
      cellState={cellState}
      cellTip={cellTip}
      /* 잠김 색은 이 활동에 아예 없어 범례에서도 뺍니다 — 안 쓰는 색을
         범례에 남겨 두면 없는 상태를 화면에서 찾게 됩니다. */
      states={["done", "doing", "empty"]}
      summary={`다 한 학생 ${allDone}명 / 전체 ${cards.length}명`}
      /* 잠금 배지 칸이 없어 곁텍스트보다 좁습니다. 다만 150px으로 뒀더니
         이름 칸이 67px이라 가장 긴 '5. 글쓰기'(66px)가 아슬아슬하게 잘렸습니다
         (실측) — 조금 남깁니다. */
      headWidth={176}
      onOpenStudent={onOpenStudent}
      onClose={onClose}
    />
  );
}
