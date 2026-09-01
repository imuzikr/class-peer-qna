"use client";

// =============================================================
// 과일을 받았을 때 터지는 폭죽 — 학생 화면 한가운데
// -------------------------------------------------------------
// 교사가 자리를 눌러 과일을 주면, 그 학생 화면에서만 이것이 터집니다.
// 받은 사실을 상단바의 작은 숫자가 조용히 1 늘어나는 것으로만 알리면
// 대개 아무도 못 보고 지나갑니다.
//
// [폭죽의 두 단계] 처음엔 가운데서 색종이를 사방으로 뿌렸는데, 터지는
// 순간이 없어 '축포'로 읽히지 않았습니다. 지금은 진짜 폭죽처럼 두 단계로
// 갑니다 — 아래에서 불씨가 **솟아오르고**, 꼭대기에서 **둥글게 터집니다**.
// 여러 발이 시차를 두고 올라가 화면 곳곳에서 연달아 터집니다.
//
// [불꼬리] 매 프레임 화면을 지우고 점을 찍으면 불티가 뚝뚝 끊겨 보입니다.
// 직전 자리에서 지금 자리까지 선을 그어 꼬리를 남깁니다 — 캔버스를 반투명
// 으로 덧칠해 잔상을 남기는 흔한 방법은 쓰지 않습니다. 그러면 잔상이 뒤의
// 밤하늘까지 덮어 시간이 갈수록 화면이 탁해집니다.
//
// [한 발 = 한 색] 진짜 폭죽처럼 한 발은 한 색으로 터집니다. 발마다 색이
// 달라 여러 발이 겹쳐도 어디서 터진 불티인지 구분됩니다.
//
// [밤하늘] 폭죽은 어두운 배경이 있어야 폭죽으로 보입니다. 이 앱은 크림색
// 바탕이라 불티가 그대로 묻혔습니다(재 보니 노랑 1.53:1, 초록 2.16:1).
// 2.6초 동안만 화면을 덮었다가 걷습니다.
//
// [화면을 막지 않습니다] 하늘도 캔버스도 pointer-events: none이라 터지는
// 동안에도 아래 화면을 그대로 누를 수 있습니다. 2.6초 뒤 스스로 사라집니다.
//
// [라이브러리를 쓰지 않는 이유] 불티 몇 백 개를 그리는 일이라 캔버스 하나와
// rAF 한 줄이면 됩니다. 이것 때문에 번들에 패키지를 더할 일은 아닙니다.
//
// [움직임을 줄인 설정] prefers-reduced-motion이면 아무것도 쏘지 않고 가운데
// 뱃지만 잠깐 띄웁니다 — 알리는 일은 그대로 하되 흔들지 않습니다.
// =============================================================
import { useEffect, useRef } from "react";

