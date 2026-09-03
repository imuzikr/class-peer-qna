"use client";

// =============================================================
// 낱말 구름 — 반이 모은 낱말을 크기로 보여 주는 화면
// -------------------------------------------------------------
// 격자(닿소리 14칸)는 '첫 글자'로 나뉜 자리라, 어떤 낱말이 많이 나왔는지는
// 칸을 하나씩 짚어야 알 수 있습니다. 구름은 칸을 지우고 **낱말만** 남겨
// 한 화면에서 그것을 보여 줍니다. 둘은 같은 집계의 두 얼굴이라 읽는 문서는
// 하나도 늘지 않습니다.
//
// 색은 **위 다섯에만** 칠하고 나머지는 먹빛(큰 낱말일수록 짙게)입니다.
// 낱말마다 모둠 색을 입혀 봤더니 일흔 개가 저마다 다른 색이라 '어느 색이
// 많은가'를 눈이 먼저 세게 되어, 정작 '무엇이 많이 나왔나'가 묻혔습니다.
// 어느 모둠에서 나왔는지는 격자와 크게 보기가 색으로 말해 줍니다.
//
// 자리 잡기는 `lib/wordCloud.js`(순수 계산)에 있고, 여기서는 판의 크기를
// 재고 글자 폭을 재서 넘겨 주는 일만 합니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { layoutCloud, accentCount, restGray, estimateWidth } from "@/lib/wordCloud";

// 글자 굵기 — **CSS(.cloud-word)와 반드시 같아야 합니다.** 폭을 재는 canvas와
// 실제로 그리는 글자의 굵기가 다르면 자리가 어긋나 낱말끼리 겹칩니다.
const WEIGHT = 800;

export default function WordCloud({
  words = [],
  rest = 0,
  onPick = null,          // 낱말을 누르면 그 자음 칸을 크게 열기 (교사 화면만)
  hint = null,            // 판 아래 한 줄 안내 (없으면 기본 문구)
}) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const laidOnce = useRef(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [items, setItems] = useState([]);

  // 판 크기 — 창을 줄이거나 서랍이 열려 좁아지면 다시 배치합니다.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setBox((prev) =>
        // 몇 px 흔들림으로 다시 배치하지 않게 (스크롤바 등장 등)
        Math.abs(prev.w - r.width) < 6 && Math.abs(prev.h - r.height) < 6
          ? prev
          : { w: Math.round(r.width), h: Math.round(r.height) }
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 낱말이 바뀌었는지 — 텍스트와 횟수만 보면 됩니다(같으면 다시 배치할 이유 없음)
  const wordKey = useMemo(
    () => words.map((w) => `${w.text}:${w.count}`).join("|"),
    [words]
  );

  useEffect(() => {
    const el = boxRef.current;
    if (!el || !box.w || !box.h) return;
    const run = () => {
      const measure = makeMeasure(el, canvasRef);
      const laid = layoutCloud(words, { width: box.w, height: box.h, measure });
      laidOnce.current = true;
      setItems(laid.items);
    };
    // 수업 중에는 학생이 낱말을 넣을 때마다 집계가 바뀝니다. 그때마다 구름을
    // 다시 짜면 화면이 쉬지 않고 뒤척여 읽을 수가 없습니다. 처음 한 번은
    // 곧바로, 그 뒤로는 잠깐 모았다가 한 번만 다시 짭니다.
    const t = setTimeout(run, laidOnce.current ? 900 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordKey, box.w, box.h]);

  const Word = onPick ? "button" : "span";

  // 색을 칠할 낱말과, 나머지의 먹빛을 정할 크기 범위
  const accentN = useMemo(() => accentCount(words), [words]);
  const accent = useMemo(
    () => new Set(words.slice(0, accentN).map((w) => w.text)),
    [words, accentN]
  );
  const [small, big] = useMemo(() => {
    if (!items.length) return [0, 1];
    const sizes = items.map((i) => i.size);
    return [Math.min(...sizes), Math.max(...sizes)];
  }, [items]);

  return (
    <div className="cloud-wrap">
      <div className="cloud-box" ref={boxRef}>
        {items.map((w) => {
          const color = accent.has(w.text)
            ? "var(--primary)"
            : restGray(big > small ? (w.size - small) / (big - small) : 1);
          return (
            <Word
              key={w.text}
              {...(onPick ? { type: "button", onClick: () => onPick(w) } : {})}
              className="cloud-word"
              style={{ left: w.x, top: w.y, fontSize: `${w.size}px`, color }}
              title={`${w.text} — ${w.count}번`}
            >
              {w.text}
            </Word>
          );
        })}
        {words.length === 0 && (
          <p className="cloud-empty">아직 모인 낱말이 없어요.</p>
        )}
      </div>
      <p className="cloud-hint">
        {hint ?? (
          <>
            많이 나온 낱말일수록 크게, 가장 많이 나온 다섯은 색으로.
            {rest > 0 && <> 여기 없는 낱말 {rest}개는 격자에서 볼 수 있어요.</>}
            {onPick && <> 낱말을 누르면 그 칸이 크게 열립니다.</>}
          </>
        )}
      </p>
    </div>
  );
}

// 글자 폭 재기 — 실제로 그릴 서체 그대로 canvas에 재 봅니다.
// (어림값으로 하면 '뽀글뽀글'처럼 폭이 어긋나 낱말끼리 겹칩니다)
function makeMeasure(el, canvasRef) {
  let font = "";
  try {
    font = getComputedStyle(el).fontFamily;
  } catch {
    font = "";
  }
  const canvas = (canvasRef.current ??=
    typeof document !== "undefined" ? document.createElement("canvas") : null);
  const ctx = canvas?.getContext?.("2d");
  if (!ctx || !font) return estimateWidth;
  const cache = new Map();
  return (text, size) => {
    const px = Math.round(size);
    const key = `${px}|${text}`;
    let hit = cache.get(key);
    if (hit === undefined) {
      ctx.font = `${WEIGHT} ${px}px ${font}`;
      hit = ctx.measureText(text).width;
      cache.set(key, hit);
    }
    return hit;
  };
}
