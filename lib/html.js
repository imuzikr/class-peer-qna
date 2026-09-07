// =============================================================
// HTML 서식 유틸
// -------------------------------------------------------------
// 서식 에디터는 내용을 HTML로 저장합니다. 화면에 그대로 출력하면
// 악성 스크립트가 끼어들 수 있으므로(XSS), 허용된 서식 태그만
// 남기고 나머지는 모두 제거한 뒤 렌더링합니다.
// =============================================================

// 허용 태그: 볼드, 이탤릭, 밑줄, 목록, 줄바꿈, 코드 블록
const ALLOWED_TAGS = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "UL",
  "OL",
  "LI",
  "BR",
  "DIV",
  "P",
  "PRE",
  "CODE",
  "IMG",
  "H4",
]);

// class 속성은 원칙적으로 전부 제거하지만(임의 클래스로 CSS를 주입하지
// 못하게), **정해진 고정 문자열 몇 개**만 남겨 둡니다.
//  · activity-section / activity-title — 공부방 활동 틀
//    (lib/activities.js의 buildActivityTemplate). 학생 카드를 읽기 모드로
//    볼 때 질문(활동 제목)과 답이 구분돼 보이게 합니다.
//  · checklist / done — 체크 목록(수업 메모). 체크박스를 <input>으로 두지
//    않은 까닭은 아래 CHECKLIST 주석 참고.
// 태그마다 **여러 값**을 둘 수 있습니다(li는 done 하나뿐이지만, 나중에
// 늘어날 자리라 배열로 받습니다).
const ALLOWED_CLASSES = {
  DIV: ["activity-section"],
  H4: ["activity-title"],
  UL: ["checklist"],
  LI: ["done"],
};

// 안전한 이미지 src만 허용: http(s)(Storage 등) 또는 data:image
function isSafeImageSrc(src = "") {
  return /^https?:\/\//i.test(src) || /^data:image\//i.test(src);
}

// HTML에서 허용 태그만 남기고 모든 속성 제거
export function sanitizeHtml(html = "") {
  // 서버(SSR/프리렌더)엔 DOMParser가 없어 정화가 불가하므로, 원본을 그대로
  // 내보내지 않고 태그를 제거한 순수 텍스트만 반환합니다(잠재 XSS 차단).
  // 실제 서식 렌더링은 클라이언트 하이드레이션 후 다시 정화되어 이뤄집니다.
  if (typeof window === "undefined") return stripHtml(html);
  const doc = new DOMParser().parseFromString(
    `<div>${html}</div>`,
    "text/html"
  );
  const root = doc.body.firstChild;

  function walk(node) {
    // 자식 스냅샷을 떠서 순회 (순회 중 구조가 바뀌므로)
    [...node.children].forEach((el) => {
      walk(el);
      if (!ALLOWED_TAGS.has(el.tagName)) {
        // 허용되지 않은 태그: 태그만 벗기고 내용은 보존
        el.replaceWith(...el.childNodes);
      } else if (el.tagName === "IMG") {
        // 이미지: 안전한 src/alt만 남기고 나머지 속성(onerror 등) 제거
        const src = el.getAttribute("src") || "";
        const alt = el.getAttribute("alt") || "";
        [...el.attributes].forEach((a) => el.removeAttribute(a.name));
        if (isSafeImageSrc(src)) {
          el.setAttribute("src", src);
          if (alt) el.setAttribute("alt", alt);
        } else {
          el.remove(); // 안전하지 않은 이미지(javascript: 등)는 제거
        }
      } else {
        // 허용 태그여도 속성(onclick, style 등)은 모두 제거하되,
        // 활동 틀의 고정 class 값만 예외로 남깁니다.
        const keep = (ALLOWED_CLASSES[el.tagName] ?? []).filter((c) =>
          el.classList.contains(c)
        );
        [...el.attributes].forEach((a) => el.removeAttribute(a.name));
        if (keep.length > 0) el.setAttribute("class", keep.join(" "));
      }
    });
  }
  walk(root);
  return root.innerHTML;
}

// 이미지 태그만 제거 (발표 슬라이드처럼 텍스트만 보여줄 때)
export function stripImgTags(html = "") {
  return html.replace(/<img[^>]*>/gi, "");
}

