"use client";

// =============================================================
// 모둠 힌트 팝오버 — 가로세로 '모둠별 풀이'의 카드를 누르면 마우스 옆에
// -------------------------------------------------------------
// 그 모둠의 구성원을 사람별로, 탭 둘로 보여 줍니다(선생님 요청).
//   힌트 — 어떤 낱말에 어떤 힌트를 썼나. 떠 있는 '낱말 힌트' 패널은 모든 모둠을
//          한 목록으로 늘어놓아 한 모둠을 짚어 보려면 굴려 찾아야 했습니다.
//   정답 — 전체 퀴즈에서 이 모둠 판의 어느 낱말을 누가 맞혔나(xwSolves —
//          끝까지 채워 맞힌 사람). 기록이 생기기 전에 맞힌 낱말은 '기록 없음'.
//
// 자리는 **누른 곳(마우스)** 옆입니다 — 카드 안에서 누른 자리를 기억해 두고,
// 뒤가 굴러도 카드와 함께 따라갑니다(`usePopoverAnchor`). 키보드로 누르면
// (마우스 자리가 없음) 카드 옆에 섭니다. 자리 잡기 · 닫기는 `lib/popover.js`.
// =============================================================
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopoverAnchor, usePopoverDismiss } from "@/lib/popover";

const DIR_LABEL = { across: "가로", down: "세로" };
const POP_W = 340;
const POP_H = 360;

function clockOf(at) {
  const d = at?.toDate ? at.toDate() : at instanceof Date ? at : null;
  if (!d) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
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

export default function XwGroupHintPopover({ anchor, title, color, members = [], hints = [], solves = [], solveTotal = 0, onClose }) {
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

  // 정답 — 사람별(모둠원 차례), 맞힌 차례대로. 기록 없는 것은 맨 뒤
  const solveRows = useMemo(() => {
    const sorted = [...solves].sort((a, b) => timeOf(a.at) - timeOf(b.at) || a.idx - b.idx);
    const out = members.map((m) => ({
      uid: m.uid,
      name: m.name || "이름 미설정",
      list: sorted.filter((x) => x.uid === m.uid),
    }));
    const known = new Set(members.map((m) => m.uid));
    const strangers = new Map();
    for (const x of sorted) {
      if (!x.uid || known.has(x.uid)) continue;
      if (!strangers.has(x.uid)) strangers.set(x.uid, { uid: x.uid, name: x.name || "모둠에서 빠진 학생", list: [] });
      strangers.get(x.uid).list.push(x);
    }
    out.push(...strangers.values());
    const none = sorted.filter((x) => !x.uid);
    if (none.length) out.push({ uid: "_none", name: "기록 없음", list: none, none: true });
    return out;
  }, [members, solves]);

  const written = hints.filter((h) => h.hint.trim()).length;
  const isHint = tab === "hint";

  return createPortal(
    <div
      ref={ref}
      className="xwg-hintpop"
      role="dialog"
      aria-label={`${title} — ${isHint ? "낱말과 힌트" : "맞힌 낱말"}`}
      style={{ left: pos.x, top: pos.y, maxHeight: Math.min(POP_H + 160, pos.maxH), "--xwg-c": color?.border }}
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
      ) : solves.length === 0 ? (
        <p className="xw-empty">아직 맞힌 낱말이 없어요.</p>
      ) : (
        <div className="xwg-hintpop-body">
          {solveRows.map((r) => (
            <section key={r.uid} className={`xwg-hintpop-person${r.none ? " none" : ""}`}>
              <h4>
                {r.name}
                <span>{r.none ? `낱말 ${r.list.length}개` : r.list.length ? `맞힘 ${r.list.length}개` : "아직 없음"}</span>
              </h4>
              {r.list.length > 0 && (
                <ol className="xwg-hint-list">
                  {r.list.map((x) => (
                    <li key={x.idx}>
                      <span className="xwg-word-tag">{DIR_LABEL[x.dir]} {x.num}</span>
                      <strong>{x.word || "?"}</strong>
                      {clockOf(x.at) && <span className="xwg-hintpop-time">{clockOf(x.at)}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
          {solves.some((x) => !x.uid) && (
            <p className="xwg-hintpop-foot">'기록 없음'은 누가 맞혔는지 남기기 전에 맞힌 낱말이에요.</p>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
