"use client";

// =============================================================
// 수업 노트 한 장 — 읽기 전용 코넬 2단
// -------------------------------------------------------------
// 서랍(CornellNoteDrawer)은 폭이 380px뿐이라 세 칸을 세로로 쌓습니다.
// 여기는 넓은 화면이라 **본래 코넬 노트 모양** 그대로 폅니다 —
// 왼쪽 좁은 단서 칸 · 오른쪽 넓은 필기 칸 · 아래 요약 한 줄.
// 이 배치 자체가 복습 방법입니다(오른쪽을 가리고 왼쪽 단서만 보며 떠올리기).
//
// 학생 리포트와 교사 열람 화면이 같은 것을 씁니다 — 한쪽만 고치면 같은
// 노트가 두 얼굴이 됩니다.
//
// [덩어리마다 한 줄]
// 단서와 필기는 **덩어리로 짝지어** 저장됩니다(lib/cornell.js). 한 덩어리가
// 표의 한 행이 되어, 왼쪽 물음이 제 오른쪽 필기와 나란히 섭니다. 예전에는
// 두 칸이 각자 흐르는 글이라 '사물인터넷은 무엇일까?'가 저 아래 엉뚱한
// 문단 옆에 가 있었습니다.
// 덩어리를 모르는 옛 노트는 `blocksOf`가 **한 행짜리**로 읽어 지금까지와
// 똑같이 보입니다.
//
// 이름표(단서·필기)는 **맨 위에 한 번만** 답니다 — 행마다 붙이면 행이 셋만
// 돼도 이름표가 여섯 개라 정작 글이 묻힙니다. 행은 가로 줄로 갈립니다.
// =============================================================
//
// [선생님이 짚은 대목 — 하이라이트]
// 덮개를 **여기서** 그립니다. 이 한 장을 쓰는 곳이 다섯(교사 열람 · 노트 크게
// 보기 · 리포트 · 서랍의 피드백 알림 · 서랍의 지난 노트)인데, 교사가 짚은
// 자리는 그 다섯 곳에서 **다 같이 보여야** 합니다 — 학생이 제 글에서 짚인
// 대목을 직접 보는 것이 이 기능의 목적이라서요. 껍데기를 여기 두면 부르는
// 쪽은 아무것도 안 해도 따라옵니다.
// 자리를 재고 글자를 맞춰 보는 셈은 전부 `lib/cornellMarks.js`에 있습니다.
// 교사 창만 `onMarkAdd`·`onMarkRemove`를 함께 주어 끌어서 만들고 눌러서
// 지웁니다 — 안 주면 읽기 전용이라 누를 수도 없습니다.
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { richHtml, stripHtml } from "@/lib/html";
import { blocksOf, blockEmpty } from "@/lib/cornell";
import { marksOf, measureMarks, offsetsOf, quoteOf, sameRects } from "@/lib/cornellMarks";

