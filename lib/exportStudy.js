// =============================================================
// 공부방 활동 자료 내보내기 — CSV / PDF(인쇄) (교사 전용)
// -------------------------------------------------------------
// 헤더: 클래스 · 주제(보드 제목) · 학번 · 이름 · 제목 · 내용
// · 실명/학번은 교사 디렉터리(users)에서 조회 — 게시물엔 익명 정보만 있으므로.
// · 내용은 서식(HTML)을 제거한 순수 텍스트로 변환.
// =============================================================
import { stripHtml } from "./html";

const HEADERS = ["클래스", "주제", "학번", "이름", "제목", "내용"];

// 흔한 HTML 엔티티를 사람이 읽을 수 있는 문자로 되돌림
function decodeEntities(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cardText(card) {
  return decodeEntities(stripHtml(card.content || "")).trim();
}

// 카드 목록 → 내보내기 행 배열
// boards: [{ id, title }], cardsByBoard: { [boardId]: cards[] }, dirMap: Map(uid -> user)
export function buildStudyRows({ className, boards, cardsByBoard, dirMap }) {
  const rows = [];
  boards.forEach((board) => {
    const cards = cardsByBoard[board.id] || [];
    cards.forEach((card) => {
      const dir = dirMap.get(card.authorId) || {};
      // 교사·관리자가 작성한 카드는 학생 활동 자료에서 제외
      if (dir.role === "teacher" || dir.role === "admin") return;
      rows.push({
        클래스: className || "",
        주제: board.title || "",
        학번: dir.studentId || "",
        이름: dir.realName || "",
        제목: card.title || "",
        내용: cardText(card),
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

// ---- CSV ----
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

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- PDF (브라우저 인쇄 → 'PDF로 저장') ----
function escHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildPrintHtml(rows, className) {
  const today = new Date().toLocaleDateString("ko-KR");
  const body = rows
    .map(
      (r) => `<tr>
        <td>${escHtml(r.주제)}</td>
        <td class="c">${escHtml(r.학번)}</td>
        <td class="c">${escHtml(r.이름)}</td>
        <td>${escHtml(r.제목)}</td>
        <td>${escHtml(r.내용)}</td>
      </tr>`
    )
    .join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
    <title>${escHtml(className)} 공부방 활동 자료</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Malgun Gothic','Apple SD Gothic Neo',sans-serif; margin: 24px; color: #2e241a; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      .meta { font-size: 12px; color: #6b5b4a; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #d9cdbc; padding: 6px 8px; text-align: left; vertical-align: top; }
      th { background: #f3ebdd; font-weight: 700; }
      td.c { text-align: center; white-space: nowrap; }
      tr { break-inside: avoid; }
      thead { display: table-header-group; }
    </style></head>
    <body>
      <h1>${escHtml(className)} · 공부방 활동 자료</h1>
      <div class="meta">${escHtml(today)} · 총 ${rows.length}건</div>
      <table>
        <thead><tr><th>주제</th><th>학번</th><th>이름</th><th>제목</th><th>내용</th></tr></thead>
        <tbody>${body || '<tr><td colspan="5" class="c">자료가 없습니다.</td></tr>'}</tbody>
      </table>
    </body></html>`;
}

export function printStudyPdf(rows, className) {
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
  doc.write(buildPrintHtml(rows, className));
  doc.close();
  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 350);
}
