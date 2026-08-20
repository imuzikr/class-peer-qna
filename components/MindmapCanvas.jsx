"use client";

// =============================================================
// 마인드맵 판 — 학생 편집 · 교사 열람 · 방송 화면이 함께 쓰는 렌더러
// -------------------------------------------------------------
// onChange를 주면 편집판, 안 주면 보기 전용입니다. 세 화면이 같은 그림을
// 그려야 해서(교사가 보는 것과 학생이 만든 것이 달라 보이면 안 되므로)
// 그리는 코드는 여기 한 곳에만 둡니다.
//
// [좌표계]
// 노드의 x·y는 '판 위의 좌표'이고, 뿌리가 (0,0)입니다. 화면에 놓을 때는
//     화면좌표 = 판 가운데 + 이동(pan) + 좌표 × 배율(zoom)
// 로 옮깁니다. 판(.mm-world)을 판 가운데에 놓고 transform으로 한 번에
// 옮기고 키우므로, 노드마다 따로 계산할 필요가 없습니다.
//
// 선(엣지)은 노드 뒤에 깔린 SVG 한 장에 그립니다. 노드 배경이 불투명해서
// 선을 노드 '가운데에서 가운데로' 그어도 겹치는 부분은 노드에 가려집니다
// — 덕분에 노드의 정확한 크기를 몰라도 선이 깔끔하게 붙습니다.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  layoutPositions,
  levelMap,
  levelStyle,
  nodeById,
  addChild,
  removeNode,
  updateNodeText,
  moveNode,
} from "@/lib/mindmap";

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.4;
// 자리 맞춤(맞춤 보기)에서 노드가 가장자리에 딱 붙지 않도록 두는 여백
const FIT_PAD = 120;

const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

