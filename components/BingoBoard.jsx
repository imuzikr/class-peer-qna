"use client";

// =============================================================
// 낱말 빙고 — 교사 화면 (독서 활동 '낱말 빙고', type: 'bingo')
// 낱말은 만들 때 고른 닿소리 채우기(activity.sourceActivityId)에서 가져와 활동 문서의
// bingo.words(낱말 상자)에 적어 두었습니다(lib/data/books.js의 addBingoActivity).
// 화면의 생김은 가로세로 낱말 퀴즈(CrosswordGroupBoard)를 그대로 따릅니다 —
// 왼쪽 판별 진행(미니맵 순위) · 가운데 고른 판 크게 + 진행 단추.
// -------------------------------------------------------------
// 두 단계(활동 문서의 bingo.stage)
//   판 채우기(fill) — 학생(모둠)이 낱말 상자에서 25칸을 골라 채웁니다. 왼쪽은 채운
//                    칸이 많은 차례, 목표 줄 수(1~5줄)를 여기서 정합니다.
//   빙고(play)      — 교사가 낱말을 부릅니다(상자에서 누르거나 '무작위로 부르기').
//                    부른 낱말이 든 칸이 모든 판에서 저절로 표시되고, 왼쪽은 빙고를
//                    먼저 한 차례 → 줄 수 차례. 판은 굳습니다(규칙도 같음).
// 실시간: 판 컬렉션 하나(bingoBoards)와 모둠 목록만 구독합니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import {
  subscribeBookGroups,
  subscribeBingoBoards,
  saveBingoState,
  refreshBingoWords,
  addSoloBookBoards,
} from "@/lib/store";
import {
  BINGO_CELLS,
  BINGO_GOALS,
  bingoProgress,
  nextBingoCall,
  normalizeBingo,
  normalizeBingoCells,
  rankBingo,
} from "@/lib/bingo";
import { ROW_COLORS } from "@/lib/bookColors";
import BingoGrid from "./BingoGrid";
import ConfirmModal from "./ConfirmModal";
import { BOOK_LOCKED_TEACHER } from "./BookHeadParts";
import { IconLock } from "./StatusIcons";

