"use client";

// =============================================================
// 낱말 빙고 — 교사 화면 (독서 활동 '낱말 빙고', type: 'bingo')
// 낱말은 만들 때 고른 닿소리 채우기(activity.sourceActivityId)에서 가져와 활동 문서의
// bingo.words(낱말 상자)에 적어 두었습니다(lib/data/books.js의 addBingoActivity).
// 화면의 생김은 가로세로 낱말 퀴즈(CrosswordGroupBoard)를 그대로 따릅니다 —
// 왼쪽 판별 진행(미니맵 순위) · 가운데 고른 판 크게 + 진행 단추.
// -------------------------------------------------------------
// 두 단계(활동 문서의 bingo.stage) — 판 크기(4×4 · 5×5)는 bingo.size
//   판 채우기(fill) — 학생(모둠)이 낱말 상자에서 칸을 골라 채웁니다. 왼쪽은 채운 칸이 많은
//                    차례, 목표 줄 수(1~5줄)와 낱말 부르기(누가 부를지)를 여기서 정합니다.
//   빙고(play)      — 판은 굳고(규칙도 같음), 부른 낱말이 든 칸이 모든 판에서 저절로 표시됩니다.
//                    판 오른쪽은 **판에 놓인 낱말**(ㄱ~ㅎ 알약 — 불리면 색이 바뀜, 선생님 요청).
//     선생님이 진행 — 그 목록에서 누르거나 '무작위로 부르기'(판에 놓인 안 부른 낱말에서만 —
//                    아무 판에도 없는 낱말을 부르면 수업만 늘어집니다).
//     학생이 진행   — 학번 차례대로 학생이 제 판의 낱말을 고릅니다(BingoStudent). 위에 부르는
//                    차례(지금 차례 · 결석), 결석한 학생의 차례는 선생님이 목록에서 대신
//                    고릅니다(한 번 — 고르면 차례가 다음 학생으로 넘어감).
//   왼쪽 순위 — 완성한 줄이 많은 차례 · 같으면 학번순, 0줄끼리는 가로 · 세로로 이어진 칸이
//               긴 차례(lib/bingo.js의 rankBingo — 선생님 요청).
// 실시간: 판 컬렉션 하나(bingoBoards)와 모둠 목록만 구독합니다(부른 낱말 · 차례는 활동 문서).
// =============================================================
import { useEffect, useMemo, useState } from "react";
import {
  subscribeBookGroups,
  subscribeBingoBoards,
  updateBingoState,
  refreshBingoWords,
  addSoloBookBoards,
} from "@/lib/store";
import {
  BINGO_DEFAULT_GOAL,
  BINGO_DEFAULT_SIZE,
  BINGO_GOALS,
  bingoBoardWords,
  bingoCall,
  bingoCellCount,
  bingoLeadPatch,
  bingoPicksBy,
  bingoProgress,
  bingoStartPatch,
  bingoTurnOrder,
  bingoTurnUid,
  bingoUndo,
  nextBingoCall,
  normalizeBingo,
  normalizeBingoCells,
  rankBingo,
  rankBingoFill,
} from "@/lib/bingo";
import { ROW_COLORS } from "@/lib/bookColors";
import BingoGrid from "./BingoGrid";
import ConfirmModal from "./ConfirmModal";
import { BOOK_LOCKED_TEACHER } from "./BookHeadParts";
import { IconLock } from "./StatusIcons";

const LEADS = [["teacher", "선생님이 진행"], ["student", "학생이 진행"]];

