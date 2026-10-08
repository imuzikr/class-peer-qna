"use client";

// =============================================================
// 가로세로 낱말퀴즈 — 모둠 활동의 교사 화면 (닿소리 '전체 보기'의 '가로세로')
// -------------------------------------------------------------
// 세 단계를 한 화면에서 넘깁니다(활동 문서의 crossword.stage).
//   준비     — '가로세로 낱말 퀴즈 생성': 이 활동의 낱말 **전부**로 참여 학생
//              수만큼 이어 판을 짜고, 모둠마다 구성원 수만큼 무작위로 나눠 줍니다.
//   힌트 쓰기 — 왼쪽: 학생마다 제출/미제출(한 사람이 낱말 하나를 맡음).
//              가운데: 정답이 보이는 판. 오른쪽: 모둠별 낱말 · 힌트(누가 썼나).
//              '낱말 채우기'를 누르면 힌트가 판의 문제로 들어갑니다.
//   낱말 채우기 — 왼쪽: 모둠별 미니맵(맞힌 낱말이 모둠 색으로 칠해짐)을 맞힌
//              순서대로. 누르면 가운데에 그 모둠의 판이 크게 섭니다.
// 낱말 힌트는 늘 오른쪽 패널입니다 — 학생 화면의 힌트 목록과 같은 자리(선생님 요청).
//
// **개별 활동**(판 하나가 한 사람)도 이 화면입니다(`solo`). 만들 때 학생마다
// 낱말 하나를 주고 쓸 사람을 미리 정해 둡니다. 낱말 채우기의 순위는 학생들이
// 적는 판 요약(xwProgress)으로 셉니다 — 맞힌 낱말 수, 같으면 글자 수(채운 칸 +
// 쓴 힌트). 학생 화면의 '가장 많이 채운 친구'와 같은 기준이고, 판(정답 글자)은
// 가운데에 크게 볼 학생 하나만 구독합니다(학생마다 판 리스너를 걸지 않게).
//
// 실시간: 모둠마다 힌트(컬렉션)와 판(문서 하나)을 구독합니다 — 모둠이 여섯이면
// 리스너 열두 개이고, 학생이 낱말을 넣을 때마다 그 판 문서 한 건이 옵니다.
// 낱말(words)은 구독하지 않고 '생성'을 누를 때 한 번만 읽습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import {
  subscribeBookGroups,
  subscribeXwHints,
  subscribeXwBoard,
  fetchActivityWords,
  createGroupCrossword,
  clearGroupCrossword,
  updateBookActivity,
  subscribeXwProgress,
} from "@/lib/store";
import {
  buildGroupCrossword,
  crosswordWordPool,
  normalizeGroupCrossword,
  normalizeXwHint,
  xwHintDone,
  fixedLettersOf,
  groupSolveProgress,
  rankGroupProgress,
  entryLen,
  normalizeXwProgress,
  rankSoloProgress,
  soloScoreLetters,
  summaryMinimap,
} from "@/lib/crossword";
import { ROW_COLORS } from "@/lib/bookColors";
import CrosswordGrid from "./CrosswordGrid";
import ConfirmModal from "./ConfirmModal";
import DashViewTabs from "./DashViewTabs";

const DIR_LABEL = { across: "가로", down: "세로" };

