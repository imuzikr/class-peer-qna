// =============================================================
// 팝오버 — 누른 것 옆에 붙어 뜨는 작은 창
// -------------------------------------------------------------
// 모달과 가려 씁니다. **모달**은 뒤를 덮어 다른 조작을 막고 화면 한가운데
// 섭니다. **팝오버**는 누른 것 옆에 붙고 뒤가 그대로 살아 있어, 바깥을
// 누르거나 Esc·×로 닫힙니다(CLAUDE.md '팝오버 — 모달과 가려 쓰세요').
//
// 자리 잡기와 닫기를 여기 한 곳에 둡니다 — 화면마다 따로 적으면 어떤
// 팝오버는 화면 밖으로 나가고 어떤 것은 Esc가 안 듣습니다.
// =============================================================
import { useEffect, useState } from "react";

// 누른 것(el) 옆에 폭 w·높이 h짜리 창을 놓을 자리를 고릅니다.
// **`position: fixed`에 그대로 넣는 값**입니다(뷰포트 기준) — 구르는 목록
// 안에서도 잘리지 않게 하려면 fixed여야 하기 때문입니다.
//
// 차례는 오른쪽 → 왼쪽 → 아래 → 위. 자리표처럼 격자가 화면 가로를 다 쓰는
// 곳에서는 맨 오른쪽 칸이 오른쪽에 자리가 없고, 맨 왼쪽 칸은 왼쪽에 자리가
// 없습니다. 좁은 화면에서는 둘 다 모자라 아래위로 갑니다.
//
// `maxH`도 함께 돌려줍니다 — 창 안에서 무언가를 펼치면(과일 흐름 차트)
// 아래로 자라 화면 밖으로 나가므로, 그 높이를 넘으면 창 안에서 구르게 합니다.
export function popoverPos(el, { w = 300, h = 240, gap = 10, margin = 8 } = {}) {
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const clampX = (v) => Math.max(margin, Math.min(v, Math.max(margin, vw - w - margin)));
  const clampY = (v) => Math.max(margin, Math.min(v, Math.max(margin, vh - h - margin)));
  const withMaxH = (x, y) => ({ x, y, maxH: Math.max(160, vh - y - margin) });

  const r = el?.getBoundingClientRect?.();
  // 누른 것이 없으면(누가기록에서 되돌아온 경우 등) 화면 한가운데
  if (!r) return withMaxH(clampX((vw - w) / 2), clampY((vh - h) / 2));

  if (r.right + gap + w <= vw - margin) return withMaxH(r.right + gap, clampY(r.top - 8));
  if (r.left - gap - w >= margin) return withMaxH(r.left - gap - w, clampY(r.top - 8));

  const x = clampX(r.left + r.width / 2 - w / 2);
  const below = r.bottom + gap;
  if (below + h <= vh - margin) return withMaxH(x, below);
  return withMaxH(x, clampY(r.top - gap - h));
}

// 누른 것을 **따라다니는** 자리. 뒤가 구르거나 창 크기가 바뀌면 다시 잽니다.
//
// 열 때 한 번만 재면, 자리표가 구르는 모달 안에 있을 때 창만 제자리에 남아
// 엉뚱한 자리를 가리킵니다. 구를 때 닫아 버리는 방법도 써 봤는데 **누르는
// 순간 닫히는 것처럼 보입니다** — 화면 가장자리의 자리를 누르면 브라우저가
// 그 칸을 화면 안으로 밀어 넣느라 클릭 직후에 스크롤이 한 번 일어납니다
// (실측: pointerdown 30ms 뒤 scroll 한 번). 그래서 닫지 않고 따라갑니다.
export function usePopoverAnchor(el, { w = 300, h = 240, gap = 10, margin = 8 } = {}) {
  const [pos, setPos] = useState(() => popoverPos(el, { w, h, gap, margin }));
  useEffect(() => {
    const place = () => setPos(popoverPos(el, { w, h, gap, margin }));
    place();
    if (!el) return undefined;
    window.addEventListener("resize", place);
    // capture — 구르는 것이 페이지가 아니라 안쪽 상자여도 잡아야 합니다
    // (scroll 이벤트는 위로 안 올라옵니다).
    document.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [el, w, h, gap, margin]);
  return pos;
}

// 바깥을 누르거나 Esc면 닫습니다.
//
// `isConnected` 한 줄은 이 앱의 약속입니다 — 누르는 순간 스스로 사라지는
// 것(자동완성 목록·툴팁)이 안에 있으면 그 노드가 문서에서 떨어져 나가
// `contains`가 false가 되고, '바깥을 눌렀다'로 잘못 읽힙니다.
//
// `keep`은 '바깥이지만 닫지 않을 것'의 선택자입니다 — 같은 목록의 다른 줄,
// 자리표의 다른 자리처럼 **그리로 옮겨 가는 중**인 경우. 걸러 두지 않으면
// 닫혔다 다시 열리며 한 번 깜빡입니다.
export function usePopoverDismiss(open, ref, onClose, keep = null) {
  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (!e.target.isConnected) return;
      if (ref.current?.contains(e.target)) return;
      if (keep && e.target.closest?.(keep)) return;
      onClose();
    }
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, ref, onClose, keep]);
}
