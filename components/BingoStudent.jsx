"use client";

// =============================================================
// 낱말 빙고 — 학생 화면 (독서 활동 '낱말 빙고', type: 'bingo')
// 가로세로 낱말 퀴즈의 학생 화면(CrosswordGroupStudent)과 같은 세 칸입니다.
//   왼쪽  — 나의(우리 모둠) 빙고 한눈에(미니맵 · 진행 막대) · 빙고 중에는 가장 앞선
//           친구(모둠)의 판
//   가운데 — 나의(우리 모둠) 빙고판(4×4 · 5×5 — bingo.size). 판 채우기 단계에는 오른쪽
//           낱말을 누르고 넣을 칸을 눌러 채웁니다(칸을 먼저 골라도 됨 · 모둠은 모둠원이
//           함께 — 칸 하나씩 저장해 서로 안 덮음).
//           빙고 중에는 굳고, 부른 낱말이 저절로 표시됩니다. **학생이 진행**이면 내 차례에
//           내 판의 안 불린 칸을 눌러 고르고 '부르기'(학번 차례대로 한 번씩 — callBingoTurn).
//   오른쪽 — 판 채우기: 낱말 상자 · 빙고 중: 선생님이 진행이면 불린 낱말(최근 것이 위),
//           학생이 진행이면 **부르는 차례**(낱말 목록은 두지 않음 — 제 판의 낱말로 하므로,
//           선생님 요청)
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeBookGroups, subscribeBingoBoards, writeBingoCells, callBingoTurn } from "@/lib/store";
import {
  BINGO_DEFAULT_GOAL,
  BINGO_DEFAULT_SIZE,
  bingoAhead,
  bingoBoardWords,
  bingoCallableWords,
  bingoCellCount,
  bingoLineCount,
  bingoProgress,
  bingoRandomFill,
  bingoTurnUid,
  bingoTurnsUntil,
  bingoUsedWords,
  normalizeBingo,
  normalizeBingoCells,
  rankBingo,
} from "@/lib/bingo";
import BingoGrid from "./BingoGrid";
import ConfirmModal from "./ConfirmModal";
import { BookLockedNote } from "./BookHeadParts";

// 미니맵의 표시 색 — 가로세로 학생 미니맵과 같은 초록
const MAP_TINT = { bg: "#cdebd7", border: "#6fbf8a" };

