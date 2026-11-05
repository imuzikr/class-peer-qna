"use client";

// 한 눈에 보기의 영역 카드 격자 — 교사의 한 눈에 보기 창(EntryOverviewModal)과
// 학생 방송 화면(PresentationOverlay의 mode "overview")이 **같은 조각**을 씁니다.
// 교사가 보는 것이 곧 칠판에 뜬 것이어야 해서입니다.

export function sectionChars(sec) {
  return (sec?.fields ?? []).reduce((n, f) => n + String(f.text ?? "").replace(/\s/g, "").length, 0);
}

export default function EntryOverviewCards({ sections = [], gridCols = 2 }) {
  return (
    <div className={`eov-grid${gridCols === 4 ? " eov-grid--4" : ""}`}>
      {sections.map((s) => {
        const chars = sectionChars(s);
        const fields = s.fields ?? [];
        return (
          <section
            key={s.key}
            data-sec={s.key}
            className={`eov-card${chars > 0 ? " done" : " empty"}${s.wide ? " wide" : ""}`}
          >
            <header className="eov-card-head">
              {s.letter && <span className="paratext-letter" aria-hidden="true">{s.letter}</span>}
              <span className="paratext-card-title">
                <strong>{s.label}</strong>
                {s.labelEn && <em>{s.labelEn}</em>}
              </span>
              <span className={`eov-state${chars > 0 ? " done" : ""}`}>
                {chars > 0 ? `${chars}자` : "비어 있음"}
              </span>
            </header>
            {s.prompt && <p className="eov-prompt">{s.prompt}</p>}
            <div className={`eov-fields${s.columns === 2 ? " cols" : ""}`}>
              {fields.length === 0 ? (
                <p className="eov-text empty">아직 쓰지 않았어요</p>
              ) : (
                fields.map((f, i) => {
                  const text = String(f.text ?? "").trim();
                  return (
                    <div key={i} className="eov-field">
                      {f.label && <span className="eov-label">{f.label}</span>}
                      <p className={`eov-text${text ? "" : " empty"}`}>{text || "아직 쓰지 않았어요"}</p>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
