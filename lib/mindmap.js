// =============================================================
// 마인드맵 활동 — 자료 구조와 배치 계산
// -------------------------------------------------------------
// 곁텍스트 읽기·RAFT·KWLS와 같은 개인 활동이라 저장 위치도 같습니다
// (bookActivities/{actId}/entries/{uid}). answers에 담기는 모양만 다릅니다.
//
//   answers = { layout: 'radial' | 'tree', verticalGap: 20, nodes: [...] }
//   node    = { id, parentId, text, x, y, edgeLabel, image }
//
// [이미지] 노드마다 그림 한 장(`image` — 내려받기 주소 한 줄)을 붙일 수
// 있습니다. 글자와 함께 둘 수도, 그림만 둘 수도 있습니다. 판에는 어느
// 층이든 **같은 크기의 미리보기**(MINDMAP_IMAGE_W × _H, 가득 채워 자름)로
// 그립니다 — 층마다 글자 크기가 달라도 그림 크기까지 달라지면 그림이
// 중요도처럼 읽힙니다. 파일은 Storage에 두고 여기엔 주소만 적습니다
// (문서 1MB 한도). 데모 모드는 data URL이 그대로 들어옵니다.
//
// [엣지를 따로 저장하지 않는 이유]
// 마인드맵의 선은 '부모-자식'을 잇는 것뿐이라, parentId만 있으면 선은 그때그때
// 그려낼 수 있습니다. 엣지를 따로 저장하면 노드를 지웠는데 선만 남는 식으로
// 둘이 어긋날 수 있어, 하나의 출처(parentId)만 두었습니다.
//
// 선 위에 쓰는 글자(edgeLabel)도 같은 이유로 엣지가 아니라 '그 선이 향하는
// 자식 노드'에 실어 둡니다 — 부모→이 노드로 가는 선은 이 노드가 생길 때
// 함께 생기고 이 노드가 지워질 때 함께 사라지므로, 노드 하나에만 붙여 둬도
// 선과 라벨이 어긋날 일이 없습니다. 뿌리는 들어오는 선이 없어 의미가 없습니다.
//
// x·y는 예전 방사형 자리와 가지 순서를 보존합니다. 위아래로 끈 거리는
// radialOffsetY·treeOffsetY에 따로 둡니다. 자동 배치를 기준으로 이 값과
// 조상들의 값을 더하므로 다른 형제를 다시 가운데로 모으지 않습니다.
// =============================================================

export const MINDMAP_LAYOUTS = [
  {
    key: "radial",
    ko: "방사형",
    hint: "가운데에서 양옆으로 뻗어요. 가지를 위아래로 끌어 각각의 간격을 조절해요.",
  },
  {
    key: "tree",
    ko: "계층형",
    hint: "왼쪽에서 오른쪽으로 층층이 뻗어요. 가지를 위아래로 끌어 각각의 간격을 조절해요.",
  },
];

export const ROOT_ID = "root";

// 같은 층·이웃 가지 사이의 세로 여백 — 확대 배율을 뺀 CSS px입니다.
export const MINDMAP_VERTICAL_GAP = Object.freeze({ min: 12, max: 120, default: 20, step: 4 });

export function normalizeVerticalGap(raw) {
  return Number.isFinite(raw)
    ? Math.max(MINDMAP_VERTICAL_GAP.min, Math.min(MINDMAP_VERTICAL_GAP.max, raw))
    : MINDMAP_VERTICAL_GAP.default;
}

// 잘못된 저장 값과 지나치게 큰 수가 배치 계산을 무한대로 만들지 않게 합니다.
// 이 값은 확대 배율과 관계없는 판의 CSS px입니다.
const MAX_VERTICAL_OFFSET = 1_000_000;
function normalizeVerticalOffset(raw) {
  return Number.isFinite(raw) ? Math.max(-MAX_VERTICAL_OFFSET, Math.min(MAX_VERTICAL_OFFSET, raw)) : 0;
}

function verticalOffsetField(layout) {
  return layout === "tree" ? "treeOffsetY" : "radialOffsetY";
}

export function getNodeVerticalOffset(map, nodeOrId) {
  const node = typeof nodeOrId === "string" ? nodeById(map?.nodes ?? [], nodeOrId) : nodeOrId;
  return normalizeVerticalOffset(node?.[verticalOffsetField(map?.layout)]);
}