export default function CornellNoteSheet({
  note,
  showFeedback = true,
  // 교사 창이 고치는 중인 목록. 안 주면 문서에 저장된 것을 그대로 씁니다.
  marks = null,
  onMarkAdd = null,
  onMarkRemove = null,
}) {
  const wrapRef = useRef(null);
  const [rects, setRects] = useState([]);
  const shown = marks ?? marksOf(note);
  // 배열이 렌더마다 새로 생기므로 의존성에 그대로 걸 수 없습니다 — 값이
  // 같은지로 봅니다(표시는 많아야 마흔 개라 이 정도면 충분합니다).
  const key = JSON.stringify(shown.map((m) => [m.start, m.end, m.text]));

  const measure = useCallback(() => {
    const next = measureMarks(wrapRef.current, shown);
    setRects((prev) => (sameRects(prev, next) ? prev : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // **렌더마다 다시 잽니다.** 본문이 새 노드로 갈리거나 글꼴이 늦게 와서 줄이
  // 다시 흘러도 표시가 따라옵니다. 값이 그대로면 상태를 안 바꾸므로
  // (sameRects) 렌더가 더 돌지 않습니다 — **이 비교를 빼면 끝없이 돕니다.**
  useLayoutEffect(() => {
    measure();
  });

  // 창 크기가 바뀌면 글이 다시 흐르므로 줄 상자도 다시 잽니다.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [measure]);

  // **안쪽이 구르는 화면이 있습니다** — 노트 크게 보기는 시트가 아니라 그 안의
  // 격자가 구릅니다(덩어리가 여럿일 때 왼쪽·오른쪽이 같이 흐르라고 그렇게
  // 짰습니다). 그때 감싼 칸은 제자리에 있고 글자만 올라가므로, 다시 재지
  // 않으면 표시가 허공에 남습니다. 창이 통째로 구르는 화면(교사 열람·리포트)
  // 에서는 둘이 같이 움직여 값이 그대로라 `sameRects`가 걸러 냅니다.
  // 스크롤은 잦으므로 프레임마다 한 번만 잽니다.
  useEffect(() => {
    if (shown.length === 0) return undefined;
    let waiting = 0;
    const onScroll = () => {
      if (waiting) return;
      waiting = requestAnimationFrame(() => {
        waiting = 0;
        measure();
      });
    };
    // capture로 들어야 안쪽 칸이 구르는 것까지 잡힙니다(scroll은 안 올라옵니다).
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      if (waiting) cancelAnimationFrame(waiting);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [measure, shown.length]);

  // 끌어서 새 표시 만들기 — 교사 창에서만.
  useEffect(() => {
    if (!onMarkAdd) return undefined;
    function onUp() {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      if (!wrap.contains(range.commonAncestorContainer)) return;
      const raw = range.toString();
      const quote = quoteOf(raw);
      // 한 글자짜리는 읽다가 스친 것일 때가 대부분입니다.
      if (quote.length < 2) return;
      const span = offsetsOf(wrap, range);
      sel.removeAllRanges(); // 파란 선택이 노란 표시 위에 겹치지 않게
      if (!span) return;
      onMarkAdd({ ...span, text: raw, quote });
    }
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [onMarkAdd]);

  if (!note) return null;

  const topic = String(note.lessonTitle ?? "").trim();
  // 빈 덩어리는 빼되, 다 비었으면 한 줄은 남겨 '비어 있어요'를 보입니다.
  const all = blocksOf(note);
  const used = all.filter((b) => !blockEmpty(b));
  const rows = used.length > 0 ? used : all.slice(0, 1);
  const summary = String(note.summary ?? "").trim();
  const feedback = String(note.feedback ?? "").trim();
  const handouts = Array.isArray(note.materials) ? note.materials : [];

  return (
    // 하이라이트를 얹으려고 감쌉니다 — 덮개가 이 칸을 기준으로 자리를 잡습니다.
    // `data-nomark`가 달린 곳은 자리 셈에서 빠집니다(학생이 쓴 글만 셉니다).
    <div className="cornell-hl-wrap" ref={wrapRef}>
    <article className="cornell-sheet">
      {/* 제목 줄 — 코넬 노트는 원래 맨 위에 '무엇에 대한 필기인가'를 적습니다.
          이게 없으면 단서·필기부터 시작해 무슨 수업이었는지 알 수 없습니다.
          날짜를 오른쪽에 함께 둡니다(넘겨 볼 때 지금 어디인지 잃지 않게). */}
      <header className="cornell-sheet-topic" data-nomark>
        <h3 className={topic ? "" : "cornell-sheet-blank"}>{topic || "제목 없음"}</h3>
        <time dateTime={note.date}>{note.date}</time>
      </header>

      <div className="cornell-sheet-grid">
        {/* 이름표 줄 — 맨 위 한 번만 */}
        <div className="cornell-sheet-cue cornell-sheet-th" data-nomark>단서 · 핵심 질문</div>
        <div className="cornell-sheet-notes cornell-sheet-th" data-nomark>필기</div>

        {rows.map((b) => {
          const cue = String(b.cue ?? "").trim();
          const notesHtml = richHtml(b.notes ?? "");
          const hasNotes = stripHtml(notesHtml).length > 0;
          return (
            <Fragment key={b.id}>
              <section className="cornell-sheet-cue">
                {cue ? <p>{cue}</p> : <p className="cornell-sheet-blank">비어 있어요</p>}
              </section>
              <section className="cornell-sheet-notes">
                {hasNotes ? (
                  <div
                    className="cornell-sheet-rich"
                    dangerouslySetInnerHTML={{ __html: notesHtml }}
                  />
                ) : (
                  <p className="cornell-sheet-blank">비어 있어요</p>
                )}
              </section>
            </Fragment>
          );
        })}
      </div>

      <section className="cornell-sheet-summary">
        <h4 data-nomark>내 말로 요약</h4>
        {summary ? <p>{summary}</p> : <p className="cornell-sheet-blank">비어 있어요</p>}
      </section>

      {/* 그날 수업 자료 — 노트를 열면 원본 파일로 바로 갑니다.
          파일을 복제하지 않고 이름과 링크만 남겼으므로, 교사가 나중에 그
          파일을 지우면 링크는 깨집니다. 이름은 남아 '무엇이었는지'는 압니다. */}
      {handouts.length > 0 && (
        <section className="cornell-sheet-handouts" data-nomark>
          <h4>📎 수업 자료</h4>
          <div className="cornell-sheet-handout-list">
            {handouts.map((m, i) => (
              <a
                key={`${m.url}_${i}`}
                className="cornell-handout"
                href={m.url}
                target="_blank"
                rel="noreferrer"
                title={m.name}
              >
                {m.kind === "image" ? "🖼" : "📄"} {m.name}
              </a>
            ))}
          </div>
        </section>
      )}

      {showFeedback && feedback && (
        <section className="cornell-sheet-feedback" data-nomark>
          <span className="cornell-feedback-tag">선생님</span>
          <p>{feedback}</p>
        </section>
      )}
    </article>

    {/* 형광펜 덮개 — 글자를 감싸지 않고 위에 덧그립니다. 본문은
        dangerouslySetInnerHTML로, 단서·요약은 React가 직접 그리는 자리라
        <mark>를 끼워 넣으면 React가 들고 있던 텍스트 노드와 어긋납니다.
        읽기 전용일 때는 누를 수 없는 그냥 표시입니다. */}
    {rects.map((r) => (
      <span
        key={r.key}
        className={`cornell-hl${onMarkRemove ? " is-editable" : ""}`}
        style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
        onClick={onMarkRemove ? () => onMarkRemove(r.id) : undefined}
        title={onMarkRemove ? "눌러서 표시 지우기" : undefined}
        aria-hidden="true"
      />
    ))}
    </div>
  );
}
