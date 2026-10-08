"use client";

// =============================================================
// 가로세로 낱말퀴즈 — 모둠 활동의 교사 화면 (닿소리 '전체 보기'의 '가로세로')
// -------------------------------------------------------------
// 세 단계를 한 화면에서 넘깁니다(활동 문서의 crossword.stage).
//   준비     — '가로세로 낱말 퀴즈 생성': 이 활동의 낱말 **전부**로 참여 학생
//              수만큼 이어 판을 짜고, 모둠마다 구성원 수만큼 무작위로 나눠 줍니다.
//   힌트 쓰기 — 왼쪽: 학생마다 제출/미제출(한 사람이 낱말 하나를 맡음).
//              가운데: 정답이 보이는 판 + 모둠별 힌트(누가 썼나).
//              '낱말 채우기'를 누르면 힌트가 판의 문제로 들어갑니다.
//   낱말 채우기 — 왼쪽: 모둠별 미니맵(맞힌 낱말이 모둠 색으로 칠해짐)을 맞힌
//              순서대로. 누르면 가운데에 그 모둠의 판이 크게 섭니다.
// 오른쪽 패널은 두지 않습니다.
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
} from "@/lib/crossword";
import { ROW_COLORS } from "@/lib/bookColors";
import CrosswordGrid from "./CrosswordGrid";
import ConfirmModal from "./ConfirmModal";

const DIR_LABEL = { across: "가로", down: "세로" };

// 모둠마다 힌트·판 구독 — 모둠 목록이 바뀔 때만 다시 겁니다
function useGroupXw(actId, groupIds) {
  const [hintsBy, setHintsBy] = useState({});
  const [boardsBy, setBoardsBy] = useState({});
  const key = groupIds.join(",");
  useEffect(() => {
    const offs = [];
    groupIds.forEach((gId) => {
      offs.push(subscribeXwHints(actId, gId, (list) => setHintsBy((m) => ({ ...m, [gId]: list }))));
      offs.push(subscribeXwBoard(actId, gId, (cells) => setBoardsBy((m) => ({ ...m, [gId]: cells }))));
    });
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actId, key]);
  return { hintsBy, boardsBy };
}

