"use client";

// =============================================================
// 방송 본문을 '한 눈에 보기' 모양으로 — 문장 한 줄 + 카드 한 장
// -------------------------------------------------------------
// RAFT 글쓰기처럼 긴 글은 카드에 담아 보여 줍니다(선생님 요청). 모양은
// 한 눈에 보기 창(EntryOverviewModal)의 카드와 **같은 클래스**(`.eov-*`)라,
// 교사가 한 눈에 보기에서 본 것과 칠판에 뜬 것이 같은 얼굴입니다.
// 꾸러미에 `look: "card"`가 실려 오면 학생 방송 화면(PresentationOverlay)과
// 교사의 수업 화면 창(CastStageModal)이 둘 다 이것을 그립니다.
// 글 크기는 부르는 쪽이 정합니다 — 칠판은 `.entry-cast[data-size]`가 키웁니다.
// =============================================================
export default function EntryCastCard({ payload }) {
  const fields = payload?.fields ?? [];
  const chars = fields.reduce((n, f) => n + String(f.text ?? "").trim().length, 0);
  return (
    <div className="entry-cast-card">
      {payload?.note && <p className="raft-sentence done eov-lead">{payload.note}</p>}
      <section className={`eov-card wide${chars > 0 ? " done" : " empty"}`}>
        <header className="eov-card-head">
          {payload?.letter && <span className="paratext-letter" aria-hidden="true">{payload.letter}</span>}
          <span className="paratext-card-title">
            <strong>{payload?.label}</strong>
            {payload?.labelEn && <em>{payload.labelEn}</em>}
          </span>
          <span className={`eov-state${chars > 0 ? " done" : ""}`}>
            {chars > 0 ? `${chars}자` : "비어 있음"}
          </span>
        </header>
        {payload?.prompt && <p className="eov-prompt">{payload.prompt}</p>}
        <div className="eov-fields entry-cast-body">
          {fields.length === 0 ? (
            <p className="eov-text paratext-read-text empty">아직 쓰지 않았어요</p>
          ) : (
            fields.map((f, i) => {
              const text = String(f.text ?? "").trim();
              return (
                <div key={i} className="eov-field">
                  {f.label && <span className="eov-label">{f.label}</span>}
                  <p className={`eov-text paratext-read-text${text ? "" : " empty"}`}>
                    {text || "아직 쓰지 않았어요"}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
