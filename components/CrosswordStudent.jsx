"use client";

// =============================================================
// 가로세로 낱말퀴즈 — 학생 화면 (닿소리 채우기 '내 판'의 '가로세로')
// -------------------------------------------------------------
// 두 덩이입니다.
//  ① 내 낱말 풀이 — 내가 이 판에 넣은 낱말 가운데 셋을 골라 뜻을 적습니다.
//     자기 기록(entries/{uid}.answers.crossword)에 **저절로 저장**되고, 셋 다
//     쓰면 선생님 화면에 '제출'로 뜹니다(제출 단추를 따로 두지 않습니다 —
//     누르지 않은 학생의 글이 빠지는 일이 없게).
//  ② 퀴즈 — 선생님이 반 전체의 풀이로 퍼즐을 만들면(활동 문서의
//     `crossword`) 여기서 풉니다.
//
// 저장 자리(entries)와 규칙은 곁텍스트 · RAFT와 같은 것이라 **규칙을 안
// 건드립니다** — entries는 활동 종류를 가리지 않고 본인 문서만 쓰게 합니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  subscribeGroupWords,
  subscribeMyParatextEntry,
  saveParatextEntry,
} from "@/lib/store";
import {
  CROSSWORD_PICKS,
  CROSSWORD_CLUE_MAX,
  crosswordWordProblem,
  normalizeCrosswordPicks,
  crosswordPicksDone,
  clueRevealsWord,
  normalizeCrossword,
} from "@/lib/crossword";
import CrosswordPuzzle from "./CrosswordPuzzle";

