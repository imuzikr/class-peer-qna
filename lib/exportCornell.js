// =============================================================
// 수업 노트(코넬) 인쇄 — 학생이 자기 노트를 PDF로 내려받는 길
// -------------------------------------------------------------
// 브라우저 인쇄 창을 열고 '대상: PDF로 저장'을 고르면 PDF가 됩니다.
// jsPDF·html2canvas 같은 라이브러리를 쓰지 않는 이유:
//  · 그림으로 굽지 않아 **글자가 글자로 남습니다** — 복사·검색이 되고,
//    확대해도 흐려지지 않습니다.
//  · 한글 글꼴을 따로 실어 나르지 않아도 됩니다(라이브러리 쪽은 한글이
//    깨지거나 폰트 파일을 통째로 넣어야 합니다).
//  · 공부방 '활동 자료 다운로드'의 PDF도 같은 방식이라, 이 앱에서 나오는
//    인쇄물이 한 가지 방법으로 만들어집니다(lib/exportStudy.js).
//
// [인쇄 레이아웃에서 지킨 것]
//  · **한 장에 노트 하나.** 두 번째 노트부터 `break-before: page`.
//  · 코넬 2단 그대로 — 왼쪽 좁은 단서 · 오른쪽 넓은 필기 · 아래 요약.
//    화면(CornellNoteSheet)과 같은 짜임이라 인쇄물이 낯설지 않습니다.
//  · 2단을 **표(table)로** 짭니다. grid·flex는 내용이 한 쪽을 넘칠 때
//    잘리는 브라우저가 있는데, 표는 칸이 다음 쪽으로 이어집니다.
//  · 필기가 길어도 자르지 않습니다(고정 높이·overflow 없음). 넘치면
//    다음 쪽으로 흘러갑니다 — 잘린 노트는 노트가 아닙니다.
//  · 링크는 이름만 적습니다. 종이에서는 누를 수 없고, 주소를 그대로 실으면
//    줄이 길어져 표가 밀립니다.
//  · 색은 최소한만(먹빛 글자 + 옅은 회색 선). 학교 프린터는 대개 흑백이라
//    색으로만 나뉘는 것은 인쇄하면 사라집니다.
// =============================================================
import { richHtml, sanitizeHtml, stripHtml } from "./html";
import { splitWorkspaceName } from "./user";
import { printHtmlDoc } from "./exportStudy";

// 인쇄물 머리에 적을 이름 — 학교 계정 이름이 '20512김하윤'처럼 학번과 붙어
// 있으므로 갈라서 '20512 김하윤'으로 적습니다(갈라지지 않으면 그대로).
// 노트를 인쇄하는 자리가 둘이라(크게 보기 창 · 학습 리포트) 여기 한 곳에
// 둡니다 — 두 곳이 다른 이름을 찍으면 같은 학생의 노트가 두 얼굴이 됩니다.
export function printableName(user) {
  const raw = String(user?.displayName ?? "").trim();
  const parsed = splitWorkspaceName(raw);
  if (parsed) return `${parsed.studentId} ${parsed.realName}`;
  const real = String(user?.realName ?? "").trim();
  const sid = String(user?.studentId ?? "").trim();
  return [sid, real || raw].filter(Boolean).join(" ");
}

