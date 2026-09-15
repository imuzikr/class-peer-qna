// =============================================================
// 수업 노트 하이라이트 — 교사가 짚은 대목
// -------------------------------------------------------------
// 교사가 학생 글을 드래그하면 (ㄱ) 그 자리가 형광펜처럼 덮이고 (ㄴ) 같은
// 대목이 피드백 칸에 인용으로 들어갑니다. 저장되는 자리는 노트 문서의
// `feedbackMarks`(교사만 쓸 수 있게 규칙이 막아 둡니다)이고, **학생 화면도
// 같은 값으로 같은 대목을 칠합니다** — 그것이 이 기능의 핵심입니다.
// 선생님 말이 글 전체에 대한 것인지 그 한 문장에 대한 것인지를, 학생이
// 인용문을 눈으로 대조하지 않고 그대로 봅니다.
//
// [자리를 어떻게 매어 두나]
// **Range를 들고 있을 수 없습니다.** 노트 본문은 dangerouslySetInnerHTML로
// 그리는 자리라 부모가 한 번 다시 그릴 때마다(피드백 칸에 글자 하나만 쳐도)
// 그 아래가 통째로 새 노드로 갈립니다. 들고 있던 Range는 문서에서 떨어져
// 나가 줄 상자가 0개가 됩니다(실측: 한 글자 치면 rects 1 → 0).
// 그래서 **글자 자리(offset)로 매어 두고 잴 때마다 Range를 새로 만듭니다.**
//
// [학생이 글을 고치면 표시는 사라집니다]
// 끌 때의 글자(`text`)를 함께 저장해 두고, 그릴 때마다 그 자리의 지금 글자와
// 견주어 다르면 **안 그립니다**. 자리만 보고 칠하면 학생이 앞에 한 줄만 더
// 써도 엉뚱한 대목을 덮게 됩니다. 이 구조에는 덤이 있습니다 — 예상 못 한
// 이유로 자리가 밀려도 **'사라지는' 쪽으로만 무너지고, 엉뚱한 데를 칠하는
// 일은 구조적으로 생기지 않습니다.**
// 지우는 것이 아니라 '지금은 안 그리는' 것이라, 학생이 고친 것을 되돌리면
// 표시도 저절로 다시 나타납니다.
//
// [자리를 재는 범위 — 학생이 쓴 글만]
// 한 장에는 학생 글 말고도 이름표('단서 · 핵심 질문'), 제목 줄, 수업 자료,
// 선생님 한 마디가 함께 그려집니다. 그것까지 세면 **나중에 이름표 한 글자만
// 고쳐도 저장해 둔 자리가 전부 밀립니다.** 그래서 그런 곳에는
// `data-nomark`를 달고 여기서 통째로 건너뜁니다 — 자리의 기준은 언제나
// '학생이 쓴 글을 차례로 이은 것'입니다.
// =============================================================

// 한 장에 남길 수 있는 표시 수. 규칙(firestore.rules)의 천장과 **같아야**
// 합니다 — 화면이 더 허용하면 저장이 조용히 거부됩니다.
export const MARK_MAX = 40;

// 자리를 확인하려고 함께 적어 두는 글자의 길이. 규칙이 목록 안 항목의 크기를
// 못 보므로(반복문이 없습니다) 문서가 불어나지 않게 여기서 자릅니다.
// 견줄 때도 **앞에서 이만큼만** 봅니다.
export const MARK_TEXT_MAX = 300;

// 피드백에 들어가는 인용 한 줄의 길이. 학생이 '어느 대목인가'를 찾을 수
// 있으면 되는 값이고, 피드백 칸이 2000자라 긴 인용 몇 개면 금세 찹니다.
export const QUOTE_MAX = 60;

// 고른 글자 → 인용 한 줄. 줄바꿈·연속 공백은 한 칸으로 눕힙니다 — 여러 줄에
// 걸쳐 끌면 그대로 넣었을 때 피드백 칸이 인용만으로 길어집니다.
export function quoteOf(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return t.length > QUOTE_MAX ? `${t.slice(0, QUOTE_MAX)}…` : t;
}

// 인용 한 덩이 — 「인용」 다음 줄에 '→ '를 두고 거기서부터 씁니다.
// 학생 화면(서랍·리포트)의 피드백 칸이 `white-space: pre-wrap`이라 이 모양이
// 그대로 보입니다. **고칠 때는 quoteBlock·dropQuote 둘을 함께** — 짓는 모양과
// 걷어 내는 모양이 갈리면 잘못 끈 인용을 못 지웁니다.
export function quoteBlock(quote) {
  return `「${quote}」\n→ `;
}

// 아직 아무것도 안 쓴 인용 덩이만 걷어 냅니다. 잘못 끌었을 때 표시와 인용이
// 한 번에 사라지게 하려는 것이라, **'→' 뒤에 글이 있으면 건드리지 않습니다**
// — 교사가 쓴 글을 지우는 것보다 인용 한 줄이 남는 편이 낫습니다.
// 찾을 때 '→'까지만 보는 까닭: 다음 인용을 붙일 때 앞 덩이의 꼬리 공백을
// 지우므로, 넣을 때 쓴 `'→ '` 그대로는 마지막 덩이에서만 맞습니다.
export function dropQuote(text, quote) {
  const head = `「${quote}」\n→`;
  const at = String(text).indexOf(head);
  if (at < 0) return null;
  const after = text.slice(at + head.length);
  const written = after.replace(/^[ \t]*/, "");
  if (written && !written.startsWith("\n")) return null;
  const before = text.slice(0, at).replace(/\s+$/, "");
  const rest = after.replace(/^\s+/, "");
  if (before && rest) return `${before}\n\n${rest}`;
  return before || rest;
}

