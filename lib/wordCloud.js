// =============================================================
// 낱말 구름 — 자리 잡기 (순수 계산, DOM 없음)
// -------------------------------------------------------------
// 닿소리 활동의 집계는 이미 '낱말 + 나온 횟수 + 낸 모둠'까지 다 있습니다.
// 말뭉치도 형태소 분석도 불용어 목록도 필요 없습니다 — 학생이 손으로 고른
// 낱말이라 그 자체가 이미 결과물입니다. 남은 일은 **그리기**뿐이라
// 라이브러리를 들이지 않고 여기서 직접 자리를 잡습니다.
//
// 방법은 흔한 그대로입니다: 큰 낱말부터 한가운데에 놓고, 자리가 겹치면
// 나선을 그리며 바깥으로 밀려 나가 빈틈을 찾습니다. 판이 가로로 길어
// 나선도 판의 비율만큼 옆으로 늘립니다(안 그러면 가운데에 동그란 덩어리가
// 생기고 좌우가 텅 빕니다).
//
// 글자 크기는 **나온 횟수**로만 정합니다. 순위로 정하면 다들 한 번씩 나온
// 낱말 사이에도 크기 차이가 생겨, 있지도 않은 차이를 있는 것처럼 보여
// 줍니다. 다 같이 한 번씩이면 다 같은 크기가 맞습니다.
// =============================================================

// 격자에 다 못 담는 낱말을 크기로 보여 주는 자리라 개수가 넉넉해야 하지만,
// 오백 개를 다 그리면 대부분이 읽을 수 없는 점이 됩니다. 칠판에서 뒷자리
// 학생이 읽을 수 있는 선이 이 언저리입니다.
export const CLOUD_TOP_N = 70;

// 글자 크기의 밑그림(상대값). 실제 크기는 판 넓이에 맞춰 통째로 늘고 줄어듭니다.
const UNIT_MIN = 15;
const UNIT_MAX = 58;

// 최종 글자 크기의 한계 — 판이 아무리 넓어도 이보다 크거나 작아지지 않게
const SIZE_MIN = 11;
const SIZE_MAX = 96;

const LINE = 1.16;   // 글자 크기 → 줄 높이
const PAD_X = 7;     // 낱말 사이 좌우 여백
const PAD_Y = 3;     // 위아래 여백

// 판 넓이 중 글자가 차지할 몫. 1에 가까울수록 빽빽합니다 — 나선 배치는
// 빈틈이 남기 마련이라 0.5를 넘기면 자리를 못 찾는 낱말이 늘어납니다.
const DENSITY = 0.52;

// ── 낱말 고르기 ────────────────────────────────────────────────
// 칸별로 나뉘어 있는 집계를 한 줄로 펴고, 많이 나온 순으로 위에서 n개.
//
// 정렬 기준은 격자(TopWords)와 **같아야 합니다** — 같은 화면의 두 얼굴인데
// 무엇이 '상위'인지가 다르면 격자에 큰 낱말이 구름에 없는 일이 생깁니다.
//   ① 많이 나온 순 ② 같으면 먼저 채운 순 ③ 그래도 같으면 가나다
export function cloudWords(cells, n = CLOUD_TOP_N) {
  const byText = new Map();
  Object.entries(cells ?? {}).forEach(([key, list]) => {
    // 저장 키는 c0~c13 — 뒤의 숫자가 자음 칸 번호입니다(눌렀을 때 그 칸을 열려고).
    const slot = Number(String(key).replace(/^c/, ""));
    (list ?? []).forEach((w) => {
      const text = String(w?.text ?? "").trim();
      if (!text) return;
      const count = Number(w.count ?? (w.from?.length ?? 1)) || 1;
      const firstAt = Number.isFinite(w.firstAt) ? w.firstAt : Infinity;
      // 같은 낱말이 두 칸에 들어가 있는 경우(첫 글자를 잘못 고른 경우)는
      // 한 덩어리로 봅니다. 구름은 칸이 아니라 낱말을 보여 주는 자리입니다.
      const hit = byText.get(text);
      if (hit) {
        hit.count += count;
        hit.from = hit.from.concat(w.from ?? []);
        if (firstAt < hit.firstAt) hit.firstAt = firstAt;
      } else {
        byText.set(text, {
          text,
          count,
          from: [...(w.from ?? [])],
          firstAt,
          slot: Number.isFinite(slot) ? slot : null,
        });
      }
    });
  });

  const all = [...byText.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.firstAt - b.firstAt ||
      a.text.localeCompare(b.text, "ko")
  );
  return { words: all.slice(0, n), rest: Math.max(0, all.length - n), total: all.length };
}

