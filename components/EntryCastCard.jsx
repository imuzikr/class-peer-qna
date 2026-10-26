"use client";

// =============================================================
// 방송 본문을 '한 눈에 보기' 모양으로 — 문장 한 줄 + 카드 한 장
// -------------------------------------------------------------
// RAFT 글쓰기처럼 긴 글은 카드에 담아 보여 줍니다(선생님 요청). 모양은
// 한 눈에 보기 창(EntryOverviewModal)의 카드와 **같은 클래스**(`.eov-*`)라,
// 교사가 한 눈에 보기에서 본 것과 칠판에 뜬 것이 같은 얼굴입니다.
// 꾸러미에 `look: "card"`가 실려 오면 학생 방송 화면(PresentationOverlay)과
// 교사의 수업 화면 창(CastStageModal)이 둘 다 이것을 그립니다.
//
// fit — 학생 방송 화면은 **글 전체가 한 화면에 들도록** 글자 크기를 잽니다
// (선생님 요청 — 글 양으로 크기를 미리 정했더니 긴 글은 화면 아래로 잘렸습니다).
// 카드가 화면 높이를 다 쓰고, 글 칸이 넘치지 않는 가장 큰 크기를 찾습니다
// (FIT_MAX에서 FIT_MIN까지, 반씩 좁혀 가며). 그래도 넘치면 글 칸 안에서 구릅니다.
// 교사의 수업 화면 창은 fit 없이 그대로(창 안 본문이 구름).
// =============================================================
import { useLayoutEffect, useRef, useState } from "react";

const FIT_MAX = 64;
const FIT_MIN = 16;

export default function EntryCastCard({ payload, fit = false }) {
  const fields = payload?.fields ?? [];
  const boxRef = useRef(null);
  const [fitSize, setFitSize] = useState(null);
  const textKey = fields.map((f) => f.text ?? "").join("\u0001");

  useLayoutEffect(() => {
    if (!fit) return undefined;
    const box = boxRef.current;
    if (!box) return undefined;
    let raf = 0;
    const measure = () => {
      // 반씩 좁혀 가며 '넘치지 않는 가장 큰 크기'를 찾습니다 — 매번 실제로 그려 잼
      let lo = FIT_MIN;
      let hi = FIT_MAX;
      const fits = (px) => {
        box.style.setProperty("--fit-size", `${px}px`);
        return box.scrollHeight <= box.clientHeight + 1;
      };
      if (fits(hi)) lo = hi;
      else {
        while (hi - lo > 1) {
          const mid = Math.floor((lo + hi) / 2);
          if (fits(mid)) lo = mid;
          else hi = mid;
        }
      }
      box.style.setProperty("--fit-size", `${lo}px`);
      setFitSize(lo);
    };
    measure();
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    ro?.observe(box);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [fit, textKey]);

  const chars = fields.reduce((n, f) => n + String(f.text ?? "").trim().length, 0);
  return (
    <div className={`entry-cast-card${fit ? " entry-cast-card--fit" : ""}`}>
      {payload?.note && <p className="raft-sentence done eov-lead">{payload.note}</p>}
      <section className={`eov-card wide${chars > 0 ? " done" : " empty"}`}>
        <header className="eov-card-head">
          {payload?.letter && <span className="paratext-letter" aria-hidden="true">{payload.letter}</span>}
          <span className="paratext-card-title">
            <strong>{payload?.label}</strong>
            {payload?.labelEn && <em>{payload.labelEn}</em>}
          </span>
          <span className={`eov-state${chars > 0 ? " done" : ""}`}>
            {chars > 0 ? `${chars}자` : "비어 있음"}
          </span>
        </header>
        {payload?.prompt && <p className="eov-prompt">{payload.prompt}</p>}
        <div
          className="eov-fields entry-cast-body"
          ref={boxRef}
          style={fit && fitSize ? { "--fit-size": `${fitSize}px` } : undefined}
        >
          {fields.length === 0 ? (
            <p className="eov-text paratext-read-text empty">아직 쓰지 않았어요</p>
          ) : (
            fields.map((f, i) => {
              const text = String(f.text ?? "").trim();
              return (
                <div key={i} className="eov-field">
                  {f.label && <span className="eov-label">{f.label}</span>}
                  <p className={`eov-text paratext-read-text${text ? "" : " empty"}`}>
                    {text || "아직 쓰지 않았어요"}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