// 문서 → 표시 목록. **읽는 자리는 모두 이것을 거칩니다**(옛 노트는 이 칸이
// 아예 없습니다). 모양이 어긋난 항목은 조용히 버립니다 — 규칙이 목록 안까지
// 검사하지 못하므로 읽는 쪽에서 한 번 거릅니다.
export function marksOf(note) {
  const raw = Array.isArray(note?.feedbackMarks) ? note.feedbackMarks : [];
  return raw
    .slice(0, MARK_MAX)
    .filter(
      (m) =>
        Number.isInteger(m?.start) &&
        Number.isInteger(m?.end) &&
        m.end > m.start &&
        typeof m.text === "string" &&
        m.text.length > 0
    )
    .map((m, i) => ({
      id: `fm${i}_${m.start}_${m.end}`,
      start: m.start,
      end: m.end,
      text: m.text,
    }));
}

// 저장할 모양으로 — 화면이 쓰는 id·quote 같은 곁가지를 털어 냅니다.
export function marksToSave(marks = []) {
  return marks.slice(0, MARK_MAX).map((m) => ({
    start: m.start,
    end: m.end,
    text: String(m.text ?? "").slice(0, MARK_TEXT_MAX),
  }));
}

// ── 아래는 DOM을 재는 것들 (브라우저에서만) ────────────────────

// 자리를 재는 범위의 글자 노드들. `data-nomark`가 달린 곳(이름표·제목·
// 수업 자료·선생님 한 마디)은 통째로 건너뜁니다 — 위 머리말 참고.
export function textNodesIn(root) {
  const walk = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(n) {
        if (n.nodeType === 1) {
          return n.hasAttribute("data-nomark")
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );
  const out = [];
  let n;
  while ((n = walk.nextNode())) out.push(n);
  return out;
}

// 고른 범위 → 글자 자리 [start, end)
export function offsetsOf(root, range) {
  let at = 0;
  let start = -1;
  let end = -1;
  textNodesIn(root).forEach((n) => {
    const len = n.nodeValue.length;
    if (range.intersectsNode(n)) {
      const s = n === range.startContainer ? range.startOffset : 0;
      const e = n === range.endContainer ? range.endOffset : len;
      if (e > s) {
        if (start < 0) start = at + s;
        end = at + e;
      }
    }
    at += len;
  });
  return start < 0 ? null : { start, end };
}

// 글자 자리 → 지금 DOM의 Range (없으면 null)
export function rangeAt(root, start, end) {
  const nodes = textNodesIn(root);
  const r = document.createRange();
  let at = 0;
  let opened = false;
  for (const n of nodes) {
    const len = n.nodeValue.length;
    if (!opened && start < at + len) {
      r.setStart(n, Math.max(0, start - at));
      opened = true;
    }
    if (opened && end <= at + len) {
      r.setEnd(n, Math.max(0, end - at));
      return r;
    }
    at += len;
  }
  return null;
}

// 그 자리의 지금 글자가 짚을 때와 같은가. **자른 길이만큼만 앞에서** 봅니다.
export function markStillFits(range, text) {
  return range.toString().slice(0, MARK_TEXT_MAX) === text;
}

// 줄 상자가 그대로면 상태를 바꾸지 않습니다 — 렌더마다 재는데 그때마다 새
// 배열을 넣으면 렌더가 끝없이 돕니다.
export function sameRects(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.key !== y.key ||
      Math.abs(x.left - y.left) > 0.5 ||
      Math.abs(x.top - y.top) > 0.5 ||
      Math.abs(x.width - y.width) > 0.5 ||
      Math.abs(x.height - y.height) > 0.5
    ) {
      return false;
    }
  }
  return true;
}

// 표시 목록 → 덮을 줄 상자들. 자리는 감싼 칸을 기준으로 잽니다 — 둘 다
// 뷰포트 좌표라 뺄셈 한 번이면 되고, 화면이 굴러도 함께 움직이므로 스크롤을
// 따로 더할 것이 없습니다.
export function measureMarks(wrap, marks) {
  if (!wrap || marks.length === 0) return [];
  const base = wrap.getBoundingClientRect();
  const out = [];
  marks.forEach((m) => {
    const r = rangeAt(wrap, m.start, m.end);
    if (!r || !markStillFits(r, m.text)) return; // 학생이 고친 대목 — 안 그립니다
    Array.from(r.getClientRects()).forEach((c, i) => {
      if (c.width < 1 || c.height < 1) return; // 줄 끝의 빈 상자
      out.push({
        key: `${m.id}_${i}`,
        id: m.id,
        left: c.left - base.left,
        top: c.top - base.top,
        width: c.width,
        height: c.height,
      });
    });
  });
  return out;
}
