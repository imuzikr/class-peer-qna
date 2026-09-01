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
// 갑니다 — 아래에서 불씨가 **솟아오르고**(꼬리를 흘리며), 꼭대기에서
// **터집니다**. 열 발 넘게 시차를 두고 올라가 쉬지 않고 이어집니다.
//
// [터지는 모양 세 가지] 한 가지 모양만 되풀이하면 발수를 늘려도 같은 그림이
// 겹칠 뿐입니다. 그래서 세 가지를 섞습니다.
//   ring   둥근 고리 — 가장 흔한 모양
//   willow 수양버들 — 느리게 퍼져 길게 늘어지며 내려앉음
//   double 이중 고리 — 안쪽은 다른 색, 바깥은 넓게
//
// [섬광] 터지는 순간 그 자리에 빛이 확 퍼집니다. 이것 하나로 '흩어진다'가
// '터진다'로 바뀝니다 — 불티만 그리면 아무리 많아도 조용합니다. 섬광은
// 겹칠수록 밝아지도록 'lighter'로 그립니다. 불티는 그대로 둡니다 — 불티까지
// 더하기로 그리면 겹치는 곳이 죄다 흰 덩어리가 됩니다.
//
// [불꼬리] 매 프레임 화면을 지우고 점을 찍으면 불티가 뚝뚝 끊겨 보입니다.
// 직전 자리에서 지금 자리까지 선을 그어 꼬리를 남깁니다 — 캔버스를 반투명
// 으로 덧칠해 잔상을 남기는 흔한 방법은 쓰지 않습니다. 그러면 잔상이 뒤의
// 밤하늘까지 덮어 시간이 갈수록 화면이 탁해집니다.
//
// [한 발 = 한 색] 진짜 폭죽처럼 한 발은 한 색으로 터집니다(이중 고리만
// 안쪽에 색 하나를 더 씁니다). 발마다 색이 달라 여러 발이 겹쳐도 어디서 터진
// 불티인지 구분됩니다.
//
// [밤하늘] 폭죽은 어두운 배경이 있어야 폭죽으로 보입니다. 이 앱은 크림색
// 바탕이라 불티가 그대로 묻혔습니다(재 보니 노랑 1.53:1, 초록 2.16:1).
// 3.2초 동안만 화면을 덮었다가 걷습니다.
//
// [화면을 막지 않습니다] 하늘도 캔버스도 pointer-events: none이라 터지는
// 동안에도 아래 화면을 그대로 누를 수 있습니다. 3.2초 뒤 스스로 사라집니다.
//
// [라이브러리를 쓰지 않는 이유] 불티 몇 백 개를 그리는 일이라 캔버스 하나와
// rAF 한 줄이면 됩니다. 이것 때문에 번들에 패키지를 더할 일은 아닙니다.
//
// [움직임을 줄인 설정] prefers-reduced-motion이면 아무것도 쏘지 않고 가운데
// 뱃지만 잠깐 띄웁니다 — 알리는 일은 그대로 하되 흔들지 않습니다.
// =============================================================
import { useEffect, useRef } from "react";

const LIFE_MS = 3200;
// 발마다 하나씩 골라 쓰는 색. 밤하늘(스크림) 위에서 재 보니 가장 낮은 색도
// 3.66:1이라 여섯 색 모두 또렷합니다 — 크림색 배경 위에서 쓰던 과일 계열은
// 노랑 1.53:1, 초록 2.16:1로 거의 보이지 않았습니다.
const COLORS = ["#ffd166", "#ffb37a", "#7ff0a8", "#7fd4ff", "#ffa3b8", "#fff3c4"];
const GRAVITY = 0.16;   // 터진 뒤 불티가 내려앉는 정도
const DRAG = 0.975;     // 공기 저항 — 터진 직후 빠르게 퍼졌다가 이내 느려짐
// 올라가는 데 걸리는 시간(프레임). 솟는 힘을 불티의 중력에서 계산했더니
// 큰 화면에서 1.2초, 작은 화면에서 1.5초가 걸려 화면 안에서 다 터지지
// 못했습니다. 올라가는 것은 화약이 미는 것이라 떨어지는 것과 같은 힘일 이유가
// 없습니다. 그래서 '몇 프레임에 걸쳐 올라간다'로 못박고 속도를 거꾸로 구합니다.
const RISE_FRAMES = 30;
const RISE_DECAY = 0.985; // 꼭대기에서 살짝 늘어지게
// 감쇠가 누적된 이동거리 = v0 · (1-DECAY^n)/(1-DECAY)
const RISE_SPAN = (1 - RISE_DECAY ** RISE_FRAMES) / (1 - RISE_DECAY);
const KINDS = ["ring", "willow", "double", "ring"]; // ring이 조금 더 자주

