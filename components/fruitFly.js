// =============================================================
// 과일이 날아가는 효과 — 과일 바구니 창(학생)의 응모하기 · 응모하지 않기
// (FruitBasketModal이 저장 성공 뒤에 부릅니다)
// -------------------------------------------------------------
// 응모하기: 내 과일 자리 → 바구니 그림으로 과일이 포물선을 그리며 하나씩
// 떨어져 담기고, 다 담기면 바구니가 한 번 출렁입니다.
// 응모하지 않기: 거꾸로 바구니에서 과일이 튀어 올라 내 과일 자리로 돌아옵니다.
//
// [화면 밖에서 그립니다] 과일은 React가 아니라 body에 붙인 span이고, 끝나면
// 스스로 지웁니다 — 창이 다시 그려져도(구독으로 숫자가 바뀌는 순간) 날아가던
// 과일이 끊기지 않게. 위치는 position: fixed + Web Animations API(transform만)라
// 레이아웃을 건드리지 않습니다.
//
// [저장이 끝난 뒤에 날립니다] 부르는 쪽은 쓰기가 성공한 다음에 부릅니다 —
// 실패했는데 과일이 담기는 그림을 보여 주면 거짓말이 됩니다.
//
// 움직임을 줄여 달라고 한 기기에서는 날리지 않습니다(숫자만 바뀜).
// =============================================================
import { FRUITS } from "./RewardFruits";

const FLY_MAX = 10;     // 아무리 많이 담아도 이만큼만 날립니다(20개가 날면 어지러움)
const FLY_MS = 760;     // 한 알이 날아가는 시간
const GAP_MS = 85;      // 알 사이 간격

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const centerOf = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

// 바구니 그림 안에서 과일이 떨어질(또는 튀어나올) 자리 — 그림의 위쪽 가운데
// 띠(가로 30~70% · 세로 38~52%)가 수북한 과일 더미 언저리입니다.
function basketPoint(r) {
  return {
    x: r.left + r.width * (0.3 + Math.random() * 0.4),
    y: r.top + r.height * (0.38 + Math.random() * 0.14),
  };
}

// from · basket: DOM 요소. dir "in"이면 from → 바구니, "out"이면 바구니 → from.
// 다 끝나면 resolve합니다(날리지 않았으면 곧바로).
export function flyFruits({ from, basket, n, dir = "in" }) {
  const count = Math.min(FLY_MAX, Math.max(0, n | 0));
  if (typeof window === "undefined" || !from || !basket || count <= 0 || reducedMotion()) {
    return Promise.resolve();
  }
  const fr = from.getBoundingClientRect();
  const br = basket.getBoundingClientRect();
  const home = centerOf(fr);
  const runs = [];
  for (let i = 0; i < count; i += 1) {
    const spot = basketPoint(br);
    const jitter = { x: (Math.random() - 0.5) * 28, y: (Math.random() - 0.5) * 14 };
    const a = dir === "in" ? { x: home.x + jitter.x, y: home.y + jitter.y } : spot;
    const b = dir === "in" ? spot : { x: home.x + jitter.x, y: home.y + jitter.y };
    const el = document.createElement("span");
    el.className = "fb-fly";
    el.textContent = FRUITS[(i + Math.floor(Math.random() * FRUITS.length)) % FRUITS.length];
    el.setAttribute("aria-hidden", "true");
    el.style.left = `${a.x}px`;
    el.style.top = `${a.y}px`;
    document.body.appendChild(el);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // 포물선 — 가운데에서 두 점보다 위로 솟습니다(멀수록 높이).
    const lift = Math.min(120, 50 + Math.abs(dx) * 0.2);
    const midY = Math.min(0, dy) - lift;
    const spin = (Math.random() - 0.5) * 120;
    const t = (x, y, s, r) => `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${s}) rotate(${r}deg)`;
    const frames = dir === "in"
      ? [
          { transform: t(0, 0, 0.4, 0), opacity: 0 },
          { transform: t(dx * 0.15, midY * 0.5, 1.05, spin * 0.3), opacity: 1, offset: 0.18 },
          { transform: t(dx * 0.55, midY, 1, spin * 0.7), opacity: 1, offset: 0.55 },
          { transform: t(dx, dy, 0.85, spin), opacity: 1, offset: 0.9 },
          { transform: t(dx, dy + 10, 0.6, spin), opacity: 0 },
        ]
      : [
          { transform: t(0, 8, 0.5, 0), opacity: 0 },
          { transform: t(dx * 0.12, midY * 0.6, 1.1, spin * 0.3), opacity: 1, offset: 0.25 },
          { transform: t(dx * 0.55, midY, 1, spin * 0.7), opacity: 1, offset: 0.55 },
          { transform: t(dx, dy, 0.8, spin), opacity: 1, offset: 0.9 },
          { transform: t(dx, dy, 0.4, spin), opacity: 0 },
        ];
    const anim = el.animate(frames, {
      duration: FLY_MS,
      delay: i * GAP_MS,
      easing: "cubic-bezier(.45,.05,.55,.95)",
      fill: "backwards",
    });
    runs.push(anim.finished.catch(() => {}).finally(() => el.remove()));
  }
  // 담기면 바구니가 한 번 출렁 — 마지막 알이 닿을 즈음.
  if (dir === "in") {
    basket.animate(
      [
        { transform: "translateY(0) scale(1)" },
        { transform: "translateY(4px) scale(1.03, 0.97)" },
        { transform: "translateY(-2px) scale(0.99, 1.01)" },
        { transform: "translateY(0) scale(1)" },
      ],
      { duration: 420, delay: (count - 1) * GAP_MS + FLY_MS * 0.85, easing: "ease-out" }
    );
  } else {
    basket.animate(
      [
        { transform: "translateY(0)" },
        { transform: "translateY(-3px)" },
        { transform: "translateY(0)" },
      ],
      { duration: 260, easing: "ease-out" }
    );
  }
  return Promise.all(runs);
}
