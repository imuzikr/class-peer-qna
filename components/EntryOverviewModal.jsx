"use client";

// =============================================================
// 한 눈에 보기 — 한 학생이 쓴 것을 영역별 카드로 한 창에 (교사)
// -------------------------------------------------------------
// 책방 교사 화면(곁텍스트 · RAFT · KWLS · 물음표)의 가운데 칸은 영역마다
// '수업 시작' 단추가 달린 작업 자리라, 양옆 패널이 서면 좁아 한 학생의 글을
// 처음부터 끝까지 이어 읽기 어려웠습니다. 이 창은 **읽기만** 합니다 —
// 방송 · 과일은 없고, 아래 ← 이전 학생 · 다음 학생 →(키보드 ← →)로 왼쪽
// 목록의 차례 그대로 넘깁니다(선생님 요청).
//
// 영역은 보드의 방송 꾸러미(`buildPayload`)를 그대로 받습니다 — 칠판에 뜨는
// 칸 이름 · 물음 · 글과 이 창의 것이 같아야 해서입니다.
//
// 넘기면 **뒤의 화면도 따라옵니다**(`onPick`) — 창을 닫았을 때 그 학생이
// 열려 있어야 방금 읽은 글에서 이어서 '수업 시작'을 누릅니다.
// =============================================================
import { useEffect, useMemo, useRef } from "react";
import { backdropClose } from "@/lib/modal";

