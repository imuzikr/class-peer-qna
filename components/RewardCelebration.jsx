"use client";

// =============================================================
// 과일을 받았을 때 터지는 폭죽 — 학생 화면 한가운데
// -------------------------------------------------------------
// 교사가 자리를 눌러 과일을 주면, 그 학생 화면에서만 이것이 터집니다.
// 받은 사실을 상단바의 작은 숫자가 조용히 1 늘어나는 것으로만 알리면
// 대개 아무도 못 보고 지나갑니다.
//
// [연달아 주면 이어서 쏩니다] 교사는 한 학생에게 과일을 여러 번 주는 일이
// 잦습니다(＋1을 서너 번). 예전에는 **첫 지급에만** 폭죽이 돌고 그 뒤로는
// 뱃지 숫자만 올라갔습니다 — 캔버스 effect가 `[active]`(개수가 0인가 아닌가)
// 하나만 보고 있어서 처음 한 번만 실행됐고, 프레임 루프도 `start + LIFE_MS`에
// 스스로 멈췄기 때문입니다. 그래서 2초 간격으로 다섯 번 주면 3.2초 뒤부터는
// **밤하늘도 불티도 없이 뱃지만 떠 있는** 화면을 7초 더 보게 됐습니다.
//
// 지금은 루프를 계속 돌려 두고 **지급할 때마다 새 발사를 목록에 밀어 넣습니다**
// (`launch`). 떠 있던 불티는 그대로 내려앉고 그 위로 새 발이 올라가, 연달아
// 줄수록 폭죽쇼가 길어집니다. 끝나는 시각도 `endAt`(마지막 발사 + LIFE_MS)로
// 밀리므로 캔버스·밤하늘·뱃지·사라지는 타이머가 한 시각에 맞습니다.
//   **'지급마다 처음부터 다시 시작'으로 짜지 마세요** — effect를 `[amount]`로
//   다시 걸면 정리(cleanup)가 돌며 `resize()`가 `canvas.width`를 다시 넣어
//   **화면이 통째로 지워지고**, 새 불씨가 바닥에서 올라오는 0.5초 동안 아무것도
//   없습니다. 빨리 여러 번 누를수록 터지는 장면이 오히려 줄어듭니다.
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
// 마지막 지급부터 LIFE_MS 동안만 화면을 덮었다가 걷습니다.
//
// [화면을 막지 않습니다] 하늘도 캔버스도 pointer-events: none이라 터지는
// 동안에도 아래 화면을 그대로 누를 수 있습니다.
//
// [라이브러리를 쓰지 않는 이유] 불티 몇 백 개를 그리는 일이라 캔버스 하나와
// rAF 한 줄이면 됩니다. 이것 때문에 번들에 패키지를 더할 일은 아닙니다.
//
// [움직임을 줄인 설정] prefers-reduced-motion이면 아무것도 쏘지 않고 가운데
// 뱃지만 잠깐 띄웁니다 — 알리는 일은 그대로 하되 흔들지 않습니다.
// =============================================================
import { useEffect, useRef, useState } from "react";

const LIFE_MS = 3200;
// 끝에서 옅어지는 구간. 캔버스의 `fade`와 밤하늘의 transition이 **같은 값**을
// 봐야 둘이 함께 걷힙니다(globals.css의 `.reward-cheer-sky` 참고).
const FADE_MS = 640;
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
// 아직 안 터진 채 올라가는 중인 발의 천장. 한 발이 불티를 60~116개 만들어,
// 연달아 다섯 번 받으면 크롬북에서 프레임이 떨어집니다. 천장에 닿아도
// **한 발은 반드시 쏩니다** — 누른 만큼 무언가는 터져야 하니까요.
const MAX_LIVE_SHELLS = 22;

// 한 번에 쏠 발수. 첫 발사는 예전 그대로라 과일 하나를 받았을 때의 모습이
// 달라지지 않고, 이어지는 발사는 작게 잡습니다 — 이미 하늘에 불티가 남아
// 있어 적은 발수로도 '또 터졌다'가 읽힙니다.
function volleySize(n, first) {
  return first ? Math.min(9 + n * 2, 16) : Math.min(5 + n * 2, 10);
}