function esc(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 2026-09-04 → 2026년 9월 4일 (금)
export function noteDateLabel(dateKey) {
  const raw = String(dateKey ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  const wd = Number.isNaN(date.getTime()) ? "" : ` (${WEEKDAYS[date.getDay()]})`;
  return `${y}년 ${Number(mo)}월 ${Number(d)}일${wd}`;
}

// 필기 칸 — 서식(HTML)은 살리되 인쇄에 해로운 것만 걷어 냅니다.
// 이미지는 그대로 둡니다(수업 중에 붙인 그림이 노트의 일부라서요).
// 다만 폭을 넘지 않게 아래 CSS에서 max-width를 걸어 둡니다.
function notesHtml(value) {
  const html = sanitizeHtml(richHtml(value ?? ""));
  const hasSomething = stripHtml(html).trim().length > 0 || /<img\b/i.test(html);
  return hasSomething ? html : "";
}

function blank(text) {
  return `<span class="blank">${esc(text)}</span>`;
}

function noteHtml(note, meta, first) {
  const title = String(note.lessonTitle ?? "").trim();
  const cue = String(note.cue ?? "").trim();
  const body = notesHtml(note.notes);
  const summary = String(note.summary ?? "").trim();
  const feedback = String(note.feedback ?? "").trim();
  const handouts = Array.isArray(note.materials) ? note.materials : [];

  return `<section class="note${first ? "" : " pb"}">
    <header class="head">
      <div class="head-main">
        <h1>${title ? esc(title) : blank("제목 없음")}</h1>
        <p class="who">${esc(meta)}</p>
      </div>
      <p class="date">${esc(noteDateLabel(note.date))}</p>
    </header>

    <table class="grid">
      <thead>
        <tr><th class="cue-h">단서 · 핵심 질문</th><th class="notes-h">필기</th></tr>
      </thead>
      <tbody>
        <tr>
          <td class="cue">${cue ? esc(cue).replace(/\n/g, "<br>") : blank("비어 있어요")}</td>
          <td class="notes">${body || blank("비어 있어요")}</td>
        </tr>
      </tbody>
    </table>

    <div class="summary">
      <h2>내 말로 요약</h2>
      <div>${summary ? esc(summary).replace(/\n/g, "<br>") : blank("비어 있어요")}</div>
    </div>

    ${
      handouts.length > 0
        ? `<div class="handouts"><h2>수업 자료</h2><p>${handouts
            .map((m) => esc(m?.name ?? ""))
            .filter(Boolean)
            .join(" · ")}</p></div>`
        : ""
    }

    ${
      feedback
        ? `<div class="feedback"><h2>선생님 한 마디</h2><div>${esc(feedback).replace(/\n/g, "<br>")}</div></div>`
        : ""
    }
  </section>`;
}

const PRINT_CSS = `
  /* A4 세로. 여백은 프린터가 못 찍는 가장자리를 피하면서, 왼쪽을 조금 더
     넓게 두어 묶거나 구멍을 뚫어도 글자가 안 잘리게 합니다. */
  @page { size: A4 portrait; margin: 14mm 12mm 14mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
    color: #1f1a14;
    font-size: 11pt;
    line-height: 1.6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .note { break-inside: auto; }
  /* 두 번째 노트부터 새 쪽에서 시작 — 한 장에 노트 하나 */
  .note.pb { break-before: page; page-break-before: always; }

  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 6px;
    margin-bottom: 10px;
    border-bottom: 2px solid #1f1a14;
  }
  .head h1 { margin: 0; font-size: 16pt; font-weight: 800; line-height: 1.3; }
  .head .who { margin: 3px 0 0; font-size: 9pt; color: #6b6055; }
  .head .date { margin: 0; font-size: 10pt; font-weight: 700; white-space: nowrap; }

  /* 코넬 2단 — 왼쪽 단서(30%) · 오른쪽 필기(70%).
     표로 짠 이유는 위 주석 참고(쪽을 넘길 때 잘리지 않게). */
  /* 내용이 적어도 **코넬 노트 한 장 모양이 그대로 한 쪽을 채웁니다.**
     내용 높이에 맞춰 줄어들면 한 줄짜리 필기가 종이 맨 위에 손바닥만 하게
     찍혀, 노트가 아니라 쪽지처럼 보였습니다. 표에 준 height는 최솟값으로
     동작하므로(표는 내용보다 작아지지 않습니다) 길게 쓴 날은 그대로 늘어나
     다음 쪽으로 이어집니다.
     175mm인 까닭: A4 세로에서 위아래 여백을 뺀 인쇄 높이가 269mm(1016px)
     이고, 제목 줄·요약·수업 자료·선생님 한 마디가 다 붙는 가장 두꺼운
     노트가 그 나머지를 씁니다. 185mm면 그 경우가 985px로 아슬아슬해
     (남는 자리 31px) 선생님 한 마디가 두어 줄만 길어져도 둘째 쪽으로
     넘어갑니다. 175mm면 같은 노트가 947px이라 서너 줄 여유가 생깁니다
     (실측). 이 값을 키울 때는 '자료 + 피드백이 다 있는 노트'로 다시 재 볼 것. */
  table.grid {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    height: 175mm;
    margin-bottom: 10px;
  }
  table.grid th, table.grid td {
    border: 1px solid #b9b0a4;
    padding: 8px 10px;
    vertical-align: top;
    text-align: left;
  }
  table.grid th {
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #4a4139;
    background: #f2efe9;
    padding: 5px 10px;
  }
  th.cue-h, td.cue { width: 30%; }
  th.notes-h, td.notes { width: 70%; }
  /* 한 칸이 한 쪽을 넘으면 다음 쪽으로 이어 갑니다(자르지 않습니다) */
  table.grid tr, table.grid td { break-inside: auto; }
  thead { display: table-header-group; }

  /* 필기 안의 서식 — 화면에서 쓰던 태그가 그대로 옵니다 */
  td.notes p { margin: 0 0 6px; }
  td.notes p:last-child { margin-bottom: 0; }
  td.notes ul, td.notes ol { margin: 0 0 6px; padding-left: 20px; }
  td.notes li { margin-bottom: 2px; }
  td.notes img { max-width: 100%; height: auto; break-inside: avoid; }
  /* 활동 틀이 쓰는 소제목(h4.activity-title) — 필기 안에서 물음과 답을 가릅니다 */
  td.notes h4 { margin: 8px 0 3px; font-size: 10.5pt; font-weight: 800; }
  td.notes h4:first-child { margin-top: 0; }
  td.notes pre {
    white-space: pre-wrap;
    word-break: break-word;
    background: #f5f3ef;
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 9.5pt;
  }
  /* 서식 에디터가 남기는 태그는 lib/html.js의 ALLOWED_TAGS가 전부입니다 —
     b·i·u·ul·ol·li·br·div·p·pre·code·img·h4. 링크와 표는 저장 단계에서
     걷히므로 여기에 규칙을 두지 않습니다(있으면 안 쓰이는 CSS가 됩니다). */
  /* 아주 긴 낱말·주소가 칸을 밀어내지 않게 */
  td.cue, td.notes { word-break: break-word; overflow-wrap: anywhere; }

  .summary, .handouts, .feedback {
    border: 1px solid #b9b0a4;
    padding: 8px 10px;
    margin-bottom: 8px;
    break-inside: avoid;
  }
  .summary h2, .handouts h2, .feedback h2 {
    margin: 0 0 4px;
    font-size: 9pt;
    font-weight: 700;
    color: #4a4139;
  }
  .summary div, .handouts p, .feedback div { margin: 0; }
  .handouts p { font-size: 10pt; color: #4a4139; }
  .feedback { border-style: dashed; }

  .blank { color: #9a9186; font-size: 10pt; }
`;

// notes: 최근 것이 앞에 오는 목록(화면과 같은 차례) — 인쇄는 **옛날 것부터**
// 뒤집어 냅니다. 종이로 묶으면 앞에서 뒤로 읽으므로 수업 차례와 맞아야 합니다.
export function buildCornellPrintHtml(notes = [], { studentName = "", className = "" } = {}) {
  const list = [...notes].reverse();
  const meta = [className, studentName].filter(Boolean).join(" · ");
  const title = `수업 노트${meta ? ` — ${meta}` : ""}`;
  const body =
    list.length > 0
      ? list.map((n, i) => noteHtml(n, meta, i === 0)).join("\n")
      : `<section class="note"><p>인쇄할 노트가 없어요.</p></section>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>${PRINT_CSS}</style>
</head><body>${body}</body></html>`;
}

export function printCornellNotes(notes, meta) {
  printHtmlDoc(buildCornellPrintHtml(notes, meta));
}
