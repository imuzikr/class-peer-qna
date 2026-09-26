// =============================================================
// 열 개의 해시태그 — 보고서 인쇄(PDF로 저장)
// -------------------------------------------------------------
// 수업 노트 인쇄(lib/exportCornell.js)와 같은 길입니다 — 숨은 iframe에 인쇄용
// 문서를 띄우고 print()(대상: PDF로 저장). 글자가 글자로 남고 한글 글꼴을
// 실어 나르지 않아도 됩니다.
//
// **차례는 화면의 보고서(components/HashtagReport.jsx)와 같아야 합니다** —
// 제목 · Keywords · 요약 · 그림 1 · 본문(태그마다 인용 + 해설) · 참고문헌.
// 한쪽만 고치면 같은 보고서가 화면과 종이에서 두 얼굴이 됩니다.
//
// 색은 최소한만(학교 프린터는 대개 흑백). 요약 속 태그 낱말은 칠하는 대신
// 굵게 둡니다 — 칠한 색은 흑백 인쇄에서 사라집니다.
// =============================================================
import {
  duplicateTagIndexes,
  hashtagProgress,
  hashtagReference,
  hashtagReportTitle,
  normalizeHashtagPost,
  safeImageUrl,
  summarySegments,
  timeOf,
} from "./hashtag";
import { printHtmlDoc } from "./exportStudy";

function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
const para = (s) => esc(s).replace(/\n/g, "<br>");

export function hashtagReportHtml(post, { author = "", activityTitle = "" } = {}) {
  const p = normalizeHashtagPost(post);
  const dup = duplicateTagIndexes(p.tags);
  const entries = p.tags.filter((e, i) => e.tag && !dup.has(i));
  const title = hashtagReportTitle(p) || "제목 없는 보고서";
  const pr = hashtagProgress(p);
  const t = timeOf(post?.updatedAt ?? post?.createdAt, 0) || Date.now();
  const date = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(t));
  const img = safeImageUrl(p.image.url);
  const ref = hashtagReference(p.source);
  const summary = summarySegments(p.summary, entries)
    .map((s) => (s.tag ? `<b>${para(s.text)}</b>` : para(s.text)))
    .join("");

  const body = `
  <article>
    <p class="kicker">${esc(activityTitle || "열 개의 해시태그")} · 독서 보고서</p>
    <h1>${esc(title)}</h1>
    <p class="byline">${[author, date, `해시태그 ${pr.done}/${pr.total}`].filter(Boolean).map(esc).join(" · ")}</p>
    ${entries.length ? `<p class="kw"><b>Keywords</b> ${entries.map((e) => `#${esc(e.tag)}`).join(" · ")}</p>` : ""}
    <h2>요약 <em>Abstract</em></h2>
    <p class="abstract">${summary || '<span class="blank">요약 없음</span>'}</p>
    ${img ? `<figure><img src="${esc(img)}" alt=""><figcaption><b>그림 1.</b> ${esc(p.image.caption || "대표 이미지")}${p.image.credit ? ` — 출처: ${esc(p.image.credit)}` : ""}</figcaption></figure>` : ""}
    <h2>본문 <em>열 개의 해시태그</em></h2>
    ${entries.length === 0 ? '<p class="blank">적은 해시태그가 없습니다.</p>' : `<ol>${entries
      .map(
        (e, i) => `<li><h3>${i + 1}. #${esc(e.tag)}</h3>
        ${e.quote.trim() ? `<blockquote>${para(e.quote.trim())}</blockquote>` : '<p class="blank">원문 문장 없음</p>'}
        ${e.insight.trim() ? `<p>${para(e.insight.trim())}</p>` : '<p class="blank">생각 표현하기 없음</p>'}</li>`
      )
      .join("")}</ol>`}
    ${ref ? `<h2>참고문헌 <em>References</em></h2><p class="ref">${esc(ref)}</p>` : ""}
  </article>`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 18mm 18mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: "Noto Serif KR", "Nanum Myeongjo", "Batang", Georgia, serif; color: #1a1a18; font-size: 11pt; line-height: 1.75; margin: 0; }
  .kicker { font-family: sans-serif; font-size: 8.5pt; letter-spacing: .08em; color: #666; margin: 0 0 6pt; text-transform: uppercase; }
  h1 { font-size: 20pt; line-height: 1.35; margin: 0 0 6pt; }
  .byline { font-family: sans-serif; font-size: 9pt; color: #555; margin: 0 0 12pt; padding-bottom: 10pt; border-bottom: 1.5pt solid #1a1a18; }
  .kw { font-size: 10pt; margin: 0 0 12pt; }
  .kw b { font-family: sans-serif; font-size: 8.5pt; letter-spacing: .06em; margin-right: 6pt; }
  h2 { font-size: 12.5pt; margin: 16pt 0 6pt; padding-bottom: 3pt; border-bottom: .5pt solid #999; break-after: avoid; }
  h2 em { font-style: italic; font-weight: 400; color: #666; font-size: 10pt; margin-left: 4pt; }
  .abstract { margin: 0; text-align: justify; white-space: normal; }
  figure { margin: 14pt 0; text-align: center; break-inside: avoid; }
  figure img { max-width: 100%; max-height: 90mm; }
  figcaption { font-size: 9pt; color: #444; margin-top: 4pt; }
  ol { list-style: none; padding: 0; margin: 0; }
  li { margin: 0 0 12pt; break-inside: avoid; }
  h3 { font-size: 11pt; margin: 0 0 4pt; }
  blockquote { margin: 0 0 5pt; padding: 3pt 0 3pt 10pt; border-left: 2pt solid #888; font-style: italic; color: #333; }
  li p { margin: 0; }
  .ref { padding-left: 18pt; text-indent: -18pt; margin: 0; word-break: break-all; }
  .blank { color: #999; font-style: italic; }
</style></head><body>${body}</body></html>`;
}

export function printHashtagReport(post, opts) {
  printHtmlDoc(hashtagReportHtml(post, opts));
}
