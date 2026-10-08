"use client";

// =============================================================
// 가로세로 낱말퀴즈 — 교사 화면 (닿소리 '전체 보기'의 '가로세로')
// -------------------------------------------------------------
// 왼쪽은 학생 목록 — 낱말 풀이 셋을 다 썼나(제출)를 막대와 네모 셋으로
// 봅니다(`BookStudentRail` — 곁텍스트 · RAFT · KWLS 교사 화면과 같은 목록).
// 가운데는 '가로세로 낱말 퀴즈 생성'과 만든 퍼즐(정답이 보이는 판), 그 아래
// 학생들이 낸 풀이 전부.
//
// 만들기: 반 전체의 풀이(같은 낱말은 먼저 낸 사람 것)에서 15개를 이어 판을
// 짭니다. 15개를 다 이을 수 없으면 14, 13 … 개로 줄입니다(lib/crossword.js).
// 퍼즐은 활동 문서의 `crossword`에 담아 반 전체가 같은 판을 풉니다 —
// 활동 문서는 담당 교사가 고칠 수 있어 **규칙을 안 건드립니다**.
//
// 읽는 문서: 모둠(이름표) · 학생 기록(entries) — 둘 다 이 활동의 것뿐입니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import {
  subscribeBookGroups,
  subscribeParatextEntries,
  updateBookActivity,
} from "@/lib/store";
import {
  CROSSWORD_PICKS,
  CROSSWORD_TARGET,
  buildCrossword,
  crosswordCandidates,
  normalizeCrosswordPicks,
  normalizeCrossword,
  crosswordPicksDone,
} from "@/lib/crossword";
import BookStudentRail from "./BookStudentRail";
import CrosswordPuzzle from "./CrosswordPuzzle";
import ConfirmModal from "./ConfirmModal";
import DashViewTabs from "./DashViewTabs";

const PICK_ROWS = Array.from({ length: CROSSWORD_PICKS }, (_, i) => ({
  key: `p${i}`,
  label: `낱말 ${i + 1}`,
}));

