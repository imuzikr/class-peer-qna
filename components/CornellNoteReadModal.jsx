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
//  · **인용은 피드백 글 안에 들어갑니다**(새 필드가 아닙니다). 규칙이 교사에게
//    feedback·feedbackAt·feedbackBy 세 칸만 열어 두어(changedOnly) 다른 필드를
//    쓰면 거부됩니다. 덕분에 **규칙을 한 줄도 안 건드립니다.**
//  · 자리(offset)를 저장하지 않는 것은 규칙 때문만이 아닙니다 — 본문은 학생이
//    계속 고치는 글이라, 자리를 적어 두면 학생이 한 줄만 고쳐도 엉뚱한 데를
//    가리킵니다. 인용한 **글자 자체**를 남기면 그런 일이 없습니다.
//  · 그래서 하이라이트는 **교사가 읽는 동안만** 있는 표시입니다(어디까지
//    짚었나). 학생에게 건너가는 것은 피드백 글 속의 인용입니다.
// =============================================================
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  subscribeStudentCornellNotes,
  saveCornellFeedback,
  subscribeMyClassRewardCount,
  addStudentReward,
  REWARD_MAX,
} from "@/lib/store";
import CornellNoteSheet from "./CornellNoteSheet";
import { nextFruit } from "./RewardFruits";
import { IconRecord } from "./StatusIcons";

const FEEDBACK_MAX = 2000;

// 인용 한 줄의 길이. 학생이 '어느 대목인가'를 찾을 수 있으면 되는 값이라 길
// 필요가 없고, 피드백 칸이 2000자라 긴 인용 몇 개면 금세 찹니다.
const QUOTE_MAX = 60;

// 고른 글자 → 인용 한 줄. 줄바꿈·연속 공백은 한 칸으로 눕힙니다 — 여러 줄에
// 걸쳐 끌면 그대로 넣었을 때 피드백 칸이 인용만으로 길어집니다.
function quoteOf(text) {
  const t = String(text).replace(/\s+/g, " ").trim();
  return t.length > QUOTE_MAX ? `${t.slice(0, QUOTE_MAX)}…` : t;
}

// 인용 한 덩이 — 「인용」 다음 줄에 '→ '를 두고 거기서부터 씁니다.
// 학생 화면(서랍·리포트)의 피드백 칸이 `white-space: pre-wrap`이라 이 모양이
// 그대로 보입니다. **고칠 때는 addQuote·dropQuote 둘을 함께** — 짓는 모양과
// 걷어 내는 모양이 갈리면 잘못 끈 인용을 못 지웁니다.
function quoteBlock(quote) {
  return `「${quote}」\n→ `;
}

// 아직 아무것도 안 쓴 인용 덩이만 걷어 냅니다. 잘못 끌었을 때 표시와 인용이
// 한 번에 사라지게 하려는 것이라, **'→' 뒤에 글이 있으면 건드리지 않습니다**
// — 교사가 쓴 글을 지우는 것보다 인용 한 줄이 남는 편이 낫습니다.
// 찾을 때 '→'까지만 보는 까닭: 다음 인용을 붙일 때 앞 덩이의 꼬리 공백을
// 지우므로(addQuote), 넣을 때 쓴 `'→ '` 그대로는 뒤 덩이에서만 맞습니다.
function dropQuote(text, quote) {
  const head = `「${quote}」\n→`;
  const at = text.indexOf(head);
  if (at < 0) return null;
  const after = text.slice(at + head.length);
  const written = after.replace(/^[ \t]*/, "");
  if (written && !written.startsWith("\n")) return null;
  const before = text.slice(0, at).replace(/\s+$/, "");
  const rest = after.replace(/^\s+/, "");
  if (before && rest) return `${before}\n\n${rest}`;
  return before || rest;
}

