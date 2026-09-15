"use client";

// =============================================================
// 수업 노트 읽기 (교사 전용) — 한 학생의 지난 노트를 넘겨 보며 한 마디
// -------------------------------------------------------------
// 학생 카드를 누르면 열립니다. 그 학생의 노트를 전부 받아(한 학기에 많아야
// 수십 건) 날짜로 넘겨 볼 수 있게 하고, 아래에 피드백 한 칸을 둡니다.
//
// **본문은 손대지 않습니다.** 규칙도 feedback 세 필드만 열어 두었고, 화면에도
// 고칠 자리를 두지 않았습니다 — 남의 필기를 고칠 수 있으면 그건 그 학생의
// 기록이 아니게 됩니다.
//
// 저장은 손으로 누릅니다(서랍의 자동 저장과 다릅니다). 학생 화면에 곧바로
// 뜨는 글이라, 쓰다 만 문장이 새어 나가면 안 됩니다.
//
// [학생 글에 하이라이트 → 피드백에 인용]
// 교사가 학생 글을 드래그하면 그 자리가 형광펜처럼 덮이고, 같은 대목이 아래
// 피드백 칸에 인용으로 들어갑니다. '글 전체에 대한 한 마디'밖에 쓸 수 없던
// 자리가 '이 문장에 대한 한 마디'가 됩니다.
//  · 짚은 자리는 노트 문서의 `feedbackMarks`에 저장되고, **학생 화면에서도
//    같은 대목이 칠해집니다** — 그것이 이 기능의 목적입니다. 인용문을 눈으로
//    대조하지 않고 선생님 말이 어느 문장에 대한 것인지 그대로 보입니다.
//  · 규칙에 그 칸을 새로 열었습니다(교사만 씀 · 학생은 못 지움 · 마흔 개까지).
//    시험은 `tests/rules/cornellNotes.test.mjs`.
//  · 덮개를 그리는 일과 자리를 재는 셈은 **여기 없습니다** —
//    `CornellNoteSheet`와 `lib/cornellMarks.js`에 있습니다. 한 장을 쓰는 곳이
//    다섯이라 거기 두어야 교사·학생이 같은 것을 봅니다. 이 창이 더 하는 일은
//    '끌면 인용을 붙이고, 누르면 걷고, 저장한다' 셋뿐입니다.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  subscribeStudentCornellNotes,
  saveCornellFeedback,
  subscribeMyClassRewardCount,
  addStudentReward,
  markCornellNoteRewarded,
  REWARD_MAX,
} from "@/lib/store";
import CornellNoteSheet from "./CornellNoteSheet";
import { MARK_MAX, dropQuote, marksOf, quoteBlock, quoteOf } from "@/lib/cornellMarks";
import { nextFruit } from "./RewardFruits";
import { IconRecord } from "./StatusIcons";

const FEEDBACK_MAX = 2000;

