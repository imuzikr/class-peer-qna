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
// 선(엣지)은 노드 뒤에 깔린 SVG 한 장에 그립니다. 실제 노드 너비로
// 양쪽 측면 중앙을 연결하고, 수평으로 시작하고 끝나는 완만한 곡선을 씁니다.
// 왼쪽 가지의 자식은 오른쪽 면, 오른쪽 가지의 자식은 왼쪽 면에 연결됩니다.
//
// [편집 동작]
//   · 노드를 더블클릭 → 그 노드의 자식 노드를 만들고 바로 편집 상태로
//   · 노드를 우클릭  → 그 노드를 편집 상태로 (내용 입력칸이 뜸)
//   · 선을 클릭      → 그 선(부모→이 노드) 위에 라벨을 입력
//   · 노드를 고르고 아래 막대의 '이미지 넣기' → 그 노드에 그림 한 장
//     (글자 칸에서 붙여넣기로도 됩니다)
// 모두 편집판(onChange가 있을 때)에서만 동작하고, 이미지는 올릴 곳
// (onUploadImage)을 받았을 때만 — 교사의 임시 편집은 저장되지 않는데
// 파일만 Storage에 남으면 주인 없는 파일이 되므로 거기엔 주지 않습니다.
//
// [이미지 미리보기] 어느 층이든 같은 크기(120×90, 가득 채워 자름)입니다.
// 층마다 글자 크기가 달라도 그림 크기까지 달라지면 그림이 중요도처럼
// 읽힙니다. 글자는 그림 아래에 붙고, 그림만 있으면 글자 줄은 비웁니다.
// =============================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  layoutPositions,
  levelMap,
  levelStyle,
  nodeById,
  subtreeIds,
  addChild,
  removeNode,
  updateNodeText,
  updateEdgeLabel,
  getNodeVerticalOffset,
  setNodeVerticalOffset,
  settleNodeVerticalPositions,
  updateNodeImage,
  nodeHasImage,
  mindmapNodeSize,
} from "@/lib/mindmap";
import { IMAGE_ACCEPT } from "@/lib/image";
import { mindmapEdgeGeometry } from "@/lib/mindmapEdges";

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 2.4;
// 자리 맞춤(맞춤 보기)에서 노드가 가장자리에 딱 붙지 않도록 두는 여백
const FIT_PAD = 120;

const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
// 한글 조합을 맺는 Enter/Escape는 편집 종료 단축키로 쓰지 않습니다.
// 일부 브라우저는 조합의 마지막 키에 isComposing 대신 keyCode 229를 줍니다.
const isComposingKey = (event) => event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229;

// transform 뒤의 화면 크기(getBoundingClientRect)가 아니라 배율 1의 실제
// border-box를 잽니다. 위치·선택·확대는 이 크기를 바꾸지 않아 재측정 루프가 없습니다.
function useNodeMeasurements(nodes, editingId, uploadingId) {
  const elements = useRef(new Map());
  const callbacks = useRef(new Map());
  const observerRef = useRef(null);
  const [nodeSizes, setNodeSizes] = useState(() => new Map());
  const measure = useCallback(() => {
    const next = new Map();
    for (const [id, element] of elements.current) {
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (width > 0 && height > 0) next.set(id, { width, height });
    }
    setNodeSizes((previous) => {
      if (previous.size === next.size && [...next].every(([id, size]) => {
        const old = previous.get(id);
        return old?.width === size.width && old?.height === size.height;
      })) return previous;
      return next;
    });
  }, []);
  const nodeRef = useCallback((id) => {
    if (!callbacks.current.has(id)) {
      callbacks.current.set(id, (element) => {
        const previous = elements.current.get(id);
        if (previous) observerRef.current?.unobserve(previous);
        if (element) {
          elements.current.set(id, element);
          observerRef.current?.observe(element);
        } else {
          elements.current.delete(id);
        }
      });
    }
    return callbacks.current.get(id);
  }, []);
  useLayoutEffect(() => {
    measure();
  }, [nodes, editingId, uploadingId, measure]);
  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observerRef.current = observer;
    for (const element of elements.current.values()) observer.observe(element);
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [measure]);
  return { nodeSizes, nodeRef, nodeElements: elements };
}

