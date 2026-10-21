"use client";

// =============================================================
// 모둠 힌트 팝오버 — 가로세로 '모둠별 풀이'의 카드를 누르면 마우스 옆에
// -------------------------------------------------------------
// 그 모둠의 구성원을 사람별로, 탭 둘로 보여 줍니다(선생님 요청).
//   힌트 — 어떤 낱말에 어떤 힌트를 썼나. 떠 있는 '낱말 힌트' 패널은 모든 모둠을
//          한 목록으로 늘어놓아 한 모둠을 짚어 보려면 굴려 찾아야 했습니다.
//   정답 — 이 모둠의 퀴즈판을 그대로 그리고, 맞힌 낱말의 칸을 **맞힌 학생의
//          색**으로 칠합니다(xwSolves — 끝까지 채워 맞힌 사람, 선생님 요청).
//          우리 모둠 낱말(열쇠 칸)은 연한 회색, 기록이 생기기 전에 맞힌 낱말은
//          '기록 없음' 색. 판 위의 범례가 색 = 학생과 맞힌 수를 적습니다(판이 길면
//          범례가 구르는 아래로 밀려 안 보여서 위에 둡니다).
//
// 자리는 **누른 곳(마우스)** 옆입니다 — 카드 안에서 누른 자리를 기억해 두고,
// 뒤가 굴러도 카드와 함께 따라갑니다(`usePopoverAnchor`). 키보드로 누르면
// (마우스 자리가 없음) 카드 옆에 섭니다. 자리 잡기 · 닫기는 `lib/popover.js`.
// =============================================================
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopoverAnchor, usePopoverDismiss } from "@/lib/popover";
import { entryCellKeys } from "@/lib/crossword";
import { rowColor } from "@/lib/bookColors";
import CrosswordGrid from "./CrosswordGrid";

const DIR_LABEL = { across: "가로", down: "세로" };
const POP_W = 420;
const POP_H = 360;

// 정답 탭의 칠하기 색 — 우리 모둠 낱말은 '기본'이라 연한 회색, 기록 없음은
// 사람 색(ROW_COLORS)과 안 겹치는 잿빛 파랑
const OWN_TONE = { bg: "#efefec", border: "#d3d0ca" };
const NONE_TONE = { bg: "#e4eaee", border: "#8fa2ad" };

const timeOf = (at) => (at?.toMillis ? at.toMillis() : at instanceof Date ? at.getTime() : Infinity);

// 카드 안 (ox, oy) 자리를 가리키는 가짜 요소 — popoverPos가 읽는 것은
// getBoundingClientRect · ownerDocument뿐입니다.
export function pointAnchor(card, e) {
  if (!card) return null;
  const r0 = card.getBoundingClientRect();
  // 키보드로 누르면 clientX/Y가 0 — 카드 자체를 기준으로
  if (!e || (e.detail === 0 && e.clientX === 0 && e.clientY === 0)) return card;
  const ox = e.clientX - r0.left;
  const oy = e.clientY - r0.top;
  return {
    ownerDocument: card.ownerDocument,
    getBoundingClientRect() {
      const r = card.getBoundingClientRect();
      const x = r.left + ox;
      const y = r.top + oy;
      return { left: x, right: x, top: y, bottom: y, width: 0, height: 0 };
    },
  };
}

