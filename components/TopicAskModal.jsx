"use client";

// =============================================================
// 무엇을 읽고 있나 — 학생이 제 주제어(도서명)를 적는 창
// -------------------------------------------------------------
// 교사가 활동을 만들 때 주제어를 비워 두면(반마다 읽는 책이 다르거나, 각자
// 고른 책으로 쓰는 활동이면) 학생이 자기 것을 적습니다. 적은 값은 자기
// 기록 문서(bookActivities/{id}/entries/{uid}.topic)에만 들어가므로 규칙을
// 넓히지 않아도 됩니다.
//
// 닫을 수 있게 둡니다 — 아직 책을 못 정했을 수도 있고, 막아 두면 활동 칸을
// 아예 열지 못하게 됩니다. 나중에 머리말 배지를 눌러 적으면 됩니다.
//
// 곁텍스트 읽기(ParatextForm)와 RAFT 글쓰기(RaftForm)가 함께 씁니다.
// =============================================================
import { useEffect, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";

export default function TopicAskModal({ initial, onSave, onClose }) {
  const [text, setText] = useState(initial ?? "");
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  function submit(e) {
    e.preventDefault();
    // 조합 중인 한글은 state에 늦게 들어오므로 입력칸의 실제 값을 씁니다
    onSave(inputRef.current?.value ?? text);
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <form
        className="modal modal-topic-ask"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>무슨 책을 읽고 있나요?</h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <p className="modal-topic-note">
          도서명이나 오늘의 주제를 적어 주세요. 내 카드에 표시됩니다.
        </p>
        <input
          ref={inputRef}
          type="text"
          className="modal-topic-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="예) 어린 왕자"
          maxLength={40}
          aria-label="도서명 또는 주제"
        />
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>나중에</button>
          <button type="submit" className="btn-primary">저장</button>
        </div>
      </form>
    </div>
  );
}
