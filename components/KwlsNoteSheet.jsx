"use client";

// =============================================================
// KWLS 한 장 — 읽기 전용 네 칸
// -------------------------------------------------------------
// 수업 노트 크게 보기의 'KWLS 노트' 탭이 한 번에 한 장씩 폅니다.
// 껍데기(.cornell-sheet)와 제목 줄은 코넬 노트 한 장과 **같은 것**을 씁니다 —
// 같은 창에서 탭만 바꿔 넘나드는 자리라, 두 장이 다른 모양이면 다른 공책을
// 편 것처럼 보입니다.
//
// 안쪽만 다릅니다: 코넬은 단서·필기 2단인데 여기는 K·W·L·S 네 칸입니다.
// 읽기 전(K·W)과 읽은 뒤(L·S)가 위아래로 갈리도록 2×2로 둡니다 — 학생이
// 쓸 때 본 배치(KwlPanel)와 같아야 어디에 무엇을 썼는지 그대로 읽힙니다.
// =============================================================
import { KWLS_COLUMNS, kwlsAnswersFromEntry } from "@/lib/kwls";

export default function KwlsNoteSheet({ entry }) {
  if (!entry) return null;

  const answers = kwlsAnswersFromEntry(entry);
  // 책방 KWLS 활동에는 주제어가 붙어 있고, 공부방 하루 성찰에는 없습니다.
  const topic = String(entry.topic ?? "").trim();

  return (
    <article className="cornell-sheet kwls-sheet">
      <header className="cornell-sheet-topic">
        <h3 className={topic ? "" : "cornell-sheet-blank"}>{topic || "하루 성찰"}</h3>
        <time dateTime={entry.date}>{entry.date}</time>
      </header>

      <div className="kwls-sheet-grid">
        {KWLS_COLUMNS.map((c) => {
          const text = String(answers[c.key] ?? "").trim();
          return (
            <section
              key={c.key}
              className={`kwls-sheet-cell kwls-sheet-cell--${c.letter.toLowerCase()}`}
            >
              <h4>
                <span className={`kwl-badge kwl-badge-${c.letter.toLowerCase()}`}>
                  {c.letter}
                </span>
                {c.ko}
              </h4>
              {text ? <p>{text}</p> : <p className="cornell-sheet-blank">비어 있어요</p>}
            </section>
          );
        })}
      </div>
    </article>
  );
}