export default function BingoBoard({
  activity,
  onBack,
  onToast,
  user,
  roster = [],
  // 오늘 출석한 학생(Set) — 출석을 안 받은 날은 null(결석을 모름)
  presentUids = null,
  classPicker = null,
  classTools = null,
}) {
  const [groups, setGroups] = useState([]);
  const [rawBoards, setRawBoards] = useState([]);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  // 'start' | 'back' | 'reset' | { word, uid } — 학생 차례에 선생님이 대신 부르기
  const [confirm, setConfirm] = useState(null);

  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);
  useEffect(() => subscribeBingoBoards(activity.id, setRawBoards), [activity.id]);

  const solo = activity.groupMode === "solo";
  const bingo = useMemo(() => normalizeBingo(activity.bingo), [activity.bingo]);
  const size = bingo?.size ?? BINGO_DEFAULT_SIZE;
  const cellCount = bingoCellCount(size);
  const playing = bingo?.stage === "play";
  const studentLead = bingo?.lead === "student";
  const called = useMemo(() => bingo?.called ?? [], [bingo]);
  const goal = bingo?.goal ?? BINGO_DEFAULT_GOAL;
  const lastWord = called.at(-1) ?? "";
  const lastBy = bingo?.by.at(-1) ?? "";

  const liveGroups = useMemo(
    () => groups.filter((g) => !g.retired && (g.memberUids ?? []).length > 0)
      .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0)),
    [groups]
  );
  const studentCount = liveGroups.reduce((n, g) => n + g.memberUids.length, 0);
  // 학생 이름 · 학번 — 반 명단(지금 이름)이 먼저, 없으면 판의 members(만들 때 베낀 것)
  const people = useMemo(() => {
    const m = new Map();
    groups.forEach((g) => (g.members ?? []).forEach((x) => { if (x?.uid) m.set(x.uid, x); }));
    (roster ?? []).forEach((s) => { if (s?.uid) m.set(s.uid, { ...m.get(s.uid), ...s }); });
    return m;
  }, [groups, roster]);
  const nameOf = (uid) => people.get(uid)?.name || "학생";
  const labelOf = (g, i = 0) => (solo
    ? people.get(g?.memberUids?.[0])?.name || g?.groupName || "학생"
    : g?.groupName || `${g?.groupIndex ?? i + 1}모둠`);
  const colorOf = useMemo(() => {
    const m = new Map(liveGroups.map((g, i) => [g.id, ROW_COLORS[i % ROW_COLORS.length]]));
    return (gId) => m.get(gId) ?? ROW_COLORS[0];
  }, [liveGroups]);

  // 판마다 진행 — 판 문서가 아직 없으면 빈 판
  const cellsBy = useMemo(
    () => new Map(rawBoards.map((b) => [b.id, normalizeBingoCells(b.cells, size)])),
    [rawBoards, size]
  );
  const ranks = useMemo(() => {
    const rows = liveGroups.map((g, order) => {
      const p = solo ? people.get(g.memberUids[0]) : null;
      return {
        ...bingoProgress(cellsBy.get(g.id) ?? [], called, goal, size),
        groupId: g.id,
        group: g,
        order,
        // 같은 성적이면 학번순(모둠 판은 원래 차례)
        sortKey: p ? p.studentId || p.name || "" : "",
      };
    });
    return playing ? rankBingo(rows) : rankBingoFill(rows);
  }, [liveGroups, cellsBy, called, goal, size, playing, solo, people]);
  const pickedRow = ranks.find((r) => r.groupId === picked) ?? ranks[0] ?? null;
  const bingoCount = ranks.filter((r) => r.bingo).length;
  const fullCount = ranks.filter((r) => r.filled === cellCount).length;

  // 판에 놓인 낱말(ㄱ~ㅎ) — 빙고 중 부르기 목록은 이것뿐입니다(선생님 요청). 낱말 상자에
  // 있는 것만 남겨 부를 수 있는 낱말만 섭니다. 낱말마다 몇 판에 놓였는지도 함께.
  const boardWords = useMemo(
    () => bingoBoardWords(liveGroups.map((g) => cellsBy.get(g.id) ?? []), bingo?.words ?? []),
    [liveGroups, cellsBy, bingo]
  );
  const boardsWith = useMemo(() => new Map(boardWords.map((x) => [x.word, x.boards])), [boardWords]);
  const calledOrder = useMemo(() => new Map(called.map((w, i) => [w, i + 1])), [called]);
  const calledOnBoards = boardWords.filter((x) => calledOrder.has(x.word)).length;

  // 학생이 진행 — 지금 차례 · 결석(오늘 출석을 받았을 때만 앎)
  const order = bingo?.order ?? [];
  const turnUid = bingoTurnUid(bingo);
  const isAbsent = (uid) => !!presentUids && !presentUids.has(uid);
  const turnAbsent = !!turnUid && isAbsent(turnUid);
  const turnGroupId = turnUid ? liveGroups.find((g) => g.memberUids.includes(turnUid))?.id ?? null : null;
  const picks = useMemo(() => bingoPicksBy(bingo), [bingo]);

  // 개별 활동 — 만든 뒤 반에 들어온 학생에게는 판이 없습니다(닿소리와 같음).
  const haveUids = useMemo(() => new Set(groups.filter((g) => !g.retired).flatMap((g) => g.memberUids ?? [])), [groups]);
  const missing = solo ? (roster ?? []).filter((s) => s?.uid && !haveUids.has(s.uid)) : [];

  // 상태 고치기 — 저장된 상태를 읽어 고칩니다(학생이 같은 문서에 부름을 이어 쓰므로).
  //   돌려주는 값: 새 상태 · 고칠 것이 없었으면 null · 저장 실패면 undefined(안내를 띄움)
  async function change(fn, msg) {
    setBusy(true);
    try {
      const next = await updateBingoState(activity.id, fn);
      if (next && msg) onToast?.(msg);
      return next;
    } catch (e) {
      console.warn("[빙고] 저장하지 못했어요:", e?.code, e?.message);
      setNote("저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  // 낱말 부르기 — 학생이 진행이면 지금 차례 학생(expect)의 몫으로 적고 차례를 넘깁니다.
  // 누르는 사이 그 학생이 스스로 골라 차례가 넘어갔으면 부르지 않습니다(다음 학생 몫이 됨).
  async function callWord(word, expect = null) {
    if (!playing || !word || calledOrder.has(word) || busy) return;
    setNote("");
    const next = await change((cur) => bingoCall(cur, word, expect));
    if (next === null) setNote("그사이 차례가 넘어갔거나 이미 불린 낱말이에요. 다시 골라 주세요.");
  }
  // 판에 놓인 낱말 알약 — 선생님이 진행이면 곧바로 부르고, 학생이 진행이면 지금 차례 학생
  // 대신 부릅니다. 결석이면 곧바로, 아니면 한 번 되묻습니다(그 학생이 고르는 중일 수 있음).
  function pickPill(word) {
    if (!playing || busy || calledOrder.has(word)) return;
    if (!studentLead || !turnUid) { callWord(word); return; }
    if (turnAbsent) { callWord(word, turnUid); return; }
    setConfirm({ word, uid: turnUid });
  }
  // 무작위로 부르기 — 판에 놓인 안 부른 낱말에서만. 학생이 진행이면 지금 차례 학생 대신 —
  // 그 학생의 판에 남은 낱말이 있으면 거기서(제 판에서 고르는 셈), 없으면 판에 놓인 낱말 전체에서.
  function callRandom() {
    const proxy = studentLead && turnUid;
    const own = proxy ? nextBingoCall(bingoBoardWords([cellsBy.get(turnGroupId) ?? []], bingo?.words ?? []), called) : null;
    const w = own ?? nextBingoCall(boardWords, called);
    if (!w) { setNote("판에 놓인 낱말을 모두 불렀어요."); return; }
    callWord(w, proxy ? turnUid : null);
  }
  function undoCall() {
    if (!called.length) return;
    setNote("");
    change((cur) => bingoUndo(cur), `‘${lastWord}’ 부르기를 되돌렸어요.`);
  }
  function start() {
    setConfirm(null);
    setNote("");
    change(
      () => bingoStartPatch(bingoTurnOrder(liveGroups, roster)),
      studentLead
        ? "빙고를 시작했어요. 학번 차례대로 학생이 제 판의 낱말을 불러요."
        : "빙고를 시작했어요. 이제 판은 고칠 수 없어요."
    );
  }
  function backToFill() {
    setConfirm(null);
    setNote("");
    change(() => ({ stage: "fill", called: [], by: [], order: [], turn: 0 }), "판 채우기로 돌아갔어요.");
  }
  function resetCalls() {
    setConfirm(null);
    setNote("");
    change(() => ({ called: [], by: [], turn: 0 }), "부른 낱말을 모두 지웠어요. 같은 판으로 다시 시작해요.");
  }
  // 누가 부를지 — 판 채우기 동안에도, 빙고 중에도 바꿉니다(학생이 진행으로 바꾸면 차례를 새로 짜되
  // 지금 차례였던 학생부터 이어 감).
  function setLead(lead) {
    if (!bingo || bingo.lead === lead || busy) return;
    setNote("");
    change(
      (cur) => bingoLeadPatch(cur, lead, bingoTurnOrder(liveGroups, roster)),
      lead === "student" ? "학생이 진행으로 바꿨어요 — 학번 차례대로 학생이 낱말을 불러요." : "선생님이 진행으로 바꿨어요."
    );
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
  const turnNo = turnUid ? bingo.turn + 1 : 0;

  // 안내 한 줄 — 단추 왼쪽
  let guide;
  if (note) guide = note;
  else if (!bingo) guide = "낱말 상자가 비어 있어요. ‘낱말 새로 가져오기’를 눌러 닿소리 채우기의 낱말을 들여오세요.";
  else if (!playing) {
    guide = `${solo ? "학생" : "모둠"}마다 낱말 상자에서 ${cellCount}칸을 골라 채워요(다 채움 ${fullCount} / ${ranks.length}). 다 채웠으면 ‘빙고 시작’을 누르세요 — 시작하면 판은 굳어요.`;
  } else if (studentLead && turnUid) {
    guide = turnAbsent
      ? `지금 차례: ${turnNo}번째 ${nameOf(turnUid)} — 오늘 결석이에요. 오른쪽 목록에서 낱말을 눌러 대신 골라 주세요(‘무작위로 대신 고르기’는 그 학생의 판에서 골라요).`
      : `지금 차례: ${turnNo}번째 ${nameOf(turnUid)} — 학생이 제 판에서 낱말을 고르면 모든 판에 곧바로 표시돼요. 결석이면 오른쪽 목록에서 대신 골라 주세요.`;
  } else if (studentLead) {
    guide = "부르는 차례에 든 학생이 없어요(판에 든 학생이 있어야 차례가 생겨요). 그동안은 오른쪽 목록에서 선생님이 불러요.";
  } else {
    guide = `낱말 ${called.length}개를 불렀어요. 오른쪽 목록에서 누르거나 ‘무작위로 부르기’로 부르면 모든 판에 곧바로 표시돼요.`;
  }

  return (
    <main className="canvas-main dash-root xw-main bingo-main">
      <div className="canvas-head">
        <strong className="canvas-head-name">{activity.title}</strong>
        <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
        {classPicker}
        {classTools}
        <span className="canvas-head-stats">
          {activity.sourceTitle ? `낱말: ${activity.sourceTitle} · ` : ""}
          {solo ? "개별 활동" : `모둠 ${liveGroups.length}개`} · {size}×{size} · 학생 {studentCount}명 · 낱말 {words.length}개
        </span>
        <span className={`xw-badge xwg-stage${playing ? " done" : ""}`}>
          {playing ? `빙고 중 · ${goal}줄 빙고` : "판 채우는 중"}
          {bingo ? ` · ${studentLead ? "학생이 진행" : "선생님이 진행"}` : ""}
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
                  const myTurn = playing && p.groupId === turnGroupId;
                  return (
                    <li key={p.groupId}>
                      <button
                        type="button"
                        className={`xwg-rank${on ? " on" : ""}`}
                        style={{ "--xwg-c": color.border, "--xwg-bg": color.bg }}
                        onClick={() => setPicked(p.groupId)}
                        aria-pressed={on}
                        title={playing ? `${p.count}줄 · 불린 칸 ${p.marked.size}개 · 가로 · 세로로 이어진 칸 ${p.run}개` : `채운 칸 ${p.filled} / ${cellCount}`}
                      >
                        <span className="xwg-rank-head">
                          <b className="xwg-rank-no">{rank + 1}</b>
                          <strong>{labelOf(p.group, p.order)}</strong>
                          {myTurn && (
                            <span className="bingo-rank-turn">{solo ? "차례" : `차례 · ${nameOf(turnUid)}`}</span>
                          )}
                          <span className={`xw-badge${playing ? (p.bingo ? " done" : "") : p.filled === cellCount ? " done" : ""}`}>
                            {playing ? (p.bingo ? `빙고! ${p.count}줄` : `${p.count}줄`) : `${p.filled} / ${cellCount}칸`}
                          </span>
                        </span>
                        <BingoGrid size={size} cells={p.cells} marked={p.marked} lineCells={p.lineCells} mini tint={color} />
                        {playing && p.bingoAt ? (
                          <span className="bingo-rank-at">{p.bingoAt}번째 낱말에서 빙고</span>
                        ) : playing && p.count === 0 && p.run > 1 ? (
                          <span className="bingo-rank-at bingo-rank-run">가로 · 세로로 {p.run}칸 이어짐</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="xw-card-note xwg-legend">
              {playing
                ? <><span className="bingo-swatch marked" /> 불린 칸 <span className="bingo-swatch line" /> 빙고 줄 — 완성한 줄이 많은 차례, 같으면 {solo ? "학번순" : "모둠 차례"}(0줄끼리는 가로 · 세로로 이어진 칸이 긴 차례)</>
                : <><span className="bingo-swatch filled" /> 채운 칸 — 많이 채운 차례, 같으면 {solo ? "학번순" : "모둠 차례"}</>}
            </p>
          </section>
        </aside>

        <div className="xwg-center xwg-center--teacher">
          <section className="xw-card">
            <header className="xw-card-head">
              <h3>{pickedRow ? `${labelOf(pickedRow.group, pickedRow.order)}의 빙고판` : "빙고판"}</h3>
              {pickedRow && (
                <span className={`xw-badge${playing && pickedRow.bingo ? " done" : ""}`}>
                  {playing ? `${pickedRow.count}줄 · 불린 칸 ${pickedRow.marked.size}개` : `${pickedRow.filled} / ${cellCount}칸`}
                </span>
              )}
            </header>

            {/* 안내가 앞, 단추가 그 오른쪽(가로세로와 같은 줄) — 크기는 하나, 색으로만 가릅니다 */}
            <div className="xw-gen-row">
              <div className="xw-gen-inner">
                <span className={`xw-gen-note${playing && turnAbsent && !note ? " bingo-note-away" : ""}`}>{guide}</span>
                <div className="xw-gen-btns">
                  {playing ? (
                    <>
                      <button
                        type="button"
                        className="xw-gen-btn xw-gen-btn--make"
                        onClick={callRandom}
                        disabled={busy || calledOnBoards >= boardWords.length}
                        title={studentLead && turnUid ? `${nameOf(turnUid)} 대신 — 그 학생의 판에 남은 낱말에서 무작위로` : "판에 놓인 안 부른 낱말에서 무작위로"}
                      >
                        {studentLead && turnUid ? "무작위로 대신 고르기" : "무작위로 부르기"}
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

            {/* 목표 줄 수 · 누가 부를지 — 진행 중에도 바꿀 수 있습니다(순위는 곧바로 다시 셈) */}
            {bingo && (
              <div className="bingo-goal">
                <div className="bingo-opt">
                  <span className="bingo-goal-label">빙고 목표</span>
                  <div className="book-seg bingo-goal-seg" role="group" aria-label="빙고 목표 줄 수">
                    {BINGO_GOALS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`book-seg-btn${goal === n ? " active" : ""}`}
                        aria-pressed={goal === n}
                        disabled={busy}
                        onClick={() => goal !== n && change(() => ({ goal: n }), `${n}줄 빙고로 바꿨어요.`)}
                      >
                        {n}줄
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bingo-opt">
                  <span className="bingo-goal-label">낱말 부르기</span>
                  <div className="book-seg bingo-lead-seg" role="group" aria-label="낱말 부르기">
                    {LEADS.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`book-seg-btn${bingo.lead === value ? " active" : ""}`}
                        aria-pressed={bingo.lead === value}
                        disabled={busy}
                        onClick={() => setLead(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
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
                {lastWord
                  ? <>방금 부른 낱말 <strong>{lastWord}</strong> <em>{called.length}번째{lastBy ? ` · ${nameOf(lastBy)} 차례` : ""}</em></>
                  : studentLead && turnUid
                    ? `아직 부른 낱말이 없어요 — ${nameOf(turnUid)}부터 학번 차례대로 불러요.`
                    : "아직 부른 낱말이 없어요."}
              </p>
            )}

            {/* 학생이 진행 — 부르는 차례(학번순). 지금 차례는 살구, 이번 바퀴에 고른 학생은 옅게,
                결석(오늘 출석 기록이 없음)은 점선 */}
            {playing && studentLead && order.length > 0 && (
              <div className="bingo-turns-box">
                <p className="bingo-turns-head">
                  <strong>부르는 차례</strong>
                  <span>{turnNo} / {order.length}번째 · 학번순 — 마지막 번호 다음은 처음부터</span>
                  {presentUids == null && <em>오늘 출석을 받으면 결석한 학생이 표시돼요</em>}
                </p>
                <ol className="bingo-turns">
                  {order.map((uid, i) => {
                    const now = i === bingo.turn;
                    const away = isAbsent(uid);
                    const pick = picks.get(uid);
                    return (
                      <li
                        key={uid}
                        className={`bingo-turn${now ? " now" : ""}${i < bingo.turn ? " done" : ""}${away ? " away" : ""}`}
                        title={pick ? `${pick.n}번째로 ‘${pick.word}’을(를) 골랐어요` : "아직 고른 낱말이 없어요"}
                        aria-current={now ? "step" : undefined}
                      >
                        <b>{i + 1}</b>
                        <span>{nameOf(uid)}</span>
                        {away && <em>결석</em>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {playing ? (
              /* 빙고 중 — 판 왼쪽, 판에 놓인 낱말(ㄱ~ㅎ 알약) 오른쪽(선생님 요청). 좁으면 위아래로 */
              <div className="bingo-stage">
                <div className="bingo-stage-board">
                  {pickedRow ? (
                    <BingoGrid
                      size={size}
                      cells={pickedRow.cells}
                      marked={pickedRow.marked}
                      lineCells={pickedRow.lineCells}
                      lastWord={lastWord}
                    />
                  ) : (
                    <p className="xw-empty">왼쪽에 판이 생기면 눌러서 크게 볼 수 있어요.</p>
                  )}
                </div>
                <section className={`bingo-callbox${studentLead && turnAbsent ? " proxy" : ""}`} aria-label="판에 놓인 낱말">
                  <header className="bingo-callbox-head">
                    <h4>판에 놓인 낱말</h4>
                    <span className="xw-badge">부름 {calledOnBoards} / {boardWords.length}</span>
                  </header>
                  <p className="xw-card-note">
                    {studentLead
                      ? turnUid
                        ? `학생이 고르면 그 낱말의 색이 바뀌어요. 누르면 ${nameOf(turnUid)} 대신 불러요 — 결석한 학생의 차례에만 쓰세요.`
                        : "학생이 고른 낱말의 색이 바뀌어요. 누르면 선생님이 불러요."
                      : "ㄱ~ㅎ 차례예요. 누르면 부릅니다."}
                    {" "}작은 숫자는 그 낱말이 놓인 판 수, 동그라미는 부른 차례예요.
                  </p>
                  {boardWords.length === 0 ? (
                    <p className="xw-empty">아직 판에 놓인 낱말이 없어요.</p>
                  ) : (
                    <div className="bingo-chips bingo-chips--call">
                      {boardWords.map(({ word, boards }) => {
                        const n = calledOrder.get(word);
                        const who = n ? bingo.by[n - 1] : "";
                        return (
                          <button
                            key={word}
                            type="button"
                            className={`bingo-chip${n ? " called" : ""}${word === lastWord ? " last" : ""}`}
                            onClick={() => pickPill(word)}
                            disabled={!!n || busy}
                            title={n
                              ? `${n}번째로 불렀어요${who ? ` · ${nameOf(who)} 차례` : ""}`
                              : studentLead && turnUid ? `${nameOf(turnUid)} 대신 부르기` : "눌러서 부르기"}
                          >
                            {n && <b className="bingo-chip-no">{n}</b>}
                            {word}
                            <em className="bingo-chip-count">{boards}</em>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p className="xw-card-note xwg-legend">
                    <span className="bingo-swatch called" /> 부른 낱말 <span className="bingo-swatch just" /> 방금 부른 낱말
                  </p>
                </section>
              </div>
            ) : pickedRow ? (
              <BingoGrid size={size} cells={pickedRow.cells} marked={pickedRow.marked} lineCells={pickedRow.lineCells} />
            ) : (
              <p className="xw-empty">왼쪽에 판이 생기면 눌러서 크게 볼 수 있어요.</p>
            )}
          </section>

          {/* 낱말 상자 — 판 채우기 동안 보기만(학생이 고르는 낱말). 빙고 중에는 판에 놓인 낱말만
              부르므로 상자 전체는 접어 둡니다(아무 판에도 없는 낱말을 부르지 않게 — 선생님 요청). */}
          {!playing && (
            <section className="xw-card">
              <header className="xw-card-head">
                <h3>낱말 상자</h3>
                <span className="xw-badge">낱말 {words.length}개</span>
              </header>
              <p className="xw-card-note">학생이 판을 채울 때 고르는 낱말이에요. 숫자는 지금 그 낱말을 놓은 판 수예요.</p>
              {words.length === 0 ? (
                <p className="xw-empty">낱말이 없어요. 닿소리 채우기에 낱말이 모이면 ‘낱말 새로 가져오기’를 눌러 주세요.</p>
              ) : (
                <div className="bingo-chips">
                  {words.map((w) => (
                    <span key={w} className="bingo-chip bingo-chip--view">
                      {w}
                      <em className="bingo-chip-count">{boardsWith.get(w) ?? 0}</em>
                    </span>
                  ))}
                </div>
              )}
              {words.length > 0 && words.length < cellCount && (
                <p className="xw-card-note">낱말이 {cellCount}개보다 적어 판을 다 채울 수 없어요 — 빈칸은 표시되지 않아요.</p>
              )}
            </section>
          )}
        </div>
      </div>

      {confirm === "start" && (
        <ConfirmModal
          icon={<span aria-hidden="true">🎯</span>}
          title="빙고를 시작할까요?"
          description={`아직 ${cellCount}칸을 다 채우지 못한 ${solo ? `학생이 ${ranks.length - fullCount}명` : `모둠이 ${ranks.length - fullCount}개`} 있어요. 시작하면 판을 더 고칠 수 없고, 빈칸은 표시되지 않아요.`}
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
          description={studentLead ? "판은 그대로 두고, 부른 낱말만 지워 첫 번호부터 다시 불러요." : "판은 그대로 두고, 부른 낱말만 지워 처음부터 다시 불러요."}
          confirmLabel="모두 지우기"
          danger
          onConfirm={resetCalls}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.word && (
        <ConfirmModal
          icon={<span aria-hidden="true">🎯</span>}
          title={`${nameOf(confirm.uid)} 대신 부를까요?`}
          description={`지금은 ${nameOf(confirm.uid)}의 차례예요. 선생님이 ‘${confirm.word}’을(를) 대신 부르면 차례가 다음 학생으로 넘어가요. 결석한 학생의 차례에만 대신 골라 주세요.`}
          confirmLabel="대신 부르기"
          onConfirm={() => {
            const c = confirm;
            setConfirm(null);
            callWord(c.word, c.uid);
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </main>
  );
}
