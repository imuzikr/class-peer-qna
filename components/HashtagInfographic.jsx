"use client";

// =============================================================
// 여섯 개의 해시태그 — 친구에게 보이는 인포그래픽 장표 한 장 (읽기 전용)
// -------------------------------------------------------------
// 공개 뒤 '친구 해시태그'에서 친구 하나를 누르면 이 한 장이 뜹니다. 칠판용
// 슬라이드(HashtagSlide)와 **같은 자료**(`hashtagSlide()`가 지은 모양)를 받아
// 모양만 달리 그립니다 — 한 학생의 기록을 포스터처럼 한눈에 훑게 하려고요.
//
//   머리띠  읽은 글 제목(큰 글씨) · 종류 · 지은이 · 쓴 사람  (+ 대표 이미지)
//   숫자    해시태그 n · 생각 n
//   리본    찾은 해시태그 칩 — 칩마다 제 카드와 같은 색
//   본문    태그마다 번호 카드(#태그 · 생각) — 원문 문장 칸은 거뒀습니다
//
// 색은 카드 차례로 `ROW_COLORS` 열 가지를 돌려 씁니다(여섯 칸이라 한 장 안에서
// 겹치지 않습니다). 칩과 카드가 같은 색이라 리본에서 카드를 눈으로 찾습니다.
//
// 칠판 방송·교사 화면·수업 화면 창은 지금까지처럼 HashtagSlide입니다 — 거기는
// 뒷자리에서 읽혀야 하는 화면이라 글자 크기를 폭에 맞춰 키우는 뼈대가 따로
// 있습니다. 둘이 받는 자료가 같아 한쪽에만 있는 칸이 생기지 않습니다.
// =============================================================
import {
  normalizeHashtagSlide,
  sourceKindLabel,
} from "@/lib/hashtag";
import { ROW_COLORS } from "@/lib/bookColors";

function colorVars(i) {
  const c = ROW_COLORS[i % ROW_COLORS.length];
  return { "--c-bg": c.bg, "--c-bd": c.border, "--c-tx": c.text };
}

export default function HashtagInfographic({ slide }) {
  const s = normalizeHashtagSlide(slide);
  const title = s.source.title;
  const tagged = s.entries.filter((e) => e.tag).length;
  const thought = s.entries.filter((e) => e.insight).length;

  return (
    <article className="htg" aria-label={`${s.writerName || "친구"}의 해시태그 인포그래픽`}>
      <header className={`htg-head${s.image.url ? " has-img" : ""}`}>
        <div className="htg-head-text">
          <p className="htg-kicker">
            <span className="htg-hash" aria-hidden="true">#</span>
            {s.activityTitle || "여섯 개의 해시태그"}
          </p>
          <h2 className="htg-title">
            {title
              ? s.source.kind === "book" ? `『${title}』` : `「${title}」`
              : `${s.writerName || "친구"}의 해시태그`}
          </h2>
          <p className="htg-meta">
            {title && <span className="htg-kind">{sourceKindLabel(s.source.kind)}</span>}
            {title && s.source.author && <span className="htg-author">{s.source.author}</span>}
            {s.writerName && (
              <span className="htg-writer">
                <em>정리</em>
                {s.writerName}
              </span>
            )}
          </p>
          <dl className="htg-stats">
            <div>
              <dt>해시태그</dt>
              <dd>{tagged}</dd>
            </div>
            <div>
              <dt>나의 생각</dt>
              <dd>{thought}</dd>
            </div>
          </dl>
        </div>
        {s.image.url && (
          <figure className="htg-figure">
            <img src={s.image.url} alt={s.image.caption || "대표 이미지"} />
            {s.image.caption && <figcaption>{s.image.caption}</figcaption>}
          </figure>
        )}
      </header>

      {s.entries.length === 0 ? (
        <p className="htg-empty">아직 찾은 해시태그가 없어요.</p>
      ) : (
        <>
          <ul className="htg-ribbon" aria-label="찾은 해시태그">
            {s.entries.map((e, i) =>
              e.tag ? (
                <li key={i} className="htg-chip" style={colorVars(i)}>
                  <b>{String(i + 1).padStart(2, "0")}</b>#{e.tag}
                </li>
              ) : null
            )}
          </ul>

          <ol className={`htg-grid${s.entries.length === 1 ? " one" : ""}`}>
            {s.entries.map((e, i) => (
              <li key={i} className="htg-card" style={colorVars(i)}>
                <div className="htg-card-head">
                  <span className="htg-no" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className={`htg-card-tag${e.tag ? "" : " empty"}`}>
                    {e.tag ? `#${e.tag}` : "태그 없음"}
                  </h3>
                </div>
                {e.insight ? (
                  <p className="htg-insight">
                    <b>나의 생각</b>
                    {e.insight}
                  </p>
                ) : (
                  <p className="htg-blank">생각을 아직 쓰지 않았어요</p>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      <footer className="htg-foot">
        <span>{s.writerName}</span>
        <span className="htg-foot-mark">#여섯개의해시태그</span>
      </footer>
    </article>
  );
}