export default function CrosswordStudent({ activity, groupId, user, onBack }) {
  const [words, setWords] = useState([]);
  const [picks, setPicks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState(""); // "" | "saving" | "saved" | "error"
  const dirtyRef = useRef(false);

  useEffect(() => subscribeGroupWords(activity.id, groupId, setWords), [activity.id, groupId]);

  // 내 기록은 처음 한 번만 받아들입니다 — 그 뒤로는 화면이 더 새것입니다
  // (적는 중에 서버 값이 돌아와 덮으면 방금 친 글자가 튑니다).
  useEffect(() => {
    setLoaded(false);
    let first = true;
    return subscribeMyParatextEntry(activity.id, user?.uid, (entry) => {
      if (!first) return;
      first = false;
      setPicks(normalizeCrosswordPicks(entry?.answers?.crossword));
      setLoaded(true);
    });
  }, [activity.id, user?.uid]);

  // 내가 넣은 낱말 — 같은 낱말은 한 번만, 넣은 차례대로
  const myWords = useMemo(() => {
    const seen = new Set();
    return words
      .filter((w) => w.authorId === user?.uid)
      .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
      .map((w) => (w.text ?? "").trim())
      .filter((t) => t && !seen.has(t) && seen.add(t));
  }, [words, user?.uid]);

  const locked = !!activity.locked;
  const done = crosswordPicksDone(picks);
  const puzzle = useMemo(() => normalizeCrossword(activity.crossword), [activity.crossword]);
  const mineInPuzzle = puzzle ? puzzle.entries.filter((e) => e.uid === user?.uid).length : 0;

  // 저절로 저장 — 0.7초 쉬었다가 한 번
  useEffect(() => {
    if (!loaded || !dirtyRef.current || locked) return undefined;
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        await saveParatextEntry(activity.id, user, { crossword: picks });
        if (pendingRef.current === picks) pendingRef.current = null;
        setSaveState("saved");
      } catch (e) {
        console.warn("[가로세로] 풀이를 저장하지 못했어요:", e?.code, e?.message);
        setSaveState("error");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [picks, loaded, locked, activity.id, user]);

  // 화면을 벗어날 때 아직 안 보낸 글 — 0.7초를 기다리는 사이에 '← 내 판'을
  // 누르면 마지막 몇 글자가 날아갑니다.
  const pendingRef = useRef(null);
  useEffect(() => () => {
    if (pendingRef.current) saveParatextEntry(activity.id, user, { crossword: pendingRef.current }).catch(() => {});
  }, [activity.id, user]);

  function change(next) {
    dirtyRef.current = true;
    pendingRef.current = next;
    setPicks(next);
  }

  function togglePick(word) {
    if (locked) return;
    const has = picks.find((p) => p.word === word);
    if (has) {
      // 풀이를 써 둔 낱말을 빼면 그 글도 함께 사라집니다 — 되묻습니다
      if (has.clue.trim() && !window.confirm(`'${word}'의 풀이도 함께 지워져요. 뺄까요?`)) return;
      change(picks.filter((p) => p.word !== word));
      return;
    }
    if (picks.length >= CROSSWORD_PICKS) return;
    change([...picks, { word, clue: "" }]);
  }

  function setClue(word, clue) {
    change(picks.map((p) => (p.word === word ? { ...p, clue: clue.slice(0, CROSSWORD_CLUE_MAX) } : p)));
  }

  const filledCount = picks.filter((p) => p.clue.trim()).length;

  return (
    <main className="canvas-main xw-main">
      <div className="canvas-head">
        <div className="canvas-head-title">
          <strong>가로세로 낱말퀴즈</strong>
          <span>{activity.title}</span>
        </div>
        <div className="canvas-head-pair">
          <button type="button" className="btn-ghost" onClick={onBack}>← 내 판</button>
        </div>
      </div>

      <div className="xw-student">
        {/* ① 내 낱말 풀이 */}
        <section className="xw-card xw-picks">
          <header className="xw-card-head">
            <h3>내 낱말 풀이</h3>
            <span className={`xw-badge${done ? " done" : ""}`}>
              {done ? "제출 완료" : `${filledCount} / ${CROSSWORD_PICKS}`}
            </span>
          </header>
          <p className="xw-card-note">
            내 판에 넣은 낱말 가운데 <b>{CROSSWORD_PICKS}개</b>를 골라 뜻을 설명해 보세요.
            세 낱말을 모두 쓰면 선생님께 제출돼요(저절로 저장).
          </p>

          {!loaded ? (
            <p className="xw-empty">불러오는 중…</p>
          ) : myWords.length === 0 ? (
            <p className="xw-empty">아직 내 판에 넣은 낱말이 없어요. 먼저 낱말을 넣어 주세요.</p>
          ) : (
            <div className="xw-word-chips" role="group" aria-label="풀이할 낱말 고르기">
              {myWords.map((w) => {
                const problem = crosswordWordProblem(w);
                const on = picks.some((p) => p.word === w);
                const full = !on && picks.length >= CROSSWORD_PICKS;
                return (
                  <button
                    key={w}
                    type="button"
                    className={`xw-word-chip${on ? " on" : ""}`}
                    onClick={() => togglePick(w)}
                    disabled={locked || (!on && (!!problem || full))}
                    aria-pressed={on}
                    title={problem || (full ? `${CROSSWORD_PICKS}개까지 고를 수 있어요` : on ? "빼기" : "고르기")}
                  >
                    {on && <span aria-hidden="true">✓ </span>}
                    {w}
                  </button>
                );
              })}
            </div>
          )}

          {picks.length > 0 && (
            <ol className="xw-pick-list">
              {picks.map((p, i) => (
                <li key={p.word}>
                  <div className="xw-pick-head">
                    <span className="xw-pick-no">{i + 1}</span>
                    <strong>{p.word}</strong>
                    <span className="xw-pick-len">{p.word.length}글자</span>
                    {!locked && (
                      <button
                        type="button"
                        className="xw-pick-x"
                        onClick={() => togglePick(p.word)}
                        aria-label={`${p.word} 빼기`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <textarea
                    className="xw-pick-clue"
                    value={p.clue}
                    onChange={(e) => setClue(p.word, e.target.value)}
                    placeholder={`'${p.word}'을(를) 모르는 친구에게 설명하듯 적어 주세요`}
                    rows={2}
                    maxLength={CROSSWORD_CLUE_MAX}
                    disabled={locked}
                    aria-label={`${p.word}의 풀이`}
                  />
                  {clueRevealsWord(p.word, p.clue) && (
                    <span className="xw-pick-warn">풀이에 낱말이 그대로 들어 있어요 — 정답이 보여요</span>
                  )}
                </li>
              ))}
            </ol>
          )}

          <p className="xw-save">
            {[
              locked
                ? "잠긴 활동이라 고칠 수 없어요."
                : saveState === "saving"
                  ? "저장 중…"
                  : saveState === "error"
                    ? "저장하지 못했어요 — 잠시 뒤 다시 적어 보세요"
                    : saveState === "saved"
                      ? "저장했어요"
                      : "",
              puzzle && !locked ? "퀴즈가 이미 만들어졌어요. 지금 고친 풀이는 선생님이 다시 만들 때 들어가요." : "",
            ].filter(Boolean).join(" · ")}
          </p>
        </section>

        {/* ② 퀴즈 */}
        <section className="xw-card xw-play">
          <header className="xw-card-head">
            <h3>퀴즈 풀기</h3>
            {puzzle && mineInPuzzle > 0 && (
              <span className="xw-badge done">내 낱말 {mineInPuzzle}개가 들어갔어요</span>
            )}
          </header>
          {puzzle ? (
            <CrosswordPuzzle
              puzzle={puzzle}
              mode="solve"
              storageKey={`xword:${activity.id}:${puzzle.createdAt ?? "0"}:${user?.uid ?? ""}`}
            />
          ) : (
            <p className="xw-empty">
              아직 퀴즈가 없어요. 친구들이 낱말 풀이를 다 쓰면 선생님이 반 전체의 낱말로
              가로세로 퀴즈를 만들어 줄 거예요.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