export default function CrosswordBoard({ activity, onBack, onPickView, onToast, classTools = null }) {
  const [groups, setGroups] = useState([]);
  const [entries, setEntries] = useState([]);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'regen' | 'clear'
  const [note, setNote] = useState("");

  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);
  useEffect(() => subscribeParatextEntries(activity.id, setEntries), [activity.id]);

  // 이 활동에 든 학생 — 판(모둠)의 명단에서, 학번순
  const cards = useMemo(() => {
    const byUid = new Map();
    groups.forEach((g) => {
      (g.members ?? []).forEach((m) => {
        if (m?.uid && !byUid.has(m.uid)) {
          byUid.set(m.uid, { uid: m.uid, name: m.name || "이름 미설정", studentId: m.studentId ?? null });
        }
      });
      (g.memberUids ?? []).forEach((u) => {
        if (u && !byUid.has(u)) byUid.set(u, { uid: u, name: "이름 미설정", studentId: null });
      });
    });
    const entryOf = new Map(entries.map((e) => [e.authorId ?? e.id, e]));
    return [...byUid.values()]
      .map((s) => {
        const e = entryOf.get(s.uid);
        const picks = normalizeCrosswordPicks(e?.answers?.crossword);
        return {
          ...s,
          name: s.name === "이름 미설정" && e?.authorName ? e.authorName : s.name,
          picks,
          // 네모 하나가 낱말 하나 — 풀이까지 쓰면 '다 씀'
          entry: {
            answers: Object.fromEntries(
              PICK_ROWS.map((r, i) => [r.key, picks[i] ? (picks[i].clue.trim() ? "done" : "doing") : "empty"])
            ),
          },
          done: crosswordPicksDone(picks),
        };
      })
      .sort((a, b) =>
        (a.studentId || a.name).localeCompare(b.studentId || b.name, "ko", { numeric: true })
      );
  }, [groups, entries]);

  const nameOf = useMemo(() => {
    const m = new Map(cards.map((c) => [c.uid, c.name]));
    return (uid) => m.get(uid) ?? "";
  }, [cards]);

  const doneCount = cards.filter((c) => c.done).length;
  const candidates = useMemo(() => crosswordCandidates(entries), [entries]);
  const puzzle = useMemo(() => normalizeCrossword(activity.crossword), [activity.crossword]);
  const usedWords = useMemo(() => new Set((puzzle?.entries ?? []).map((e) => e.word)), [puzzle]);

  async function generate() {
    setConfirm(null);
    setBusy(true);
    setNote("");
    // 화면이 먼저 '만드는 중'을 그리도록 한 박자 쉬고 계산합니다
    await new Promise((r) => setTimeout(r, 30));
    const built = buildCrossword(candidates, { target: CROSSWORD_TARGET });
    if (!built) {
      setBusy(false);
      setNote("서로 이어지는 낱말이 모자라 퍼즐을 만들 수 없어요. 낱말 풀이가 더 모이면 다시 해 보세요.");
      return;
    }
    try {
      await updateBookActivity(activity.id, {
        crossword: { ...built, createdAt: Date.now() },
      });
      const n = built.entries.length;
      const msg = n < Math.min(CROSSWORD_TARGET, candidates.length)
        ? `낱말 ${n}개로 가로세로 퀴즈를 만들었어요 — 이어지는 낱말이 모자라 ${CROSSWORD_TARGET}개에서 줄였어요.`
        : `낱말 ${n}개로 가로세로 퀴즈를 만들었어요.`;
      setNote(msg);
      onToast?.(msg);
    } catch (e) {
      console.warn("[가로세로] 퀴즈를 저장하지 못했어요:", e?.code, e?.message);
      setNote("퀴즈를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function clearPuzzle() {
    setConfirm(null);
    try {
      await updateBookActivity(activity.id, { crossword: null });
      setNote("");
      onToast?.("퀴즈를 내렸어요.");
    } catch (e) {
      console.warn("[가로세로] 퀴즈를 내리지 못했어요:", e?.code, e?.message);
    }
  }

  function pick(uid) {
    setPicked((p) => (p === uid ? null : uid));
    setTimeout(() => {
      document.getElementById(`xw-sub-${uid}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 0);
  }

  const submitted = cards.filter((c) => c.picks.length > 0);

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
          가로세로 · 제출 {doneCount} / {cards.length}명 · 쓸 수 있는 낱말 {candidates.length}개
        </span>
      </div>

      <div className="book-workspace">
        <BookStudentRail
          cards={cards}
          pickedUid={picked}
          onPick={pick}
          rows={PICK_ROWS}
          cellState={(row, answers) => answers[row.key] ?? "empty"}
          unit="개"
          meta={(c) => (c.done ? "제출 완료" : c.picks.length ? "쓰는 중" : "아직 안 씀")}
        />

        <div className="book-workspace-center xw-teacher">
          <section className="xw-card">
            <header className="xw-card-head">
              <h3>퀴즈 만들기</h3>
              <span className={`xw-badge${doneCount === cards.length && cards.length ? " done" : ""}`}>
                {doneCount === cards.length && cards.length
                  ? "모두 제출했어요"
                  : `${cards.length - doneCount}명이 아직 다 쓰지 않았어요`}
              </span>
            </header>
            <div className="xw-gen-row">
              <div className="xw-gen-inner">
                <span className="xw-gen-note">
                  {note ||
                    `학생들이 낸 낱말 가운데 ${CROSSWORD_TARGET}개를 이어 만들어요. 다 이을 수 없으면 개수를 줄여요.`}
                </span>
                <div className="xw-gen-btns">
                  <button
                    type="button"
                    className="xw-gen-btn xw-gen-btn--make"
                    disabled={busy || candidates.length < 2}
                    onClick={() => (puzzle ? setConfirm("regen") : generate())}
                  >
                    {busy ? "만드는 중…" : puzzle ? "퀴즈 다시 생성" : "가로세로 낱말 퀴즈 생성"}
                  </button>
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
            {puzzle ? (
              <CrosswordPuzzle puzzle={puzzle} mode="answer" nameOf={nameOf} highlightUid={picked} />
            ) : (
              <p className="xw-empty">아직 만든 퀴즈가 없어요. 만들면 학생들 화면에 곧바로 나타나요.</p>
            )}
          </section>

          <section className="xw-card">
            <header className="xw-card-head">
              <h3>학생들이 낸 낱말 풀이</h3>
              <span className="xw-badge">{submitted.length}명</span>
            </header>
            {submitted.length === 0 ? (
              <p className="xw-empty">아직 낱말 풀이를 쓴 학생이 없어요.</p>
            ) : (
              <ul className="xw-subs">
                {submitted.map((c) => (
                  <li key={c.uid} id={`xw-sub-${c.uid}`} className={c.uid === picked ? "on" : ""}>
                    <div className="xw-sub-who">
                      {c.studentId && <em>{c.studentId}</em>}
                      <b>{c.name}</b>
                      <span className={`xw-badge${c.done ? " done" : ""}`}>
                        {c.done ? "제출" : `${c.picks.filter((p) => p.clue.trim()).length} / ${CROSSWORD_PICKS}`}
                      </span>
                    </div>
                    <ol>
                      {c.picks.map((p) => (
                        <li key={p.word}>
                          <strong>{p.word}</strong>
                          {usedWords.has(p.word) && <span className="xw-used">퀴즈에 들어감</span>}
                          <span className={p.clue.trim() ? "" : "xw-sub-empty"}>
                            {p.clue.trim() || "아직 풀이를 안 썼어요"}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {confirm === "regen" && (
        <ConfirmModal
          icon={<span aria-hidden="true">🧩</span>}
          title="퀴즈를 다시 만들까요?"
          description="새 퀴즈로 바뀌면 학생들이 지금 풀던 답은 사라지고 빈 판에서 다시 시작해요."
          confirmLabel="다시 만들기"
          onConfirm={generate}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "clear" && (
        <ConfirmModal
          icon={<span aria-hidden="true">🧩</span>}
          title="퀴즈를 내릴까요?"
          description="학생 화면에서 퀴즈가 사라져요. 학생들이 쓴 낱말 풀이는 그대로 남아 다시 만들 수 있어요."
          confirmLabel="내리기"
          danger
          onConfirm={clearPuzzle}
          onClose={() => setConfirm(null)}
        />
      )}
    </main>
  );
}
