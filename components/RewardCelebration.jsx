"use client";

// =============================================================
// 과일을 받았을 때 터지는 축포 — 학생 화면 한가운데
// -------------------------------------------------------------
// 교사가 자리를 눌러 과일을 주면, 그 학생 화면에서만 이것이 터집니다.
// 받은 사실을 상단바의 작은 숫자가 조용히 1 늘어나는 것으로만 알리면
// 대개 아무도 못 보고 지나갑니다.
//
// [화면을 막지 않습니다] 캔버스는 pointer-events: none이라 터지는 동안에도
// 아래 화면을 그대로 누를 수 있습니다. 2.4초 뒤 스스로 사라집니다.
//
// [라이브러리를 쓰지 않는 이유] 색종이 몇 백 조각을 그리는 일이라 캔버스
// 하나와 rAF 한 줄이면 됩니다. 이것 때문에 번들에 패키지를 더할 일은
// 아닙니다.
//
// [움직임을 줄인 설정] prefers-reduced-motion이면 조각을 날리지 않고
// 가운데 뱃지만 잠깐 띄웁니다 — 알리는 일은 그대로 하되 흔들지 않습니다.
// =============================================================
import { useEffect, useRef } from "react";

const LIFE_MS = 2400;
// 과일 색 계열 — 한 줄기(축하)라 의미를 나누는 색이 아니라, 조각이 서로
// 겹칠 때 덩어리로 뭉쳐 보이지 않게 하는 장식입니다.
const COLORS = ["#d97757", "#e8a33d", "#7fb98a", "#c04a3f", "#f0c674", "#b85c3f"];

export default function RewardCelebration({ amount = 0, onDone }) {
  const canvasRef = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (amount <= 0) return;

    const finish = setTimeout(() => doneRef.current?.(), LIFE_MS);
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const canvas = canvasRef.current;
    if (reduce || !canvas) return () => clearTimeout(finish);

    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    // 가운데에서 사방으로 — 과일을 많이 받을수록 조금 더 크게 터지되,
    // 한 번에 주는 개수가 커도 화면이 종이로 덮이지 않게 상한을 둡니다.
    const count = Math.min(140 + amount * 40, 320);
    const cx = w / 2;
    const cy = h / 2;
    // 속도를 화면 크기에 매답니다. 픽셀로 못박아 두면 큰 화면에서는 가운데
    // 한 줌만 터지고 작은 화면에서는 한 프레임에 밖으로 나가 버립니다.
    // reach = 반 화면 남짓, base = 그 거리에 0.45초쯤(26프레임) 걸리는 속도
    // (감쇠 vx*=0.99가 누적돼 실제 이동은 계수의 약 0.87배입니다).
    const base = (Math.max(w, h) * 0.55) / 26;
    const bits = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = base * (0.45 + Math.random() * 0.75);
      return {
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - base * 0.3, // 살짝 위로 솟았다가 떨어지게
        size: 8 + Math.random() * 10,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    });

    const start = performance.now();
    let raf = 0;
    function frame(now) {
      const t = now - start;
      if (t >= LIFE_MS) { ctx.clearRect(0, 0, w, h); return; }
      // 끝에서 서서히 사라지게 — 갑자기 없어지면 화면이 튑니다.
      const fade = t < LIFE_MS * 0.65 ? 1 : 1 - (t - LIFE_MS * 0.65) / (LIFE_MS * 0.35);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = fade;
      for (const b of bits) {
        b.x += b.vx;
        b.y += b.vy;
        b.vy += 0.32;   // 중력
        b.vx *= 0.99;   // 공기 저항
        b.rot += b.spin;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      clearTimeout(finish);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [amount]);

  if (amount <= 0) return null;

  return (
    <div className="reward-cheer" aria-live="polite">
      <canvas ref={canvasRef} className="reward-cheer-canvas" aria-hidden="true" />
      <div className="reward-cheer-badge" role="status">
        <span className="reward-cheer-emoji" aria-hidden="true">🍎</span>
        <strong className="reward-cheer-plus">+{amount}</strong>
        <span className="reward-cheer-text">과일을 받았어요!</span>
      </div>
    </div>
  );
}