// "#rrggbb" + 투명도 → rgba(). 섬광의 그라데이션에 씁니다.
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export default function RewardCelebration({ amount = 0, onDone }) {
  const canvasRef = useRef(null);
  const doneRef = useRef(onDone);
  // 캔버스가 살아 있는 동안만 채워집니다(움직임을 줄인 설정에서는 계속 null).
  const launchRef = useRef(null);
  const shotRef = useRef(0); // 지금까지 폭죽으로 쏜 개수 — amount와의 차이가 새 지급
  const [dimming, setDimming] = useState(false); // 밤하늘을 걷는 중
  const active = amount > 0;
  doneRef.current = onDone;

  // 사라지는 시각 — **마지막 지급부터** LIFE_MS. 지급이 더 오면 둘 다 되감깁니다.
  useEffect(() => {
    if (amount <= 0) {
      setDimming(false);
      return;
    }
    setDimming(false);
    const dim = setTimeout(() => setDimming(true), LIFE_MS - FADE_MS);
    const finish = setTimeout(() => doneRef.current?.(), LIFE_MS);
    return () => {
      clearTimeout(dim);
      clearTimeout(finish);
    };
  }, [amount]);

  // 캔버스 — active인 동안 **한 번만** 차립니다. 지급이 더 오면 아래 effect가
  // launch()로 발사만 덧붙입니다(맨 위 '연달아 주면 이어서 쏩니다' 참고).
  // 이 effect가 아래 발사 effect보다 **먼저 선언돼 있어야** 합니다 — React는
  // 같은 렌더에서 선언 순서대로 실행하므로, 뒤에 두면 첫 지급 때 launchRef가
  // 아직 비어 있어 아무것도 안 터집니다.
  useEffect(() => {
    if (!active) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const canvas = canvasRef.current;
    if (reduce || !canvas) return;

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

    let shells = [];
    const sparks = [];
    const flashes = [];
    let colorSeq = 0;       // 발마다 색을 돌려 쓰는 번호 — 발사가 갈려도 이어집니다
    let endAt = 0;          // 이 시각이 지나면 루프를 멈춥니다(발사할 때마다 미룸)
    let raf = 0;

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

    // 한 번 지급받은 만큼 쏩니다. now는 이 발사의 기준 시각 — 발마다 여기에
    // 시차를 더해 **절대 시각**으로 둡니다(루프 시작 시각 기준이 아니라).
    // 그래야 나중에 덧붙는 발사가 앞 발사의 시간표에 끌려가지 않습니다.
    function launch(n) {
      const now = performance.now();
      const first = shells.length === 0 && sparks.length === 0;
      // 이미 터진 발은 걷어 냅니다 — 안 걷으면 연달아 받을수록 배열만 늡니다.
      shells = shells.filter((s) => !s.burst);
      const count = Math.max(
        1,
        Math.min(volleySize(n, first), MAX_LIVE_SHELLS - shells.length)
      );

      // 발사 위치를 그냥 난수로 뽑았더니 열한 발이 오른쪽에 몰리고 왼쪽 절반이
      // 비는 일이 있었습니다(실측). 폭을 발수만큼의 띠로 나눠 띠마다 한 발씩
      // 두고, 그 순서를 섞습니다 — 고르게 퍼지되 좌에서 우로 훑는 것처럼
      // 보이지는 않습니다. 띠 안에서는 여전히 아무 자리나 잡습니다.
      const slots = Array.from({ length: count }, (_, i) => (i + Math.random()) / count);
      for (let i = slots.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      for (let i = 0; i < count; i += 1) {
        // 가운데 76% 안에서 올라갑니다(가장자리에서 터지면 절반이 잘립니다).
        const x = w * (0.12 + slots[i] * 0.76);
        const apex = h * (0.12 + Math.random() * 0.36);
        colorSeq += 1;
        shells.push({
          x,
          y: h + 10,
          apex,
          vx: (Math.random() - 0.5) * 0.6 * scale,
          // RISE_FRAMES 프레임 뒤 정확히 apex에 닿는 속도
          vy: -(h + 10 - apex) / RISE_SPAN,
          px: x,
          py: h + 10,
          color: COLORS[colorSeq % COLORS.length],
          inner: COLORS[(colorSeq + 3) % COLORS.length], // 이중 고리의 안쪽 색
          kind: KINDS[Math.floor(Math.random() * KINDS.length)],
          at: now + i * 88 + Math.random() * 70, // 발마다 시차 — 쉬지 않고 이어지게
          burst: false,
        });
      }

      endAt = now + LIFE_MS;
      // 루프가 멈춰 있으면(직전 발사가 다 사그라든 뒤) 다시 돌립니다.
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function frame(now) {
      if (now >= endAt) {
        ctx.clearRect(0, 0, w, h);
        raf = 0;
        return;
      }
      // 끝에서 서서히 사라지게 — 갑자기 없어지면 화면이 튑니다.
      const left = endAt - now;
      const fade = left >= FADE_MS ? 1 : left / FADE_MS;

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
        if (s.burst || now < s.at) continue;
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

    launchRef.current = launch;

    return () => {
      launchRef.current = null;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [active]);

  // 새로 받은 만큼 덧붙여 쏩니다 — **위 캔버스 effect보다 뒤에** 있어야 합니다.
  useEffect(() => {
    if (amount <= 0) {
      shotRef.current = 0;
      return;
    }
    const delta = amount - shotRef.current;
    if (delta <= 0) return;
    shotRef.current = amount;
    launchRef.current?.(delta);
  }, [amount]);

  if (!active) return null;

  return (
    <div className="reward-cheer" aria-live="polite">
      {/* 잠깐의 밤하늘 — 불투명도 0.7은 불티 여섯 색이 모두 3:1을 넘는
          지점입니다(최저 3.66:1). 클릭은 그대로 통과합니다.
          **key로 다시 마운트하지 마세요** — 들어오는 키프레임이 다시 돌아
          지급할 때마다 어둠이 0.26초씩 깜빡입니다. 걷는 것만 클래스로
          제어해, 늦게 온 지급에는 다시 짙어집니다. */}
      <div
        className={`reward-cheer-sky${dimming ? " is-out" : ""}`}
        aria-hidden="true"
      />
      <canvas ref={canvasRef} className="reward-cheer-canvas" aria-hidden="true" />
      <div className="reward-cheer-enter">
        <div key={amount} className="reward-cheer-badge" role="status">
          <span className="reward-cheer-emoji" aria-hidden="true">🍊</span>
          <strong className="reward-cheer-plus">+{amount}</strong>
          <span className="reward-cheer-text">과일을 받았어요!</span>
        </div>
      </div>
    </div>
  );
}
