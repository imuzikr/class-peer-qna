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
// =============================================================
import { richHtml, stripHtml } from "@/lib/html";

export default function CornellNoteSheet({ note, showFeedback = true }) {
  if (!note) return null;

  const topic = String(note.lessonTitle ?? "").trim();
  const cue = String(note.cue ?? "").trim();
  const notesHtml = richHtml(note.notes ?? "");
  const hasNotes = stripHtml(notesHtml).length > 0;
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
        <section className="cornell-sheet-cue">
          <h4>단서 · 핵심 질문</h4>
          {cue ? <p>{cue}</p> : <p className="cornell-sheet-blank">비어 있어요</p>}
        </section>
        <section className="cornell-sheet-notes">
          <h4>필기</h4>
          {hasNotes ? (
            <div
              className="cornell-sheet-rich"
              dangerouslySetInnerHTML={{ __html: notesHtml }}
            />
          ) : (
            <p className="cornell-sheet-blank">비어 있어요</p>
          )}
        </section>
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