export default function CornellNoteReadModal({
  classId,
  student,
  user,
  initialDate = null,
  onBack = null,
  onClose,
}) {
  const [notes, setNotes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [date, setDate] = useState(initialDate);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── 과일 주기 ────────────────────────────────────────────
  // 노트를 읽는 그 자리에서 바로 줍니다 — 잘 쓴 노트를 보고 격려하려면
  // 창을 닫고 자리표나 카드 격자로 건너가야 했습니다.
  // 문서 **한 건**만 봅니다(`rewards/{classId}_{uid}`). 이름이 `My…`지만
  // uid를 받는 함수라 교사가 학생 것을 보는 데도 그대로 씁니다.
  const [rewardCount, setRewardCount] = useState(0);
  const [awarding, setAwarding] = useState(false);
  useEffect(() => {
    if (!classId || !student?.uid) { setRewardCount(0); return; }
    return subscribeMyClassRewardCount(classId, student.uid, setRewardCount);
  }, [classId, student?.uid]);

  const rewardMaxed = rewardCount >= REWARD_MAX;
  async function award() {
    if (awarding || rewardMaxed) return;
    setAwarding(true);
    try {
      // **델타로 줍니다**(절대값 아님) — 빨리 두 번 누를 때 두 번째가
      // 묻히지 않게. 자세한 것은 CLAUDE.md의 '과일 지급 이력' 절.
      await addStudentReward(classId, student.uid, +1, {
        name: student.name,
        emoji: student.emoji,
      });
      // **이 노트를 읽고 줬다는 도장을 함께 찍습니다.** 지급 이력
      // (rewardEvents)에는 어느 화면에서 줬는지가 안 남아, 자리표에서 준
      // 과일과 구분할 길이 없습니다. 기록 관리의 수업 노트 탭이 이 값으로
      // 카드를 초록으로 칠합니다(`isCornellRewarded` — 피드백을 쓴 날과
      // 같은 날일 때만).
      // 그날 노트가 없으면 찍을 자리도 없습니다 — 그때는 조용히 넘어갑니다
      // (규칙이 노트 생성을 본인에게만 열어 두어 교사가 대신 못 만듭니다).
      if (note?.id) {
        await markCornellNoteRewarded(classId, note.id, user).catch(() => {});
      }
    } finally {
      setAwarding(false);
    }
  }

  useEffect(() => {
    if (!classId || !student?.uid) { setNotes([]); setLoaded(true); return; }
    return subscribeStudentCornellNotes(classId, student.uid, (list) => {
      setNotes(list);
      setLoaded(true);
    });
  }, [classId, student?.uid]);

  // 고른 날짜가 아직 없거나 목록에 없으면 가장 최근 것으로.
  useEffect(() => {
    if (notes.length === 0) return;
    if (!date || !notes.some((n) => n.date === date)) setDate(notes[0].date);
  }, [notes, date]);

  const index = notes.findIndex((n) => n.date === date);
  const note = index >= 0 ? notes[index] : null;

  // 노트를 옮길 때마다 피드백 칸을 그 노트의 것으로 되돌립니다.
  // 쓰던 중이면(dirty) 그대로 두지 않고 버립니다 — 다른 학생의 노트에 남긴
  // 글이 옆 노트로 따라가는 것이 훨씬 나쁩니다.
  useEffect(() => {
    setDraft(String(note?.feedback ?? ""));
    setDirty(false);
    setSaved(false);
    // 지난번에 짚어 둔 표시를 그대로 불러옵니다 — 글자 자리는 **그 노트
    // 안에서만** 뜻이 있으므로 노트를 옮길 때마다 새로 읽습니다.
    // `quote`는 저장하지 않습니다(피드백 글 안에 이미 있습니다) — 눌러서 지울
    // 때 그 줄을 함께 걷으려고 여기서 같은 셈으로 다시 만듭니다.
    setMarks(marksOf(note).map((m) => ({ ...m, quote: quoteOf(m.text) })));
  }, [note?.id]);

  // ── 학생 글에 하이라이트 ──────────────────────────────────
  // 덮개를 그리고 자리를 재는 일은 `CornellNoteSheet`가 합니다 — 여기서는
  // 목록을 들고 있다가 시트에 내려 주고, 끌면 인용을 붙이고, 저장합니다.
  // 고치는 중인 목록이 있으면 그것이 문서 값보다 앞섭니다.
  const fbRef = useRef(null);
  const draftRef = useRef("");
  const seqRef = useRef(0);
  const [marks, setMarks] = useState([]); // { id, quote, text, start, end }

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // 인용 한 덩이를 피드백 칸 끝에 붙이고 커서를 '→ ' 뒤에 둡니다.
  // **화면을 끌어당기지 않습니다**(preventScroll) — 잇달아 여러 군데를 짚는
  // 자리라, 한 번 끌 때마다 칸이 아래로 튀면 노트가 화면에서 사라집니다.
  // 글자를 치기 시작하면 브라우저가 알아서 커서를 보여 줍니다.
  const addQuote = useCallback((quote) => {
    const head = draftRef.current.replace(/\s+$/, "");
    const next = `${head ? `${head}\n\n` : ""}${quoteBlock(quote)}`.slice(0, FEEDBACK_MAX);
    setDraft(next);
    setDirty(true);
    setSaved(false);
    requestAnimationFrame(() => {
      const el = fbRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(next.length, next.length);
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  // 시트가 드래그를 잡아 넘겨 줍니다.
  // **판정을 setMarks 안에서 하지 마세요** — StrictMode가 갱신 함수를 두 번
  // 부르므로 인용이 두 번 붙습니다. 지금 목록을 보고 밖에서 가릅니다.
  const addMark = useCallback(
    (span) => {
      // 같은 자리를 두 번 끌면 그냥 둡니다. 글자로 견주면 같은 낱말이 두 번
      // 나오는 글에서 둘째 것을 못 짚습니다.
      if (marks.some((m) => m.start === span.start && m.end === span.end)) return;
      if (marks.length >= MARK_MAX) return; // 규칙의 천장과 같은 값
      seqRef.current += 1;
      setMarks((prev) => [...prev, { ...span, id: `hl${seqRef.current}` }]);
      addQuote(span.quote);
    },
    [marks, addQuote]
  );

  // 표시를 지웁니다. 아직 아무것도 안 쓴 인용이면 그 줄도 함께 걷습니다.
  // **표시만 걷어도 '저장 안 한 것'입니다** — 표시가 이제 문서에 남는 값이라,
  // 여기서 dirty를 안 세우면 저장 단추가 꺼진 채라 지운 것이 안 반영됩니다.
  function removeMark(id) {
    const gone = marks.find((m) => m.id === id);
    if (!gone) return;
    setMarks((prev) => prev.filter((m) => m.id !== id));
    setDirty(true);
    setSaved(false);
    const next = dropQuote(draft, gone.quote);
    if (next !== null) setDraft(next);
  }

  function clearMarks() {
    if (marks.length === 0) return;
    let text = draft;
    marks.forEach((m) => {
      const next = dropQuote(text, m.quote);
      if (next !== null) text = next;
    });
    setMarks([]);
    setDirty(true);
    setSaved(false);
    if (text !== draft) setDraft(text);
  }

  const counted = useMemo(
    () => ({ index: index >= 0 ? index + 1 : 0, total: notes.length }),
    [index, notes.length]
  );

  async function save() {
    if (!note || saving) return;
    setSaving(true);
    try {
      // 글과 표시를 **한 번에** 씁니다 — 규칙이 이 넷만 함께 바꾸도록
      // 열어 두었고, 나눠 쓰면 글과 표시가 어긋난 순간이 생깁니다.
      await saveCornellFeedback(classId, note.id, draft, user, marks);
      setDirty(false);
      setSaved(true);
    } catch (e) {
      console.warn("[수업 노트] 피드백을 저장하지 못했어요:", e?.code, e?.message);
      alert("피드백을 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setSaving(false);
    }
  }

  function go(step) {
    const next = index + step;
    if (next < 0 || next >= notes.length) return;
    setDate(notes[next].date);
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal modal-cornell-read"
        role="dialog"
        aria-modal="true"
        aria-label="수업 노트 읽기"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 className="head-icon">
            {onBack && (
              <button type="button" className="modal-back" onClick={onBack} aria-label="뒤로" title="뒤로">
                ‹
              </button>
            )}
            <IconRecord size={19} /> 수업 노트
            <span className="notes-student">
              {student?.emoji ?? "🙂"} {student?.name}
            </span>
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {!loaded ? (
          <p className="empty-note">불러오는 중이에요…</p>
        ) : notes.length === 0 ? (
          <p className="empty-note">이 학생은 아직 수업 노트를 쓰지 않았어요.</p>
        ) : (
          <>
            {/* 날짜 넘기기 — 한 학생의 흐름을 따라가는 자리입니다.
                ‹ ›는 붙여 둡니다(학생 화면과 같은 모양) */}
            <div className="cornell-read-bar">
              <select
                className="cornell-read-date"
                value={date ?? ""}
                onChange={(e) => setDate(e.target.value)}
                aria-label="날짜 고르기"
              >
                {notes.map((n) => (
                  <option key={n.id} value={n.date}>
                    {n.date}
                    {n.lessonTitle ? ` · ${n.lessonTitle}` : ""}
                    {String(n.feedback ?? "").trim() ? " · 피드백 남김" : ""}
                  </option>
                ))}
              </select>
              <div className="cornell-read-nav">
                <button
                  type="button"
                  className="cornell-read-step"
                  onClick={() => go(1)}
                  disabled={index >= notes.length - 1}
                  title="이전 날짜"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="cornell-read-step"
                  onClick={() => go(-1)}
                  disabled={index <= 0}
                  title="다음 날짜"
                >
                  ›
                </button>
              </div>
              <span className="cornell-read-count">
                {counted.index} / {counted.total}
              </span>
            </div>

            {/* 안내 한 줄 — 드래그로 되는 일은 화면에 적혀 있지 않으면
                아무도 찾지 못합니다. '지우기'는 표시를 걷는 유일한 키보드
                길이기도 합니다(덮개는 눈으로 보고 누르는 것이라
                aria-hidden). */}
            <div className="cornell-hl-bar">
              <span className="cornell-hl-tip">
                학생 글을 드래그하면 그 대목이 <b>선생님 한 마디</b>에 인용으로 들어가고,
                학생 노트에도 같은 자리가 칠해집니다
              </span>
              {marks.length > 0 && (
                <button type="button" className="cornell-hl-clear" onClick={clearMarks}>
                  표시 {marks.length}개 지우기
                </button>
              )}
            </div>

            <CornellNoteSheet
              note={note}
              showFeedback={false}
              marks={marks}
              onMarkAdd={addMark}
              onMarkRemove={removeMark}
            />

            <div className="cornell-read-feedback">
              {/* 이름표 줄 오른쪽 끝에 과일 단추 — 노트를 읽은 바로 그
                  자리에서 격려합니다. 값도 길도 카드 격자·활동 칸의 단추와
                  같습니다(`nextFruit(개수)` · 델타로 주기). */}
              <div className="cornell-read-fbhead">
                <label htmlFor="cornell-feedback">
                  <b>선생님 한 마디</b>
                  <em>학생 서랍 맨 위에 그대로 보입니다</em>
                </label>
                <button
                  type="button"
                  className="study-card-award-btn cornell-read-award"
                  onClick={award}
                  disabled={awarding || rewardMaxed}
                  title={
                    rewardMaxed
                      ? "이미 최대 개수예요"
                      : `${student?.name || "이 학생"}에게 과일 주기 (현재 ${rewardCount}개)`
                  }
                  aria-label="과일 주기"
                >
                  {nextFruit(rewardCount)}
                </button>
              </div>
              <textarea
                id="cornell-feedback"
                ref={fbRef}
                rows={3}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value.slice(0, FEEDBACK_MAX));
                  setDirty(true);
                  setSaved(false);
                }}
                placeholder="예) 단서 칸에 물음표를 붙여 보면 복습할 때 훨씬 좋아요"
              />
              <div className="cornell-read-actions">
                <span className="cornell-read-hint">
                  {saved ? "저장했어요" : dirty ? "저장하지 않은 글이 있어요" : ""}
                </span>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={save}
                  disabled={!dirty || saving}
                >
                  {saving ? "저장 중…" : "피드백 저장"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
