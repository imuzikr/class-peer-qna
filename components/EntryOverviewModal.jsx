"use client";

// =============================================================
// 한 눈에 보기 — 한 학생이 쓴 것을 영역별 카드로 한 창에 (교사)
// -------------------------------------------------------------
// 책방 교사 화면(곁텍스트 · RAFT · KWLS · 물음표)의 가운데 칸은 양옆 패널이
// 서면 좁아 한 학생의 글을 처음부터 끝까지 이어 읽기 어려웠습니다. 이 창은
// 글을 고치지 않고 읽으며, 아래 ← 이전 학생 · 다음 학생 →(키보드 ← →)로 왼쪽
// 목록의 차례 그대로 넘깁니다(선생님 요청).
//
// **머리의 '수업 시작'은 창 전체를 띄웁니다**(선생님 요청, 2026-11-05) — 영역
// 하나가 아니라 이 학생의 모든 영역(KWLS면 K · W · L · S 네 칸 함께)을 학급
// 화면에 같은 카드 모양으로(mode "overview", lib/overviewCast.js). 띄우는 동안
// 이전 · 다음 학생으로 넘기면 방송도 그 학생으로 따라가고, 이 창을 굴리면 학생
// 화면도 같은 비율로 굴러갑니다. 단추는 '수업 종료'가 되어 그 자리에서 끕니다
// (상단바의 '방송 종료' 알약으로도 꺼짐).
//
// 영역은 보드의 방송 꾸러미(`buildPayload`)를 그대로 받습니다 — 칠판에 뜨는
// 칸 이름 · 물음 · 글과 이 창의 것이 같아야 해서입니다.
//
// 넘기면 **뒤의 화면도 따라옵니다**(`onPick`) — 창을 닫았을 때 그 학생이
// 열려 있어야 방금 읽은 글에서 이어서 '수업 시작'을 누릅니다.
// =============================================================
import { useEffect, useMemo, useRef } from "react";
import { backdropClose } from "@/lib/modal";
import { setBroadcastScroll } from "@/lib/store";
import EntryOverviewCards, { sectionChars } from "./EntryOverviewCards";

function isTyping(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
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
  // 영역 카드를 한 줄에 몇 장 — 2(기본) · 4(KWLS의 K · W · L · S)
  gridCols = 2,
  // 방송 — 창 전체를 띄웁니다. castingUid = 지금 이 창 모양으로 띄우는 학생(없으면 null)
  canCast = false,
  castingUid = null,
  onCast = null,       // (card) → 이 학생의 창 전체를 띄움
  onStopCast = null,
  classId = null,      // 굴림 따라가기(setBroadcastScroll)
}) {
  const at = Math.max(0, cards.findIndex((c) => c.uid === uid));
  const card = cards[at] ?? null;
  const prev = at > 0 ? cards[at - 1] : null;
  const next = at < cards.length - 1 ? cards[at + 1] : null;
  const bodyRef = useRef(null);

  const sections = useMemo(() => (card ? sectionsOf(card) : []), [card, sectionsOf]);
  const written = sections.filter((s) => sectionChars(s) > 0).length;
  const lead = card && leadOf ? leadOf(card) : null;

  const castingThis = !!castingUid && castingUid === card?.uid;

  // 학생을 넘기면 맨 위에서 다시 읽습니다. 띄우는 중이면 방송도 그 학생으로
  // 따라갑니다 — **창 안에서 넘길 때만**(창을 새로 열 때 남의 방송을 바꾸지 않게).
  const lastUidRef = useRef(card?.uid);
  useEffect(() => {
    bodyRef.current?.scrollTo?.({ top: 0 });
    const was = lastUidRef.current;
    lastUidRef.current = card?.uid;
    if (card && was && was !== card.uid && castingUid && castingUid === was) onCast?.(card);
    // 학생이 바뀔 때만 따라갑니다 — castingUid · onCast가 바뀔 때마다 다시 보내지 않게.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.uid]);

  // 띄우는 동안 이 창을 굴리면 학생 화면도 같은 비율로(수업 화면 창과 같은 방식 —
  // 0.15초에 한 번, 1% 아래 차이는 안 보냄)
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !classId || !castingThis) return undefined;
    const key = { mode: "overview", writerName: card?.name ?? "" };
    let timer = null;
    let last = -1;
    const send = () => {
      timer = null;
      const room = el.scrollHeight - el.clientHeight;
      const ratio = room > 0 ? el.scrollTop / room : 0;
      if (Math.abs(last - ratio) < 0.01 && ratio > 0 && ratio < 1) return;
      last = ratio;
      setBroadcastScroll(classId, key, ratio).catch(() => {});
    };
    const onScroll = () => { if (!timer) timer = setTimeout(send, 150); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); if (timer) clearTimeout(timer); };
  }, [classId, castingThis, card?.name]);

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
            {canCast && onCast && (
              <button
                type="button"
                className={`btn-ghost dash-cast-btn eov-cast${castingThis ? " on" : ""}`}
                onClick={() => (castingThis ? onStopCast?.() : onCast(card))}
                title={
                  castingThis
                    ? "학급 화면을 원래대로 되돌립니다"
                    : "이 창에 보이는 그대로(모든 영역) 학급 전체 화면에 띄웁니다 — 넘기면 방송도 따라갑니다"
                }
              >
                {castingThis && <span className="broadcast-live-dot" aria-hidden="true" />}
                {castingThis ? "수업 종료" : "수업 시작"}
              </button>
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
          <EntryOverviewCards sections={sections} gridCols={gridCols} />
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