export default function BingoBoard({ activity, onBack, onToast, user, roster = [], classPicker = null, classTools = null }) {
  const [groups, setGroups] = useState([]);
  const [rawBoards, setRawBoards] = useState([]);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(null); // 'start' | 'back' | 'reset'

  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);
  useEffect(() => subscribeBingoBoards(activity.id, setRawBoards), [activity.id]);

  const solo = activity.groupMode === "solo";
  const bingo = useMemo(() => normalizeBingo(activity.bingo), [activity.bingo]);
  const stage = bingo?.stage ?? "fill";
  const playing = stage === "play";
  const called = useMemo(() => bingo?.called ?? [], [bingo]);
  const goal = bingo?.goal ?? 3;
  const lastWord = called.at(-1) ?? "";

  const liveGroups = useMemo(
    () => groups.filter((g) => !g.retired && (g.memberUids ?? []).length > 0)
      .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0)),
    [groups]
  );
  const studentCount = liveGroups.reduce((n, g) => n + g.memberUids.length, 0);
  const labelOf = (g, i = 0) => (solo ? g?.members?.[0]?.name || g?.groupName || "학생" : g?.groupName || `${g?.groupIndex ?? i + 1}모둠`);
  const colorOf = useMemo(() => {
    const m = new Map(liveGroups.map((g, i) => [g.id, ROW_COLORS[i % ROW_COLORS.length]]));
    return (gId) => m.get(gId) ?? ROW_COLORS[0];
  }, [liveGroups]);

  // 판마다 진행 — 판 문서가 아직 없으면 빈 판
  const cellsBy = useMemo(() => new Map(rawBoards.map((b) => [b.id, normalizeBingoCells(b.cells)])), [rawBoards]);
  const ranks = useMemo(() => {
    const rows = liveGroups.map((g, order) => ({
      ...bingoProgress(cellsBy.get(g.id) ?? [], called, goal),
      groupId: g.id,
      group: g,
      order,
    }));
    // 판 채우기 단계는 많이 채운 차례(같으면 원래 차례)
    return playing
      ? rankBingo(rows)
      : [...rows].sort((a, b) => b.filled - a.filled || a.order - b.order);
  }, [liveGroups, cellsBy, called, goal, playing]);
  const pickedRow = ranks.find((r) => r.groupId === picked) ?? ranks[0] ?? null;
  const bingoCount = ranks.filter((r) => r.bingo).length;
  const fullCount = ranks.filter((r) => r.filled === BINGO_CELLS).length;

  // 낱말마다 몇 판에 놓였나(부르기 칩의 작은 숫자)
  const boardsWith = useMemo(() => {
    const m = new Map();
    ranks.forEach((r) => new Set(r.cells.filter(Boolean)).forEach((w) => m.set(w, (m.get(w) ?? 0) + 1)));
    return m;
  }, [ranks]);
  const calledOrder = useMemo(() => new Map(called.map((w, i) => [w, i + 1])), [called]);

  // 개별 활동 — 만든 뒤 반에 들어온 학생에게는 판이 없습니다(닿소리와 같음).
  const haveUids = useMemo(() => new Set(groups.filter((g) => !g.retired).flatMap((g) => g.memberUids ?? [])), [groups]);
  const missing = solo ? (roster ?? []).filter((s) => s?.uid && !haveUids.has(s.uid)) : [];

  async function save(next, msg) {
    setBusy(true);
    try {
      await saveBingoState(activity.id, { ...bingo, ...next });
      if (msg) onToast?.(msg);
    } catch (e) {
      console.warn("[빙고] 저장하지 못했어요:", e?.code, e?.message);
      setNote("저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  function callWord(word) {
    if (!playing || !word || calledOrder.has(word) || busy) return;
    setNote("");
    save({ called: [...called, word] });
  }
  function callRandom() {
    const w = nextBingoCall(ranks.map((r) => r.cells), bingo?.words, called);
    if (!w) { setNote("더 부를 낱말이 없어요."); return; }
    callWord(w);
  }
  function undoCall() {
    if (!called.length) return;
    save({ called: called.slice(0, -1) }, `‘${lastWord}’ 부르기를 되돌렸어요.`);
  }
  function start() {
    setConfirm(null);
    setNote("");
    save({ stage: "play", called: [] }, "빙고를 시작했어요. 이제 판은 고칠 수 없어요.");
  }
  function backToFill() {
    setConfirm(null);
    save({ stage: "fill", called: [] }, "판 채우기로 돌아갔어요.");
  }
  function resetCalls() {
    setConfirm(null);
    save({ called: [] }, "부른 낱말을 모두 지웠어요. 같은 판으로 다시 시작해요.");
  }
  async function refreshWords() {
    setBusy(true);
    setNote("");
    try {
      const n = await refreshBingoWords(activity);
      setNote(`낱말 상자를 새로 채웠어요 — 낱말 ${n}개.`);
    } catch (e) {
      console.warn("[빙고] 낱말을 가져오지 못했어요:", e?.code, e?.message);
      setNote("낱말을 가져오지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }
  async function addMissing() {
    setBusy(true);
    try {
      const n = await addSoloBookBoards(user, activity.id, missing);
      onToast?.(`판 ${n}개를 더 만들었어요.`);
    } catch (e) {
      console.warn("[빙고] 판을 만들지 못했어요:", e?.code, e?.message);
    } finally {
      setBusy(false);
    }
  }

  const words = bingo?.words ?? [];
  const who = solo ? "학생" : "모둠";

  return (
    <main className="canvas-main dash-root xw-main bingo-main">
      <div className="canvas-head">
        <strong className="canvas-head-name">{activity.title}</strong>
        <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
        {classPicker}
        {classTools}
        <span className="canvas-head-stats">
          {activity.sourceTitle ? `낱말: ${activity.sourceTitle} · ` : ""}
          {solo ? "개별 활동" : `모둠 ${liveGroups.length}개`} · 학생 {studentCount}명 · 낱말 {words.length}개
        </span>
        <span className={`xw-badge xwg-stage${playing ? " done" : ""}`}>
          {playing ? `빙고 중 · ${goal}줄 빙고` : "판 채우는 중"}
        </span>
        {activity.locked && (
          <span className="book-locked-note book-locked-chip">
            <IconLock size={14} /> {BOOK_LOCKED_TEACHER}
          </span>
        )}
      </div>

      <div className="xwg xwg--teacher">
        {/* 왼쪽 — 판별 진행(미니맵 순위). 누르면 가운데에 그 판이 크게 섭니다 */}
        <aside className="xwg-side xwg-left">
          <section className="xw-card">
            <header className="xw-card-head">
              <h3>{solo ? "학생별 빙고" : "모둠별 빙고"}</h3>
              <span className={`xw-badge${playing ? (bingoCount ? " done" : "") : fullCount === ranks.length && ranks.length ? " done" : ""}`}>
                {playing ? `빙고 ${bingoCount} / ${ranks.length}` : `다 채움 ${fullCount} / ${ranks.length}`}
              </span>
            </header>
            {missing.length > 0 && (
              <button type="button" className="bingo-missing" onClick={addMissing} disabled={busy}>
                판이 없는 학생 {missing.length}명 — 판 만들기
              </button>
            )}
            {ranks.length === 0 ? (
              <p className="xw-empty">아직 판이 없어요. {solo ? "반에 학생이 들어오면" : "모둠에 학생이 있으면"} 판이 생겨요.</p>
            ) : (
              <ol className="xwg-ranks">
                {ranks.map((p, rank) => {
                  const color = colorOf(p.groupId);
                  const on = pickedRow?.groupId === p.groupId;
                  return (
                    <li key={p.groupId}>
                      <button
                        type="button"
                        className={`xwg-rank${on ? " on" : ""}`}
                        style={{ "--xwg-c": color.border, "--xwg-bg": color.bg }}
                        onClick={() => setPicked(p.groupId)}
                        aria-pressed={on}
                        title={playing ? `${p.count}줄 · 불린 칸 ${p.marked.size}개` : `채운 칸 ${p.filled} / ${BINGO_CELLS}`}
                      >
                        <span className="xwg-rank-head">
                          <b className="xwg-rank-no">{rank + 1}</b>
                          <strong>{labelOf(p.group, p.order)}</strong>
                          <span className={`xw-badge${playing ? (p.bingo ? " done" : "") : p.filled === BINGO_CELLS ? " done" : ""}`}>
                            {playing ? (p.bingo ? `빙고! ${p.count}줄` : `${p.count}줄`) : `${p.filled} / ${BINGO_CELLS}칸`}
                          </span>
                        </span>
                        <BingoGrid cells={p.cells} marked={p.marked} lineCells={p.lineCells} mini tint={color} />
                        {playing && p.bingoAt && (
                          <span className="bingo-rank-at">{p.bingoAt}번째 낱말에서 빙고</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="xw-card-note xwg-legend">
              {playing
                ? <><span className="bingo-swatch marked" /> 불린 칸 <span className="bingo-swatch line" /> 빙고 줄 — 먼저 빙고한 차례, 그다음 줄 수</>
                : <><span className="bingo-swatch filled" /> 채운 칸 — 많이 채운 차례</>}
            </p>
          </section>
        </aside>

        <div className="xwg-center xwg-center--teacher">
          <section className="xw-card">
            <header className="xw-card-head">
              <h3>{pickedRow ? `${labelOf(pickedRow.group, pickedRow.order)}의 빙고판` : "빙고판"}</h3>
              {pickedRow && (
                <span className={`xw-badge${playing && pickedRow.bingo ? " done" : ""}`}>
                  {playing ? `${pickedRow.count}줄 · 불린 칸 ${pickedRow.marked.size}개` : `${pickedRow.filled} / ${BINGO_CELLS}칸`}
                </span>
              )}
            </header>

            {/* 안내가 앞, 단추가 그 오른쪽(가로세로와 같은 줄) — 크기는 하나, 색으로만 가릅니다 */}
            <div className="xw-gen-row">
              <div className="xw-gen-inner">
                <span className="xw-gen-note">
                  {note ||
                    (!bingo
                      ? "낱말 상자가 비어 있어요. ‘낱말 새로 가져오기’를 눌러 닿소리 채우기의 낱말을 들여오세요."
                      : playing
                        ? `낱말 ${called.length}개를 불렀어요. 아래 낱말 상자에서 누르거나 ‘무작위로 부르기’로 부르면 모든 판에 곧바로 표시돼요.`
                        : `${who}마다 낱말 상자에서 25칸을 골라 채워요(다 채움 ${fullCount} / ${ranks.length}). 다 채웠으면 ‘빙고 시작’을 누르세요 — 시작하면 판은 굳어요.`)}
                </span>
                <div className="xw-gen-btns">
                  {playing ? (
                    <>
                      <button type="button" className="xw-gen-btn xw-gen-btn--make" onClick={callRandom} disabled={busy || called.length >= words.length}>
                        무작위로 부르기
                      </button>
                      <button type="button" className="xw-gen-btn xw-gen-btn--step" onClick={undoCall} disabled={busy || !called.length}>
                        하나 되돌리기
                      </button>
                      <button type="button" className="xw-gen-btn xw-gen-btn--off" onClick={() => setConfirm("back")} disabled={busy}>
                        판 채우기로 돌아가기
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="xw-gen-btn xw-gen-btn--make"
                        onClick={() => (fullCount < ranks.length ? setConfirm("start") : start())}
                        disabled={busy || !bingo || ranks.length === 0}
                      >
                        빙고 시작
                      </button>
                      <button type="button" className="xw-gen-btn xw-gen-btn--step" onClick={refreshWords} disabled={busy || !activity.sourceActivityId}>
                        낱말 새로 가져오기
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 목표 줄 수 — 진행 중에도 바꿀 수 있습니다(순위는 곧바로 다시 셈) */}
            {bingo && (
              <div className="bingo-goal">
                <span className="bingo-goal-label">빙고 목표</span>
                <div className="book-seg bingo-goal-seg" role="group" aria-label="빙고 목표 줄 수">
                  {BINGO_GOALS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`book-seg-btn${goal === n ? " active" : ""}`}
                      aria-pressed={goal === n}
                      disabled={busy}
                      onClick={() => goal !== n && save({ goal: n }, `${n}줄 빙고로 바꿨어요.`)}
                    >
                      {n}줄
                    </button>
                  ))}
                </div>
                {playing && called.length > 0 && (
                  <button type="button" className="bingo-reset" onClick={() => setConfirm("reset")} disabled={busy}>
                    부른 낱말 모두 지우기
                  </button>
                )}
              </div>
            )}

            {playing && (
              <p className="bingo-last" aria-live="polite">
                {lastWord ? <>방금 부른 낱말 <strong>{lastWord}</strong> <em>{called.length}번째</em></> : "아직 부른 낱말이 없어요."}
              </p>
            )}

            {pickedRow ? (
              <BingoGrid
                cells={pickedRow.cells}
                marked={pickedRow.marked}
                lineCells={pickedRow.lineCells}
                lastWord={lastWord}
              />
            ) : (
              <p className="xw-empty">왼쪽에 판이 생기면 눌러서 크게 볼 수 있어요.</p>
            )}
          </section>

          {/* 낱말 상자 — 판 채우기 단계에는 보기만, 빙고 중에는 눌러서 부릅니다 */}
          <section className="xw-card">
            <header className="xw-card-head">
              <h3>{playing ? "낱말 부르기" : "낱말 상자"}</h3>
              <span className="xw-badge">{playing ? `부름 ${called.length} / ${words.length}` : `낱말 ${words.length}개`}</span>
            </header>
            <p className="xw-card-note">
              {playing
                ? "낱말을 누르면 부릅니다. 숫자는 그 낱말이 놓인 판 수, 동그라미는 부른 차례예요."
                : "학생이 판을 채울 때 고르는 낱말이에요. 숫자는 지금 그 낱말을 놓은 판 수예요."}
            </p>
            {words.length === 0 ? (
              <p className="xw-empty">낱말이 없어요. 닿소리 채우기에 낱말이 모이면 ‘낱말 새로 가져오기’를 눌러 주세요.</p>
            ) : (
              <div className="bingo-chips">
                {words.map((w) => {
                  const n = calledOrder.get(w);
                  return (
                    <button
                      key={w}
                      type="button"
                      className={`bingo-chip${n ? " called" : ""}${w === lastWord ? " last" : ""}`}
                      onClick={() => callWord(w)}
                      disabled={!playing || !!n || busy}
                      title={n ? `${n}번째로 불렀어요` : playing ? "눌러서 부르기" : undefined}
                    >
                      {n && <b className="bingo-chip-no">{n}</b>}
                      {w}
                      <em className="bingo-chip-count">{boardsWith.get(w) ?? 0}</em>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {confirm === "start" && (
        <ConfirmModal
          icon={<span aria-hidden="true">🎯</span>}
          title="빙고를 시작할까요?"
          description={`아직 25칸을 다 채우지 못한 ${who}이(가) ${ranks.length - fullCount}개 있어요. 시작하면 판을 더 고칠 수 없고, 빈칸은 표시되지 않아요.`}
          confirmLabel="시작하기"
          onConfirm={start}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "back" && (
        <ConfirmModal
          icon={<span aria-hidden="true">🎯</span>}
          title="판 채우기로 돌아갈까요?"
          description="학생이 다시 판을 고칠 수 있게 되고, 지금까지 부른 낱말은 모두 지워져요. 채운 판은 그대로예요."
          confirmLabel="돌아가기"
          onConfirm={backToFill}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "reset" && (
        <ConfirmModal
          icon={<span aria-hidden="true">🎯</span>}
          title="부른 낱말을 모두 지울까요?"
          description="판은 그대로 두고, 부른 낱말만 지워 처음부터 다시 불러요."
          confirmLabel="모두 지우기"
          danger
          onConfirm={resetCalls}
          onClose={() => setConfirm(null)}
        />
      )}
    </main>
  );
}