export default function MindmapCanvas({
  map,
  onChange = null,
  selectedId = null,
  onSelect = null,
  className = "",
  // 형태를 바꾸거나 처음 열 때 화면에 맞춰 다시 잡아 주는 열쇠
  fitKey = "",
  // (file) => Promise<url> — 주면 노드에 이미지를 붙일 수 있습니다
  onUploadImage = null,
}) {
  const readOnly = !onChange;
  const stageRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // 지금 내용을 고치는 중인 노드/선 — 우클릭(노드)·클릭(선)으로 들어갑니다.
  const [editingId, setEditingId] = useState(null);
  const [editingEdgeId, setEditingEdgeId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const editInputRef = useRef(null);
  const edgeInputRef = useRef(null);
  const fileRef = useRef(null);
  // 이미지를 올리는 중인 노드 — 그 노드 자리에 같은 크기의 빈 틀을 둡니다
  const [uploadingId, setUploadingId] = useState(null);
  const [imageError, setImageError] = useState("");
  const canImage = !!onChange && !!onUploadImage;
  // 올리는 동안 학생이 가지를 더하거나 고칠 수 있어, 끝났을 때는 그 순간의
  // 판에 붙여야 합니다(올리기 시작할 때의 map에 붙이면 그 사이 고친 것이 날아감).
  const mapRef = useRef(map);
  mapRef.current = map;

  const { nodeSizes, nodeRef, nodeElements } = useNodeMeasurements(map.nodes, editingId, uploadingId);
  const positions = useMemo(() => layoutPositions(map, { nodeSizes }), [map, nodeSizes]);
  const levels = useMemo(() => levelMap(map.nodes), [map.nodes]);
  const draggedIds = useMemo(() => (
    draggingId ? subtreeIds(map.nodes, draggingId) : new Set()
  ), [draggingId, map.nodes]);
  const edges = useMemo(() => {
    return map.nodes
      .filter((n) => n.parentId !== null)
      .map((n) => {
        const a = positions.get(n.parentId);
        const b = positions.get(n.id);
        if (!a || !b) return null;
        const parent = nodeById(map.nodes, n.parentId);
        return {
          node: n,
          ...mindmapEdgeGeometry(a, b, {
            layout: map.layout,
            parentSize: mindmapNodeSize(parent, levels.get(parent?.id) ?? 0, nodeSizes),
            childSize: mindmapNodeSize(n, levels.get(n.id) ?? 1, nodeSizes),
          }),
        };
      })
      .filter(Boolean);
  }, [map.nodes, map.layout, positions, levels, nodeSizes]);

  // 휠 처리기는 한 번만 붙이고 계속 쓰므로, 그 안에서 최신 배율·이동을 읽으려면
  // state를 그대로 잡아 두면 안 됩니다(처음 값에 묶임). 거울용 ref를 둡니다.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;

  const selected = selectedId ? nodeById(map.nodes, selectedId) : null;
  const pendingFitRef = useRef(true);
  const fitPendingRef = useRef(null);
  const fittedSelectionRef = useRef(null);
  const draggedSelectionRef = useRef(null);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);
  useEffect(() => {
    if (editingEdgeId) edgeInputRef.current?.focus();
  }, [editingEdgeId]);

  // ── 화면에 맞추기 ──
  const fit = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || map.nodes.length === 0) return false;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of map.nodes) {
      const p = positions.get(n.id) ?? { x: 0, y: 0 };
      const size = mindmapNodeSize(n, levels.get(n.id) ?? 1, nodeSizes);
      minX = Math.min(minX, p.x - size.width / 2); maxX = Math.max(maxX, p.x + size.width / 2);
      minY = Math.min(minY, p.y - size.height / 2); maxY = Math.max(maxY, p.y + size.height / 2);
    }
    const w = maxX - minX + FIT_PAD * 2;
    const h = maxY - minY + FIT_PAD * 2;
    const next = clampZoom(Math.min(rect.width / w, rect.height / h, 1));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const nextPan = { x: -cx * next, y: -cy * next };
    // 같은 commit의 선택 노드 따라가기 효과도 새 맞춤 좌표를 읽어야 합니다.
    // state 반영 전의 옛 ref를 읽으면 방금 맞춘 pan을 다시 덮어씁니다.
    zoomRef.current = next;
    panRef.current = nextPan;
    fittedSelectionRef.current = { selectedId, positions };
    setZoom(next);
    setPan(nextPan);
    return true;
  }, [map.nodes, positions, levels, nodeSizes, selectedId]);

  // 먼저 실제 노드를 잰 뒤 처음 열릴 때와 형태가 바뀔 때만 맞춥니다.
  // 편집·이미지 변경으로 크기가 달라져도 전체 판을 다시 맞추지는 않습니다.
  useLayoutEffect(() => {
    pendingFitRef.current = true;
  }, [map.layout, fitKey]);
  fitPendingRef.current = () => {
    if (!pendingFitRef.current) return;
    const measured = map.nodes.every((node) => {
      const element = nodeElements.current.get(node.id);
      const size = nodeSizes.get(node.id);
      return element && size?.width === element.offsetWidth && size?.height === element.offsetHeight;
    });
    if (measured && fit()) pendingFitRef.current = false;
  };
  useLayoutEffect(() => {
    fitPendingRef.current?.();
  }, [map.layout, fitKey, fit]);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return undefined;
    // 접혀 있던 교사·방송 판이 열려 실제 높이를 얻는 경우도 한 번 맞춥니다.
    const observer = new ResizeObserver(() => fitPendingRef.current?.());
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // 고른 노드를 화면 안으로 — 가지를 더하면 새 노드가 부모 바깥쪽에 생겨
  // 판 밖으로 나가는 일이 잦습니다(특히 방사형). 그때마다 전체를 다시 맞추면
  // 그림이 통째로 튀므로, 벗어난 만큼만 살짝 따라갑니다.
  useEffect(() => {
    const fittedSelection = fittedSelectionRef.current;
    fittedSelectionRef.current = null;
    // 맞춤은 전체 노드를 보여 주는 의도적인 이동입니다. 낮은 배율에서는
    // 아래의 화면 여백보다 맞춤 여백이 작아도, 이 맞춤을 다시 밀지 않습니다.
    if (fittedSelection?.selectedId === selectedId && fittedSelection?.positions === positions) return;
    if (!selectedId || dragRef.current || pendingFitRef.current) return;
    // 직접 옮긴 자리에서는 손을 뗀 뒤에도 판을 밀지 않습니다. 다음 선택이나
    // 내용 변경으로 위치가 달라졌을 때부터 다시 화면 안으로 따라갑니다.
    const draggedSelection = draggedSelectionRef.current;
    if (draggedSelection) {
      const p = positions.get(selectedId);
      if (draggedSelection.id === selectedId && p?.x === draggedSelection.x && p?.y === draggedSelection.y) return;
      draggedSelectionRef.current = null;
    }
    const stage = stageRef.current;
    const p = positions.get(selectedId);
    if (!stage || !p) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0) return;
    const z = zoomRef.current;
    const { x: px, y: py } = panRef.current;
    const sx = px + p.x * z; // 판 가운데를 0으로 본 노드의 화면 위치
    const sy = py + p.y * z;
    const node = nodeById(map.nodes, selectedId);
    const size = mindmapNodeSize(node, levels.get(selectedId) ?? 1, nodeSizes);
    const marginX = Math.max(0, rect.width / 2 - size.width * z / 2 - 24);
    const marginY = Math.max(0, rect.height / 2 - size.height * z / 2 - 24);
    let nx = px;
    let ny = py;
    if (sx > marginX) nx = px - (sx - marginX);
    else if (sx < -marginX) nx = px + (-marginX - sx);
    if (sy > marginY) ny = py - (sy - marginY);
    else if (sy < -marginY) ny = py + (-marginY - sy);
    if (nx !== px || ny !== py) setPan({ x: nx, y: ny });
  }, [selectedId, positions, map.nodes, levels, nodeSizes]);

  // ── 휠 확대/축소 — 손가락(커서) 아래 지점을 붙잡은 채로 키웁니다 ──
  // React의 onWheel은 기본이 passive라 preventDefault가 통하지 않아,
  // 판이 확대될 때 페이지까지 같이 스크롤됩니다. 그래서 직접 붙입니다.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function onWheel(e) {
      e.preventDefault();
      if (dragRef.current?.kind === "node") return;
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
    if (e.target.closest(".mm-edge-label")) return;
    setEditingId(null);
    setEditingEdgeId(null);
    if (onSelect) onSelect(null);
    dragRef.current = { kind: "pan", pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  // ── 노드 끌기 / 선택 — 각 가지의 세로 간격을 직접 조정합니다 ──
  function onNodePointerDown(e, node) {
    if (e.target.tagName === "INPUT") return; // 편집 입력칸 안의 클릭은 그대로 둡니다
    if (e.target.closest?.(".mm-node-imgbtn")) return; // 노드 위 '이미지' 단추
    if (editingEdgeId) setEditingEdgeId(null);
    if (editingId && editingId !== node.id) setEditingId(null);
    if (onSelect) onSelect(node.id);
    // 끌기는 왼쪽 단추로만 — 오른쪽 단추(우클릭 = 글자 고치기)까지 끌기를
    // 시작하면 포인터를 붙잡아 두어, 누르는 사이 손이 조금만 움직여도 노드가
    // 딸려 오고 그때마다 판을 다시 저장합니다. 윈도는 contextmenu가 손을 뗀
    // 뒤에 와서 고치기 칸이 그만큼 늦게 뜹니다. 맥의 Ctrl+클릭도 우클릭이라
    // (단추는 왼쪽으로 옵니다) 함께 거릅니다.
    if (e.button !== 0 || e.ctrlKey) return;
    if (readOnly || editingId === node.id) return;
    const lv = levels.get(node.id) ?? 0;
    if (lv === 0) return;
    if (map.layout !== "radial" && map.layout !== "tree") return;
    e.stopPropagation();
    const p = positions.get(node.id) ?? { x: 0, y: 0 };
    dragRef.current = {
      kind: "node",
      pointerId: e.pointerId,
      id: node.id,
      layout: map.layout,
      level: lv,
      sx: e.clientX,
      sy: e.clientY,
      zoom: zoomRef.current,
      originX: p.x,
      originY: p.y,
      startOffset: getNodeVerticalOffset(map, node),
      moved: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  // 더블클릭 — 자식 노드를 만들고 바로 편집 상태로
  function onNodeDoubleClick(e, node) {
    if (readOnly || editingId === node.id) return;
    e.stopPropagation();
    const next = addChild(map, node.id, "");
    const child = next.nodes[next.nodes.length - 1];
    onChange(next);
    onSelect?.(child.id);
    setEditingEdgeId(null);
    setEditingId(child.id);
  }

  // 우클릭 — 이 노드를 편집 상태로
  function onNodeContextMenu(e, node) {
    e.preventDefault();
    if (readOnly) return;
    e.stopPropagation();
    onSelect?.(node.id);
    setEditingEdgeId(null);
    setEditingId(node.id);
  }

  function startEdgeEdit(e, childId) {
    e.stopPropagation();
    if (readOnly) return;
    setEditingId(null);
    setEditingEdgeId(childId);
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.kind === "pan") {
      setPan({ x: d.ox + dx, y: d.oy + dy });
    } else if (d.kind === "node") {
      const currentMap = mapRef.current;
      if (readOnly || currentMap.layout !== d.layout || !nodeById(currentMap.nodes, d.id)) {
        onPointerUp(e);
        return;
      }
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return; // 살짝 눌린 것은 클릭으로
      d.moved = true;
      setDraggingId(d.id);
      // 자동 배치의 저장 y는 표시 자리와 다를 수 있습니다. 기존 보정량에
      // 포인터가 움직인 만큼만 더하고, 항상 최신 판에 적용해 업로드·글자를 지킵니다.
      let next = setNodeVerticalOffset(currentMap, d.id, d.startOffset + dy / d.zoom);
      if (d.layout === "radial" && d.level === 1) {
        next = {
          ...next,
          nodes: next.nodes.map((node) => node.id === d.id ? { ...node, x: d.originX + dx / d.zoom } : node),
        };
      }
      mapRef.current = next;
      onChange(next);
    }
  }

  function onPointerUp(e) {
    const d = dragRef.current;
    if (!d || (e && d.pointerId !== e.pointerId)) return;
    if (d.kind === "node" && d.moved) {
      if (!readOnly && mapRef.current.layout === d.layout) {
        // 충돌 보정 뒤 화면에 놓인 자리를 다음 끌기의 기준으로 저장합니다.
        // 그래야 이웃에 닿았던 가지도 다음에는 움직인 만큼 바로 따라옵니다.
        const settled = settleNodeVerticalPositions(mapRef.current, { nodeSizes });
        if (settled !== mapRef.current) {
          mapRef.current = settled;
          onChange(settled);
        }
      }
      const p = layoutPositions(mapRef.current, { nodeSizes }).get(d.id);
      if (p) draggedSelectionRef.current = { id: d.id, ...p };
    }
    dragRef.current = null;
    setDraggingId(null);
  }

  async function attachImage(nodeId, file) {
    if (!canImage || !file || uploadingId) return;
    if (!/^image\//.test(file.type || "")) {
      setImageError("이미지 파일만 붙일 수 있어요.");
      return;
    }
    setImageError("");
    setUploadingId(nodeId);
    try {
      const url = await onUploadImage(file);
      if (nodeById(mapRef.current.nodes, nodeId)) {
        onChange(updateNodeImage(mapRef.current, nodeId, url));
      }
    } catch {
      setImageError("이미지를 올리지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setUploadingId(null);
    }
  }

  function pickImage() {
    if (!selected || uploadingId) return;
    fileRef.current?.click();
  }

  const canDragNodes = !readOnly && (map.layout === "radial" || map.layout === "tree");

  return (
    <div className={`mm-stage${className ? ` ${className}` : ""}`}>
      <div
        ref={stageRef}
        className="mm-viewport"
        onPointerDown={onStagePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
      >
        <div
          className="mm-world"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {/* 선 — 노드 뒤에 깔립니다. 좌표가 음수일 수 있어 넉넉한 판을 잡습니다.
              편집판에서는 선마다 굵은 투명 선을 하나 더 깔아 클릭 폭을 넓힙니다
              (실제 선은 1~3px라 그대로면 정확히 못 눌러 라벨을 못 답니다). */}
          <svg className="mm-edges" viewBox="-3000 -3000 6000 6000" aria-hidden="true">
            {edges.map(({ node: n, d }) => {
              const lv = levels.get(n.id) ?? 1;
              const isDraggedEdge = draggedIds.has(n.id);
              return (
                <g key={n.id}>
                  {!readOnly && (
                    <path
                      d={d}
                      className="mm-edge-hit"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => startEdgeEdit(e, n.id)}
                    />
                  )}
                  <path
                    className={`mm-edge${isDraggedEdge ? " dragging" : ""}`}
                    data-mindmap-edge-id={n.id}
                    data-mindmap-parent-id={n.parentId}
                    d={d}
                    stroke={levelStyle(lv).border}
                    strokeWidth={Math.max(1.6, 3.2 - lv * 0.4)}
                  />
                </g>
              );
            })}
          </svg>

          {/* 선 위 라벨 — 곡선의 가운데 점에 둡니다. 보기 전용에서는 라벨이
              있는 선만, 편집판에서는 전부(빈 선은 옅은 + 표시) 보여 줍니다. */}
          {edges.map(({ node: n, mid }) => {
            const hasLabel = !!n.edgeLabel?.trim();
            if (readOnly && !hasLabel) return null;
            const isEditing = editingEdgeId === n.id;
            return (
              <div
                key={`el-${n.id}`}
                className={`mm-edge-label${hasLabel ? "" : " empty"}${isEditing ? " editing" : ""}`}
                data-mindmap-edge-label-id={n.id}
                style={{ left: mid.x, top: mid.y }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => startEdgeEdit(e, n.id)}
              >
                {isEditing ? (
                  <input
                    ref={edgeInputRef}
                    className="mm-edge-input"
                    value={n.edgeLabel ?? ""}
                    placeholder="선 위 글자"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onChange(updateEdgeLabel(map, n.id, e.target.value))}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (isComposingKey(e)) return;
                      if (e.key === "Enter" || e.key === "Escape") {
                        e.preventDefault();
                        setEditingEdgeId(null);
                      }
                    }}
                    onBlur={() => setEditingEdgeId(null)}
                    maxLength={24}
                  />
                ) : (
                  hasLabel ? n.edgeLabel : "+"
                )}
              </div>
            );
          })}

          {map.nodes.map((n) => {
            const p = positions.get(n.id) ?? { x: 0, y: 0 };
            const lv = levels.get(n.id) ?? 0;
            const s = levelStyle(lv);
            const isSel = selectedId === n.id;
            const isEditing = editingId === n.id;
            const isDraggedRoot = draggingId === n.id;
            const isDraggedChild = !isDraggedRoot && draggedIds.has(n.id);
            const canDrag = canDragNodes && lv > 0 && !isEditing;
            const hasImg = nodeHasImage(n);
            const isUploading = uploadingId === n.id;
            return (
              <div
                key={n.id}
                ref={nodeRef(n.id)}
                data-mindmap-node-id={n.id}
                className={`mm-node${isSel ? " sel" : ""}${lv === 0 ? " root" : ""}${
                  isEditing ? " editing" : ""
                }${canDrag ? " draggable" : ""}${isDraggedRoot ? " dragging" : ""}${
                  hasImg || isUploading ? " has-img" : ""
                }${
                  isDraggedChild ? " drag-child" : ""
                }`}
                style={{
                  left: p.x,
                  top: p.y,
                  background: s.bg,
                  borderColor: isSel ? "var(--primary)" : s.border,
                  color: s.text,
                  ...(isDraggedRoot || isDraggedChild ? { zIndex: 5 } : {}),
                  ...(isEditing ? { width: lv === 0 ? 200 : 168 } : {}),
                }}
                onPointerDown={(e) => onNodePointerDown(e, n)}
                onDoubleClick={(e) => onNodeDoubleClick(e, n)}
                onContextMenu={(e) => onNodeContextMenu(e, n)}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onKeyDown={
                  onSelect
                    ? (e) => {
                        if (e.target !== e.currentTarget || isComposingKey(e)) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(n.id);
                        }
                      }
                    : undefined
                }
              >
                {/* 고른 노드 위의 '이미지' 단추 — 아래 막대에도 같은 단추가 있지만
                    판이 화면 높이를 거의 다 써서 막대가 화면 밖에 있기 쉽습니다
                    (실제로 '노드를 눌러도 이미지 넣기가 안 생긴다'는 신고).
                    누른 자리에서 바로 닿게 노드 모서리에 붙여 둡니다. */}
                {canImage && isSel && !isEditing && (
                  <button
                    type="button"
                    className="mm-node-imgbtn"
                    onPointerDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      pickImage();
                    }}
                    disabled={!!uploadingId}
                    title={hasImg ? "이미지 바꾸기" : "이미지 넣기"}
                    aria-label={hasImg ? "이미지 바꾸기" : "이미지 넣기"}
                  >
                    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
                      <rect x="2.5" y="4" width="15" height="12" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                      <circle cx="7.2" cy="8.2" r="1.5" fill="currentColor" />
                      <path d="M3.5 14.5l4.2-4 3 2.8 2.3-2.1 3.5 3.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
                {/* 미리보기 — 어느 층이든 같은 크기(CSS .mm-node-img) */}
                {isUploading ? (
                  <span className="mm-node-img mm-node-img--loading">올리는 중…</span>
                ) : hasImg ? (
                  <img className="mm-node-img" src={n.image} alt={n.text || "노드 이미지"} draggable={false} />
                ) : null}
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    className="mm-node-input"
                    value={n.text}
                    placeholder={n.parentId === null ? "가운데 주제" : "가지에 담을 내용"}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onChange(updateNodeText(map, n.id, e.target.value))}
                    onKeyDown={(e) => {
                      // 입력칸의 Space가 노드 선택 키로 올라가면 공백이 사라집니다.
                      e.stopPropagation();
                      if (isComposingKey(e)) return;
                      if (e.key === "Enter" || e.key === "Escape") {
                        e.preventDefault();
                        setEditingId(null);
                      }
                    }}
                    onPaste={(e) => {
                      // 글자 칸에 그림을 붙여 넣으면 그 노드의 이미지로
                      if (!canImage) return;
                      const f = [...(e.clipboardData?.files ?? [])].find((x) => /^image\//.test(x.type));
                      if (!f) return;
                      e.preventDefault();
                      attachImage(n.id, f);
                    }}
                    onBlur={() => setEditingId(null)}
                    maxLength={60}
                  />
                ) : n.text.trim() ? (
                  <span className="mm-node-text">{n.text}</span>
                ) : hasImg || isUploading ? null : (
                  <em className="mm-node-empty">내용을 적어 주세요</em>
                )}
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

      {/* 편집 막대 — 이제 만들기·고치기는 노드 위 동작(더블클릭·우클릭)으로
          하므로, 여기는 지우기와 안내만 남깁니다. */}
      {!readOnly && (
        <div className="mm-bar">
          {selected ? (
            <>
            {canImage && (
              <>
                <button
                  type="button"
                  className="btn-ghost mm-bar-img"
                  onClick={pickImage}
                  disabled={!!uploadingId}
                  title="이 노드에 그림 한 장을 붙입니다 (글자 칸에 붙여넣기로도 돼요)"
                >
                  {uploadingId ? "올리는 중…" : nodeHasImage(selected) ? "이미지 바꾸기" : "이미지 넣기"}
                </button>
                {nodeHasImage(selected) && (
                  <button
                    type="button"
                    className="btn-ghost mm-bar-img"
                    disabled={!!uploadingId}
                    onClick={() => onChange(updateNodeImage(map, selected.id, ""))}
                  >
                    이미지 빼기
                  </button>
                )}
              </>
            )}
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
            {imageError ? (
              <span className="mm-bar-hint mm-bar-error" role="alert">{imageError}</span>
            ) : (
              <span className="mm-bar-hint">
                {canDragNodes && "가지를 위아래로 끌어 원하는 간격으로 놓아요. 딸린 가지도 함께 움직여요. "}
                글자는 마우스 오른쪽 버튼으로 고쳐요.
                {canImage && " 그림은 ‘이미지 넣기’로 붙여요. 글자와 그림 중 하나만 있어도 돼요."}
              </span>
            )}
            </>
          ) : (
            <span className="mm-bar-hint">
              노드를 더블클릭하면 가지가 생기고, 마우스 오른쪽 버튼을 누르면 내용을 고칠 수 있어요.
              선을 클릭하면 선 위에 글자를 넣을 수 있어요.
              {canDragNodes && " 가지를 위아래로 끌어 원하는 간격으로 놓을 수 있어요. 딸린 가지도 함께 움직여요."}
              {canImage && " 노드를 누르면 모서리에 생기는 그림 단추로 이미지도 넣을 수 있어요."}
            </span>
          )}
          {canImage && (
            <input
              ref={fileRef}
              type="file"
              accept={IMAGE_ACCEPT}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = ""; // 같은 파일을 다시 골라도 change가 오게
                if (f && selected) attachImage(selected.id, f);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