export default function BingoStudent({ activity, groupId, user, onBack }) {
  const myUid = user?.uid ?? null;
  const solo = activity.groupMode === "solo";
  const OUR = solo ? "나의" : "우리 모둠";
  const [groups, setGroups] = useState([]);
  const [rawBoards, setRawBoards] = useState([]);
  const [sel, setSel] = useState(null);
  // 먼저 고른 낱말 — 그다음 누른 칸에 들어갑니다(선생님 요청: 낱말 → 칸 차례)
  const [pick, setPick] = useState("");
  const [note, setNote] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  // 학생이 진행 — 내 차례에 고른 칸 { i, at: 고를 때의 부른 낱말 수 }(차례가 지나면 저절로 풀림)
  const [callSel, setCallSel] = useState(null);
  const [calling, setCalling] = useState(false);

  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);
  useEffect(() => subscribeBingoBoards(activity.id, setRawBoards), [activity.id]);

  const bingo = useMemo(() => normalizeBingo(activity.bingo), [activity.bingo]);
  const size = bingo?.size ?? BINGO_DEFAULT_SIZE;
  const cellCount = bingoCellCount(size);
  const playing = bingo?.stage === "play";
  const studentLead = bingo?.lead === "student";
  const called = useMemo(() => bingo?.called ?? [], [bingo]);
  const goal = bingo?.goal ?? BINGO_DEFAULT_GOAL;
  const lastWord = called.at(-1) ?? "";
  const lastBy = bingo?.by.at(-1) ?? "";
  const locked = !!activity.locked;
  const canEdit = !!bingo && !playing && !locked;

  const myGroup = groups.find((g) => g.id === groupId) ?? null;
  const cellsBy = useMemo(
    () => new Map(rawBoards.map((b) => [b.id, normalizeBingoCells(b.cells, size)])),
    [rawBoards, size]
  );
  const cells = useMemo(() => cellsBy.get(groupId) ?? Array(cellCount).fill(""), [cellsBy, groupId, cellCount]);
  const mine = useMemo(() => bingoProgress(cells, called, goal, size), [cells, called, goal, size]);
  const used = useMemo(() => bingoUsedWords(cells), [cells]);
  // 이름 — 판의 members(만들 때 베낀 반 명단). 학생은 반 명단을 따로 읽지 않습니다.
  const people = useMemo(() => {
    const m = new Map();
    groups.forEach((g) => (g.members ?? []).forEach((x) => { if (x?.uid) m.set(x.uid, x); }));
    return m;
  }, [groups]);
  const nameOf = (uid) => people.get(uid)?.name || "친구";

  // 가장 앞선 친구(모둠) — 나를 뺀 판 가운데 1위(교사 화면과 같은 순위: 줄 수 · 0줄이면
  // 가로 · 세로로 이어진 칸 · 학번순)
  const leader = useMemo(() => {
    if (!playing) return null;
    const rows = groups
      .filter((g) => g.id !== groupId && !g.retired && (g.memberUids ?? []).length > 0)
      .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0))
      .map((g, order) => {
        const p = solo ? g.members?.[0] : null;
        return {
          ...bingoProgress(cellsBy.get(g.id) ?? [], called, goal, size),
          group: g,
          order,
          sortKey: p ? p.studentId || p.name || "" : "",
        };
      });
    const top = rankBingo(rows)[0];
    if (!top || top.marked.size === 0) return null;
    return { ...top, name: solo ? top.group.members?.[0]?.name || top.group.groupName || "친구" : top.group.groupName || "모둠" };
  }, [playing, groups, groupId, cellsBy, called, goal, size, solo]);
  const bingoFriends = useMemo(() => {
    if (!playing) return 0;
    return groups.filter((g) => g.id !== groupId && !g.retired && (g.memberUids ?? []).length > 0)
      .filter((g) => bingoProgress(cellsBy.get(g.id) ?? [], called, goal, size).bingo).length;
  }, [playing, groups, groupId, cellsBy, called, goal, size]);

  // 학생이 진행 — 지금 차례 · 내 차례까지
  const order = bingo?.order ?? [];
  const turnUid = bingoTurnUid(bingo);
  const myTurn = !!myUid && turnUid === myUid && !locked;
  // 내 차례인데 활동이 잠겨 있음 — 부를 수 없어 선생님이 대신 고릅니다(교사 화면도 같은 안내)
  const myTurnLocked = !!myUid && turnUid === myUid && locked;
  const until = myUid ? bingoTurnsUntil(bingo, myUid) : null;
  // 내 판에서 부를 수 있는 칸 — 낱말이 있고, 상자의 낱말이고, 아직 안 불린 것(교사 화면이 '부를
  // 낱말 없음'을 가리는 셈과 같은 함수 — lib/bingo.js의 bingoCallableWords)
  const callableWords = useMemo(() => new Set(bingoCallableWords(cells, bingo)), [cells, bingo]);
  const callable = (i) => !!cells[i] && callableWords.has(cells[i]);
  const anyCallable = callableWords.size > 0;
  // 판에 놓인 낱말을 모두 불렀나 — 그러면 내 차례여도 선생님도 더 고를 낱말이 없습니다
  // (교사 화면의 exhausted와 같은 셈)
  const exhausted = useMemo(() => {
    if (!playing) return false;
    const done = new Set(called);
    const live = groups.filter((g) => !g.retired && (g.memberUids ?? []).length > 0);
    return bingoBoardWords(live.map((g) => cellsBy.get(g.id) ?? []), bingo?.words ?? []).every((x) => done.has(x.word));
  }, [playing, called, groups, cellsBy, bingo]);
  const selIdx = myTurn && callSel && callSel.at === called.length && callable(callSel.i) ? callSel.i : null;

  async function write(set, del = []) {
    setNote("");
    try {
      await writeBingoCells(activity.id, groupId, set, del);
    } catch (e) {
      console.warn("[빙고] 판을 저장하지 못했어요:", e?.code, e?.message);
      setNote("저장하지 못했어요 — 잠시 뒤 다시 눌러 주세요.");
    }
  }
  // 칸 누르기 — 고른 낱말이 있으면 그 칸에 넣고(이미 든 낱말은 바뀜), 없으면 칸을 고릅니다
  // (고른 칸은 '칸 비우기' · Delete로 비우거나, 다음에 누른 낱말로 채웁니다).
  function pickCell(i) {
    if (!canEdit) return;
    if (pick) {
      write({ [String(i)]: pick });
      setPick("");
      setSel(null);
      return;
    }
    setSel((cur) => (cur === i ? null : i));
  }
  // 낱말 누르기 — 칸을 먼저 골라 두었으면 곧바로 그 칸에, 아니면 낱말을 집어 듭니다
  // (같은 낱말을 다시 누르면 내려놓음). 판에 이미 놓인 낱말은 못 고릅니다.
  function pickWord(word) {
    if (!canEdit || used.has(word)) return;
    if (sel != null) {
      write({ [String(sel)]: word });
      setSel(null);
      setPick("");
      return;
    }
    setPick((cur) => (cur === word ? "" : word));
  }
  function clearCell() {
    if (!canEdit || sel == null || !cells[sel]) return;
    write({}, [String(sel)]);
  }
  function fillRandom() {
    if (!canEdit) return;
    const set = bingoRandomFill(cells, bingo.words, Math.random, size);
    if (!Object.keys(set).length) { setNote(mine.filled === cellCount ? "이미 다 채웠어요." : "넣을 낱말이 더 없어요."); return; }
    write(set);
    setSel(null);
    setPick("");
  }
  function clearAll() {
    setConfirmClear(false);
    const del = cells.map((w, i) => (w ? String(i) : null)).filter(Boolean);
    if (del.length) write({}, del);
    setSel(null);
    setPick("");
  }

  // 학생이 진행 — 내 차례에 내 판의 칸을 눌러 고르고(다시 누르면 풀림) '부르기'로 부릅니다.
  // 한 번 더 확인하는 까닭: 잘못 누른 낱말도 곧바로 모든 판에 표시되고, 되돌리기는 선생님만 합니다.
  function pickCallCell(i) {
    if (!myTurn || !callable(i)) return;
    setNote("");
    setCallSel((cur) => (cur?.i === i && cur.at === called.length ? null : { i, at: called.length }));
  }
  async function callMine() {
    if (selIdx == null || calling) return;
    setCalling(true);
    setNote("");
    try {
      const ok = await callBingoTurn(activity.id, myUid, cells[selIdx]);
      if (!ok) setNote("그사이 차례가 넘어갔거나 이미 불린 낱말이에요.");
      setCallSel(null);
    } catch (e) {
      console.warn("[빙고] 낱말을 부르지 못했어요:", e?.code, e?.message);
      setNote("부르지 못했어요 — 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setCalling(false);
    }
  }

  // 판 위에서 Delete · Backspace로 고른 칸 비우기
  function onBoardKey(e) {
    if (!canEdit || sel == null) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); clearCell(); }
  }

  const head = (
    <>
      <div className="canvas-head">
        <div className="canvas-head-title">
          <strong>낱말 빙고</strong>
          <span>{activity.title}{myGroup?.groupName && !solo ? ` · ${myGroup.groupName}` : ""}</span>
        </div>
        <div className="canvas-head-pair">
          <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
        </div>
      </div>
      {locked && <BookLockedNote />}
    </>
  );

  if (!bingo) {
    return (
      <main className="canvas-main xw-main bingo-main">
        {head}
        <section className="xw-card">
          <p className="xw-empty">아직 빙고 낱말이 없어요. 선생님이 낱말을 가져오면 여기에서 판을 채울 수 있어요.</p>
        </section>
      </main>
    );
  }

  const fillPct = (mine.filled / cellCount) * 100;
  const linePct = Math.min(100, (mine.count / goal) * 100);
  const selWord = sel != null ? cells[sel] : "";

  return (
    <main className="canvas-main xw-main bingo-main">
      {head}

      <div className="xwg">
        {/* 왼쪽 — 나의 빙고 한눈에 · 가장 앞선 친구 */}
        <aside className="xwg-side xwg-left">
          <section className="xw-card xwg-mymap">
            <header className="xw-card-head">
              <h3>{OUR} 빙고 한눈에</h3>
              <span className={`xw-badge${(playing ? mine.bingo : mine.filled === cellCount) ? " done" : ""}`}>
                {playing ? `${mine.count} / ${goal}줄` : `${mine.filled} / ${cellCount}칸`}
              </span>
            </header>
            <BingoGrid size={size} cells={cells} marked={mine.marked} lineCells={mine.lineCells} sel={sel} mini tint={MAP_TINT} />
            <div className="xwg-bar" aria-hidden="true">
              <span style={{ width: `${playing ? linePct : fillPct}%` }} />
            </div>
            <p className="xw-card-note">
              {playing
                ? mine.bingo
                  ? `🎉 빙고! ${mine.count}줄을 완성했어요${mine.bingoAt ? ` (${mine.bingoAt}번째 낱말에서)` : ""}.`
                  : `불린 칸 ${mine.marked.size}개 · ${goal}줄을 완성하면 빙고예요(가로 · 세로 · 대각선 ${bingoLineCount(size)}줄).`
                : mine.filled === cellCount
                  ? "다 채웠어요! 선생님이 ‘빙고 시작’을 누를 때까지 칸을 바꿀 수 있어요."
                  : `빈칸 ${cellCount - mine.filled}개 — 오른쪽 낱말 상자에서 골라 채워요.`}
            </p>
          </section>

          {playing ? (
            <section className="xw-card xwg-leader">
              <header className="xw-card-head">
                <h3>{solo ? "가장 앞선 친구" : "가장 앞선 모둠"}</h3>
                {leader && <span className={`xw-badge${leader.bingo ? " done" : ""}`}>{leader.count}줄</span>}
              </header>
              {leader ? (
                <>
                  <p className="xw-card-note xwg-leader-name">
                    <strong>{leader.name}</strong> · {leader.count > 0 ? `불린 칸 ${leader.marked.size}개` : `가로 · 세로로 ${leader.run}칸 이어짐`}
                    {bingoAhead(mine, leader)
                      ? <span className="xwg-leader-me"> · 지금은 {solo ? "내가" : "우리가"} 앞서요!</span>
                      : null}
                  </p>
                  <BingoGrid size={size} cells={leader.cells} marked={leader.marked} lineCells={leader.lineCells} mini tint={MAP_TINT} />
                  <p className="xw-card-note">빙고한 {solo ? "친구" : "모둠"} {bingoFriends}{solo ? "명" : "개"} — 완성한 줄이 많은 차례로 정해요(0줄이면 가로 · 세로로 이어진 칸이 긴 차례).</p>
                </>
              ) : (
                <p className="xw-empty">아직 표시된 칸이 있는 {solo ? "친구" : "모둠"}가 없어요.</p>
              )}
            </section>
          ) : (
            <section className="xw-card">
              <header className="xw-card-head"><h3>이렇게 해요</h3></header>
              <ol className="bingo-how">
                <li>오른쪽 낱말 상자에서 낱말을 누르고, 판에서 넣을 칸을 누르면 그 칸이 채워져요.</li>
                <li>이미 채운 칸을 누르면 새 낱말로 바뀌어요. 칸만 눌러 고른 뒤 ‘칸 비우기’로 비울 수도 있어요.</li>
                {studentLead
                  ? <li>선생님이 ‘빙고 시작’을 누르면 판이 굳어요. 그다음 학번 차례대로 한 번씩, 내 판의 낱말을 골라 불러요.</li>
                  : <li>선생님이 ‘빙고 시작’을 누르면 판이 굳고, 부르는 낱말이 저절로 표시돼요.</li>}
                {!solo && <li>모둠원이 함께 한 판을 채워요 — 친구가 넣은 낱말도 곧바로 보여요.</li>}
              </ol>
            </section>
          )}
        </aside>

        {/* 가운데 — 빙고판 */}
        <section className="xw-card xwg-center">
          <header className="xw-card-head">
            <h3>{OUR} 빙고판</h3>
            <span className={`xw-badge${playing && mine.bingo ? " done" : ""}`}>
              {playing ? (mine.bingo ? `빙고! ${mine.count}줄` : `${goal}줄 빙고`) : solo ? "혼자 채워요" : "모둠원이 함께 채워요"}
            </span>
          </header>
          {playing && (
            <p className={`bingo-last${mine.bingo ? " won" : ""}`} aria-live="polite">
              {mine.bingo
                ? <>🎉 <strong>빙고!</strong> {mine.count}줄 완성</>
                : lastWord
                  ? <>방금 불린 낱말 <strong>{lastWord}</strong> <em>{called.length}번째{lastBy ? ` · ${lastBy === myUid ? "내 차례" : `${nameOf(lastBy)} 차례`}` : ""}</em></>
                  : studentLead
                    ? "첫 번호부터 학번 차례대로 낱말을 불러요."
                    : "선생님이 낱말을 부르기를 기다려요."}
            </p>
          )}
          {/* 학생이 진행 — 내 차례 알림 · 아니면 지금 누구 차례인지 */}
          {playing && studentLead && (
            myTurn ? (
              <p className="bingo-myturn" role="status">
                <strong>내 차례예요!</strong>{" "}
                {anyCallable
                  ? "내 판에서 아직 안 불린 낱말을 누른 뒤 ‘부르기’를 누르세요."
                  : exhausted
                    ? "판에 놓인 낱말을 모두 불렀어요 — 더 부를 낱말이 없어요."
                    : mine.filled === 0
                    ? "내 판에 낱말이 없어요 — 선생님이 대신 골라 주실 거예요."
                    : "내 판의 낱말을 모두 불렀어요 — 선생님이 대신 골라 주실 거예요."}
              </p>
            ) : myTurnLocked ? (
              <p className="bingo-waitturn">
                <strong>내 차례</strong>지만 지금은 활동이 잠겨 있어 부를 수 없어요 — 선생님이 대신 골라 주실 거예요.
              </p>
            ) : turnUid ? (
              <p className="bingo-waitturn">
                지금은 <strong>{nameOf(turnUid)}</strong>의 차례예요
                {until === 1 ? " — 다음이 내 차례예요!" : until != null ? ` — 내 앞에 ${until}명이 남았어요.` : "."}
              </p>
            ) : null
          )}
          {/* 칸 버튼이 포커스를 가지므로 Delete · Backspace를 여기서 받습니다 */}
          <div className={`bingo-board-wrap${pick ? " picking" : ""}${myTurn ? " calling" : ""}`} onKeyDown={onBoardKey}>
            <BingoGrid
              size={size}
              cells={cells}
              marked={mine.marked}
              lineCells={mine.lineCells}
              lastWord={playing ? lastWord : ""}
              sel={canEdit ? sel : selIdx}
              onCellClick={canEdit ? pickCell : myTurn ? pickCallCell : null}
              cellEnabled={myTurn ? callable : null}
            />
          </div>
          {canEdit && (
            <div className="xw-gen-row">
              <div className="xw-gen-inner">
              <span className="xw-gen-note">
                {pick
                  ? <>고른 낱말: <strong>{pick}</strong> — 판에서 넣을 칸을 누르세요.</>
                  : sel != null
                    ? selWord
                      ? <>고른 칸: <strong>{selWord}</strong> — 낱말을 누르면 바뀌어요.</>
                      : "고른 칸이 비어 있어요 — 오른쪽 낱말을 눌러 넣으세요."
                    : "오른쪽에서 낱말을 누르고, 넣을 칸을 누르세요."}
              </span>
              <div className="xw-gen-btns">
                <button type="button" className="xw-gen-btn xw-gen-btn--off" onClick={clearCell} disabled={sel == null || !selWord}>
                  칸 비우기
                </button>
                <button type="button" className="xw-gen-btn xw-gen-btn--step" onClick={fillRandom} disabled={mine.filled === cellCount}>
                  빈칸 무작위로 채우기
                </button>
                <button type="button" className="xw-gen-btn xw-gen-btn--off" onClick={() => setConfirmClear(true)} disabled={mine.filled === 0}>
                  판 모두 비우기
                </button>
              </div>
              </div>
            </div>
          )}
          {myTurn && anyCallable && (
            <div className="xw-gen-row">
              <div className="xw-gen-inner">
                <span className="xw-gen-note">
                  {selIdx != null
                    ? <>고른 낱말: <strong>{cells[selIdx]}</strong> — ‘부르기’를 누르면 모두의 판에 표시돼요.</>
                    : "내 판에서 부를 낱말을 하나 누르세요(초록 칸은 이미 불린 낱말이에요)."}
                </span>
                <div className="xw-gen-btns">
                  <button type="button" className="xw-gen-btn xw-gen-btn--make" onClick={callMine} disabled={selIdx == null || calling}>
                    {calling ? "부르는 중…" : "부르기"}
                  </button>
                </div>
              </div>
            </div>
          )}
          {note && <p className="xw-pick-warn">{note}</p>}
          <p className="xw-card-note xwg-legend">
            {playing
              ? <><span className="bingo-swatch marked" /> 불린 칸 <span className="bingo-swatch line" /> 빙고 줄 <span className="bingo-swatch last" /> 방금 불린 낱말{myTurn && <> <span className="bingo-swatch sel" /> 고른 칸</>}</>
              : <><span className="bingo-swatch filled" /> 채운 칸 <span className="bingo-swatch sel" /> 고른 칸</>}
          </p>
        </section>

        {/* 오른쪽 — 낱말 상자 / 불린 낱말 / 부르는 차례(학생이 진행) */}
        <aside className="xwg-side xwg-right">
          {playing && studentLead ? (
            <section className="xw-card">
              <header className="xw-card-head">
                <h3>부르는 차례</h3>
                <span className="xw-badge">{order.length ? `${bingo.turn + 1} / ${order.length}` : "차례 없음"}</span>
              </header>
              <p className="xw-card-note">학번 차례대로 한 번씩 내 판의 낱말을 불러요. 마지막 번호까지 부르면 처음부터 다시예요.</p>
              {order.length === 0 ? (
                <p className="xw-empty">아직 부르는 차례가 없어요. 선생님께 말씀해 주세요.</p>
              ) : (
                <>
                  <ol className="bingo-turns">
                    {order.map((uid, i) => {
                      const now = i === bingo.turn;
                      const me = uid === myUid;
                      return (
                        <li
                          key={uid}
                          className={`bingo-turn${now ? " now" : ""}${i < bingo.turn ? " done" : ""}${me ? " me" : ""}`}
                          aria-current={now ? "step" : undefined}
                        >
                          <b>{i + 1}</b>
                          <span>{nameOf(uid)}</span>
                          {me && <em>나</em>}
                        </li>
                      );
                    })}
                  </ol>
                  <p className="xw-card-note">
                    {myTurn
                      ? "지금 내 차례예요!"
                      : myTurnLocked
                        ? "내 차례지만 활동이 잠겨 있어요."
                        : until === 1
                        ? "다음이 내 차례예요."
                        : until != null
                          ? `내 앞에 ${until}명 남았어요.`
                          : "차례에 내 이름이 없어요 — 선생님께 말씀해 주세요."}
                  </p>
                </>
              )}
            </section>
          ) : playing ? (
            <section className="xw-card">
              <header className="xw-card-head">
                <h3>불린 낱말</h3>
                <span className="xw-badge">{called.length}개</span>
              </header>
              {called.length === 0 ? (
                <p className="xw-empty">아직 불린 낱말이 없어요.</p>
              ) : (
                <ol className="bingo-called">
                  {[...called].reverse().map((w, k) => {
                    const n = called.length - k;
                    const hit = used.has(w);
                    return (
                      <li key={w} className={`${hit ? "hit" : ""}${k === 0 ? " last" : ""}`}>
                        <b>{n}</b>
                        <span>{w}</span>
                        {hit && <em>{solo ? "내 판" : "우리 판"}</em>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          ) : (
            <section className="xw-card">
              <header className="xw-card-head">
                <h3>낱말 상자</h3>
                <span className="xw-badge">{bingo.words.length}개</span>
              </header>
              <p className="xw-card-note">
                우리 반 친구들이 {activity.sourceTitle ? `‘${activity.sourceTitle}’` : "닿소리 채우기"}에 쓴 낱말 전부예요. 낱말을 누르고 판에서 넣을 칸을 누르세요. 판에 넣은 낱말은 흐리게 보여요.
              </p>
              {bingo.words.length === 0 ? (
                <p className="xw-empty">낱말 상자가 비어 있어요. 선생님께 말씀해 주세요.</p>
              ) : (
                <div className="bingo-chips">
                  {bingo.words.map((w) => (
                    <button
                      key={w}
                      type="button"
                      className={`bingo-chip${used.has(w) ? " used" : ""}${pick === w ? " on" : ""}`}
                      onClick={() => pickWord(w)}
                      disabled={!canEdit || used.has(w)}
                      aria-pressed={pick === w}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              )}
              {bingo.words.length > 0 && bingo.words.length < cellCount && (
                <p className="xw-card-note">낱말이 {cellCount}개보다 적어 판을 다 채울 수 없어요 — 빈칸은 표시되지 않아요.</p>
              )}
            </section>
          )}
        </aside>
      </div>

      {confirmClear && (
        <ConfirmModal
          icon={<span aria-hidden="true">🎯</span>}
          title="판을 모두 비울까요?"
          description={solo ? "채운 낱말이 모두 지워져요." : "모둠원이 함께 채운 낱말이 모두 지워져요."}
          confirmLabel="모두 비우기"
          danger
          onConfirm={clearAll}
          onClose={() => setConfirmClear(false)}
        />
      )}
    </main>
  );
}