const LIFE_MS = 2600;
// 발마다 하나씩 골라 쓰는 색. 밤하늘(스크림) 위에서 재 보니 가장 낮은 색도
// 3.66:1이라 여섯 색 모두 또렷합니다 — 크림색 배경 위에서 쓰던 과일 계열은
// 노랑 1.53:1, 초록 2.16:1로 거의 보이지 않았습니다.
const COLORS = ["#ffd166", "#ffb37a", "#7ff0a8", "#7fd4ff", "#ffa3b8", "#fff3c4"];
const GRAVITY = 0.16;   // 터진 뒤 불티가 내려앉는 정도
const DRAG = 0.975;     // 공기 저항 — 터진 직후 빠르게 퍼졌다가 이내 느려짐
const SPARKS = 64;      // 한 발이 터질 때 나오는 불티 수
// 올라가는 데 걸리는 시간(프레임). 솟는 힘을 불티의 중력에서 계산했더니
// 큰 화면에서 1.2초, 작은 화면에서 1.5초가 걸려 3초 안에 다 터지지 못했습니다.
// 올라가는 것은 화약이 미는 것이라 떨어지는 것과 같은 힘일 이유가 없습니다.
// 그래서 '몇 프레임에 걸쳐 올라간다'로 못박고 속도를 거꾸로 구합니다.
const RISE_FRAMES = 30;
const RISE_DECAY = 0.985; // 꼭대기에서 살짝 늘어지게
// 감쇠가 누적된 이동거리 = v0 · (1-DECAY^n)/(1-DECAY)
const RISE_SPAN = (1 - RISE_DECAY ** RISE_FRAMES) / (1 - RISE_DECAY);

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

    // 크기를 화면에 매답니다. 픽셀로 못박아 두면 큰 화면에서는 가운데 한 줌만
    // 터지고 작은 화면에서는 한 프레임에 밖으로 나가 버립니다.
    const scale = Math.max(w, h) / 900;
    // 터지는 반경은 짧은 변 기준 — 세로로 긴 휴대폰에서 좌우로 넘치지 않게.
    const burstR = Math.min(w, h) * 0.22;
    // 저항이 누적된 이동거리 = v0 · (1-DRAG^n)/(1-DRAG). n=45프레임으로 잡음.
    const sparkV = burstR / ((1 - DRAG ** 45) / (1 - DRAG));
    const g = GRAVITY * scale;

    // 과일을 많이 받을수록 몇 발 더 — 다만 화면이 불티로 덮이지 않게 상한.
    const shellCount = Math.min(3 + amount, 7);
    const shells = Array.from({ length: shellCount }, (_, i) => {
      // 가운데 60% 안에서 올라갑니다(가장자리에서 터지면 절반이 잘립니다).
      const x = w * (0.2 + Math.random() * 0.6);
      const apex = h * (0.16 + Math.random() * 0.3);
      return {
        x,
        y: h + 10,
        apex,
        vx: (Math.random() - 0.5) * 0.6 * scale,
        // RISE_FRAMES 프레임 뒤 정확히 apex에 닿는 속도
        vy: -(h + 10 - apex) / RISE_SPAN,
        px: x,
        py: h + 10,
        color: COLORS[i % COLORS.length],
        at: i * 130 + Math.random() * 100, // 발마다 시차 — 한꺼번에 안 터지게
        burst: false,
      };
    });
    const sparks = [];

    function explode(shell) {
      for (let i = 0; i < SPARKS; i += 1) {
        // 고른 각도에 흔들림을 조금 섞습니다 — 정확히 등간격이면 톱니바퀴처럼
        // 보여 터진 것이 아니라 그린 것 같습니다.
        const a = (i / SPARKS) * Math.PI * 2 + Math.random() * 0.16;
        // 안쪽에도 불티가 남게 속도를 흩습니다(테두리만 있는 고리 방지).
        const v = sparkV * (0.45 + Math.random() * 0.55);
        sparks.push({
          x: shell.x,
          y: shell.y,
          px: shell.x,
          py: shell.y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          color: shell.color,
          life: 1,
          decay: 0.010 + Math.random() * 0.008,
        });
      }
    }

    const start = performance.now();
    let raf = 0;
    function frame(now) {
      const t = now - start;
      if (t >= LIFE_MS) { ctx.clearRect(0, 0, w, h); return; }
      // 끝에서 서서히 사라지게 — 갑자기 없어지면 화면이 튑니다.
      const fade = t < LIFE_MS * 0.75 ? 1 : 1 - (t - LIFE_MS * 0.75) / (LIFE_MS * 0.25);

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";

      for (const s of shells) {
        if (s.burst || t < s.at) continue;
        s.px = s.x;
        s.py = s.y;
        s.x += s.vx;
        s.y += s.vy;
        s.vy *= RISE_DECAY;
        if (s.y <= s.apex) { s.burst = true; explode(s); continue; }
        ctx.globalAlpha = fade;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 3 * scale;
        ctx.beginPath();
        ctx.moveTo(s.px, s.py);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }

      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const p = sparks[i];
        p.life -= p.decay;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        p.px = p.x;
        p.py = p.y;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += g * 0.55; // 불티는 가벼워 천천히 내려앉습니다
        p.vx *= DRAG;
        p.vy *= DRAG;
        ctx.globalAlpha = fade * Math.min(1, p.life * 1.6);
        ctx.strokeStyle = p.color;
        // 점이 됩니다. 밝기로만 사그라들게 하고 굵기는 바닥을 둡니다.
        ctx.lineWidth = 3.2 * scale * (0.4 + p.life * 0.6);
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
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
      {/* 잠깐의 밤하늘 — 폭죽은 어두운 배경이 있어야 폭죽으로 보입니다.
          이 앱은 크림색 바탕이라 불티가 그대로 묻혔습니다(측정: 노랑 1.53:1).
          2.6초 동안만 어둡게 덮고 걷습니다. 클릭은 그대로 통과합니다. */}
      <div className="reward-cheer-sky" aria-hidden="true" />
      <canvas ref={canvasRef} className="reward-cheer-canvas" aria-hidden="true" />
      <div className="reward-cheer-badge" role="status">
        <span className="reward-cheer-emoji" aria-hidden="true">🍎</span>
        <strong className="reward-cheer-plus">+{amount}</strong>
        <span className="reward-cheer-text">과일을 받았어요!</span>
      </div>
    </div>
  );
}