export function setNodeVerticalOffset(map, id, value) {
  const node = nodeById(map?.nodes ?? [], id);
  if (!node || node.parentId === null) return map;
  const field = verticalOffsetField(map.layout);
  const offset = normalizeVerticalOffset(value);
  if (node[field] === offset) return map;
  return { ...map, nodes: map.nodes.map((n) => n.id === id ? { ...n, [field]: offset } : n) };
}

// 끌기를 마치면 충돌 때문에 보정된 화면 위치를 다음 끌기의 기준으로 삼습니다.
// 부모와의 상대 거리로 저장해야 조상의 이동량이 자식에게 중복되지 않습니다.
export function settleNodeVerticalPositions(map, { nodeSizes = null } = {}) {
  if (!Array.isArray(map?.nodes) || map.nodes.length === 0) return map;
  const field = verticalOffsetField(map.layout);
  const actual = layoutPositions(map, { nodeSizes });
  const automatic = layoutPositions({ ...map,
    nodes: map.nodes.map((n) => ({ ...n, [field]: 0 })) }, { nodeSizes });
  const forest = layoutForest(map.nodes);
  const parents = new Map();
  for (const [parentId, children] of forest.children) {
    for (const child of children) parents.set(child.id, parentId);
  }
  let changed = false;
  const nodes = map.nodes.map((node) => {
    const parentId = parents.get(node.id);
    if (parentId === undefined) return node;
    const offset = normalizeVerticalOffset(
      (actual.get(node.id).y - actual.get(parentId).y) -
      (automatic.get(node.id).y - automatic.get(parentId).y));
    if (node[field] === offset || (node[field] === undefined && offset === 0)) return node;
    changed = true;
    return { ...node, [field]: offset };
  });
  if (!changed) return map;
  const settled = { ...map, nodes };
  const positions = layoutPositions(settled, { nodeSizes });
  // 잘못된 숲의 뿌리 이동 등 상대 이동량만으로 표현할 수 없는 경우에도
  // 손을 놓는 순간 화면이 달라지지 않도록 기존 값을 유지합니다.
  for (const [id, position] of actual) {
    const next = positions.get(id);
    if (!Number.isFinite(next?.x) || !Number.isFinite(next?.y) ||
        Math.abs(next.x - position.x) > 1e-7 || Math.abs(next.y - position.y) > 1e-7) return map;
  }
  return settled;
}

// 노드 이미지 미리보기 — 모든 노드가 같은 크기입니다(CSS .mm-node-img와 같은 값).
export const MINDMAP_IMAGE_W = 120;
export const MINDMAP_IMAGE_H = 90;

// 저장된 이미지 주소를 받아도 되는지 — https 주소나 데모의 이미지 data URL만.
// 방송 문서로도 건너가 남의 화면에 그려지는 값이라 javascript: 따위는 걸러 둡니다.
export function safeNodeImage(raw) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (/^https:\/\//i.test(s)) return s;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(s)) return s;
  return "";
}

// 계층별 배경색 — 깊이가 한눈에 보이도록 층마다 다른 색을 씁니다.
// 뿌리만 꽉 찬 색이고, 아래로 갈수록 옅은 색이라 글씨가 잘 읽힙니다.
export const LEVEL_STYLES = [
  { bg: "#d97757", border: "#b85c3f", text: "#ffffff" }, // 0 — 뿌리(주제)
  { bg: "#f8ece5", border: "#e0a98f", text: "#a84f30" }, // 1
  { bg: "#eaf4ee", border: "#a9d3ba", text: "#2f6f57" }, // 2
  { bg: "#eef1f9", border: "#b9c6e4", text: "#3f5a8a" }, // 3
  { bg: "#faf1dd", border: "#e6d3a8", text: "#8a6a2f" }, // 4
  { bg: "#f3eef8", border: "#cfc0e0", text: "#6b4f8a" }, // 5 이상
];

export function levelStyle(level) {
  return LEVEL_STYLES[Math.min(Math.max(level, 0), LEVEL_STYLES.length - 1)];
}

export function emptyMindmap(topic = "", verticalGap = MINDMAP_VERTICAL_GAP.default) {
  return {
    layout: "radial",
    verticalGap: normalizeVerticalGap(verticalGap),
    nodes: [{ id: ROOT_ID, parentId: null, text: topic || "주제", x: 0, y: 0,
      radialOffsetY: 0, treeOffsetY: 0 }],
  };
}

