// =============================================================
// 공부방 활동 자료 내보내기 — CSV / Excel(반별 시트) / PDF(인쇄) (교사 전용)
// -------------------------------------------------------------
// 헤더: 클래스 · 주제(보드 제목) · 학번 · 이름 · 작성시각 · 제목 · 내용
// · 실명/학번은 교사 디렉터리(users)에서 조회 — 게시물엔 익명 정보만 있으므로.
// · 내용은 서식(HTML)을 제거한 순수 텍스트. 텍스트가 없고 이미지·첨부만 있으면
//   [이미지 N] · [첨부 N] 표시로 대체.
// =============================================================
import { stripHtml } from "./html";
import { toDate } from "./store";
import { zipBlob } from "./zip";

const HEADERS = ["클래스", "주제", "학번", "이름", "작성시각", "제목", "내용"];
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

// 흔한 HTML 엔티티를 사람이 읽을 수 있는 문자로 되돌림
function decodeEntities(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// 내용 셀 — 텍스트 우선, 없으면 이미지/첨부 개수 표시
function cardContentCell(card) {
  const text = decodeEntities(stripHtml(card.content || "")).trim();
  if (text) return text;
  const atts = card.attachments || [];
  const imgs =
    (card.content?.match(/<img\b/gi)?.length || 0) +
    (card.imageUrl ? 1 : 0) +
    atts.filter((a) => IMAGE_EXTS.has(a.ext)).length;
  const files = atts.filter((a) => !IMAGE_EXTS.has(a.ext)).length;
  const parts = [];
  if (imgs) parts.push(`[이미지 ${imgs}]`);
  if (files) parts.push(`[첨부 ${files}]`);
  return parts.join(" ");
}

function formatTs(value) {
  if (!value) return "";
  const d = toDate(value);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 카드 목록 → 내보내기 행 배열
// boards: [{ id, title }], cardsByBoard: { [boardId]: cards[] }, dirMap: Map(uid -> user)
export function buildStudyRows({ className, boards, cardsByBoard, dirMap }) {
  const rows = [];
  boards.forEach((board) => {
    const cards = cardsByBoard[board.id] || [];
    cards.forEach((card) => {
      // 모둠 카드 — 이름 열에 모둠명(구성원), 학번은 빈칸
      if (card.groupId) {
        if (card.retired) return; // 보관(재구성으로 남은) 카드는 제외
        const groupTitle = card.title || card.groupName || "";
        const memberNames = (card.members ?? []).map((m) => m.name).join(", ");
        rows.push({
          클래스: className || "",
          주제: board.title || "",
          학번: "",
          이름: memberNames ? `${groupTitle} (${memberNames})` : groupTitle,
          작성시각: formatTs(card.createdAt),
          제목: card.title || "",
          내용: cardContentCell(card),
        });
        return;
      }
      const dir = dirMap.get(card.authorId) || {};
      // 교사·관리자가 작성한 카드는 학생 활동 자료에서 제외
      if (dir.role === "teacher" || dir.role === "admin") return;
      rows.push({
        클래스: className || "",
        주제: board.title || "",
        학번: dir.studentId || "",
        이름: dir.realName || "",
        작성시각: formatTs(card.createdAt),
        제목: card.title || "",
        내용: cardContentCell(card),
      });
    });
  });
  // 주제 → 학번 → 이름 순 정렬
  rows.sort(
    (a, b) =>
      a.주제.localeCompare(b.주제, "ko") ||
      String(a.학번).localeCompare(String(b.학번), "ko", { numeric: true }) ||
      a.이름.localeCompare(b.이름, "ko")
  );
  return rows;
}

// ---- 다운로드 공통 ----
export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- CSV (한 반) ----
function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadStudyCsv(rows, filename) {
  const lines = [HEADERS.join(",")];
  rows.forEach((r) => lines.push(HEADERS.map((h) => csvEscape(r[h])).join(",")));
  // Excel에서 한글이 깨지지 않도록 UTF-8 BOM 부착
  const blob = new Blob(["﻿" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  triggerDownload(blob, filename);
}

// ---- Excel 워크북 (반별 시트) — 라이브러리 없이 .xlsx 생성 ----
// 예전에는 SpreadsheetML 2003(XML 한 장)을 `.xls` 이름으로 내려 주었는데,
// 엑셀이 열 때마다 **'파일 형식과 확장명이 일치하지 않습니다'** 경고를 띄웠습니다
// (속은 XML인데 이름은 옛 이진 형식이라서). 지금은 진짜 `.xlsx`를 만듭니다 —
// XML 몇 장을 `lib/zip.js`로 묶은 것이고, 라이브러리는 여전히 안 씁니다.
function xmlEscape(s = "") {
  return (
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      // XML 1.0이 허용하지 않는 제어문자(줄바꿈·탭 제외) — 들어 있으면 엑셀이
      // 파일을 통째로 '읽을 수 없다'고 합니다. 학생 글에 섞여 들어올 수 있어
      // 여기서 걷어 냅니다.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
  );
}
// 엑셀 시트명 제약: 31자 이내, : \ / ? * [ ] 사용 불가
function sanitizeSheetName(name, index) {
  let n = String(name || `반${index + 1}`).replace(/[:\\/?*[\]]/g, " ").trim();
  if (!n) n = `반${index + 1}`;
  return n.slice(0, 31);
}

// 0 → A, 25 → Z, 26 → AA … (출석부는 날짜만큼 열이 늘어 26칸을 쉽게 넘습니다)
export function colName(index) {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// 표 하나짜리 워크북 — sheets: [{ name, headers, rows }], rows는 **셀 배열의 배열**.
// 활동 자료는 열 이름이 고정이지만(HEADERS), 출석부처럼 열이 날짜 수에 따라
// 달라지는 표도 있어 열을 인자로 받는 이 형태를 밑바탕으로 둡니다.
//
// 셀은 전부 **inlineStr**(문자열을 시트 안에 그대로)입니다. 공유 문자열표
// (sharedStrings.xml)를 쓰면 파일이 조금 작아지지만 표 한 장에 그럴 값어치가
// 없고, 부품이 하나 늘면 어긋날 자리도 하나 늡니다.
export function buildXlsxParts(sheets) {
  const usedNames = new Set();
  const named = sheets.map((sheet, i) => {
    let name = sanitizeSheetName(sheet.name, i);
    while (usedNames.has(name)) name = (name.slice(0, 28) + "_" + i).slice(0, 31);
    usedNames.add(name);
    return { ...sheet, name };
  });

  const sheetXml = (sheet) => {
    const line = (cells, r) =>
      `<row r="${r}">${cells
        .map(
          (c, i) =>
            `<c r="${colName(i)}${r}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
              c ?? ""
            )}</t></is></c>`
        )
        .join("")}</row>`;
    const all = [sheet.headers ?? [], ...(sheet.rows ?? [])];
    const rows = all.map((cells, i) => line(cells, i + 1)).join("");
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<sheetData>${rows}</sheetData></worksheet>`
    );
  };

  const parts = [
    {
      name: "[Content_Types].xml",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        named
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
          )
          .join("") +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        named
          .map(
            (s, i) =>
              `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
          )
          .join("") +
        `</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        named
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
          )
          .join("") +
        `</Relationships>`,
    },
  ];
  named.forEach((sheet, i) => {
    parts.push({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(sheet) });
  });
  return parts;
}

export function downloadWorkbook(sheets, filename) {
  const blob = zipBlob(buildXlsxParts(sheets), {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, filename);
}

// sheets: [{ name, rows }] — rows는 buildStudyRows가 만든 객체 배열
export function downloadStudyWorkbook(sheets, filename) {
  downloadWorkbook(
    sheets.map((sheet) => ({
      name: sheet.name,
      headers: HEADERS,
      rows: (sheet.rows ?? []).map((r) => HEADERS.map((h) => r[h])),
    })),
    filename
  );
}

// ---- PDF (브라우저 인쇄 → 'PDF로 저장') ----
function escHtml(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sectionHtml(rows) {
  const body = rows
    .map(
      (r) => `<tr>
        <td>${escHtml(r.주제)}</td>
        <td class="c">${escHtml(r.학번)}</td>
        <td class="c">${escHtml(r.이름)}</td>
        <td class="c">${escHtml(r.작성시각)}</td>
        <td>${escHtml(r.제목)}</td>
        <td>${escHtml(r.내용)}</td>
      </tr>`
    )
    .join("");
  return `<table>
    <thead><tr><th>주제</th><th>학번</th><th>이름</th><th>작성시각</th><th>제목</th><th>내용</th></tr></thead>
    <tbody>${body || '<tr><td colspan="6" class="c">자료가 없습니다.</td></tr>'}</tbody>
  </table>`;
}

// sections: [{ className, rows }]
function buildPrintHtml(sections, title) {
  const today = new Date().toLocaleDateString("ko-KR");
  const blocks = sections
    .map(
      (s, i) => `<section class="${i > 0 ? "pb" : ""}">
        <h1>${escHtml(s.className)} · 공부방 활동 자료</h1>
        <div class="meta">${escHtml(today)} · 총 ${s.rows.length}건</div>
        ${sectionHtml(s.rows)}
      </section>`
    )
    .join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
    <title>${escHtml(title)} 공부방 활동 자료</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Malgun Gothic','Apple SD Gothic Neo',sans-serif; margin: 24px; color: #2e241a; }
      section.pb { break-before: page; page-break-before: always; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      .meta { font-size: 12px; color: #6b5b4a; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
      th, td { border: 1px solid #d9cdbc; padding: 6px 8px; text-align: left; vertical-align: top; }
      th { background: #f3ebdd; font-weight: 700; }
      td.c { text-align: center; white-space: nowrap; }
      tr { break-inside: avoid; }
      thead { display: table-header-group; }
    </style></head>
    <body>${blocks}</body></html>`;
}

export function printStudyPdf(rows, className) {
  printStudyPdfSections([{ className, rows }], className);
}

export function printStudyPdfSections(sections, title) {
  printHtmlDoc(buildPrintHtml(sections, title));
}

// 인쇄용 문서 한 장을 숨은 iframe에 띄우고 인쇄 창을 엽니다.
// (브라우저의 '대상: PDF로 저장'이 곧 PDF 내려받기입니다 — 라이브러리를 하나도
//  쓰지 않아 한글 글꼴이 그대로 나오고, 글자가 그림이 아니라 글자로 남습니다.)
// 새 창(window.open)이 아니라 iframe인 이유는 팝업 차단에 걸리지 않아서입니다.
export function printHtmlDoc(html) {
  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 350);
}