// 모둠마다 힌트·판 구독 — 목록이 바뀔 때만 다시 겁니다. 판은 boardIds만
// (개별 활동은 가운데에 크게 볼 학생 하나뿐 — 순위는 판 요약으로 셉니다).
function useGroupXw(actId, groupIds, boardIds) {
  const [hintsBy, setHintsBy] = useState({});
  const [boardsBy, setBoardsBy] = useState({});
  const key = groupIds.join(",");
  const boardKey = boardIds.join(",");
  useEffect(() => {
    const offs = groupIds.map((gId) =>
      subscribeXwHints(actId, gId, (list) => setHintsBy((m) => ({ ...m, [gId]: list }))));
    return () => offs.forEach((off) => off());
    // 목록 내용은 key가 대신 봅니다(렌더마다 새 배열이라 그대로 걸면 끊임없이 다시 겁니다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actId, key]);
  useEffect(() => {
    const offs = boardIds.map((gId) =>
      subscribeXwBoard(actId, gId, (cells) => setBoardsBy((m) => ({ ...m, [gId]: cells }))));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actId, boardKey]);
  return { hintsBy, boardsBy };
}

export default function CrosswordGroupBoard({ activity, onBack, onPickView, onToast, classTools = null }) {
  const [groups, setGroups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(null); // 'regen' | 'clear' | 'solve'
  const [picked, setPicked] = useState(null); // 낱말 채우기 — 가운데에 크게 볼 모둠

  const solo = activity.groupMode === "solo";
  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);
  const liveGroups = useMemo(() => groups.filter((g) => (g.memberUids ?? []).length > 0), [groups]);
  const groupIds = useMemo(() => liveGroups.map((g) => g.id), [liveGroups]);

  const puzzle = useMemo(() => normalizeGroupCrossword(activity.crossword), [activity.crossword]);
  const stage = puzzle?.stage ?? null;
  const studentCount = liveGroups.reduce((n, g) => n + g.memberUids.length, 0);

  // 개별 활동 — 학생들의 판 요약(순위 · 미니맵)
  const [rawProgress, setRawProgress] = useState([]);
  useEffect(() => {
    if (!solo) return undefined;
    return subscribeXwProgress(activity.id, setRawProgress);
  }, [solo, activity.id]);
  const soloRanks = useMemo(() => {
    if (!solo || !puzzle) return [];
    const byId = new Map(rawProgress.map((x) => [x.id, normalizeXwProgress(x, x.id)]));
    return rankSoloProgress(liveGroups.map((g, order) => {
      const s = byId.get(g.id) ?? normalizeXwProgress({ groupId: g.id }, g.id);
      return { ...s, groupId: g.id, group: g, order, map: summaryMinimap(puzzle, { ...s, groupId: g.id }) };
    }));
  }, [solo, puzzle, rawProgress, liveGroups]);
  const soloPickedId = solo && stage === "solve"
    ? (soloRanks.find((x) => x.groupId === picked) ?? soloRanks[0])?.groupId ?? null
    : null;
  const boardIds = useMemo(
    () => (solo ? (soloPickedId ? [soloPickedId] : []) : groupIds),
    [solo, soloPickedId, groupIds]
  );
  const { hintsBy, boardsBy } = useGroupXw(activity.id, groupIds, boardIds);
  // 개별 활동의 이름 — 판 이름이 곧 학생 이름이지만, 구성원 이름표가 먼저
  const soloName = (g) => g?.members?.[0]?.name || g?.groupName || "학생";
  const groupLabel = (g, i) => (solo ? soloName(g) : g.groupName || `${g.groupIndex ?? i + 1}모둠`);

  const colorOf = useMemo(() => {
    const m = new Map(groups.map((g, i) => [g.id, ROW_COLORS[i % ROW_COLORS.length]]));
    return (gId) => m.get(gId) ?? ROW_COLORS[0];
  }, [groups]);

  // 이 퍼즐의 힌트(모둠별) — 지난 퍼즐의 것이 한 박자 늦게 남아도 칸이 맞는 것만
  const hintsOf = useMemo(() => {
    const out = {};
    if (!puzzle) return out;
    for (const gId of groupIds) {
      out[gId] = (hintsBy[gId] ?? [])
        .map((h) => normalizeXwHint(h, h.id))
        .filter((h) => {
          const e = puzzle.entries[h.idx];
          return e && e.groupId === gId && entryLen(e) === h.word.length;
        });
    }
    return out;
  }, [puzzle, groupIds, hintsBy]);
  const allHints = useMemo(() => Object.values(hintsOf).flat(), [hintsOf]);
  const hintByIdx = useMemo(() => new Map(allHints.map((h) => [h.idx, h])), [allHints]);

  // 정답 판 — 모든 낱말을 칸에
  const answerLetters = useMemo(() => fixedLettersOf(puzzle, allHints), [puzzle, allHints]);

  // ── 힌트 제출 — 학생 한 명이 낱말 하나 ──
  const nameOf = (g, uid) => (g.members ?? []).find((m) => m.uid === uid)?.name || "이름 미설정";
  const studentRows = useMemo(() => liveGroups.map((g) => ({
    group: g,
    rows: g.memberUids.map((uid) => {
      const list = hintsOf[g.id] ?? [];
      const mine = list.filter((h) => h.writerUid === uid);
      const done = mine.some(xwHintDone);
      // 모둠 낱말이 구성원보다 적으면(판에 다 못 놓인 경우) 쓸 사람이 다 정해진
      // 뒤 남는 학생은 '맡은 낱말 없음' — 미제출로 남기면 영영 안 꺼집니다.
      const allTaken = list.length > 0 && list.every((h) => h.writerUid);
      return {
        uid,
        name: nameOf(g, uid),
        words: mine.map((h) => h.word),
        state: done ? "done" : mine.length ? "doing" : allTaken || !list.length ? "free" : "none",
      };
    }),
    unassigned: (hintsOf[g.id] ?? []).filter((h) => !h.writerUid).length,
  })), [liveGroups, hintsOf]);
  const submitted = studentRows.reduce((n, x) => n + x.rows.filter((r) => r.state === "done").length, 0);
  const hintsDone = allHints.filter(xwHintDone).length;
  // 힌트를 낼 학생 수 — 낱말 하나에 한 사람이라 낱말 수를 넘지 않습니다
  const writerSlots = Math.min(studentCount, puzzle?.entries.length ?? 0);

  // ── 풀이 현황 — 모둠별 ──
  const progressList = useMemo(() => {
    if (!puzzle || solo) return [];
    return rankGroupProgress(liveGroups.map((g, order) => {
      const fixed = fixedLettersOf(puzzle, hintsOf[g.id]);
      const p = groupSolveProgress(puzzle, g.id, boardsBy[g.id] ?? {}, fixed);
      return { groupId: g.id, group: g, order, fixed, ...p, solved: p.solved.size, solvedSet: p.solved };
    }));
  }, [puzzle, solo, liveGroups, hintsOf, boardsBy]);

  const pickedRow = solo
    ? (() => {
        const r = soloRanks.find((x) => x.groupId === soloPickedId);
        if (!r) return null;
        // 가운데 큰 판은 진짜 판(글자)으로 — 열쇠 칸은 그 학생의 낱말
        const fixed = fixedLettersOf(puzzle, hintsOf[r.groupId]);
        const p = groupSolveProgress(puzzle, r.groupId, boardsBy[r.groupId] ?? {}, fixed);
        return { ...r, fixed, solvedKeys: p.solvedKeys, solvedSet: p.solved, solved: p.solved.size, total: p.total };
      })()
    : progressList.find((x) => x.groupId === picked) ?? progressList[0] ?? null;

  // ── 동작 ──
  async function generate() {
    setConfirm(null);
    setBusy(true);
    setNote("");
    try {
      const words = await fetchActivityWords(activity.id, groupIds);
      const pool = crosswordWordPool(words);
      await new Promise((r) => setTimeout(r, 30)); // '만드는 중'을 먼저 그리게
      const salt = `${activity.id}:${Date.now().toString(36)}`;
      const built = buildGroupCrossword(
        pool,
        liveGroups.map((g) => ({ id: g.id, size: g.memberUids.length })),
        { salt }
      );
      if (!built) {
        setNote(`서로 이어지는 낱말이 모자라 퍼즐을 만들 수 없어요(쓸 수 있는 낱말 ${pool.length}개). 낱말이 더 모이면 다시 해 보세요.`);
        return;
      }
      // 개별 활동은 판의 주인이 곧 쓸 사람 — 미리 정해 두면 알약이 필요 없습니다
      const hints = solo
        ? built.hints.map((h) => {
            const g = liveGroups.find((x) => x.id === h.groupId);
            return { ...h, writerUid: g?.memberUids?.[0] ?? null, writerName: soloName(g) };
          })
        : built.hints;
      await createGroupCrossword(activity.id, { ...built.puzzle, createdAt: Date.now() }, hints);
      const n = built.puzzle.entries.length;
      const msg = n < built.target
        ? `낱말 ${n}개로 퀴즈를 만들었어요 — 이어지는 낱말이 모자라 학생 수(${built.target}명)보다 적어요. 낱말을 못 맡은 학생이 있어요.`
        : solo
          ? `낱말 ${n}개로 퀴즈를 만들고 학생마다 하나씩 나눠 주었어요(재료 ${pool.length}개).`
          : `낱말 ${n}개로 퀴즈를 만들고 모둠마다 나눠 주었어요(재료 ${pool.length}개).`;
      setNote(msg);
      onToast?.(msg);
      setPicked(null);
    } catch (e) {
      console.warn("[가로세로] 퀴즈를 만들지 못했어요:", e?.code, e?.message);
      setNote("퀴즈를 만들지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function clearPuzzle() {
    setConfirm(null);
    setBusy(true);
    try {
      await clearGroupCrossword(activity.id);
      setNote("");
      onToast?.("퀴즈를 내렸어요.");
    } catch (e) {
      console.warn("[가로세로] 퀴즈를 내리지 못했어요:", e?.code, e?.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStage(next) {
    setConfirm(null);
    const raw = activity.crossword;
    if (!raw) return;
    const entries = (raw.entries ?? []).map((e, i) => ({
      ...e,
      clue: next === "solve" ? String(hintByIdx.get(i)?.hint ?? "").trim() : e.clue ?? "",
    }));
    try {
      await updateBookActivity(activity.id, { crossword: { ...raw, stage: next, entries } });
      onToast?.(next === "solve" ? "낱말 채우기를 시작했어요." : "힌트 쓰기로 돌아갔어요.");
    } catch (e) {
      console.warn("[가로세로] 단계를 바꾸지 못했어요:", e?.code, e?.message);
      setNote("단계를 바꾸지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    }
  }

  const missingHints = puzzle ? puzzle.entries.length - hintsDone : 0;

  return (
    <main className="canvas-main dash-root xw-main">
      <div className="canvas-head">
        {/* 머리말은 '전체 보기'(ConsonantDashboard)와 같은 짜임입니다 — 제목 ·
            ← 모둠 · 보는 방법 알약. 알약의 '가로세로'가 켜져 있고, 앞의 셋을
            누르면 집계 화면 그 얼굴로 돌아갑니다. */}
        <strong className="canvas-head-name">{activity.topic || activity.title}</strong>
        <button type="button" className="btn-ghost" onClick={onBack}>← 모둠</button>
        {classTools}
        <div className="dash-head-actions">
          <DashViewTabs view="crossword" onPick={onPickView} />
        </div>
        <span className="canvas-head-stats">
          가로세로 · {solo ? "개별 활동" : `모둠 ${liveGroups.length}개`} · 학생 {studentCount}명
          {puzzle && ` · 낱말 ${puzzle.entries.length}개`}
        </span>
        <span className={`xw-badge xwg-stage${stage === "solve" ? " done" : ""}`}>
          {stage === "solve" ? "낱말 채우기 중" : stage === "hint" ? "힌트 쓰는 중" : "준비"}
        </span>
      </div>

      <div className="xwg xwg--teacher">
        {/* 왼쪽 — 힌트 제출 현황 / 모둠별 풀이 미니맵 */}
        <aside className="xwg-side xwg-left">
          {stage === "solve" && solo ? (
            <section className="xw-card">
              <header className="xw-card-head">
                <h3>학생별 풀이</h3>
                <span className="xw-badge">많이 채운 차례</span>
              </header>
              <ol className="xwg-ranks">
                {soloRanks.map((p, rank) => {
                  const color = colorOf(p.groupId);
                  const on = soloPickedId === p.groupId;
                  return (
                    <li key={p.groupId}>
                      <button
                        type="button"
                        className={`xwg-rank${on ? " on" : ""}`}
                        style={{ "--xwg-c": color.border, "--xwg-bg": color.bg }}
                        onClick={() => setPicked(p.groupId)}
                        aria-pressed={on}
                        title={`맞힌 낱말 ${p.solved}개 · 글자 ${soloScoreLetters(p)}자(채운 칸 ${p.cells} + 힌트 ${p.hintChars})`}
                      >
                        <span className="xwg-rank-head">
                          <b className="xwg-rank-no">{rank + 1}</b>
                          <strong>{soloName(p.group)}</strong>
                          <span className={`xw-badge${p.total && p.solved === p.total ? " done" : ""}`}>
                            {p.total ? `${p.solved} / ${p.total}` : "아직"}
                          </span>
                        </span>
                        <CrosswordGrid
                          puzzle={puzzle}
                          letters={p.map.letters}
                          fixed={p.map.fixed}
                          solvedKeys={p.map.solvedKeys}
                          mini
                          tint={color}
                          showFixedLetters={false}
                        />
                      </button>
                    </li>
                  );
                })}
              </ol>
              <p className="xw-card-note">
                맞힌 낱말 수가 먼저, 같으면 글자 수(채운 칸 + 쓴 힌트). <span className="xwg-swatch key" /> 그 학생 낱말 <span className="xwg-swatch filled" /> 채우는 중
              </p>
            </section>
          ) : stage === "solve" ? (
            <section className="xw-card">
              <header className="xw-card-head">
                <h3>모둠별 풀이</h3>
                <span className="xw-badge">맞힌 순서</span>
              </header>
              <ol className="xwg-ranks">
                {progressList.map((p, rank) => {
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
                      >
                        <span className="xwg-rank-head">
                          <b className="xwg-rank-no">{rank + 1}</b>
                          <strong>{p.group.groupName || `${p.group.groupIndex ?? rank + 1}모둠`}</strong>
                          <span className={`xw-badge${p.total && p.solved === p.total ? " done" : ""}`}>
                            {p.solved} / {p.total}
                          </span>
                        </span>
                        <CrosswordGrid
                          puzzle={puzzle}
                          letters={boardsBy[p.groupId] ?? {}}
                          fixed={p.fixed}
                          solvedKeys={p.solvedKeys}
                          mini
                          tint={color}
                        />
                      </button>
                    </li>
                  );
                })}
              </ol>
              <p className="xw-card-note">
                <span className="xwg-swatch key" /> 그 모둠 낱말 <span className="xwg-swatch filled" /> 채우는 중 · 맞힌 낱말은 모둠 색
              </p>
            </section>
          ) : (
            <section className="xw-card">
              <header className="xw-card-head">
                <h3>힌트 제출</h3>
                {puzzle && (
                  <span className={`xw-badge${submitted >= writerSlots && writerSlots ? " done" : ""}`}>
                    {submitted} / {writerSlots}명
                  </span>
                )}
              </header>
              {!puzzle && <p className="xw-card-note">퀴즈를 만들면 학생마다 힌트를 냈는지 여기에 떠요.</p>}
              {solo ? (
                <ul className="xwg-solo-list">
                  {studentRows.map(({ group, rows }) => rows.map((r) => (
                    <li key={r.uid} className={`xwg-stu xwg-stu--${r.state}`}>
                      <span className="xwg-stu-name">{soloName(group)}</span>
                      {puzzle && (
                        <span className="xwg-stu-state">
                          {r.state === "done" ? "제출" : r.state === "doing" ? "쓰는 중" : r.state === "free" ? "맡은 낱말 없음" : "미제출"}
                        </span>
                      )}
                    </li>
                  )))}
                </ul>
              ) : studentRows.map(({ group, rows, unassigned }, gi) => (
                <div key={group.id} className="xwg-subgroup" style={{ "--xwg-c": colorOf(group.id).border }}>
                  <div className="xwg-subgroup-head">
                    <strong>{group.groupName || `${group.groupIndex ?? gi + 1}모둠`}</strong>
                    {puzzle && (
                      <span className="xwg-subgroup-meta">
                        낱말 {(hintsOf[group.id] ?? []).length}개{unassigned ? ` · 쓸 사람 안 정함 ${unassigned}` : ""}
                      </span>
                    )}
                  </div>
                  <ul>
                    {rows.map((r) => (
                      <li key={r.uid} className={`xwg-stu xwg-stu--${r.state}`}>
                        <span className="xwg-stu-name">{r.name}</span>
                        {puzzle && (
                          <span className="xwg-stu-state">
                            {r.state === "done" ? "제출" : r.state === "doing" ? "쓰는 중" : r.state === "free" ? "맡은 낱말 없음" : "미제출"}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </aside>

        {/* 가운데 · 오른쪽은 한 묶음 — 두 카드의 바닥을 맞춥니다(왼쪽 목록이 길어도
            그 길이를 따라가지 않게 바깥 격자와 갈라 둠) */}
        <div className="xwg-pair">
        <div className="xwg-center xwg-center--teacher">
          <section className="xw-card">
            <header className="xw-card-head">
              <h3>
                {stage === "solve" && pickedRow
                  ? `${groupLabel(pickedRow.group, 0)}의 낱말판`
                  : "퀴즈 만들기"}
              </h3>
              {stage === "solve" && pickedRow && (
                <span className="xw-badge">{pickedRow.solved} / {pickedRow.total}개 맞힘</span>
              )}
              {!puzzle && <span className="xw-card-head-note">아직 만든 퀴즈가 없어요.</span>}
            </header>

            {/* 안내가 앞, 단추가 그 오른쪽. 단추는 크기를 하나로 맞추고 색으로만 가릅니다 —
                만들기(진한 살구) · 다음 단계(살구) · 내리기(연한 살구) */}
            <div className="xw-gen-row">
              <div className="xw-gen-inner">
                <span className="xw-gen-note">
                  {note ||
                    (stage === "solve"
                      ? `왼쪽 미니맵을 누르면 그 ${solo ? "학생" : "모둠"}의 판을 크게 봐요. 학생이 낱말을 넣는 대로 곧바로 바뀌어요.`
                      : stage === "hint"
                        ? `힌트 ${hintsDone} / ${puzzle.entries.length}개. 다 모이면 '낱말 채우기'를 눌러 ${solo ? "학생" : "모둠"}마다 판을 열어 주세요.`
                        : solo
                          ? `이 활동에 나온 낱말 전부로 학생 수(${studentCount}명)만큼 이어 판을 짜고, 학생마다 낱말 하나씩 나눠 줘요.`
                          : `이 활동에 나온 낱말 전부로 학생 수(${studentCount}명)만큼 이어 판을 짜고, 모둠마다 구성원 수만큼 나눠 줘요.`)}
                </span>
                <div className="xw-gen-btns">
                  {stage !== "solve" && (
                    <button
                      type="button"
                      className="xw-gen-btn xw-gen-btn--make"
                      disabled={busy || liveGroups.length === 0}
                      onClick={() => (puzzle ? setConfirm("regen") : generate())}
                    >
                      {busy ? "만드는 중…" : puzzle ? "퀴즈 다시 생성" : "가로세로 낱말 퀴즈 생성"}
                    </button>
                  )}
                  {stage === "hint" && (
                    <button
                      type="button"
                      className="xw-gen-btn xw-gen-btn--step"
                      disabled={busy}
                      onClick={() => (missingHints > 0 ? setConfirm("solve") : setStage("solve"))}
                    >
                      낱말 채우기
                    </button>
                  )}
                  {stage === "solve" && (
                    <button
                      type="button"
                      className="xw-gen-btn xw-gen-btn--step"
                      disabled={busy}
                      onClick={() => setStage("hint")}
                    >
                      힌트 쓰기로 돌아가기
                    </button>
                  )}
                  {puzzle && (
                    <button
                      type="button"
                      className="xw-gen-btn xw-gen-btn--off"
                      onClick={() => setConfirm("clear")}
                      disabled={busy}
                    >
                      퀴즈 내리기
                    </button>
                  )}
                </div>
              </div>
            </div>

            {!puzzle ? null : stage === "solve" && pickedRow ? (
              <CrosswordGrid
                puzzle={puzzle}
                letters={boardsBy[pickedRow.groupId] ?? {}}
                fixed={pickedRow.fixed}
                solvedKeys={pickedRow.solvedKeys}
              />
            ) : (
              <CrosswordGrid puzzle={puzzle} fixed={answerLetters} />
            )}
          </section>
        </div>

        {/* 오른쪽 — 낱말 힌트(모둠별 · 누가 썼나). 학생 화면의 힌트 목록과 같은 자리 */}
        <aside className="xwg-side xwg-right">
          <section className="xw-card">
            <header className="xw-card-head">
              <h3>낱말 힌트</h3>
              {puzzle && <span className="xw-badge">힌트 {hintsDone} / {puzzle.entries.length}</span>}
            </header>
            {!puzzle ? (
              <p className="xw-card-note">퀴즈를 만들면 {solo ? "학생마다" : "모둠마다"} 맡은 낱말과 학생이 쓴 힌트가 여기에 떠요.</p>
            ) : solo ? (
              <ol className="xwg-hint-list xwg-hint-list--solo">
                {[...allHints].sort((a, b) => a.idx - b.idx).map((h) => {
                  const g = liveGroups.find((x) => x.id === h.groupId);
                  return (
                    <li key={h.idx}>
                      <span className="xwg-word-tag">{DIR_LABEL[h.dir]} {h.num}</span>
                      <strong>{h.word}</strong>
                      {stage === "solve" && pickedRow?.solvedSet?.has(h.idx) && (
                        <span className="xw-used">{soloName(pickedRow.group)} 맞힘</span>
                      )}
                      <span className={h.hint.trim() ? "" : "xw-sub-empty"}>
                        {h.hint.trim() || "아직 힌트가 없어요"}
                      </span>
                      <em className="xwg-writer">{soloName(g)}</em>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="xwg-hint-groups">
                {liveGroups.map((g, gi) => {
                  const list = hintsOf[g.id] ?? [];
                  const solvedSet = progressList.find((p) => p.groupId === pickedRow?.groupId)?.solvedSet;
                  return (
                    <div key={g.id} className="xwg-subgroup" style={{ "--xwg-c": colorOf(g.id).border }}>
                      <div className="xwg-subgroup-head">
                        <strong>{g.groupName || `${g.groupIndex ?? gi + 1}모둠`}</strong>
                        <span className="xwg-subgroup-meta">낱말 {list.length}개</span>
                      </div>
                      {list.length === 0 ? (
                        <p className="xw-empty">맡은 낱말이 없어요.</p>
                      ) : (
                        <ol className="xwg-hint-list">
                          {list.map((h) => (
                            <li key={h.idx}>
                              <span className="xwg-word-tag">{DIR_LABEL[h.dir]} {h.num}</span>
                              <strong>{h.word}</strong>
                              {stage === "solve" && solvedSet?.has(h.idx) && (
                                <span className="xw-used">{pickedRow.group.groupName || "고른 모둠"} 맞힘</span>
                              )}
                              <span className={h.hint.trim() ? "" : "xw-sub-empty"}>
                                {h.hint.trim() || "아직 힌트가 없어요"}
                              </span>
                              <em className="xwg-writer">
                                {h.writerUid ? nameOf(g, h.writerUid) || h.writerName : "쓸 사람 안 정함"}
                              </em>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </aside>
        </div>
      </div>

      {confirm === "regen" && (
        <ConfirmModal
          icon={<span aria-hidden="true">🧩</span>}
          title="퀴즈를 다시 만들까요?"
          description={`새 퀴즈로 바뀌면 ${solo ? "학생마다" : "모둠마다"} 맡은 낱말과 지금까지 쓴 힌트, 채우던 낱말판이 모두 사라져요.`}
          confirmLabel="다시 만들기"
          onConfirm={generate}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "clear" && (
        <ConfirmModal
          icon={<span aria-hidden="true">🧩</span>}
          title="퀴즈를 내릴까요?"
          description="학생 화면에서 퀴즈가 사라지고, 쓴 힌트와 채우던 낱말판도 함께 지워져요. 닿소리 판의 낱말은 그대로예요."
          confirmLabel="내리기"
          danger
          onConfirm={clearPuzzle}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "solve" && (
        <ConfirmModal
          icon={<span aria-hidden="true">🧩</span>}
          title="낱말 채우기를 시작할까요?"
          description={`아직 힌트가 없는 낱말이 ${missingHints}개 있어요. 시작하면 그 낱말은 '(힌트 없음)'으로 나가요. 나중에 '힌트 쓰기로 돌아가기'로 되돌릴 수 있어요.`}
          confirmLabel="시작하기"
          onConfirm={() => setStage("solve")}
          onClose={() => setConfirm(null)}
        />
      )}
    </main>
  );
}
