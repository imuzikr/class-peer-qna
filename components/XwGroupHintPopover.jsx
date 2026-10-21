"use client";

// =============================================================
// 모둠 힌트 팝오버 — 가로세로 '모둠별 풀이'의 카드를 누르면 마우스 옆에
// -------------------------------------------------------------
// 그 모둠의 구성원이 어떤 낱말에 어떤 힌트를 썼는지를 사람별로 보여 줍니다
// (선생님 요청). 떠 있는 '낱말 힌트' 패널은 모든 모둠을 한 목록으로 늘어놓아
// 한 모둠을 짚어 보려면 굴려 찾아야 했습니다.
//
// 자리는 **누른 곳(마우스)** 옆입니다 — 카드 안에서 누른 자리를 기억해 두고,
// 뒤가 굴러도 카드와 함께 따라갑니다(`usePopoverAnchor`). 키보드로 누르면
// (마우스 자리가 없음) 카드 옆에 섭니다. 자리 잡기 · 닫기는 `lib/popover.js`.
// =============================================================
import { useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { usePopoverAnchor, usePopoverDismiss } from "@/lib/popover";

const DIR_LABEL = { across: "가로", down: "세로" };
const POP_W = 340;
const POP_H = 360;

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

export default function XwGroupHintPopover({ anchor, title, color, members = [], hints = [], onClose }) {
  const ref = useRef(null);
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

  const written = hints.filter((h) => h.hint.trim()).length;

  return createPortal(
    <div
      ref={ref}
      className="xwg-hintpop"
      role="dialog"
      aria-label={`${title} — 낱말과 힌트`}
      style={{ left: pos.x, top: pos.y, maxHeight: Math.min(POP_H + 120, pos.maxH), "--xwg-c": color?.border }}
    >
      <div className="xwg-hintpop-head">
        <strong>{title}</strong>
        <span className="xwg-subgroup-meta">힌트 {written} / {hints.length}</span>
        <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
      </div>
      {hints.length === 0 ? (
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
      )}
    </div>,
    document.body
  );
}
