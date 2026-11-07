"use client";

// =============================================================
// 낱말 빙고 — 학생 화면 (독서 활동 '낱말 빙고', type: 'bingo')
// 가로세로 낱말 퀴즈의 학생 화면(CrosswordGroupStudent)과 같은 세 칸입니다.
//   왼쪽  — 나의(우리 모둠) 빙고 한눈에(미니맵 · 진행 막대) · 빙고 중에는 가장 앞선
//           친구(모둠)의 판
//   가운데 — 나의(우리 모둠) 빙고판. 판 채우기 단계에는 오른쪽 낱말을 누르고 넣을 칸을
//           눌러 채웁니다(칸을 먼저 골라도 됨 · 모둠은 모둠원이 함께 — 칸 하나씩 저장해
//           서로 안 덮음).
//           빙고 중에는 굳고, 선생님이 부른 낱말이 저절로 표시됩니다.
//   오른쪽 — 판 채우기: 낱말 상자 · 빙고 중: 불린 낱말(최근 것이 위)
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeBookGroups, subscribeBingoBoards, writeBingoCells } from "@/lib/store";
import {
  BINGO_CELLS,
  BINGO_LINE_COUNT,
  bingoProgress,
  bingoRandomFill,
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

export default function BingoStudent({ activity, groupId, onBack }) {
  const solo = activity.groupMode === "solo";
  const OUR = solo ? "나의" : "우리 모둠";
  const [groups, setGroups] = useState([]);
  const [rawBoards, setRawBoards] = useState([]);
  const [sel, setSel] = useState(null);
  // 먼저 고른 낱말 — 그다음 누른 칸에 들어갑니다(선생님 요청: 낱말 → 칸 차례)
  const [pick, setPick] = useState("");
  const [note, setNote] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);
  useEffect(() => subscribeBingoBoards(activity.id, setRawBoards), [activity.id]);

  const bingo = useMemo(() => normalizeBingo(activity.bingo), [activity.bingo]);
  const playing = bingo?.stage === "play";
  const called = useMemo(() => bingo?.called ?? [], [bingo]);
  const goal = bingo?.goal ?? 3;
  const lastWord = called.at(-1) ?? "";
  const locked = !!activity.locked;
  const canEdit = !!bingo && !playing && !locked;

  const myGroup = groups.find((g) => g.id === groupId) ?? null;
  const cellsBy = useMemo(() => new Map(rawBoards.map((b) => [b.id, normalizeBingoCells(b.cells)])), [rawBoards]);
  const cells = cellsBy.get(groupId) ?? Array(BINGO_CELLS).fill("");
  const mine = useMemo(() => bingoProgress(cells, called, goal), [cells, called, goal]);
  const used = useMemo(() => bingoUsedWords(cells), [cells]);

  // 가장 앞선 친구(모둠) — 나를 뺀 판 가운데 1위(교사 화면과 같은 순위)
  const leader = useMemo(() => {
    if (!playing) return null;
    const rows = groups
      .filter((g) => g.id !== groupId && !g.retired && (g.memberUids ?? []).length > 0)
      .map((g, order) => ({ ...bingoProgress(cellsBy.get(g.id) ?? [], called, goal), group: g, order }));
    const top = rankBingo(rows)[0];
    if (!top || (top.marked.size === 0 && top.filled === 0)) return null;
    return { ...top, name: solo ? top.group.members?.[0]?.name || top.group.groupName || "친구" : top.group.groupName || "모둠" };
  }, [playing, groups, groupId, cellsBy, called, goal, solo]);
  const bingoFriends = useMemo(() => {
    if (!playing) return 0;
    return groups.filter((g) => g.id !== groupId && !g.retired && (g.memberUids ?? []).length > 0)
      .filter((g) => bingoProgress(cellsBy.get(g.id) ?? [], called, goal).bingo).length;
  }, [playing, groups, groupId, cellsBy, called, goal]);

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
    const set = bingoRandomFill(cells, bingo.words);
    if (!Object.keys(set).length) { setNote(mine.filled === BINGO_CELLS ? "이미 다 채웠어요." : "넣을 낱말이 더 없어요."); return; }
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

  const fillPct = (mine.filled / BINGO_CELLS) * 100;
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
              <span className={`xw-badge${(playing ? mine.bingo : mine.filled === BINGO_CELLS) ? " done" : ""}`}>
                {playing ? `${mine.count} / ${goal}줄` : `${mine.filled} / ${BINGO_CELLS}칸`}
              </span>
            </header>
            <BingoGrid cells={cells} marked={mine.marked} lineCells={mine.lineCells} sel={sel} mini tint={MAP_TINT} />
            <div className="xwg-bar" aria-hidden="true">
              <span style={{ width: `${playing ? linePct : fillPct}%` }} />
            </div>
            <p className="xw-card-note">
              {playing
                ? mine.bingo
                  ? `🎉 빙고! ${mine.count}줄을 완성했어요${mine.bingoAt ? ` (${mine.bingoAt}번째 낱말에서)` : ""}.`
                  : `불린 칸 ${mine.marked.size}개 · ${goal}줄을 먼저 완성하면 빙고예요(가로 · 세로 · 대각선 ${BINGO_LINE_COUNT}줄).`
                : mine.filled === BINGO_CELLS
                  ? "다 채웠어요! 선생님이 ‘빙고 시작’을 누를 때까지 칸을 바꿀 수 있어요."
                  : `빈칸 ${BINGO_CELLS - mine.filled}개 — 오른쪽 낱말 상자에서 골라 채워요.`}
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
                    <strong>{leader.name}</strong> · 불린 칸 {leader.marked.size}개
                    {(mine.bingoAt ?? Infinity) < (leader.bingoAt ?? Infinity) || (!leader.bingo && mine.count > leader.count)
                      ? <span className="xwg-leader-me"> · 지금은 {solo ? "내가" : "우리가"} 앞서요!</span>
                      : null}
                  </p>
                  <BingoGrid cells={leader.cells} marked={leader.marked} lineCells={leader.lineCells} mini tint={MAP_TINT} />
                  <p className="xw-card-note">빙고한 {solo ? "친구" : "모둠"} {bingoFriends}{solo ? "명" : "개"} — 먼저 빙고한 차례, 그다음 줄 수로 정해요.</p>
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
                <li>선생님이 ‘빙고 시작’을 누르면 판이 굳고, 부르는 낱말이 저절로 표시돼요.</li>
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
                  ? <>방금 불린 낱말 <strong>{lastWord}</strong> <em>{called.length}번째</em></>
                  : "선생님이 낱말을 부르기를 기다려요."}
            </p>
          )}
          {/* 칸 버튼이 포커스를 가지므로 Delete · Backspace를 여기서 받습니다 */}
          <div className={`bingo-board-wrap${pick ? " picking" : ""}`} onKeyDown={onBoardKey}>
            <BingoGrid
              cells={cells}
              marked={mine.marked}
              lineCells={mine.lineCells}
              lastWord={playing ? lastWord : ""}
              sel={canEdit ? sel : null}
              onCellClick={canEdit ? pickCell : null}
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
                <button type="button" className="xw-gen-btn xw-gen-btn--step" onClick={fillRandom} disabled={mine.filled === BINGO_CELLS}>
                  빈칸 무작위로 채우기
                </button>
                <button type="button" className="xw-gen-btn xw-gen-btn--off" onClick={() => setConfirmClear(true)} disabled={mine.filled === 0}>
                  판 모두 비우기
                </button>
              </div>
              </div>
            </div>
          )}
          {note && <p className="xw-pick-warn">{note}</p>}
          <p className="xw-card-note xwg-legend">
            {playing
              ? <><span className="bingo-swatch marked" /> 불린 칸 <span className="bingo-swatch line" /> 빙고 줄 <span className="bingo-swatch last" /> 방금 불린 낱말</>
              : <><span className="bingo-swatch filled" /> 채운 칸 <span className="bingo-swatch sel" /> 고른 칸</>}
          </p>
        </section>

        {/* 오른쪽 — 낱말 상자 / 불린 낱말 */}
        <aside className="xwg-side xwg-right">
          {playing ? (
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
              {bingo.words.length > 0 && bingo.words.length < BINGO_CELLS && (
                <p className="xw-card-note">낱말이 {BINGO_CELLS}개보다 적어 판을 다 채울 수 없어요 — 빈칸은 표시되지 않아요.</p>
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