export default function CrosswordGroupBoard({ activity, onBack, onToast }) {
  const [groups, setGroups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(null); // 'regen' | 'clear' | 'solve'
  const [picked, setPicked] = useState(null); // 낱말 채우기 — 가운데에 크게 볼 모둠

  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);
  const liveGroups = useMemo(() => groups.filter((g) => (g.memberUids ?? []).length > 0), [groups]);
  const groupIds = useMemo(() => liveGroups.map((g) => g.id), [liveGroups]);
  const { hintsBy, boardsBy } = useGroupXw(activity.id, groupIds);

  const puzzle = useMemo(() => normalizeGroupCrossword(activity.crossword), [activity.crossword]);
  const stage = puzzle?.stage ?? null;
  const studentCount = liveGroups.reduce((n, g) => n + g.memberUids.length, 0);

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
    if (!puzzle) return [];
    return rankGroupProgress(liveGroups.map((g, order) => {
      const fixed = fixedLettersOf(puzzle, hintsOf[g.id]);
      const p = groupSolveProgress(puzzle, g.id, boardsBy[g.id] ?? {}, fixed);
      return { groupId: g.id, group: g, order, fixed, ...p, solved: p.solved.size, solvedSet: p.solved };
    }));
  }, [puzzle, liveGroups, hintsOf, boardsBy]);

  const pickedRow = progressList.find((x) => x.groupId === picked) ?? progressList[0] ?? null;

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
      await createGroupCrossword(activity.id, { ...built.puzzle, createdAt: Date.now() }, built.hints);
      const n = built.puzzle.entries.length;
      const msg = n < built.target
        ? `낱말 ${n}개로 퀴즈를 만들었어요 — 이어지는 낱말이 모자라 학생 수(${built.target}명)보다 적어요. 낱말을 못 맡은 학생이 있어요.`
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
        <strong className="canvas-head-name">가로세로 낱말퀴즈</strong>
        <button type="button" className="btn-ghost" onClick={onBack}>← 전체 보기</button>
        <span className="canvas-head-stats">
          {activity.topic || activity.title} · 모둠 {liveGroups.length}개 · 학생 {studentCount}명
          {puzzle && ` · 낱말 ${puzzle.entries.length}개`}
        </span>
        <span className={`xw-badge xwg-stage${stage === "solve" ? " done" : ""}`}>
          {stage === "solve" ? "낱말 채우기 중" : stage === "hint" ? "힌트 쓰는 중" : "준비"}
        </span>
      </div>

      <div className="xwg xwg--teacher">
        {/* 왼쪽 — 힌트 제출 현황 / 모둠별 풀이 미니맵 */}
        <aside className="xwg-side xwg-left">
          {stage === "solve" ? (
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
              {studentRows.map(({ group, rows, unassigned }, gi) => (
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

        {/* 가운데 */}
        <div className="xwg-center xwg-center--teacher">
          <section className="xw-card">
            <header className="xw-card-head">
              <h3>
                {stage === "solve" && pickedRow
                  ? `${pickedRow.group.groupName || `${pickedRow.group.groupIndex}모둠`}의 낱말판`
                  : "퀴즈 만들기"}
              </h3>
              {stage === "solve" && pickedRow && (
                <span className="xw-badge">{pickedRow.solved} / {pickedRow.total}개 맞힘</span>
              )}
            </header>

            <div className="xw-gen-row">
              {stage !== "solve" && (
                <button
                  type="button"
                  className="btn-primary xw-gen-btn"
                  disabled={busy || liveGroups.length === 0}
                  onClick={() => (puzzle ? setConfirm("regen") : generate())}
                >
                  {busy ? "만드는 중…" : puzzle ? "퀴즈 다시 생성" : "가로세로 낱말 퀴즈 생성"}
                </button>
              )}
              {stage === "hint" && (
                <button
                  type="button"
                  className="btn-primary xw-gen-btn"
                  disabled={busy}
                  onClick={() => (missingHints > 0 ? setConfirm("solve") : setStage("solve"))}
                >
                  낱말 채우기
                </button>
              )}
              {stage === "solve" && (
                <button type="button" className="btn-ghost" disabled={busy} onClick={() => setStage("hint")}>
                  힌트 쓰기로 돌아가기
                </button>
              )}
              {puzzle && (
                <button type="button" className="btn-ghost" onClick={() => setConfirm("clear")} disabled={busy}>
                  퀴즈 내리기
                </button>
              )}
              <span className="xw-gen-note">
                {note ||
                  (stage === "solve"
                    ? "왼쪽 미니맵을 누르면 그 모둠의 판을 크게 봐요. 학생이 낱말을 넣는 대로 곧바로 바뀌어요."
                    : stage === "hint"
                      ? `힌트 ${hintsDone} / ${puzzle.entries.length}개. 다 모이면 '낱말 채우기'를 눌러 모둠마다 판을 열어 주세요.`
                      : `이 활동에 나온 낱말 전부로 학생 수(${studentCount}명)만큼 이어 판을 짜고, 모둠마다 구성원 수만큼 나눠 줘요.`)}
              </span>
            </div>

            {!puzzle ? (
              <p className="xw-empty">아직 만든 퀴즈가 없어요.</p>
            ) : stage === "solve" && pickedRow ? (
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

          {puzzle && (
            <section className="xw-card">
              <header className="xw-card-head">
                <h3>모둠별 낱말과 힌트</h3>
                <span className="xw-badge">힌트 {hintsDone} / {puzzle.entries.length}</span>
              </header>
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
            </section>
          )}
        </div>
      </div>

      {confirm === "regen" && (
        <ConfirmModal
          icon={<span aria-hidden="true">🧩</span>}
          title="퀴즈를 다시 만들까요?"
          description="새 퀴즈로 바뀌면 모둠마다 맡은 낱말과 지금까지 쓴 힌트, 채우던 낱말판이 모두 사라져요."
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
