"use client";

// =============================================================
// 열 개의 해시태그 — 보고서 한 장 (읽기 전용)
// -------------------------------------------------------------
// 학생이 폼에 적은 것을 **정해 둔 학술 보고서 틀**에 앉힙니다. 글을 새로
// 짓는 것은 없습니다 — 차례와 모양만 보고서답게 바꿉니다.
//
//   제목 · 지은이 · 날짜
//   Keywords  #태그 · #태그 …
//   요약(Abstract) — 요약문 속 태그 낱말은 칠해 둡니다
//   그림 1. 설명 — 출처
//   본문 — 태그마다 소제목 · 인용 블록(원문 문장) · 해설(알 수 있는 것)
//   참고문헌 — 출처 칸으로 지은 한 줄
//
// 같은 한 장을 네 곳이 씁니다: 학생 폼 아래의 미리보기 · 친구 보고서 ·
// 교사 화면 가운데 · PDF(인쇄는 lib/exportHashtag.js가 같은 차례로 따로
// 짭니다). **여기를 고치면 인쇄물도 함께 고치세요** — 한 보고서가 두 얼굴이
// 되면 안 됩니다.
// =============================================================
import { useMemo } from "react";
import {
  HASHTAG_COUNT,
  duplicateTagIndexes,
  hashtagProgress,
  hashtagReference,
  hashtagReportTitle,
  normalizeHashtagPost,
  safeImageUrl,
  safeSourceUrl,
  summarySegments,
  tagsUsedInSummary,
  timeOf,
} from "@/lib/hashtag";

export function reportDateLabel(post) {
  const t = timeOf(post?.updatedAt ?? post?.createdAt, 0) || Date.now();
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(
    new Date(t)
  );
}

export default function HashtagReport({ post, author = "", draft = false }) {
  const p = useMemo(() => normalizeHashtagPost(post), [post]);
  const dup = useMemo(() => duplicateTagIndexes(p.tags), [p.tags]);
  // 보고서에는 중복 칸을 빼고 태그가 있는 칸만 — 빈 칸 번호가 듬성듬성
  // 남지 않게 차례를 다시 매깁니다.
  const entries = useMemo(
    () => p.tags.filter((e, i) => e.tag && !dup.has(i)),
    [p.tags, dup]
  );
  const title = hashtagReportTitle(p);
  const progress = hashtagProgress(p);
  const used = tagsUsedInSummary(p.tags, p.summary);
  const segments = summarySegments(p.summary, entries);
  const image = safeImageUrl(p.image.url);
  const ref = hashtagReference(p.source);
  const refUrl = safeSourceUrl(p.source.url);

  const nothing =
    !title && entries.length === 0 && !p.summary.trim() && !image;

  return (
    <article className={`htr${draft ? " htr--draft" : ""}`} aria-label="해시태그 보고서">
      <header className="htr-head">
        <p className="htr-kicker">열 개의 해시태그 · 독서 보고서</p>
        <h2 className={`htr-title${title ? "" : " empty"}`}>{title || "제목을 적으면 여기에 섭니다"}</h2>
        <p className="htr-byline">
          {author && <span>{author}</span>}
          <span>{reportDateLabel(post)}</span>
          <span className={`htr-count${progress.done === progress.total ? " full" : ""}`}>
            해시태그 {progress.done}/{progress.total}
          </span>
        </p>
      </header>

      {nothing ? (
        <p className="htr-empty">
          위 칸을 채우면 여기에서 보고서가 짜여 나갑니다 — 제목 · 요약 · 그림 · 해시태그 열 개 · 참고문헌 차례로.
        </p>
      ) : (
        <>
          {entries.length > 0 && (
            <p className="htr-keywords">
              <b>Keywords</b>
              {entries.map((e, i) => (
                <span key={i} className="htr-kw">#{e.tag}</span>
              ))}
            </p>
          )}

          <section className="htr-sec htr-abstract">
            <h3>
              요약 <em>Abstract</em>
            </h3>
            {p.summary.trim() ? (
              <>
                <p className="htr-abstract-text">
                  {segments.map((s, i) =>
                    s.tag ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>
                  )}
                </p>
                <p className="htr-usage">
                  요약에 쓴 해시태그 {used.size} / {HASHTAG_COUNT}개
                </p>
              </>
            ) : (
              <p className="htr-placeholder">아직 요약을 쓰지 않았어요.</p>
            )}
          </section>

          {image && (
            <figure className="htr-figure">
              <img src={image} alt={p.image.caption || "대표 이미지"} />
              <figcaption>
                <b>그림 1.</b> {p.image.caption || "대표 이미지"}
                {p.image.credit && <span className="htr-credit"> — 출처: {p.image.credit}</span>}
              </figcaption>
            </figure>
          )}

          <section className="htr-sec htr-body">
            <h3>
              본문 <em>열 개의 해시태그</em>
            </h3>
            {entries.length === 0 ? (
              <p className="htr-placeholder">아직 적은 해시태그가 없어요.</p>
            ) : (
              <ol className="htr-entries">
                {entries.map((e, i) => (
                  <li key={i} className="htr-entry">
                    <h4>
                      <span className="htr-no">{i + 1}.</span> #{e.tag}
                    </h4>
                    {e.quote.trim() ? (
                      <blockquote className="htr-quote">{e.quote.trim()}</blockquote>
                    ) : (
                      <p className="htr-placeholder">원문 문장을 아직 옮기지 않았어요.</p>
                    )}
                    {e.insight.trim() ? (
                      <p className="htr-insight">{e.insight.trim()}</p>
                    ) : (
                      <p className="htr-placeholder">이 문장으로 알 수 있는 것을 아직 쓰지 않았어요.</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {ref && (
            <section className="htr-sec htr-refs">
              <h3>
                참고문헌 <em>References</em>
              </h3>
              <p className="htr-ref">
                {refUrl ? (
                  <>
                    {ref.slice(0, ref.lastIndexOf(refUrl))}
                    <a href={refUrl} target="_blank" rel="noopener noreferrer">{refUrl}</a>
                  </>
                ) : (
                  ref
                )}
              </p>
            </section>
          )}
        </>
      )}
    </article>
  );
}