// 텍스트 없이 이미지만 붙여넣은 내용인지 확인할 때 씁니다. RichTextEditor는
// 붙여넣은 이미지를 파일 첨부(attachments)가 아니라 본문 HTML 안에 <img>로
// 바로 심는데(handlePaste), stripHtml()은 태그를 전부 지우므로 이미지만 있는
// 본문은 빈 문자열로 보입니다 — '내용 없음'과 '이미지만 있음'을 구분하려면
// 이 함수를 stripHtml과 함께 확인해야 합니다.
export function htmlHasImage(html = "") {
  return /<img[\s/>]/i.test(html);
}

// HTML → 순수 텍스트 (카드 미리보기, 빈 내용 검사용)
export function stripHtml(html = "") {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 서식이 나중에 붙은 자리(수업 메모)에서 씁니다. 예전에 순수 텍스트로 적어
// 둔 것과 서식 에디터로 적은 HTML이 한 목록에 섞여 있어, 무엇으로 적힌
// 것인지 보고 갈라 줍니다 — 옛 메모의 줄바꿈은 <br>로 살립니다.
//
// 판정은 '허용 태그가 있는가'로 합니다. 순수 텍스트에 '<b'가 우연히 들어
// 있으면 서식으로 읽히지만, 그때도 sanitizeHtml을 거치므로 위험하지 않고
// 그 글자가 굵게 보일 뿐입니다.
const HTML_LIKE = /<(b|strong|i|em|u|ul|ol|li|br|div|p|pre|code|h4)\b[^>]*>/i;

export function looksLikeHtml(value = "") {
  return HTML_LIKE.test(value);
}

export function textToHtml(text = "") {
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

// 어느 쪽으로 적힌 값이든 화면에 넣을 수 있는 HTML로
export function richHtml(value = "") {
  const s = String(value ?? "");
  return looksLikeHtml(s) ? sanitizeHtml(s) : textToHtml(s);
}

// 일반 텍스트 → HTML 안전 문자로 변환
export function escapeHtml(text = "") {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 코드 문자열 → 어두운 배경의 코드 블록 HTML
// (파이썬 실행기의 '질문 만들기'에서 사용. 뒤에 빈 줄을 붙여
//  학생이 코드 아래에 설명을 이어서 쓸 수 있게 합니다)
export function codeBlockHtml(code = "") {
  return `<pre><code>${escapeHtml(code)}</code></pre><div><br></div>`;
}

// ── 체크 목록 ────────────────────────────────────────────────
// `<ul class="checklist">`의 `<li>`이고, 켜진 줄은 `class="done"`입니다.
//
// **<input type="checkbox">를 쓰지 않습니다.** 그러려면 정화기(sanitizeHtml)에
// 태그 하나와 속성 둘(type·checked)을 새로 열어야 하는데, 이 앱에서 남의 글이
// 그대로 화면에 뿌려지는 자리가 여럿이라(질문·답변·카드·메모) 여는 문은
// 적을수록 좋습니다. class 두 값을 더하는 쪽이 훨씬 좁은 변경이고, 상자는
// CSS가 그립니다. 미리보기(stripHtml)에서 사라지는 것도 이쪽이 낫습니다 —
// <input>은 글자가 없어 한 줄 미리보기에 아무 흔적도 안 남깁니다.
//
// 켜고 끄는 것은 **읽는 화면**에서 합니다(수업 메모 패널·달력). 그래서 저장된
// HTML을 그 자리에서 고쳐 다시 씁니다 — 아래 함수가 그 일을 합니다.
export function toggleChecklistItem(html = "", index = 0) {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstChild;
  const items = root.querySelectorAll("ul.checklist > li");
  const li = items[index];
  if (!li) return html;
  li.classList.toggle("done");
  return root.innerHTML;
}

// 화면에서 누른 <li>가 저장된 HTML의 몇 번째 항목인지 — 켜고 끌 때 씁니다.
export function checklistIndexOf(rootEl, li) {
  if (!rootEl || !li) return -1;
  return [...rootEl.querySelectorAll("ul.checklist > li")].indexOf(li);
}
