"use client";

// =============================================================
// 여섯 개의 해시태그 — 학생 한 명의 슬라이드 한 장 (읽기 전용)
// -------------------------------------------------------------
// 교사가 '수업 시작'을 누르면 이 한 장이 학급 화면에 뜹니다. 같은 모양을
// 세 곳이 씁니다 — 학생 화면의 방송(PresentationOverlay) · 교사의 수업 화면
// 창(CastStageModal) · 교사 화면 가운데(친구 보기는 HashtagInfographic). **교사가 보는
// 것이 곧 칠판에 뜬 것**이어야 하므로 한 컴포넌트로 둡니다.
//
//   머리  누구의 것 · 읽은 글 한 줄 · 찾은 해시태그 칩 줄   (+ 대표 이미지)
//   몸통  태그마다 카드 한 장 — #태그 · 원문 문장(인용) · 생각
//
// 받는 값은 `hashtagSlide()`가 지은 모양(= 방송 꾸러미)입니다. 남이 쓴 값이라
// 그리기 전에 `normalizeHashtagSlide`로 한 번 더 거릅니다.
//
// variant
//   "page"  — 화면 안의 한 칸(교사 가운데 · 친구 보기). 글자는 본문 크기.
//   "cast"  — 칠판. 글이 적을수록 크게(data-size, 곁텍스트·KWLS 방송과 같은 생각).
// =============================================================
import {
  hashtagSlideSize,
  hashtagSourceLine,
  normalizeHashtagSlide,
} from "@/lib/hashtag";

export default function HashtagSlide({ slide, variant = "page", maxCols = 3 }) {
  const s = normalizeHashtagSlide(slide);
  const size = hashtagSlideSize(s);
  const src = hashtagSourceLine(s.source);
  const tagged = s.entries.filter((e) => e.tag);
  // 칠판(cast)은 **칸 크기를 못 박습니다** — 세 칸 × 두 줄(여섯 자리)이 늘
  // 같은 크기로 서고, 카드가 적으면 빈 자리가 남습니다. 학생을 넘길 때마다
  // 카드 수에 따라 칸이 커졌다 작아졌다 하면 같은 화면으로 안 읽힙니다
  // (선생님 요청). 여섯을 넘는 옛 기록(열 개이던 때)만 줄이 늘어납니다.
  // 화면 안의 한 칸(page)은 카드가 적으면 한 줄에 덜 세웁니다 — 두 장을
  // 세 칸 격자에 두면 오른쪽이 통째로 빕니다. 좁은 자리(교사의 수업 화면
  // 창)는 maxCols로 두 장까지만.
  const n = s.entries.length;
  const cols =
    variant === "cast" ? 3 : Math.min(maxCols, n <= 1 ? 1 : n <= 4 ? 2 : 3);
  const rows = Math.max(2, Math.ceil(n / 3));

  return (
    <article
      className={`hts hts--${variant}`}
      data-size={size}
      style={{ "--hts-cols": cols, "--hts-rows": rows }}
      aria-label={`${s.writerName || "학생"}의 해시태그`}
    >
      <header className="hts-head">
        <div className="hts-head-text">
          {s.activityTitle && <p className="hts-kicker">{s.activityTitle}</p>}
          {s.writerName && <h2 className="hts-who">{s.writerName}</h2>}
          {src && <p className="hts-source">{src}</p>}
          {tagged.length > 0 && (
            <p className="hts-tags">
              {tagged.map((e, i) => (
                <span key={i} className="hts-tag">#{e.tag}</span>
              ))}
            </p>
          )}
        </div>
        {s.image.url && (
          <figure className="hts-figure">
            <img src={s.image.url} alt={s.image.caption || "대표 이미지"} />
            {s.image.caption && <figcaption>{s.image.caption}</figcaption>}
          </figure>
        )}
      </header>

      {s.entries.length === 0 ? (
        <p className="hts-empty">아직 찾은 해시태그가 없어요.</p>
      ) : (
        <ol className="hts-grid">
          {s.entries.map((e, i) => (
            <li key={i} className="hts-card">
              <h3 className={`hts-card-tag${e.tag ? "" : " empty"}`}>
                {e.tag ? `#${e.tag}` : "태그 없음"}
              </h3>
              {e.quote ? (
                <blockquote className="hts-quote">{e.quote}</blockquote>
              ) : (
                <p className="hts-blank">원문 문장을 아직 옮기지 않았어요</p>
              )}
              {e.insight ? (
                <p className="hts-insight">
                  <b>생각</b>
                  {e.insight}
                </p>
              ) : (
                <p className="hts-blank">생각을 아직 쓰지 않았어요</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