export default function XwGroupHintPopover({
  anchor, title, color, members = [], hints = [], solves = [], solveTotal = 0,
  puzzle = null, letters = {}, fixed = null, onClose,
}) {
  const ref = useRef(null);
  const [tab, setTab] = useState("hint");
  const pos = usePopoverAnchor(anchor, { w: POP_W, h: POP_H, gap: 14 });
  usePopoverDismiss(true, ref, onClose, ".xwg-rank");

  // 사람별로 — 모둠원 차례, 쓸 사람을 안 정한 낱말은 맨 뒤
  const rows = useMemo(() => {
    const sorted = [...hints].sort((a, b) => a.idx - b.idx);
    const out = members.map((m) => ({
      uid: m.uid,
      name: m.name || "이름 미설정",
      list: sorted.filter((h) => h.writerUid === m.uid),
    }));
    const known = new Set(members.map((m) => m.uid));
    // 모둠에서 빠진 학생이 쓴 힌트도 남깁니다(이름은 힌트에 적힌 것)
    const strangers = new Map();
    for (const h of sorted) {
      if (!h.writerUid || known.has(h.writerUid)) continue;
      if (!strangers.has(h.writerUid)) strangers.set(h.writerUid, { uid: h.writerUid, name: h.writerName || "모둠에서 빠진 학생", list: [] });
      strangers.get(h.writerUid).list.push(h);
    }
    out.push(...strangers.values());
    const none = sorted.filter((h) => !h.writerUid);
    if (none.length) out.push({ uid: "_none", name: "쓸 사람 안 정함", list: none, none: true });
    return out;
  }, [members, hints]);

  // 정답 — 사람마다 색(모둠원 차례 → 모둠에서 빠진 학생), 칸을 그 색으로.
  // 두 낱말이 엇갈리는 칸은 **먼저 맞힌 사람**의 색(그 칸을 먼저 채운 사람)
  const { paint, legend } = useMemo(() => {
    const people = members.map((m) => ({ uid: m.uid, name: m.name || "이름 미설정", count: 0 }));
    const sorted = [...solves].sort((a, b) => timeOf(a.at) - timeOf(b.at) || a.idx - b.idx);
    for (const x of sorted) {
      if (x.uid && !people.some((p) => p.uid === x.uid)) {
        people.push({ uid: x.uid, name: x.name || "모둠에서 빠진 학생", count: 0 });
      }
    }
    // 사람 색은 ROW_COLORS의 옅은 바탕보다 한 단계 짙게 — 판 위 작은 칸에서
    // 귤빛 · 겨자처럼 이웃한 색이 옅으면 서로 안 갈립니다
    people.forEach((p, i) => {
      const c = rowColor(i);
      p.tone = { bg: `color-mix(in srgb, ${c.border} 42%, #fff)`, border: c.border };
    });
    const byUid = new Map(people.map((p) => [p.uid, p]));
    const map = new Map();
    fixed?.forEach((_, k) => map.set(k, OWN_TONE));
    let none = 0;
    for (const x of sorted) {
      const e = puzzle?.entries?.[x.idx];
      if (!e) continue;
      const who = x.uid ? byUid.get(x.uid) : null;
      if (who) who.count += 1; else none += 1;
      const tone = who?.tone ?? NONE_TONE;
      entryCellKeys(e).forEach((k) => { if (!map.has(k)) map.set(k, tone); });
    }
    const rows = people.map((p) => ({ key: p.uid, name: p.name, tone: p.tone, count: p.count }));
    if (none) rows.push({ key: "_none", name: "기록 없음", tone: NONE_TONE, count: none, none: true });
    rows.push({ key: "_own", name: "우리 모둠 낱말", tone: OWN_TONE, own: true });
    return { paint: map, legend: rows };
  }, [members, solves, puzzle, fixed]);

  const written = hints.filter((h) => h.hint.trim()).length;
  const isHint = tab === "hint";

  return createPortal(
    <div
      ref={ref}
      className="xwg-hintpop"
      role="dialog"
      aria-label={`${title} — ${isHint ? "낱말과 힌트" : "맞힌 낱말"}`}
      style={{ left: pos.x, top: pos.y, maxHeight: Math.min(isHint ? POP_H + 160 : POP_H + 300, pos.maxH), "--xwg-c": color?.border }}
    >
      <div className="xwg-hintpop-head">
        <strong>{title}</strong>
        <span className="xwg-subgroup-meta">
          {isHint ? `힌트 ${written} / ${hints.length}` : `맞힘 ${solves.length} / ${solveTotal}`}
        </span>
        <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
      </div>
      <div className="xwg-hintpop-tabs" role="tablist">
        {[["hint", "힌트"], ["solve", "정답"]].map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? "on" : ""}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>
      {isHint ? (
        hints.length === 0 ? (
          <p className="xw-empty">맡은 낱말이 없어요.</p>
        ) : (
          <div className="xwg-hintpop-body">
            {rows.map((r) => (
              <section key={r.uid} className={`xwg-hintpop-person${r.none ? " none" : ""}`}>
                <h4>
                  {r.name}
                  <span>{r.list.length ? `낱말 ${r.list.length}개` : "맡은 낱말 없음"}</span>
                </h4>
                {r.list.length > 0 && (
                  <ol className="xwg-hint-list">
                    {r.list.map((h) => (
                      <li key={h.idx}>
                        <span className="xwg-word-tag">{DIR_LABEL[h.dir]} {h.num}</span>
                        <strong>{h.word}</strong>
                        <span className={h.hint.trim() ? "" : "xw-sub-empty"}>
                          {h.hint.trim() || "아직 힌트가 없어요"}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
          </div>
        )
      ) : !puzzle ? (
        <p className="xw-empty">퀴즈판을 불러오는 중이에요.</p>
      ) : (
        <div className="xwg-hintpop-body">
          <ul className="xwg-hintpop-legend">
            {legend.map((r) => (
              <li key={r.key} className={r.none || r.own ? "muted" : ""}>
                <i style={{ background: r.tone.bg, borderColor: r.tone.border }} aria-hidden="true" />
                <span>{r.name}</span>
                {!r.own && <b>{r.count}</b>}
              </li>
            ))}
          </ul>
          <div className="xwg-hintpop-board">
            <CrosswordGrid puzzle={puzzle} letters={letters} fixed={fixed} paint={paint} />
          </div>
          {legend.some((r) => r.none) && (
            <p className="xwg-hintpop-foot">'기록 없음'은 누가 맞혔는지 남기기 전에 맞힌 낱말이에요.</p>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