// "#rrggbb" + 투명도 → rgba(). 섬광의 그라데이션에 씁니다.
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

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
    const burstR = Math.min(w, h) * 0.24;
    // 저항이 누적된 이동거리 = v0 · (1-DRAG^n)/(1-DRAG). n=45프레임으로 잡음.
    const sparkV = burstR / ((1 - DRAG ** 45) / (1 - DRAG));
    const g = GRAVITY * scale;

    // 과일을 많이 받을수록 더 많이 — 다만 마지막 발도 화면 안에서 터지도록
    // 상한을 둡니다(마지막 발사 ≈ 1.4초 + 올라가는 0.5초 = 1.9초 < 3.2초).
    const shellCount = Math.min(9 + amount * 2, 16);
    // 발사 위치를 그냥 난수로 뽑았더니 열한 발이 오른쪽에 몰리고 왼쪽 절반이
    // 비는 일이 있었습니다(실측). 폭을 발수만큼의 띠로 나눠 띠마다 한 발씩
    // 두고, 그 순서를 섞습니다 — 고르게 퍼지되 좌에서 우로 훑는 것처럼
    // 보이지는 않습니다. 띠 안에서는 여전히 아무 자리나 잡습니다.
    const slots = Array.from({ length: shellCount }, (_, i) => (i + Math.random()) / shellCount);
    for (let i = slots.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    const shells = Array.from({ length: shellCount }, (_, i) => {
      // 가운데 76% 안에서 올라갑니다(가장자리에서 터지면 절반이 잘립니다).
      const x = w * (0.12 + slots[i] * 0.76);
      const apex = h * (0.12 + Math.random() * 0.36);
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
        inner: COLORS[(i + 3) % COLORS.length], // 이중 고리의 안쪽 색
        kind: KINDS[Math.floor(Math.random() * KINDS.length)],
        at: i * 88 + Math.random() * 70, // 발마다 시차 — 쉬지 않고 이어지게
        burst: false,
      };
    });
    const sparks = [];
    const flashes = [];

    // 불티 한 개. gf는 중력을 받는 정도(수양버들은 무겁게 내려앉습니다).
    function spark(x, y, angle, v, color, decay, gf) {
      sparks.push({
        x, y, px: x, py: y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        color, decay, gf,
        life: 1,
        // 일부만 반짝이게 — 전부 깜빡이면 화면이 지지직거립니다.
        twinkle: Math.random() < 0.3,
      });
    }

    function ringOf(shell, n, vLo, vHi, color, dLo, dHi, gf) {
      for (let i = 0; i < n; i += 1) {
        // 고른 각도에 흔들림을 조금 섞습니다 — 정확히 등간격이면 톱니바퀴처럼
        // 보여 터진 것이 아니라 그린 것 같습니다.
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.18;
        // 안쪽에도 불티가 남게 속도를 흩습니다(테두리만 있는 고리 방지).
        const v = sparkV * (vLo + Math.random() * (vHi - vLo));
        spark(shell.x, shell.y, a, v, color, dLo + Math.random() * (dHi - dLo), gf);
      }
    }

    function explode(shell) {
      flashes.push({ x: shell.x, y: shell.y, color: shell.color, life: 1 });
      if (shell.kind === "willow") {
        // 느리게 퍼지고 오래 남아 길게 늘어집니다.
        ringOf(shell, 60, 0.3, 0.6, shell.color, 0.005, 0.009, 1.15);
      } else if (shell.kind === "double") {
        ringOf(shell, 52, 0.28, 0.42, shell.inner, 0.011, 0.018, 0.5);
        ringOf(shell, 64, 0.75, 1.05, shell.color, 0.009, 0.015, 0.5);
      } else {
        ringOf(shell, 76, 0.45, 1, shell.color, 0.009, 0.016, 0.55);
      }
    }

    const start = performance.now();
    let raf = 0;
    function frame(now) {
      const t = now - start;
      if (t >= LIFE_MS) { ctx.clearRect(0, 0, w, h); return; }
      // 끝에서 서서히 사라지게 — 갑자기 없어지면 화면이 튑니다.
      const fade = t < LIFE_MS * 0.8 ? 1 : 1 - (t - LIFE_MS * 0.8) / (LIFE_MS * 0.2);

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";

      // ── 섬광 — 겹칠수록 밝아지게 'lighter'로 먼저 깔고 원래대로 되돌립니다
      ctx.globalCompositeOperation = "lighter";
      for (let i = flashes.length - 1; i >= 0; i -= 1) {
        const f = flashes[i];
        f.life -= 0.07;
        if (f.life <= 0) { flashes.splice(i, 1); continue; }
        const r = burstR * (0.35 + (1 - f.life) * 0.85);
        const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        grd.addColorStop(0, rgba(f.color, 0.5 * f.life * fade));
        grd.addColorStop(0.45, rgba(f.color, 0.16 * f.life * fade));
        grd.addColorStop(1, rgba(f.color, 0));
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // ── 올라가는 불씨 (꼬리를 흘리며)
      for (const s of shells) {
        if (s.burst || t < s.at) continue;
        s.px = s.x;
        s.py = s.y;
        s.x += s.vx;
        s.y += s.vy;
        s.vy *= RISE_DECAY;
        if (s.y <= s.apex) { s.burst = true; explode(s); continue; }
        // 지나온 자리에 잔불을 떨굽니다 — 솟아오르는 게 눈에 남습니다.
        spark(s.x, s.y, Math.PI / 2 + (Math.random() - 0.5), 0.5 * scale,
              s.color, 0.06, 0.25);
        ctx.globalAlpha = fade;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 3 * scale;
        ctx.beginPath();
        ctx.moveTo(s.px, s.py);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }

      // ── 불티
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const p = sparks[i];
        p.life -= p.decay;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        p.px = p.x;
        p.py = p.y;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += g * p.gf;
        p.vx *= DRAG;
        p.vy *= DRAG;
        // 사그라들 무렵에만 깜빡입니다 — 잦아드는 불씨처럼.
        if (p.twinkle && p.life < 0.55 && Math.random() < 0.35) continue;
        ctx.globalAlpha = fade * Math.min(1, p.life * 1.6);
        ctx.strokeStyle = p.color;
        // 굵기를 life에 그대로 곱하면 끝에서 0으로 사라져 선이 아니라
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
      {/* 잠깐의 밤하늘 — 불투명도 0.7은 불티 여섯 색이 모두 3:1을 넘는
          지점입니다(최저 3.66:1). 클릭은 그대로 통과합니다. */}
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