// ── 색 ────────────────────────────────────────────────────────
// **위 다섯만 색, 나머지는 먹빛.** 낱말마다 모둠 색을 입혀 봤더니 일흔
// 개가 저마다 다른 색이라 '어느 색이 많은가'를 눈이 먼저 세게 되고,
// 정작 이 화면이 말하려는 '무엇이 많이 나왔나'가 묻혔습니다. 모둠은
// 격자와 크게 보기가 색으로 말해 줍니다 — 여기서는 크기 하나만.
export const CLOUD_ACCENT_N = 5;

// 몇 개에 색을 칠할지. 그냥 앞에서 다섯을 세면, 다들 한 번씩 나온 판에서도
// 아무 낱말 다섯에 색이 붙어 '얘들이 많이 나왔다'고 거짓말을 합니다.
// 그래서 **6위보다 확실히 많이 나온 낱말에만** 칠합니다 — 다 같은 횟수면
// 하나도 안 칠합니다(색이 없는 것도 사실을 말합니다).
export function accentCount(words, n = CLOUD_ACCENT_N) {
  if (!words?.length) return 0;
  if (words[0].count === words[words.length - 1].count) return 0;
  const boundary = words[n]?.count ?? -Infinity;
  let k = 0;
  while (k < Math.min(n, words.length) && words[k].count > boundary) k += 1;
  return k;
}

// 색을 안 칠하는 낱말의 먹빛 — 클수록 짙게, 작을수록 옅게.
// 작은 낱말까지 새까맣게 두면 일흔 개가 한꺼번에 소리쳐 큰 낱말이 안
// 보입니다. t는 그 구름에서의 상대 크기(0 = 가장 작은 것, 1 = 가장 큰 것).
const GRAY_SMALL = [168, 167, 159]; // 옅은 따뜻한 회색
const GRAY_BIG = [42, 42, 39];      // 거의 먹빛
export function restGray(t) {
  const k = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 1));
  const ch = (i) => Math.round(GRAY_SMALL[i] + (GRAY_BIG[i] - GRAY_SMALL[i]) * k);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

// 그 낱말을 가장 많이 낸 모둠 — 크게 보기·격자가 쓰는 모둠 색용.
// (여러 모둠에서 나왔으면 제일 많이 낸 쪽, 같으면 먼저 나온 쪽)
export function dominantGroup(from = []) {
  if (!from.length) return null;
  const tally = new Map();
  from.forEach((g) => tally.set(g, (tally.get(g) ?? 0) + 1));
  let best = from[0];
  let bestN = 0;
  tally.forEach((nGroup, g) => {
    if (nGroup > bestN) { best = g; bestN = nGroup; }
  });
  return best;
}

