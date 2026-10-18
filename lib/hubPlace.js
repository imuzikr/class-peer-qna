// =============================================================
// 떠 있는 동그라미의 자리 — 끌어 옮긴 자리를 화면 안으로 셈합니다
// -------------------------------------------------------------
// 그리기는 components/FloatingHub.jsx. 여기는 Firebase를 안 가져와 tests/unit이
// 그대로 읽습니다.
//
// [저장은 화면 비율]
// 동그라미 **가운데**를 화면 폭 · 높이에 대한 비율(0~1)로 적습니다
// ({ fx, fy }). px로 적으면 큰 화면에서 오른쪽 아래에 둔 것이 작은 화면에서
// 밖으로 나갑니다. 비율이면 '오른쪽 아래 언저리'가 어느 화면에서든 그 언저리입니다.
//
// [펼치는 쪽은 화면 가운데로]
// 큰 원(300px) · 메신저 창(380×580)은 동그라미 모서리에 붙어 **화면 가운데 쪽으로**
// 펼쳐집니다. 동그라미가 왼쪽 절반이면 오른쪽으로(isLeft), 위쪽 절반이면
// 아래로(isTop). 기본 자리(오른쪽 아래)에서는 지금까지처럼 왼쪽 위로 펼쳐집니다.
// =============================================================

export const HUB_FAB = 56; // 동그라미 지름 — CSS `.hub-fab`과 같아야 합니다
export const HUB_EDGE = 8; // 화면 가장자리에서 띄울 최소 간격
export const HUB_DRAG_MIN = 6; // 이만큼 움직여야 '끌기'(그 아래는 누르기)

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

// 저장해 둔 값이 쓸 만한가 — 아니면 null(기본 자리)
export function cleanHubPos(raw) {
  if (!raw || typeof raw !== "object") return null;
  const { fx, fy } = raw;
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;
  return { fx: clamp(fx, 0, 1), fy: clamp(fy, 0, 1) };
}

// 손가락 · 마우스가 있는 가운데 자리(px) → 저장할 비율
export function hubPosFromPoint(cx, cy, w, h) {
  if (!w || !h) return null;
  return cleanHubPos({ fx: cx / w, fy: cy / h });
}

// 비율 → 화면 위 자리. null이면 기본 자리(CSS가 정함).
//  left · top · right · bottom: 동그라미 상자의 네 변이 화면 가장자리에서 떨어진 거리(px)
//  isLeft · isTop: 큰 원 · 메신저를 어느 쪽으로 펼칠지
export function hubPlacement(pos, w, h) {
  const p = cleanHubPos(pos);
  if (!p || !w || !h) return null;
  const half = HUB_FAB / 2;
  const cx = clamp(p.fx * w, HUB_EDGE + half, w - HUB_EDGE - half);
  const cy = clamp(p.fy * h, HUB_EDGE + half, h - HUB_EDGE - half);
  const left = Math.round(cx - half);
  const top = Math.round(cy - half);
  return {
    left,
    top,
    right: Math.round(w - left - HUB_FAB),
    bottom: Math.round(h - top - HUB_FAB),
    isLeft: cx < w / 2,
    isTop: cy < h / 2,
  };
}