function isTyping(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function sectionChars(sec) {
  return (sec.fields ?? []).reduce((n, f) => n + String(f.text ?? "").replace(/\s/g, "").length, 0);
}

export default function EntryOverviewModal({
  activityTitle = "",
  // 넘길 차례 — 왼쪽 목록에 보이는 그대로
  cards = [],
  uid,
  onPick,
  onClose,
  // card → [{ key, letter, label, labelEn, prompt, fields, columns, wide }]
  sectionsOf,
  // card → 머리줄에 적을 진행 요약('3 / 4칸 · 글 120자')
  summaryOf = null,
  // card → 영역 위에 한 줄로 서는 문장 { text, done } (RAFT의 '나는 …이 되어 …')
  leadOf = null,
  // card → 영역 카드 아래에 붙는 것(모둠 RAFT의 '모둠 친구들이 남긴 한 마디')
  footOf = null,
}) {
  const at = Math.max(0, cards.findIndex((c) => c.uid === uid));
  const card = cards[at] ?? null;
  const prev = at > 0 ? cards[at - 1] : null;
  const next = at < cards.length - 1 ? cards[at + 1] : null;
  const bodyRef = useRef(null);

  const sections = useMemo(() => (card ? sectionsOf(card) : []), [card, sectionsOf]);
  const written = sections.filter((s) => sectionChars(s) > 0).length;
  const lead = card && leadOf ? leadOf(card) : null;

  // 학생을 넘기면 맨 위에서 다시 읽습니다
  useEffect(() => {
    bodyRef.current?.scrollTo?.({ top: 0 });
  }, [card?.uid]);

  // ← →는 학생 넘기기. Esc는 공통 처리(backdropClose)가 맡습니다.
  useEffect(() => {
    function onKey(e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isTyping(e.target)) return;
      if (e.key === "ArrowLeft" && prev) { e.preventDefault(); onPick?.(prev.uid); }
      if (e.key === "ArrowRight" && next) { e.preventDefault(); onPick?.(next.uid); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, onPick]);

  function jump(key) {
    const el = bodyRef.current?.querySelector(`[data-sec="${key}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!card) return null;

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal modal-entry-overview"
        role="dialog"
        aria-modal="true"
        aria-label={`${card.name} — 한 눈에 보기`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="eov-head">
          <div className="eov-who">
            <span className="eov-kicker">한 눈에 보기{activityTitle ? ` · ${activityTitle}` : ""}</span>
            <h3>
              {card.name}
              {card.studentId && <em>{card.studentId}</em>}
            </h3>
          </div>
          <div className="eov-meta">
            {card.entry?.topic && <span className="book-group-topic">{card.entry.topic}</span>}
            {summaryOf && <span className="book-group-class">{summaryOf(card)}</span>}
            {cards.length > 1 && (
              <span className="eov-count">{at + 1} / {cards.length}</span>
            )}
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {/* 영역 바로가기 — 칸이 많은 활동(곁텍스트 여덟 단계)에서 굴리지 않고
            짚어 갑니다. 쓴 칸은 초록, 빈 칸은 회색. */}
        {sections.length > 1 && (
          <nav className="eov-nav" aria-label="영역 바로가기">
            {sections.map((s) => {
              const done = sectionChars(s) > 0;
              return (
                <button
                  key={s.key}
                  type="button"
                  className={`eov-nav-chip${done ? " done" : ""}`}
                  onClick={() => jump(s.key)}
                  title={done ? `${s.label} — 썼어요` : `${s.label} — 아직 비어 있어요`}
                >
                  {s.letter && <b aria-hidden="true">{s.letter}</b>}
                  {s.label}
                </button>
              );
            })}
            <span className="eov-nav-sum">{written} / {sections.length} 영역 작성</span>
          </nav>
        )}

        <div className="eov-body" ref={bodyRef}>
          {lead?.text && <p className={`raft-sentence${lead.done ? " done" : ""} eov-lead`}>{lead.text}</p>}
          {!card.entry && (
            <p className="eov-empty-note">아직 시작하지 않았어요 — 쓴 것이 생기면 여기에 바로 보입니다.</p>
          )}
          <div className="eov-grid">
            {sections.map((s) => {
              const chars = sectionChars(s);
              const fields = s.fields ?? [];
              return (
                <section
                  key={s.key}
                  data-sec={s.key}
                  className={`eov-card${chars > 0 ? " done" : " empty"}${s.wide ? " wide" : ""}`}
                >
                  <header className="eov-card-head">
                    {s.letter && <span className="paratext-letter" aria-hidden="true">{s.letter}</span>}
                    <span className="paratext-card-title">
                      <strong>{s.label}</strong>
                      {s.labelEn && <em>{s.labelEn}</em>}
                    </span>
                    <span className={`eov-state${chars > 0 ? " done" : ""}`}>
                      {chars > 0 ? `${chars}자` : "비어 있음"}
                    </span>
                  </header>
                  {s.prompt && <p className="eov-prompt">{s.prompt}</p>}
                  <div className={`eov-fields${s.columns === 2 ? " cols" : ""}`}>
                    {fields.length === 0 ? (
                      <p className="eov-text empty">아직 쓰지 않았어요</p>
                    ) : (
                      fields.map((f, i) => {
                        const text = String(f.text ?? "").trim();
                        return (
                          <div key={i} className="eov-field">
                            {f.label && <span className="eov-label">{f.label}</span>}
                            <p className={`eov-text${text ? "" : " empty"}`}>
                              {text || "아직 쓰지 않았어요"}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          {footOf && footOf(card)}
        </div>

        <div className="eov-foot">
          <button
            type="button"
            className="btn-ghost eov-step"
            onClick={() => prev && onPick?.(prev.uid)}
            disabled={!prev}
            title={prev ? `${prev.name}의 글로` : "앞에 학생이 없어요"}
          >
            ← 이전 학생
          </button>
          <span className="eov-hint">
            {prev || next ? "왼쪽 목록의 차례대로 넘깁니다 · 키보드 ← →" : "넘길 학생이 없어요"}
          </span>
          <button
            type="button"
            className="btn-ghost eov-step"
            onClick={() => next && onPick?.(next.uid)}
            disabled={!next}
            title={next ? `${next.name}의 글로` : "뒤에 학생이 없어요"}
          >
            다음 학생 →
          </button>
        </div>
      </div>
    </div>
  );
}