// ── 자리 잡기 ──────────────────────────────────────────────────
// measure(text, size) → 그 크기로 그렸을 때의 글자 폭(px).
// 브라우저에서는 canvas measureText를, 그 밖에서는 어림값을 넘깁니다.
export function layoutCloud(words, { width, height, measure }) {
  if (!width || !height || !words?.length) return { items: [], scale: 1, dropped: 0 };

  const counts = words.map((w) => w.count);
  const lo = Math.min(...counts);
  const hi = Math.max(...counts);
  const base = words.map((w) => ({
    ...w,
    // 넓이가 횟수에 비례하도록 제곱근을 씁니다. 크기를 횟수에 그대로 비례
    // 시키면 세 번 나온 낱말이 한 번짜리보다 아홉 배 넓어 보입니다.
    unit:
      hi > lo
        ? UNIT_MIN + (UNIT_MAX - UNIT_MIN) * Math.sqrt((w.count - lo) / (hi - lo))
        : (UNIT_MIN + UNIT_MAX) / 2,
  }));

  // 첫 크기 — 글자들이 차지할 넓이가 판의 DENSITY만큼 되도록 통째로 맞춥니다.
  // 넓이는 크기의 제곱에 비례하므로 한 번의 제곱근으로 바로 나옵니다.
  const area1 = base.reduce((s, w) => s + (measure(w.text, w.unit) + PAD_X * 2) * (w.unit * LINE + PAD_Y * 2), 0);
  let scale = area1 > 0 ? Math.sqrt((width * height * DENSITY) / area1) : 1;

  // 나선 배치는 빈틈이 남아 계산대로 딱 들어가지 않습니다. 하나라도 자리를
  // 못 찾으면 조금 줄여 다시 — 전부 들어갈 때까지(최대 14번).
  let best = null;
  for (let attempt = 0; attempt < 14; attempt++) {
    const packed = pack(base, scale, width, height, measure);
    if (packed.dropped === 0) return { items: packed.items, scale, dropped: 0 };
    if (!best || packed.items.length > best.items.length) best = { ...packed, scale };
    scale *= 0.86;
  }
  return { items: best?.items ?? [], scale: best?.scale ?? scale, dropped: best?.dropped ?? 0 };
}

function pack(base, scale, W, H, measure) {
  const rects = [];
  const items = [];
  let dropped = 0;
  const cx = W / 2;
  const cy = H / 2;
  // 나선을 판의 비율만큼 옆으로 늘립니다(가로로 긴 판에서 좌우가 비지 않게)
  const aspect = Math.max(0.7, Math.min(2.6, W / H));

  for (const w of base) {
    const size = Math.max(SIZE_MIN, Math.min(SIZE_MAX, w.unit * scale));
    const bw = measure(w.text, size) + PAD_X * 2;
    const bh = size * LINE + PAD_Y * 2;
    if (bw > W || bh > H) { dropped += 1; continue; }
    const spot = spiral(bw, bh, W, H, cx, cy, aspect, rects);
    if (!spot) { dropped += 1; continue; }
    rects.push({ x: spot.x, y: spot.y, w: bw, h: bh });
    items.push({
      ...w,
      size,
      // 가운데 좌표로 돌려줍니다 — 화면에서 translate(-50%, -50%)로 얹으면
      // 글자 크기가 바뀌어도 자리가 흔들리지 않습니다.
      x: spot.x + bw / 2,
      y: spot.y + bh / 2,
      w: bw,
      h: bh,
    });
  }
  return { items, dropped };
}

// 아르키메데스 나선 — 각도를 조금씩 키우며 반지름도 함께 키웁니다.
// 각도 폭을 반지름에 반비례시켜, 바깥으로 나가도 훑는 간격이 일정합니다.
function spiral(bw, bh, W, H, cx, cy, aspect, rects) {
  const GROWTH = 3.2;   // 한 바퀴에 바깥으로 약 20px
  const ARC = 7;        // 훑는 간격(px)
  const maxR = H * 0.62;
  let t = 0;
  for (let step = 0; step < 24000; step += 1) {
    const r = GROWTH * t;
    if (r > maxR) return null;
    const x = cx + r * Math.cos(t) * aspect - bw / 2;
    const y = cy + r * Math.sin(t) - bh / 2;
    t += ARC / Math.max(r, ARC);
    if (x < 0 || y < 0 || x + bw > W || y + bh > H) continue;
    if (!hits(x, y, bw, bh, rects)) return { x, y };
  }
  return null;
}

function hits(x, y, bw, bh, rects) {
  for (let i = rects.length - 1; i >= 0; i -= 1) {
    const r = rects[i];
    if (x < r.x + r.w && x + bw > r.x && y < r.y + r.h && y + bh > r.y) return true;
  }
  return false;
}

// 브라우저 밖(또는 canvas가 없을 때)의 어림 글자 폭.
// 한글·한자는 한 글자가 거의 정사각형, 로마자·숫자·공백은 그 절반쯤입니다.
export function estimateWidth(text, size) {
  let units = 0;
  for (const ch of String(text)) {
    units += /[가-힣ㄱ-ㆎ一-鿿぀-ヿ]/.test(ch) ? 1 : 0.55;
  }
  return units * size;
}
