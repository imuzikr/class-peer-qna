// Mindmap positions and sizes are unscaled CSS pixels. Connect the facing
// horizontal sides of the rendered boxes so even steep branches meet the
// middle of a side, rather than disappearing behind a corner.
const MAX_HANDLE = 48;
const ARC_SAMPLES = 64;

const finite = (value) => Number.isFinite(value) ? value : 0;
const widthOf = (size) => Number.isFinite(size?.width) && size.width > 0 ? size.width : 0;

function offset(value, delta) {
  const result = value + delta;
  // Corrupted, extremely large coordinates must still produce a finite path.
  return Number.isFinite(result) ? result : Math.sign(result) * Number.MAX_VALUE;
}

function mix(a, b, t) {
  return a === b ? a : a * (1 - t) + b * t;
}

function cubicAt(start, c1, c2, end, t) {
  // Successive interpolation also avoids overflowing the polynomial's sums
  // when an old document contains unusually large but finite coordinates.
  const point = (a, b) => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });
  return point(point(point(start, c1), point(c1, c2)), point(point(c1, c2), point(c2, end)));
}

function curveMidpoint(start, c1, c2, end) {
  const at = (t) => cubicAt(start, c1, c2, end, t);
  const scale = Math.max(1, ...[start, c1, c2, end].flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]));
  const points = Array.from({ length: ARC_SAMPLES + 1 }, (_, i) => at(i / ARC_SAMPLES));
  // A common scale preserves the half-length position and bounds subtraction
  // and distance calculations even for opposite extreme coordinates.
  const lengths = points.slice(1).map((p, i) => Math.hypot(
    p.x / scale - points[i].x / scale,
    p.y / scale - points[i].y / scale,
  ));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0) return at(0.5);
  let remaining = total / 2;
  for (let i = 0; i < lengths.length; i += 1) {
    if (remaining <= lengths[i]) {
      const fraction = lengths[i] > 0 ? remaining / lengths[i] : 0;
      // Evaluate the cubic again, rather than placing the label on a sampled
      // chord which can leave it visibly detached from the actual curve.
      return at((i + fraction) / ARC_SAMPLES);
    }
    remaining -= lengths[i];
  }
  return at(0.5);
}

/**
 * Build a cubic connector between measured node boxes without changing them.
 * Radial branches mirror their anchors; tree branches always flow rightward.
 * Missing/invalid coordinates and widths safely fall back to zero.
 */
export function mindmapEdgeGeometry(parentPosition, childPosition, {
  parentSize,
  childSize,
  layout = "radial",
} = {}) {
  const parent = { x: finite(parentPosition?.x), y: finite(parentPosition?.y) };
  const child = { x: finite(childPosition?.x), y: finite(childPosition?.y) };
  const side = layout === "tree" || child.x >= parent.x ? 1 : -1;
  const start = { x: offset(parent.x, side * widthOf(parentSize) / 2), y: parent.y };
  const end = { x: offset(child.x, -side * widthOf(childSize) / 2), y: child.y };
  const gap = side * (end.x - start.x);
  // Short handles keep a gentle bend and horizontal entry at both ends. An
  // overlapping or inward pair collapses them instead of making a large loop.
  const handle = Math.min(MAX_HANDLE, Math.max(0, gap) * 0.35);
  const c1 = { x: offset(start.x, side * handle), y: start.y };
  const c2 = { x: offset(end.x, -side * handle), y: end.y };
  return {
    d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
    mid: curveMidpoint(start, c1, c2, end),
    start,
    end,
    c1,
    c2,
  };
}