// 두 점을 잇는 선. 계층형은 가로로 흐르는 곡선, 방사형은 곧은 선이
// 뻗어 나가는 느낌을 살립니다.
function edgePath(a, b, layout) {
  if (layout === "tree") {
    const dx = Math.max(30, Math.abs(b.x - a.x) / 2);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}

export default function MindmapCanvas({
  map,
  onChange = null,
  selectedId = null,
  onSelect = null,
  className = "",
  // 형태를 바꾸거나 처음 열 때 화면에 맞춰 다시 잡아 주는 열쇠
  fitKey = "",
}) {
  const readOnly = !onChange;
  const stageRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const positions = useMemo(() => layoutPositions(map), [map]);
  const levels = useMemo(() => levelMap(map.nodes), [map.nodes]);

  // 휠 처리기는 한 번만 붙이고 계속 쓰므로, 그 안에서 최신 배율·이동을 읽으려면
  // state를 그대로 잡아 두면 안 됩니다(처음 값에 묶임). 거울용 ref를 둡니다.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;

  const selected = selectedId ? nodeById(map.nodes, selectedId) : null;

  // ── 화면에 맞추기 ──
  const fit = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || map.nodes.length === 0) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of map.nodes) {
      const p = positions.get(n.id) ?? { x: 0, y: 0 };
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const w = maxX - minX + FIT_PAD * 2;
    const h = maxY - minY + FIT_PAD * 2;
    const next = clampZoom(Math.min(rect.width / w, rect.height / h, 1));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setZoom(next);
    setPan({ x: -cx * next, y: -cy * next });
  }, [map.nodes, positions]);

  // 처음 열릴 때와 형태가 바뀔 때만 맞춥니다(가지를 더할 때마다 튀지 않도록).
  useEffect(() => {
    const t = setTimeout(fit, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.layout, fitKey]);

  // 고른 노드를 화면 안으로 — 가지를 더하면 새 노드가 부모 바깥쪽에 생겨
  // 판 밖으로 나가는 일이 잦습니다(특히 방사형). 그때마다 전체를 다시 맞추면
  // 그림이 통째로 튀므로, 벗어난 만큼만 살짝 따라갑니다.
  useEffect(() => {
    if (!selectedId || dragRef.current) return;
    const stage = stageRef.current;
    const p = positions.get(selectedId);
    if (!stage || !p) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0) return;
    const z = zoomRef.current;
    const { x: px, y: py } = panRef.current;
    const sx = px + p.x * z; // 판 가운데를 0으로 본 노드의 화면 위치
    const sy = py + p.y * z;
    const marginX = Math.max(40, rect.width / 2 - 130);
    const marginY = Math.max(40, rect.height / 2 - 80);
    let nx = px;
    let ny = py;
    if (sx > marginX) nx = px - (sx - marginX);
    else if (sx < -marginX) nx = px + (-marginX - sx);
    if (sy > marginY) ny = py - (sy - marginY);
    else if (sy < -marginY) ny = py + (-marginY - sy);
    if (nx !== px || ny !== py) setPan({ x: nx, y: ny });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, positions]);

  // ── 휠 확대/축소 — 손가락(커서) 아래 지점을 붙잡은 채로 키웁니다 ──
  // React의 onWheel은 기본이 passive라 preventDefault가 통하지 않아,
  // 판이 확대될 때 페이지까지 같이 스크롤됩니다. 그래서 직접 붙입니다.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function onWheel(e) {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const sx = e.clientX - rect.left - rect.width / 2;
      const sy = e.clientY - rect.top - rect.height / 2;
      const z = zoomRef.current;
      const p = panRef.current;
      const next = clampZoom(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
      if (next === z) return;
      const mx = (sx - p.x) / z; // 커서 아래의 판 좌표
      const my = (sy - p.y) / z;
      setPan({ x: sx - mx * next, y: sy - my * next });
      setZoom(next);
    }
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  // 버튼 확대/축소는 판 가운데를 기준으로
  function zoomBy(factor) {
    const next = clampZoom(zoom * factor);
    if (next === zoom) return;
    const k = next / zoom;
    setPan((p) => ({ x: p.x * k, y: p.y * k }));
    setZoom(next);
  }

  // ── 판 끌기(이동) ──
  const dragRef = useRef(null);
  function onStagePointerDown(e) {
    // 노드를 누른 경우는 노드 쪽에서 처리합니다
    if (e.target.closest(".mm-node")) return;
    // 확대/축소 단추는 판 위에 얹혀 있어 여기까지 이벤트가 올라옵니다. 그대로
    // 두면 판 끌기가 시작되면서 포인터를 가로채(setPointerCapture) 단추의
    // click이 아예 발생하지 않습니다 — 버튼이 안 눌리던 원인이었습니다.
    if (e.target.closest(".mm-zoom")) return;
    if (onSelect) onSelect(null);
    dragRef.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  // ── 노드 끌기(방사형 편집판만) ──
  function onNodePointerDown(e, node) {
    if (onSelect) onSelect(node.id);
    if (readOnly || map.layout !== "radial") return;
    e.stopPropagation();
    const p = positions.get(node.id) ?? { x: 0, y: 0 };
    dragRef.current = {
      kind: "node",
      id: node.id,
      sx: e.clientX,
      sy: e.clientY,
      ox: p.x,
      oy: p.y,
      moved: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.kind === "pan") {
      setPan({ x: d.ox + dx, y: d.oy + dy });
    } else if (d.kind === "node") {
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return; // 살짝 눌린 것은 클릭으로
      d.moved = true;
      onChange(moveNode(map, d.id, d.ox + dx / zoom, d.oy + dy / zoom));
    }
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  const canDragNodes = !readOnly && map.layout === "radial";

  return (
    <div className={`mm-stage${className ? ` ${className}` : ""}`}>
      <div
        ref={stageRef}
        className={`mm-viewport${canDragNodes ? " draggable" : ""}`}
        onPointerDown={onStagePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="mm-world"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {/* 선 — 노드 뒤에 깔립니다. 좌표가 음수일 수 있어 넉넉한 판을 잡습니다 */}
          <svg className="mm-edges" viewBox="-3000 -3000 6000 6000" aria-hidden="true">
            {map.nodes.map((n) => {
              if (n.parentId === null) return null;
              const a = positions.get(n.parentId);
              const b = positions.get(n.id);
              if (!a || !b) return null;
              const lv = levels.get(n.id) ?? 1;
              return (
                <path
                  key={n.id}
                  className="mm-edge"
                  d={edgePath(a, b, map.layout)}
                  stroke={levelStyle(lv).border}
                  strokeWidth={Math.max(1.6, 3.2 - lv * 0.4)}
                />
              );
            })}
          </svg>

          {map.nodes.map((n) => {
            const p = positions.get(n.id) ?? { x: 0, y: 0 };
            const lv = levels.get(n.id) ?? 0;
            const s = levelStyle(lv);
            const isSel = selectedId === n.id;
            return (
              <div
                key={n.id}
                className={`mm-node${isSel ? " sel" : ""}${lv === 0 ? " root" : ""}`}
                style={{
                  left: p.x,
                  top: p.y,
                  background: s.bg,
                  borderColor: isSel ? "var(--primary)" : s.border,
                  color: s.text,
                }}
                onPointerDown={(e) => onNodePointerDown(e, n)}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onKeyDown={
                  onSelect
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(n.id);
                        }
                      }
                    : undefined
                }
              >
                {n.text.trim() ? n.text : <em className="mm-node-empty">내용을 적어 주세요</em>}
              </div>
            );
          })}
        </div>

        {/* 확대/축소 — 판 위에 떠 있어 배율이 바뀌어도 크기가 그대로입니다 */}
        <div className="mm-zoom">
          <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="축소">－</button>
          <span className="mm-zoom-val">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => zoomBy(1.2)} aria-label="확대">＋</button>
          <button type="button" className="mm-zoom-fit" onClick={fit}>맞춤</button>
        </div>
      </div>

      {/* 편집 막대 — 고른 노드의 글을 고치고 가지를 더합니다.
          노드 옆에 두면 축소했을 때 같이 작아져 못 누르므로 판 아래에 고정합니다 */}
      {!readOnly && (
        <div className="mm-bar">
          {selected ? (
            <>
              <label className="sr-only" htmlFor="mm-node-text">노드 내용</label>
              <input
                id="mm-node-text"
                className="mm-bar-input"
                type="text"
                value={selected.text}
                placeholder={selected.parentId === null ? "가운데 주제" : "가지에 담을 내용"}
                onChange={(e) => onChange(updateNodeText(map, selected.id, e.target.value))}
                maxLength={60}
              />
              <button
                type="button"
                className="btn-primary mm-bar-add"
                onClick={() => {
                  const next = addChild(map, selected.id, "");
                  onChange(next);
                  onSelect?.(next.nodes[next.nodes.length - 1].id);
                }}
              >
                ＋ 가지 추가
              </button>
              <button
                type="button"
                className="btn-ghost mm-bar-del"
                disabled={selected.parentId === null}
                title={
                  selected.parentId === null
                    ? "가운데 주제는 지울 수 없어요"
                    : "이 가지와 딸린 가지를 모두 지웁니다"
                }
                onClick={() => {
                  onChange(removeNode(map, selected.id));
                  onSelect?.(null);
                }}
              >
                지우기
              </button>
            </>
          ) : (
            <span className="mm-bar-hint">
              노드를 누르면 내용을 고치고 가지를 더할 수 있어요.
              {map.layout === "radial" && " 노드를 끌어 자리를 옮길 수도 있어요."}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