// 저장된 값을 그릴 수 있는 모양으로 손질합니다. 예전 기록이나 빈 값이 와도
// 화면이 깨지지 않도록, 뿌리가 없으면 만들어 주고 형태 값도 바로잡습니다.
export function normalizeMindmap(raw, topic = "") {
  const layout = raw?.layout === "tree" ? "tree" : "radial";
  const verticalGap = normalizeVerticalGap(raw?.verticalGap);
  const list = Array.isArray(raw?.nodes) ? raw.nodes : [];
  const nodes = list
    .filter((n) => n && typeof n.id === "string")
    .map((n) => ({
      id: n.id,
      parentId: typeof n.parentId === "string" ? n.parentId : null,
      text: typeof n.text === "string" ? n.text : "",
      x: Number.isFinite(n.x) ? n.x : null,
      y: Number.isFinite(n.y) ? n.y : null,
      radialOffsetY: normalizeVerticalOffset(n.radialOffsetY),
      treeOffsetY: normalizeVerticalOffset(n.treeOffsetY),
      edgeLabel: typeof n.edgeLabel === "string" ? n.edgeLabel : "",
      image: safeNodeImage(n.image),
    }));
  if (nodes.length === 0) return emptyMindmap(topic, verticalGap);
  // 뿌리(부모 없는 노드)가 하나도 없으면 첫 노드를 뿌리로 삼습니다.
  if (!nodes.some((n) => n.parentId === null)) nodes[0] = { ...nodes[0], parentId: null };
  return { layout, verticalGap, nodes };
}

export function nodeById(nodes, id) {
  return nodes.find((n) => n.id === id) ?? null;
}

export function childrenOf(nodes, id) {
  return nodes.filter((n) => n.parentId === id);
}

// 노드별 깊이(뿌리=0). 부모 관계가 꼬여 고리가 생겨도 멈추도록 방문 표시를 씁니다.
export function levelMap(nodes) {
  const kids = new Map();
  const roots = [];
  for (const n of nodes) {
    if (n.parentId === null) roots.push(n);
    else {
      if (!kids.has(n.parentId)) kids.set(n.parentId, []);
      kids.get(n.parentId).push(n);
    }
  }
  const levels = new Map();
  const seen = new Set();
  const queue = roots.map((n) => [n, 0]);
  while (queue.length > 0) {
    const [node, lv] = queue.shift();
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    levels.set(node.id, lv);
    for (const k of kids.get(node.id) ?? []) queue.push([k, lv + 1]);
  }
  // 부모를 잃은 노드도 그리기는 해야 하므로 1층으로 둡니다.
  for (const n of nodes) if (!levels.has(n.id)) levels.set(n.id, 1);
  return levels;
}

// 이 노드와 그 아래 자손 전체 — 지울 때 씁니다.
export function subtreeIds(nodes, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (n.parentId && out.has(n.parentId) && !out.has(n.id)) {
        out.add(n.id);
        grew = true;
      }
    }
  }
  return out;
}

let seq = 0;
function makeId() {
  seq += 1;
  return `n${Date.now().toString(36)}${seq.toString(36)}`;
}

// ── 방사형 배치 ────────────────────────────────────────────────
// 새 가지도 화면에 쓰는 배치 계산으로 자리를 잡습니다. 형제가 이미 있으면
// 같은 바깥쪽 열의 다음 줄에 놓으므로 새 노드끼리 같은 자리에 생기지 않습니다.
export function radialSpawn(nodes, parentId, { verticalGap } = {}) {
  const parent = nodeById(nodes, parentId);
  if (!parent) return { x: 0, y: 0 };
  const sibs = childrenOf(nodes, parentId);
  let id = "__new_mindmap_branch__";
  while (nodes.some((n) => n.id === id)) id += "_";
  const positions = layoutPositions({ layout: "radial", verticalGap, nodes });
  const p = positions.get(parentId) ?? { x: 0, y: 0 };
  // 하위 가지는 기존 형제 다음에 덧붙입니다. 뿌리의 새 가지는 자동으로
  // 좌우를 나누도록 좌표를 비워 둡니다.
  const rawX = Number.isFinite(parent.x) ? parent.x : p.x;
  const rawY = Number.isFinite(parent.y) ? parent.y : p.y;
  const lastY = Math.max(rawY, ...sibs.map((n) =>
    Number.isFinite(n.y) ? n.y : positions.get(n.id)?.y ?? rawY));
  const next = {
    id, parentId, text: "", edgeLabel: "",
    x: parent.parentId === null ? null : rawX,
    y: parent.parentId === null ? null : lastY + SHORT_NODE_H + normalizeVerticalGap(verticalGap),
  };
  const spot = layoutPositions({ layout: "radial", verticalGap, nodes: [...nodes, next] }).get(id);
  return {
    x: Math.round(rawX + spot.x - p.x),
    y: Math.round(parent.parentId === null ? rawY + spot.y - p.y : next.y),
  };
}

