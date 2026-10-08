"use client";

// =============================================================
// 가로세로 낱말퀴즈 — 모둠 활동의 학생 화면 (닿소리 '내 판'의 '가로세로')
// -------------------------------------------------------------
// 세 칸입니다.
//   왼쪽  — 우리 모둠이 맡은 낱말. 낱말마다 모둠원 알약으로 '누가 쓸지'를
//           정하고, 고른 그 학생이 힌트를 적습니다(저절로 저장).
//   가운데 — 모둠이 **함께** 채우는 낱말판. 한 사람이 낱말을 넣으면 모둠원
//           화면에 곧바로 들어갑니다(xwBoard 구독). 우리 모둠 낱말은 미리
//           채워진 열쇠 칸이라 고칠 수 없고 점수에서도 빠집니다.
//   오른쪽 — 힌트 목록(가로 · 세로). '낱말 채우기'가 시작되면 힌트가 뜹니다.
//
// 맞았는지는 칸 글자를 이어 낸 지문으로만 압니다 — 정답 낱말은 이 화면에
// 오지 않습니다(우리 모둠 낱말만 예외). 맞힌 낱말은 초록, 틀린 것은 칠하지
// 않습니다(빨강을 보여 주면 글자를 하나씩 바꿔 대 보는 놀이가 됩니다).
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  subscribeBookGroups,
  subscribeXwHints,
  subscribeXwBoard,
  setXwHintWriter,
  saveXwHint,
  writeXwBoard,
} from "@/lib/store";
import {
  CROSSWORD_HINT_MAX,
  normalizeGroupCrossword,
  normalizeXwHint,
  xwHintDone,
  fixedLettersOf,
  groupSolveProgress,
  boardWordOf,
  entryCellKeys,
  entryLen,
  xwCommitPlan,
  clueRevealsWord,
} from "@/lib/crossword";
import CrosswordGrid from "./CrosswordGrid";

const DIR_LABEL = { across: "가로", down: "세로" };

