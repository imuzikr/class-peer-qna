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
import { Fragment } from "react";
import { richHtml, stripHtml } from "@/lib/html";
import { blocksOf, blockEmpty } from "@/lib/cornell";

export default function CornellNoteSheet({ note, showFeedback = true }) {
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
    <article className="cornell-sheet">
      {/* 제목 줄 — 코넬 노트는 원래 맨 위에 '무엇에 대한 필기인가'를 적습니다.
          이게 없으면 단서·필기부터 시작해 무슨 수업이었는지 알 수 없습니다.
          날짜를 오른쪽에 함께 둡니다(넘겨 볼 때 지금 어디인지 잃지 않게). */}
      <header className="cornell-sheet-topic">
        <h3 className={topic ? "" : "cornell-sheet-blank"}>{topic || "제목 없음"}</h3>
        <time dateTime={note.date}>{note.date}</time>
      </header>

      <div className="cornell-sheet-grid">
        {/* 이름표 줄 — 맨 위 한 번만 */}
        <div className="cornell-sheet-cue cornell-sheet-th">단서 · 핵심 질문</div>
        <div className="cornell-sheet-notes cornell-sheet-th">필기</div>

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
        <h4>내 말로 요약</h4>
        {summary ? <p>{summary}</p> : <p className="cornell-sheet-blank">비어 있어요</p>}
      </section>

      {/* 그날 수업 자료 — 노트를 열면 원본 파일로 바로 갑니다.
          파일을 복제하지 않고 이름과 링크만 남겼으므로, 교사가 나중에 그
          파일을 지우면 링크는 깨집니다. 이름은 남아 '무엇이었는지'는 압니다. */}
      {handouts.length > 0 && (
        <section className="cornell-sheet-handouts">
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
        <section className="cornell-sheet-feedback">
          <span className="cornell-feedback-tag">선생님</span>
          <p>{feedback}</p>
        </section>
      )}
    </article>
  );
}