// 자리(x·y)가 없는 노드에만 방사형 자리를 채워 줍니다.
// 계층형으로만 만들다가 방사형으로 바꾸면 자리가 없어 모두 겹치는데,
// 그때 위에서부터 훑어 내려가며 부모 기준으로 자리를 잡아 줍니다.
export function withRadialPositions(map) {
  if (map.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))) return map;
  // x·y에는 자동 기준점만 채웁니다. 옮긴 화면 좌표를 넣으면 저장된 이동량이
  // 다음 배치에서 한 번 더 더해집니다.
  const positions = layoutPositions({ ...map, layout: "radial",
    nodes: map.nodes.map((n) => ({ ...n, radialOffsetY: 0 })) });
  return {
    ...map,
    nodes: map.nodes.map((n) => {
      if (Number.isFinite(n.x) && Number.isFinite(n.y)) return n;
      const p = positions.get(n.id);
      return { ...n, x: p.x, y: p.y };
    }),
  };
}

// ── 노드 크기와 자동 배치 ───────────────────────────────────────
const SHORT_NODE_H = 42;
const LABEL_SPACE = 24;

export function nodeHasImage(n) {
  return !!safeNodeImage(n?.image);
}

function textWidth(text, fontSize) {
  return [...text].reduce((sum, ch) => {
    const factor = /\s/.test(ch) ? 0.4 : /[MW@#%]/.test(ch) ? 1 : /[ -~]/.test(ch) ? 0.75 : 1;
    return sum + fontSize * factor;
  }, 0);
}

// DOM 실측은 확대 배율을 뺀 CSS px입니다. 실측 전에도 긴 글과 그림이 겹치지
// 않도록 CSS의 폭·여백·줄 높이를 반영한 보수적인 크기를 사용합니다.
export function mindmapNodeSize(node, level = 1, nodeSizes = null) {
  const measured = nodeSizes?.get(node?.id);
  if (Number.isFinite(measured?.width) && measured.width > 0 &&
      Number.isFinite(measured?.height) && measured.height > 0) {
    return { width: measured.width, height: measured.height };
  }
  const root = level === 0;
  const font = root ? 15 : 13.5;
  const padX = root ? 40 : 32; // 좌우 padding + 테두리
  const padY = root ? 28 : 22;
  const hasImage = nodeHasImage(node);
  const text = String(node?.text ?? "").trim().replace(/\s+/g, " ") ||
    (hasImage ? "" : "내용을 적어 주세요");
  const width = Math.min(root ? 200 : 168,
    Math.max(62, textWidth(text, font) + padX, hasImage ? MINDMAP_IMAGE_W + padX : 0));
  const contentWidth = width - padX;
  let lines = 0;
  let used = 0;
  // 단어는 다음 줄로 넘기고, 칸보다 긴 단어는 글자 단위로 나눕니다.
  for (const word of text.split(" ").filter(Boolean)) {
    const wordWidth = textWidth(word, font);
    const space = used > 0 ? textWidth(" ", font) : 0;
    if (used > 0 && used + space + wordWidth > contentWidth) {
      lines += 1;
      used = 0;
    } else {
      used += space;
    }
    for (const ch of word) {
      const w = textWidth(ch, font);
      if (used > 0 && used + w > contentWidth) {
        lines += 1;
        used = 0;
      }
      used += w;
    }
  }
  if (used > 0) lines += 1;
  const height = Math.ceil(padY + lines * font * 1.45 +
    (hasImage ? MINDMAP_IMAGE_H + (text ? 6 : 0) : 0));
  return { width: Math.ceil(width), height };
}

function edgeLabelWidth(label) {
  const text = String(label ?? "").trim();
  return text ? Math.ceil(textWidth(text, 11) + 18) : 0;
}

function edgeGap(parentSize, childSize, label, minimum) {
  return Math.max(minimum,
    (parentSize.width + childSize.width) / 2 + edgeLabelWidth(label) + LABEL_SPACE);
}

// 부모가 없거나 고리가 있는 예전 기록도 모든 노드를 한 번씩 배치합니다.
// 이 그리기 전용 숲은 원본 parentId나 저장 순서를 바꾸지 않습니다.
function layoutForest(nodes) {
  const byId = new Map();
  for (const n of nodes) if (!byId.has(n.id)) byId.set(n.id, n);
  const candidates = new Map();
  for (const n of byId.values()) {
    if (!candidates.has(n.parentId)) candidates.set(n.parentId, []);
    candidates.get(n.parentId).push(n);
  }
  const children = new Map();
  const seen = new Set();
  const roots = [];
  const depth = new Map();
  function visit(n, level) {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    depth.set(n.id, level);
    const kids = [];
    children.set(n.id, kids);
    for (const child of candidates.get(n.id) ?? []) {
      if (seen.has(child.id)) continue;
      kids.push(child);
      visit(child, level + 1);
    }
  }
  function addRoot(n) {
    if (seen.has(n.id)) return;
    roots.push(n);
    visit(n, 0);
  }
  for (const n of byId.values()) if (n.parentId === null || !byId.has(n.parentId)) addRoot(n);
  for (const n of byId.values()) addRoot(n);
  return { roots, children, depth, nodes: [...byId.values()] };
}

// 원하는 위치를 최대한 유지하며 이웃 가지의 위아래 범위를 띄웁니다.
// 겹친 묶음만 나누어 옮기고 이미 떨어져 있는 수동 위치는 유지합니다.
function packBands(items, gap) {
  let offset = 0;
  const blocks = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    item.offset = offset;
    blocks.push({ start: i, end: i, sum: item.desired + item.shape.top - offset, count: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      if (a.sum / a.count <= b.sum / b.count) break;
      blocks.splice(-2, 2, { start: a.start, end: b.end, sum: a.sum + b.sum, count: a.count + b.count });
    }
    offset += item.shape.bottom - item.shape.top + gap;
  }
  for (const block of blocks) {
    for (let i = block.start; i <= block.end; i += 1) {
      const item = items[i];
      item.y = block.sum / block.count + item.offset - item.shape.top;
    }
  }
  return items;
}

function makeBranch(node, forest, sizes, gap, { radial = false, side = 1 } = {}) {
  const children = forest.children.get(node.id) ?? [];
  const branches = children.map((child) => ({
    node: child,
    shape: makeBranch(child, forest, sizes, gap, { radial, side }),
  }));
  // 하위 가지의 저장된 y는 순서만 정합니다. 오래된 큰 세로 간격은 화면에
  // 되살리지 않고, 형제 전체가 부모를 가운데에 두도록 위아래로 쌓습니다.
  if (radial) branches.sort((a, b) =>
    (Number.isFinite(a.node.y) ? a.node.y : 0) - (Number.isFinite(b.node.y) ? b.node.y : 0));
  const totalHeight = branches.reduce((sum, b) => sum + b.shape.bottom - b.shape.top, 0) +
    Math.max(0, branches.length - 1) * gap;
  let top = -totalHeight / 2;
  for (const branch of branches) {
    branch.desired = top - branch.shape.top;
    top += branch.shape.bottom - branch.shape.top + gap;
  }
  packBands(branches, gap);
  const size = sizes.get(node.id);
  // 형제는 같은 열에 놓고 글자·라벨의 폭만큼 바깥쪽 간격을 확보합니다.
  const column = branches.reduce((distance, b) => {
    return Math.max(distance,
      edgeGap(size, sizes.get(b.node.id), b.node.edgeLabel, 165));
  }, 0);
  return {
    node, children: branches, column,
    top: Math.min(-size.height / 2, ...branches.map((b) => b.y + b.shape.top)),
    bottom: Math.max(size.height / 2, ...branches.map((b) => b.y + b.shape.bottom)),
  };
}

function putBranch(shape, x, y, positions, { side = 1, columns = null, depth = 0 } = {}) {
  positions.set(shape.node.id, { x, y });
  for (const branch of shape.children) {
    putBranch(branch.shape, columns ? columns[depth + 1] : x + side * shape.column,
      y + branch.y, positions, { side, columns, depth: depth + 1 });
  }
}

// 먼저 얻은 자동 좌표를 고정한 뒤, 노드마다 저장한 세로 이동량을 더합니다.
// 자식의 기준점은 자동 좌표 사이의 차이이므로 한 가지를 옮겨도 다른 가지의
// 기준점은 바뀌지 않습니다. 실제로 같은 가로 영역에서 겹친 가지에만
// 최소 여백을 줍니다. 하위 열의 빈 공간 때문에 부모나 이웃을 밀지 않습니다.
function applyVerticalOffsets(layout, automatic, forest, sizes) {
  const field = verticalOffsetField(layout);
  const roots = new Set(forest.roots.map((n) => n.id));
  if (!forest.nodes.some((n) => !roots.has(n.id) && normalizeVerticalOffset(n[field]) !== 0)) return automatic;
  const gap = MINDMAP_VERTICAL_GAP.min;

  function packManualBranches(branches) {
    branches.sort((a, b) => a.desired - b.desired);
    for (let i = 0; i < branches.length; i += 1) {
      const branch = branches[i];
      branch.y = branch.desired;
      // 한 번 피한 앞 가지보다 아래에 놓이므로 같은 쌍이 다시 겹치지 않습니다.
      // 아래로 옮기며 다른 앞 가지에 닿았을 때만 앞에서부터 다시 확인합니다.
      let moved;
      do {
        moved = false;
        for (let j = 0; j < i; j += 1) {
          const previous = branches[j];
          let overlaps = false;
          let separation = -Infinity;
          for (const a of previous.shape.rectangles) {
            for (const b of branch.shape.rectangles) {
              if (a.right <= b.left || b.right <= a.left) continue;
              separation = Math.max(separation, a.bottom - b.top + gap);
              if (previous.y + a.bottom + gap > branch.y + b.top + 1e-7 &&
                  branch.y + b.bottom + gap > previous.y + a.top + 1e-7) overlaps = true;
            }
          }
          if (overlaps) {
            branch.y = previous.y + separation;
            moved = true;
          }
        }
      } while (moved);
    }
  }

  function makeManualBranch(node) {
    const origin = automatic.get(node.id);
    const children = (forest.children.get(node.id) ?? []).map((child) => ({
      node: child,
      shape: makeManualBranch(child),
      desired: automatic.get(child.id).y - origin.y + normalizeVerticalOffset(child[field]),
    }));
    // 방사형 뿌리의 왼쪽·오른쪽은 서로 다른 열이라 독립적으로 정리합니다.
    const groups = layout === "radial" && roots.has(node.id)
      ? [-1, 1].map((side) => children.filter((child) =>
        Math.sign(automatic.get(child.node.id).x - origin.x) === side))
      : [children];
    for (const group of groups) packManualBranches(group);
    const size = sizes.get(node.id);
    return {
      node, children,
      rectangles: [{ left: origin.x - size.width / 2, right: origin.x + size.width / 2,
        top: -size.height / 2, bottom: size.height / 2 },
      ...children.flatMap((child) => child.shape.rectangles.map((rectangle) => ({ ...rectangle,
        top: rectangle.top + child.y, bottom: rectangle.bottom + child.y })))],
    };
  }

  const positions = new Map();
  function putManualBranch(shape, y) {
    positions.set(shape.node.id, { x: automatic.get(shape.node.id).x, y });
    for (const child of shape.children) putManualBranch(child.shape, y + child.y);
  }
  const rootBranches = forest.roots.map((root) => ({
    shape: makeManualBranch(root), desired: automatic.get(root.id).y,
  }));
  packManualBranches(rootBranches);
  for (const branch of rootBranches) putManualBranch(branch.shape, branch.y);
  return positions;
}

// 깊이별 최대 노드 폭과 라벨 폭으로 열을 정합니다. 긴 라벨이 있어도
// 같은 깊이의 노드는 같은 x에 나란히 놓입니다.
export function computeTreeLayout(nodes, { colGap = 210, rowGap = 62, verticalGap, nodeSizes = null } = {}) {
  const forest = layoutForest(nodes);
  const levels = levelMap(nodes);
  const sizes = new Map(forest.nodes.map((n) => [n.id, mindmapNodeSize(n, levels.get(n.id) ?? 1, nodeSizes)]));
  const widths = [];
  const labels = [];
  for (const n of forest.nodes) {
    const depth = forest.depth.get(n.id);
    widths[depth] = Math.max(widths[depth] ?? 0, sizes.get(n.id).width);
    labels[depth] = Math.max(labels[depth] ?? 0, edgeLabelWidth(n.edgeLabel));
  }
  const columns = [0];
  for (let depth = 1; depth < widths.length; depth += 1) {
    columns[depth] = columns[depth - 1] + Math.max(colGap,
      (widths[depth - 1] + widths[depth]) / 2 + labels[depth] + LABEL_SPACE);
  }
  // rowGap은 예전 호출부의 짧은 노드 중심 간격입니다. 새 값은 테두리 사이 여백입니다.
  const gap = verticalGap === undefined ? Math.max(0, rowGap - SHORT_NODE_H) : normalizeVerticalGap(verticalGap);
  const branches = forest.roots.map((n) => ({ shape: makeBranch(n, forest, sizes, gap) }));
  let top = 0;
  for (const b of branches) {
    b.y = top - b.shape.top;
    top += b.shape.bottom - b.shape.top + gap;
  }
  const positions = new Map();
  const rootY = branches[0]?.y ?? 0;
  for (const b of branches) putBranch(b.shape, 0, b.y - rootY, positions, { columns });
  return applyVerticalOffsets("tree", positions, forest, sizes);
}

// 방사형은 뿌리의 좌우 가지를 보존하고, 각 가지 아래는 바깥쪽 열에 쌓습니다.
// 좌표 보정은 이 반환값에만 적용되며 학생의 원문·좌표·parentId는 건드리지 않습니다.
export function layoutPositions(map, { nodeSizes = null } = {}) {
  const gap = normalizeVerticalGap(map.verticalGap);
  if (map.layout === "tree") return computeTreeLayout(map.nodes, { nodeSizes, verticalGap: gap });
  const forest = layoutForest(map.nodes);
  const levels = levelMap(map.nodes);
  const sizes = new Map(forest.nodes.map((n) => [n.id, mindmapNodeSize(n, levels.get(n.id) ?? 1, nodeSizes)]));
  const positions = new Map();
  let previousBottom = null;
  for (const root of forest.roots) {
    const rootX = Number.isFinite(root.x) ? root.x : 0;
    const rootY = Number.isFinite(root.y) ? root.y : 0;
    positions.set(root.id, { x: rootX, y: rootY });
    const children = forest.children.get(root.id) ?? [];
    const sides = new Map([[-1, []], [1, []]]);
    for (let i = 0; i < children.length; i += 1) {
      const n = children[i];
      const side = Number.isFinite(n.x) && n.x !== rootX ? Math.sign(n.x - rootX) : (i % 2 ? -1 : 1);
      const shape = makeBranch(n, forest, sizes, gap, { radial: true, side });
      // 좌표가 없는 가지는 좌우로 펼치고 저장된 y는 원하는 위치로 사용합니다.
      const onSide = sides.get(side);
      const rank = onSide.length;
      const automaticY = rank === 0 ? 0 : (rank % 2 ? -1 : 1) * Math.ceil(rank / 2) * 180;
      onSide.push({ node: n, shape, desired: Number.isFinite(n.y) ? n.y - rootY : automaticY });
    }
    for (const [side, branches] of sides) {
      branches.sort((a, b) => a.desired - b.desired);
      packBands(branches, gap);
      for (const b of branches) {
        const distance = Math.max(
          Number.isFinite(b.node.x) ? side * (b.node.x - rootX) : 0,
          edgeGap(sizes.get(root.id), sizes.get(b.node.id), b.node.edgeLabel, 200));
        putBranch(b.shape, rootX + side * distance, rootY + b.y, positions, { side });
      }
    }
    // 부모를 잃었거나 고리에서 분리된 나머지 나무도 겹치지 않게 그립니다.
    const ids = new Set();
    const collect = (n) => {
      ids.add(n.id);
      for (const child of forest.children.get(n.id) ?? []) collect(child);
    };
    collect(root);
    let top = Infinity;
    let bottom = -Infinity;
    for (const id of ids) {
      const p = positions.get(id);
      const h = sizes.get(id).height;
      top = Math.min(top, p.y - h / 2);
      bottom = Math.max(bottom, p.y + h / 2);
    }
    const shift = previousBottom === null ? 0 : Math.max(0, previousBottom + gap - top);
    if (shift) for (const id of ids) {
      const p = positions.get(id);
      positions.set(id, { x: p.x, y: p.y + shift });
    }
    previousBottom = bottom + shift;
  }
  return applyVerticalOffsets("radial", positions, forest, sizes);
}

// ── 편집 ──────────────────────────────────────────────────────
export function addChild(map, parentId, text = "") {
  const spot = map.layout === "radial" ? radialSpawn(map.nodes, parentId, { verticalGap: map.verticalGap }) : { x: null, y: null };
  const node = { id: makeId(), parentId, text, x: spot.x, y: spot.y,
    radialOffsetY: 0, treeOffsetY: 0, edgeLabel: "", image: "" };
  return { ...map, nodes: [...map.nodes, node] };
}

export function updateVerticalGap(map, value) {
  return { ...map, verticalGap: normalizeVerticalGap(value) };
}

// 노드 이미지 — 빈 문자열이면 뺍니다.
export function updateNodeImage(map, id, image) {
  const next = safeNodeImage(image);
  return { ...map, nodes: map.nodes.map((n) => (n.id === id ? { ...n, image: next } : n)) };
}

// 판에 붙은 이미지 주소 전부 — 고치기 전후를 견주어 빠진 파일을 치울 때 씁니다.
export function mindmapImages(map) {
  return new Set((map?.nodes ?? []).map((n) => safeNodeImage(n.image)).filter(Boolean));
}

export function updateNodeText(map, id, text) {
  return { ...map, nodes: map.nodes.map((n) => (n.id === id ? { ...n, text } : n)) };
}

// 선 위 글자 — 그 선이 향하는 자식 노드(childId)에 실어 둡니다.
export function updateEdgeLabel(map, childId, label) {
  return {
    ...map,
    nodes: map.nodes.map((n) => (n.id === childId ? { ...n, edgeLabel: label } : n)),
  };
}

export function moveSubtreeTo(map, id, x, y) {
  const node = nodeById(map.nodes, id);
  if (!node) return map;
  const nextX = Math.round(x);
  const nextY = Math.round(y);
  const curX = Number.isFinite(node.x) ? node.x : 0;
  const curY = Number.isFinite(node.y) ? node.y : 0;
  const dx = nextX - curX;
  const dy = nextY - curY;
  if (dx === 0 && dy === 0) return map;

  const moving = subtreeIds(map.nodes, id);
  return {
    ...map,
    nodes: map.nodes.map((n) => {
      if (!moving.has(n.id)) return n;
      const px = Number.isFinite(n.x) ? n.x : 0;
      const py = Number.isFinite(n.y) ? n.y : 0;
      return { ...n, x: Math.round(px + dx), y: Math.round(py + dy) };
    }),
  };
}

export function reorderFirstLevelChild(map, childId, targetIndex) {
  const root = map.nodes.find((n) => n.parentId === null);
  const child = nodeById(map.nodes, childId);
  if (!root || !child || child.parentId !== root.id) return map;

  const siblings = map.nodes.filter((n) => n.parentId === root.id);
  const oldIndex = siblings.findIndex((n) => n.id === childId);
  if (oldIndex < 0) return map;

  const nextSiblings = siblings.filter((n) => n.id !== childId);
  const insertAt = Math.max(0, Math.min(targetIndex, nextSiblings.length));
  nextSiblings.splice(insertAt, 0, child);

  const changed = siblings.some((n, i) => nextSiblings[i]?.id !== n.id);
  if (!changed) return map;

  const firstSiblingIndex = map.nodes.findIndex((n) => n.parentId === root.id);
  const nodes = [];
  let inserted = false;
  for (let i = 0; i < map.nodes.length; i += 1) {
    const n = map.nodes[i];
    if (n.parentId !== root.id) {
      nodes.push(n);
      continue;
    }
    if (!inserted) {
      nodes.push(...nextSiblings);
      inserted = true;
    }
  }
  if (!inserted) nodes.splice(firstSiblingIndex, 0, ...nextSiblings);
  return { ...map, nodes };
}

// 뿌리는 지울 수 없습니다(마인드맵의 주제라 없으면 그림이 성립하지 않음).
export function removeNode(map, id) {
  const target = nodeById(map.nodes, id);
  if (!target || target.parentId === null) return map;
  const doomed = subtreeIds(map.nodes, id);
  return { ...map, nodes: map.nodes.filter((n) => !doomed.has(n.id)) };
}

// ── 진행 상황 ─────────────────────────────────────────────────
// 뿌리는 주제라 처음부터 있으므로, '가지'는 뿌리를 뺀 수로 셉니다.
export function branchCount(map) {
  return Math.max(0, (map?.nodes?.length ?? 0) - 1);
}

export function mindmapStarted(map) {
  return branchCount(map) > 0;
}

export function maxDepth(map) {
  if (!map?.nodes?.length) return 0;
  const levels = levelMap(map.nodes);
  return Math.max(...levels.values(), 0);
}