export default function CrosswordGroupStudent({ activity, groupId, user, onBack }) {
  const me = user?.uid ?? null;
  const [groups, setGroups] = useState([]);
  const [rawHints, setRawHints] = useState([]);
  const [letters, setLetters] = useState({});
  const [drafts, setDrafts] = useState({}); // 힌트 쓰는 중인 글 { idx: 글 }
  const [saveState, setSaveState] = useState("");
  const [sel, setSel] = useState(null);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const timers = useRef({});
  const pending = useRef({});
  const inputRef = useRef(null);

  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);
  useEffect(() => subscribeXwHints(activity.id, groupId, setRawHints), [activity.id, groupId]);
  useEffect(() => subscribeXwBoard(activity.id, groupId, setLetters), [activity.id, groupId]);

  // 화면을 벗어날 때 아직 안 보낸 힌트를 한 번 더
  useEffect(() => () => {
    Object.values(timers.current).forEach(clearTimeout);
    Object.entries(pending.current).forEach(([idx, text]) => {
      saveXwHint(activity.id, groupId, Number(idx), text).catch(() => {});
    });
  }, [activity.id, groupId]);

  const puzzle = useMemo(() => normalizeGroupCrossword(activity.crossword), [activity.crossword]);
  const myGroup = groups.find((g) => g.id === groupId) ?? null;
  const members = useMemo(() => {
    const list = (myGroup?.members ?? []).filter((m) => m?.uid);
    // 이름표가 빠진 옛 모둠 — memberUids로라도 알약을 세웁니다
    (myGroup?.memberUids ?? []).forEach((u) => {
      if (u && !list.some((m) => m.uid === u)) list.push({ uid: u, name: u === me ? (user?.realName || user?.displayName || "나") : "모둠원" });
    });
    return list;
  }, [myGroup, me, user]);

  // 퍼즐을 새로 만들면 지난 퍼즐의 힌트 문서는 걷히지만, 한 박자 늦게 올 수
  // 있어 이 퍼즐의 칸과 맞는 것만 씁니다.
  const hints = useMemo(() => {
    if (!puzzle) return [];
    return rawHints
      .map((h) => normalizeXwHint(h, h.id))
      .filter((h) => {
        const e = puzzle.entries[h.idx];
        return e && e.groupId === groupId && entryLen(e) === h.word.length;
      });
  }, [rawHints, puzzle, groupId]);

  const fixed = useMemo(() => fixedLettersOf(puzzle, hints), [puzzle, hints]);
  const progress = useMemo(
    () => (puzzle ? groupSolveProgress(puzzle, groupId, letters, fixed) : null),
    [puzzle, groupId, letters, fixed]
  );
  const stage = puzzle?.stage ?? null;
  const locked = !!activity.locked;
  const solving = stage === "solve";

  const hintDoneCount = hints.filter((h) => xwHintDone({ ...h, hint: h.writerUid === me ? drafts[h.idx] ?? h.hint : h.hint })).length;

  // ── 힌트 쓰기 ──
  function changeHint(h, text) {
    const t = text.slice(0, CROSSWORD_HINT_MAX);
    setDrafts((d) => ({ ...d, [h.idx]: t }));
    pending.current[h.idx] = t;
    clearTimeout(timers.current[h.idx]);
    setSaveState("saving");
    timers.current[h.idx] = setTimeout(async () => {
      try {
        await saveXwHint(activity.id, groupId, h.idx, t);
        if (pending.current[h.idx] === t) delete pending.current[h.idx];
        setSaveState("saved");
      } catch (e) {
        console.warn("[가로세로] 힌트를 저장하지 못했어요:", e?.code, e?.message);
        setSaveState("error");
      }
    }, 700);
  }

  async function pickWriter(h, m) {
    if (locked || solving) return;
    const next = h.writerUid === m.uid ? null : { uid: m.uid, name: m.name || "" };
    try {
      await setXwHintWriter(activity.id, groupId, h.idx, next);
    } catch (e) {
      console.warn("[가로세로] 쓸 사람을 정하지 못했어요:", e?.code, e?.message);
      setNote("쓸 사람을 바꾸지 못했어요 — 힌트를 쓴 친구만 바꿀 수 있어요.");
    }
  }

  // ── 낱말 채우기 ──
  const entries = puzzle?.entries ?? [];
  const isOwn = (i) => entries[i]?.groupId === groupId;
  const firstOpen = () => {
    const i = entries.findIndex((e, j) => !isOwn(j) && !progress?.solved.has(j));
    return i >= 0 ? i : entries.findIndex((_, j) => !isOwn(j));
  };
  // 처음 열 때(또는 퍼즐이 바뀌면) 아직 못 푼 첫 낱말을 골라 둡니다
  useEffect(() => {
    if (!solving) { setSel(null); return; }
    setSel((s) => (s != null && entries[s] ? s : firstOpen()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solving, puzzle?.createdAt]);

  const selEntry = sel != null ? entries[sel] : null;
  const selKeys = useMemo(() => new Set(selEntry ? entryCellKeys(selEntry) : []), [selEntry]);

  // 고른 낱말이 바뀌면 지금 칸에 다 찬 낱말이 있으면 입력칸에 미리 채웁니다
  useEffect(() => {
    if (!selEntry) { setTyped(""); return; }
    const w = boardWordOf(selEntry, letters, fixed);
    setTyped(w.length === entryLen(selEntry) ? w : "");
    // letters는 일부러 빼 둡니다 — 친구가 다른 칸을 채울 때마다 적던 글이 덮이면 안 됩니다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  function pickEntry(i) {
    setSel(i);
    setNote("");
    if (!isOwn(i)) setTimeout(() => inputRef.current?.focus(), 0);
  }

  function pickCell(k) {
    if (!solving) return;
    const list = entries.map((e, i) => ({ e, i })).filter(({ e }) => entryCellKeys(e).includes(k)).map((x) => x.i);
    if (!list.length) return;
    // 우리 모둠 낱말보다 풀 낱말을 먼저, 두 낱말이 지나면 누를 때마다 번갈아
    const ordered = [...list.filter((i) => !isOwn(i)), ...list.filter((i) => isOwn(i))];
    const next = ordered.includes(sel) && ordered.length > 1
      ? ordered[(ordered.indexOf(sel) + 1) % ordered.length]
      : ordered[0];
    pickEntry(next);
  }

  async function commit() {
    if (!selEntry || isOwn(sel) || locked) return;
    // 지우면 안 되는 칸 — 이 낱말 말고 맞힌 낱말의 칸
    const protect = new Set();
    progress?.solved.forEach((i) => {
      if (i !== sel) entryCellKeys(entries[i]).forEach((k) => protect.add(k));
    });
    const plan = xwCommitPlan(selEntry, typed, letters, fixed, protect);
    try {
      await writeXwBoard(activity.id, groupId, plan.set, plan.del);
      setNote("");
    } catch (e) {
      console.warn("[가로세로] 낱말판에 넣지 못했어요:", e?.code, e?.message);
      setNote("넣지 못했어요 — 잠시 뒤 다시 눌러 주세요.");
      return;
    }
    // 다음 아직 못 푼 낱말로
    const nextIdx = entries.findIndex((e, j) => j > sel && !isOwn(j) && !progress?.solved.has(j));
    if (nextIdx >= 0) pickEntry(nextIdx);
  }

  const across = entries.map((e, i) => ({ e, i })).filter((x) => x.e.dir === "across");
  const down = entries.map((e, i) => ({ e, i })).filter((x) => x.e.dir === "down");
  const ownByIdx = new Map(hints.map((h) => [h.idx, h]));

  function renderClues(title, list) {
    return (
      <div className="xw-clues-col">
        <h4>{title}</h4>
        <ol>
          {list.map(({ e, i }) => {
            const own = e.groupId === groupId;
            const done = progress?.solved.has(i);
            return (
              <li key={`${e.dir}${e.num}`}>
                <button
                  type="button"
                  className={`xw-clue${i === sel ? " on" : ""}${done ? " done" : ""}${own ? " own" : ""}`}
                  onClick={() => solving && pickEntry(i)}
                  disabled={!solving}
                >
                  <b>{e.num}</b>
                  <span className="xw-clue-text">
                    {own
                      ? <>{ownByIdx.get(i)?.word ?? ""} <i className="xw-clue-own">우리 모둠 낱말</i></>
                      : solving
                        ? (e.clue || "(힌트 없음)")
                        : <span className="xw-clue-wait">힌트를 쓰는 중이에요</span>}
                    <i className="xw-clue-len">{e.len}글자</i>
                  </span>
                  {done && <span className="xw-clue-ok" aria-label="맞힘">✓</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  const head = (
    <div className="canvas-head">
      <div className="canvas-head-title">
        <strong>가로세로 낱말퀴즈</strong>
        <span>{activity.title}{myGroup?.groupName ? ` · ${myGroup.groupName}` : ""}</span>
      </div>
      <div className="canvas-head-pair">
        <button type="button" className="btn-ghost" onClick={onBack}>← 내 판</button>
      </div>
    </div>
  );

  if (!puzzle) {
    return (
      <main className="canvas-main xw-main">
        {head}
        <section className="xw-card">
          <p className="xw-empty">
            아직 퀴즈가 없어요. 선생님이 이 활동의 낱말로 가로세로 퀴즈를 만들면, 우리 모둠이
            맡은 낱말이 여기에 나타나요.
          </p>
        </section>
      </main>
    );
  }

  const solvedN = progress?.solved.size ?? 0;
  const totalN = progress?.total ?? 0;
  const allSolved = solving && totalN > 0 && solvedN === totalN;

  return (
    <main className="canvas-main xw-main">
      {head}

      <div className="xwg">
        {/* 왼쪽 — 우리 모둠 낱말 · 힌트 쓰기 */}
        <aside className="xwg-side xwg-left">
          {solving && (
            <section className="xw-card xwg-score">
              <header className="xw-card-head">
                <h3>우리 모둠 풀이</h3>
                <span className={`xw-badge${allSolved ? " done" : ""}`}>{solvedN} / {totalN}개</span>
              </header>
              <div className="xwg-bar" aria-hidden="true">
                <span style={{ width: `${totalN ? (solvedN / totalN) * 100 : 0}%` }} />
              </div>
              <p className="xw-card-note">
                {allSolved
                  ? "🎉 모든 낱말을 맞혔어요!"
                  : "맞힌 낱말은 초록으로 칠해져요. 우리 모둠 낱말(열쇠 칸)은 세지 않아요."}
              </p>
            </section>
          )}

          <section className="xw-card">
            <header className="xw-card-head">
              <h3>우리 모둠 낱말</h3>
              {!solving && (
                <span className={`xw-badge${hintDoneCount === hints.length && hints.length ? " done" : ""}`}>
                  힌트 {hintDoneCount} / {hints.length}
                </span>
              )}
            </header>
            <p className="xw-card-note">
              {solving
                ? "우리가 힌트를 쓴 낱말이에요. 판에는 미리 채워져 있어요."
                : "낱말마다 모둠원 이름을 눌러 누가 힌트를 쓸지 정하세요. 고른 사람만 힌트를 쓸 수 있어요(저절로 저장)."}
            </p>
            {hints.length === 0 ? (
              <p className="xw-empty">이번 퀴즈에서 우리 모둠이 맡은 낱말이 없어요.</p>
            ) : (
              <ol className="xwg-words">
                {hints.map((h) => {
                  const mine = h.writerUid === me;
                  // 쓰는 중인 글은 내가 쓸 사람일 때만 — 알약이 넘어가면 서버 값
                  const text = mine ? drafts[h.idx] ?? h.hint : h.hint;
                  const writtenByOther = !!h.hint.trim() && h.writerUid && !mine;
                  const done = xwHintDone({ ...h, hint: text });
                  const writerName = members.find((m) => m.uid === h.writerUid)?.name || h.writerName;
                  return (
                    <li key={h.idx} className={done ? "done" : ""}>
                      <div className="xwg-word-head">
                        <span className="xwg-word-tag">{DIR_LABEL[h.dir]} {h.num}</span>
                        <strong>{h.word}</strong>
                        <span className="xw-pick-len">{h.len}글자</span>
                        <span className={`xw-badge${done ? " done" : ""}`}>{done ? "제출" : "아직"}</span>
                      </div>
                      {!solving && (
                        <div className="xwg-pills" role="radiogroup" aria-label={`${h.word} 힌트를 쓸 사람`}>
                          {members.map((m) => {
                            const on = h.writerUid === m.uid;
                            const blocked = locked || writtenByOther;
                            return (
                              <button
                                key={m.uid}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                className={`xwg-pill${on ? " on" : ""}${m.uid === me ? " me" : ""}`}
                                onClick={() => pickWriter(h, m)}
                                disabled={blocked}
                                title={
                                  writtenByOther
                                    ? `${writerName}이(가) 쓴 힌트예요 — 쓴 사람만 바꿀 수 있어요`
                                    : on ? "다시 누르면 비워요" : `${m.name}이(가) 쓰기`
                                }
                              >
                                {m.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {solving ? (
                        <p className="xwg-hint-read">
                          {h.hint.trim() || <span className="xw-sub-empty">힌트 없음</span>}
                          {writerName && <span className="xwg-writer"> — {writerName}</span>}
                        </p>
                      ) : (
                        <>
                          <textarea
                            className="xw-pick-clue"
                            value={text}
                            onChange={(e) => changeHint(h, e.target.value)}
                            placeholder={
                              mine
                                ? `'${h.word}'을(를) 모르는 친구에게 설명하듯 적어 주세요`
                                : h.writerUid
                                  ? `${writerName}이(가) 쓰는 중이에요`
                                  : "먼저 위에서 쓸 사람을 정해 주세요"
                            }
                            rows={2}
                            maxLength={CROSSWORD_HINT_MAX}
                            disabled={!mine || locked}
                            aria-label={`${h.word}의 힌트`}
                          />
                          {mine && clueRevealsWord(h.word, text) && (
                            <span className="xw-pick-warn">힌트에 낱말이 그대로 들어 있어요 — 정답이 보여요</span>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            {!solving && (
              <p className="xw-save">
                {[
                  locked ? "잠긴 활동이라 고칠 수 없어요." : "",
                  saveState === "saving" ? "저장 중…" : saveState === "error" ? "저장하지 못했어요 — 잠시 뒤 다시 적어 보세요" : saveState === "saved" ? "저장했어요" : "",
                  note,
                ].filter(Boolean).join(" · ")}
              </p>
            )}
          </section>
        </aside>

        {/* 가운데 — 함께 채우는 낱말판 */}
        <section className="xw-card xwg-center">
          <header className="xw-card-head">
            <h3>{solving ? "우리 모둠 낱말판" : "낱말판 미리 보기"}</h3>
            <span className="xw-badge">{solving ? "모둠원이 함께 채워요" : "힌트를 다 쓰면 선생님이 '낱말 채우기'를 열어요"}</span>
          </header>
          <CrosswordGrid
            puzzle={puzzle}
            letters={solving ? letters : {}}
            fixed={fixed}
            solvedKeys={progress?.solvedKeys}
            selKeys={selKeys}
            onCellClick={solving ? pickCell : null}
          />
          {solving && selEntry && (
            <div className="xw-entry">
              <span className="xw-entry-tag">{DIR_LABEL[selEntry.dir]} {selEntry.num} · {selEntry.len}글자</span>
              {isOwn(sel) ? (
                <span className="xw-entry-clue">우리 모둠 낱말이에요 — 열쇠 칸이라 고칠 수 없어요.</span>
              ) : (
                <>
                  <span className="xw-entry-clue">{selEntry.clue || "(힌트 없음)"}</span>
                  <div className="xw-entry-row">
                    <input
                      ref={inputRef}
                      className="xw-entry-input"
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); }
                      }}
                      maxLength={selEntry.len + 4}
                      placeholder={`${selEntry.len}글자로 적고 Enter`}
                      disabled={locked}
                      aria-label={`${DIR_LABEL[selEntry.dir]} ${selEntry.num}번 답`}
                    />
                    <button type="button" className="btn-primary xw-entry-btn" onClick={commit} disabled={locked}>
                      넣기
                    </button>
                  </div>
                </>
              )}
              {note && <span className="xw-pick-warn">{note}</span>}
            </div>
          )}
          <p className="xw-card-note xwg-legend">
            <span className="xwg-swatch key" /> 열쇠 칸(우리 모둠 낱말)
            {solving && <><span className="xwg-swatch right" /> 맞힌 낱말</>}
          </p>
        </section>

        {/* 오른쪽 — 힌트 목록 */}
        <aside className="xwg-side xwg-right">
          <section className="xw-card">
            <header className="xw-card-head">
              <h3>낱말 힌트</h3>
            </header>
            {!solving && (
              <p className="xw-card-note">'낱말 채우기'가 시작되면 친구 모둠들이 쓴 힌트가 여기에 떠요.</p>
            )}
            <div className="xw-clues">
              {renderClues("가로", across)}
              {renderClues("세로", down)}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