// ── 표시를 무엇에 매어 둘까 ───────────────────────────────────
// **Range를 그대로 들고 있으면 안 됩니다.** 노트 본문은
// dangerouslySetInnerHTML로 그리는 자리라, 부모가 한 번 다시 그릴 때마다
// (피드백 칸에 글자 하나만 쳐도) 그 아래가 통째로 새 노드로 갈립니다. 들고
// 있던 Range는 문서에서 떨어져 나가 줄 상자가 0개가 됩니다 — 표시가 그냥
// 사라집니다(실측: 한 글자 치면 rects 1 → 0, isConnected false).
// 그래서 **글자 자리(offset)로 매어 두고 잴 때마다 Range를 새로 만듭니다.**
// 노트가 같은 글인 한 자리는 그대로이므로 몇 번을 다시 그려도 맞습니다.
function textNodesIn(root) {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out = [];
  let n;
  while ((n = walk.nextNode())) out.push(n);
  return out;
}

// 고른 범위 → 감싼 칸 기준의 글자 자리 [start, end)
function offsetsOf(root, range) {
  let at = 0;
  let start = -1;
  let end = -1;
  textNodesIn(root).forEach((n) => {
    const len = n.nodeValue.length;
    if (range.intersectsNode(n)) {
      const s = n === range.startContainer ? range.startOffset : 0;
      const e = n === range.endContainer ? range.endOffset : len;
      if (e > s) {
        if (start < 0) start = at + s;
        end = at + e;
      }
    }
    at += len;
  });
  return start < 0 ? null : { start, end };
}

// 글자 자리 → 지금 DOM의 Range
function rangeAt(root, start, end) {
  const nodes = textNodesIn(root);
  const r = document.createRange();
  let at = 0;
  let opened = false;
  for (const n of nodes) {
    const len = n.nodeValue.length;
    if (!opened && start < at + len) {
      r.setStart(n, Math.max(0, start - at));
      opened = true;
    }
    if (opened && end <= at + len) {
      r.setEnd(n, Math.max(0, end - at));
      return r;
    }
    at += len;
  }
  return null;
}

