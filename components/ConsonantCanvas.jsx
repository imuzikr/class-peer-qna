"use client";

// =============================================================
// 닿소리 채우기 캔버스 — 모둠이 함께 채우는 3×5 격자
// -------------------------------------------------------------
// 한가운데는 주제어(도서명), 나머지 14칸은 자음입니다.
// 칸을 누르면 입력창이 열리고, 넣은 단어는 칩으로 쌓입니다.
// 같은 모둠원이 동시에 입력해도 단어가 문서 1건씩 저장돼 충돌하지 않고,
// 다른 사람이 넣은 단어도 실시간으로 바로 나타납니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeBookGroups, subscribeGroupWords, addConsonantWord, deleteConsonantWord } from "@/lib/store";
import { CONSONANT_LABELS, GRID_SLOTS, CELL_COUNT, cellKey } from "@/lib/consonants";
import { IconLock } from "./StatusIcons";

export default function ConsonantCanvas({ activity, groupId, user, isTeacher, onBack }) {
  const [words, setWords] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null); // 입력창이 열린 자음 칸
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => subscribeGroupWords(activity.id, groupId, setWords), [activity.id, groupId]);
  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);

  const group = groups.find((g) => g.id === groupId);
  const isMember = (group?.memberUids ?? []).includes(user?.uid);
  // 교사는 확인만 하고, 입력은 그 모둠 학생이 합니다. 잠긴 활동도 입력 불가.
  const canWrite = isMember && !activity.locked;

  // 자음 칸별로 단어를 모아 둡니다 (오래된 순)
  const byCell = useMemo(() => {
    const map = {};
    words.forEach((w) => {
      (map[w.cellKey] ??= []).push(w);
    });
    Object.values(map).forEach((list) =>
      list.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
    );
    return map;
  }, [words]);

  const filled = useMemo(
    () => Array.from({ length: CELL_COUNT }, (_, i) => (byCell[cellKey(i)] ?? []).length > 0)
      .filter(Boolean).length,
    [byCell]
  );

  useEffect(() => {
    if (activeIndex !== null) inputRef.current?.focus();
  }, [activeIndex]);

  async function handleAdd(index) {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await addConsonantWord(activity.id, groupId, { cellKey: cellKey(index), text }, user);
    inputRef.current?.focus(); // 연달아 입력할 수 있게
  }

  function openCell(index) {
    if (!canWrite) return;
    setActiveIndex(index);
    setDraft("");
  }

  return (
    <main className="canvas-main">
      <div className="canvas-head">
        <button type="button" className="btn-ghost" onClick={onBack}>← 모둠</button>
        <div className="canvas-head-title">
          <strong>{group?.groupName || "모둠"}</strong>
          <span>{activity.title}</span>
        </div>
        <div className="canvas-progress">
          <div className="canvas-progress-bar">
            <span style={{ width: `${(filled / CELL_COUNT) * 100}%` }} />
          </div>
          <span className="canvas-progress-text">{filled} / {CELL_COUNT}칸</span>
        </div>
      </div>

      {activity.locked ? (
        <p className="book-locked-note">
          <IconLock size={15} /> 잠긴 활동이라 새 단어를 넣을 수 없어요.
        </p>
      ) : !isMember ? (
        <p className="book-locked-note">
          {isTeacher ? "선생님은 내용만 확인할 수 있어요." : "이 모둠의 구성원만 단어를 넣을 수 있어요."}
        </p>
      ) : null}

      <div className="consonant-grid">
        {GRID_SLOTS.map((slot, pos) => {
          // 한가운데 — 주제어 칸
          if (slot === null) {
            return (
              <div key={pos} className="consonant-cell consonant-center">
                <span className="consonant-center-label">학습주제 · 도서명</span>
                <strong className="consonant-center-topic">{activity.topic}</strong>
              </div>
            );
          }

          const list = byCell[cellKey(slot)] ?? [];
          const open = activeIndex === slot;
          return (
            <div
              key={pos}
              className={`consonant-cell${list.length > 0 ? " has-words" : ""}${open ? " open" : ""}${canWrite ? " editable" : ""}`}
              onClick={() => !open && openCell(slot)}
            >
              <span className="consonant-label">{CONSONANT_LABELS[slot]}</span>

              <div className="consonant-words">
                {list.map((w) => (
                  <span key={w.id} className="consonant-chip" title={`${w.authorName}`}>
                    {w.text}
                    {(w.authorId === user?.uid || isTeacher) && !activity.locked && (
                      <button
                        type="button"
                        className="consonant-chip-x"
                        aria-label={`${w.text} 지우기`}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConsonantWord(activity.id, groupId, w.id);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>

              {open && (
                <input
                  ref={inputRef}
                  className="consonant-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdd(slot);
                    } else if (e.key === "Escape") {
                      setActiveIndex(null);
                      setDraft("");
                    }
                  }}
                  onBlur={() => {
                    if (!draft.trim()) setActiveIndex(null);
                  }}
                  placeholder="단어 입력 후 Enter"
                  maxLength={20}
                />
              )}
            </div>
          );
        })}
      </div>

      {canWrite && (
        <p className="canvas-hint">
          칸을 누르고 단어를 적은 뒤 Enter를 누르세요. 내가 넣은 단어는 ×로 지울 수 있어요.
        </p>
      )}
    </main>
  );
}