// 줄 상자가 그대로면 상태를 바꾸지 않습니다 — 렌더마다 재는데 그때마다 새
// 배열을 넣으면 렌더가 끝없이 돕니다.
function sameRects(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.key !== y.key ||
      Math.abs(x.left - y.left) > 0.5 ||
      Math.abs(x.top - y.top) > 0.5 ||
      Math.abs(x.width - y.width) > 0.5 ||
      Math.abs(x.height - y.height) > 0.5
    ) {
      return false;
    }
  }
  return true;
}

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
    // 하이라이트도 함께 지웁니다 — 글자 자리는 **그 노트 안에서만** 뜻이
    // 있어서, 남겨 두면 다음 노트의 엉뚱한 대목을 덮습니다.
    setMarks([]);
  }, [note?.id]);

  // ── 학생 글에 하이라이트 ──────────────────────────────────
  // 표시는 **글자를 감싸지 않고 위에 덧그립니다.** 노트 본문은
  // dangerouslySetInnerHTML로 그리고 단서·요약은 React가 직접 그리는 자리라,
  // <mark>를 끼워 넣으면 React가 들고 있던 텍스트 노드와 어긋나 다음 렌더에서
  // 글이 안 바뀌거나 지우다 오류가 납니다. 줄 상자를 그대로 덮으면 여러 줄·
  // 여러 칸에 걸친 선택도 자연히 맞습니다.
  // 매어 두는 것은 Range가 아니라 **글자 자리**입니다 — 까닭은 위
  // offsetsOf/rangeAt 앞의 설명에.
  const wrapRef = useRef(null);
  const fbRef = useRef(null);
  const draftRef = useRef("");
  const seqRef = useRef(0);
  const [marks, setMarks] = useState([]); // { id, quote, raw, start, end }
  const [rects, setRects] = useState([]); // 덮을 줄 상자들

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const next = [];
    if (marks.length > 0) {
      // 자리는 감싼 칸을 기준으로 잽니다 — 둘 다 뷰포트 좌표라 뺄셈 한 번이면
      // 되고, 모달이 굴러도 함께 움직이므로 스크롤을 따로 더할 것이 없습니다.
      const base = wrap.getBoundingClientRect();
      marks.forEach((m) => {
        const r = rangeAt(wrap, m.start, m.end);
        // 학생이 지금 그 노트를 고치고 있으면 자리가 밀립니다. 글자가 달라진
        // 표시는 엉뚱한 데를 덮느니 그냥 접습니다(인용은 피드백 글에 남습니다).
        if (!r || r.toString() !== m.raw) return;
        Array.from(r.getClientRects()).forEach((c, i) => {
          if (c.width < 1 || c.height < 1) return; // 줄 끝의 빈 상자
          next.push({
            key: `${m.id}_${i}`,
            id: m.id,
            left: c.left - base.left,
            top: c.top - base.top,
            width: c.width,
            height: c.height,
          });
        });
      });
    }
    setRects((prev) => (sameRects(prev, next) ? prev : next));
  }, [marks]);

  // **렌더마다 다시 잽니다.** 본문이 새 노드로 갈리거나 글꼴이 늦게 와서
  // 줄이 다시 흘러도 표시가 따라옵니다. 값이 그대로면 상태를 안 바꾸므로
  // (sameRects) 렌더가 더 돌지 않습니다.
  useLayoutEffect(() => {
    measure();
  });

  // 창 크기가 바뀌면 글이 다시 흐르므로 줄 상자도 다시 잽니다.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [measure]);

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

  useEffect(() => {
    function onUp() {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      if (!wrap.contains(range.commonAncestorContainer)) return;
      const raw = range.toString();
      const quote = quoteOf(raw);
      // 한 글자짜리는 읽다가 스친 것일 때가 대부분입니다.
      if (quote.length < 2) return;
      const span = offsetsOf(wrap, range);
      sel.removeAllRanges(); // 파란 선택이 노란 표시 위에 겹치지 않게
      if (!span) return;
      // 같은 자리를 두 번 끌면 그냥 둡니다. 글자로 견주면 같은 낱말이 두 번
      // 나오는 글에서 둘째 것을 못 짚습니다.
      if (marks.some((m) => m.start === span.start && m.end === span.end)) return;
      seqRef.current += 1;
      setMarks((prev) => [...prev, { id: `hl${seqRef.current}`, quote, raw, ...span }]);
      addQuote(quote);
    }
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [marks, addQuote]);

  // 표시를 지웁니다. 아직 아무것도 안 쓴 인용이면 그 줄도 함께 걷습니다.
  function removeMark(id) {
    const gone = marks.find((m) => m.id === id);
    setMarks((prev) => prev.filter((m) => m.id !== id));
    if (!gone) return;
    const next = dropQuote(draft, gone.quote);
    if (next === null) return;
    setDraft(next);
    setDirty(true);
    setSaved(false);
  }

  function clearMarks() {
    let text = draft;
    marks.forEach((m) => {
      const next = dropQuote(text, m.quote);
      if (next !== null) text = next;
    });
    setMarks([]);
    if (text === draft) return;
    setDraft(text);
    setDirty(true);
    setSaved(false);
  }

  const counted = useMemo(
    () => ({ index: index >= 0 ? index + 1 : 0, total: notes.length }),
    [index, notes.length]
  );

  async function save() {
    if (!note || saving) return;
    setSaving(true);
    try {
      await saveCornellFeedback(classId, note.id, draft, user);
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
                학생 글을 드래그하면 그 대목이 아래 <b>선생님 한 마디</b>에 인용으로 들어가요
              </span>
              {marks.length > 0 && (
                <button type="button" className="cornell-hl-clear" onClick={clearMarks}>
                  표시 {marks.length}개 지우기
                </button>
              )}
            </div>

            <div className="cornell-hl-wrap" ref={wrapRef}>
              <CornellNoteSheet note={note} showFeedback={false} />
              {rects.map((r) => (
                <span
                  key={r.key}
                  className="cornell-hl"
                  style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
                  onClick={() => removeMark(r.id)}
                  title="눌러서 표시 지우기"
                  aria-hidden="true"
                />
              ))}
            </div>

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
