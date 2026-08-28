"use client";

// =============================================================
// 활동 모아보기 — 한 활동에 대한 반 전체의 답을 한 화면에
// -------------------------------------------------------------
// 지금까지 결과를 함께 보는 길은 '발표 모드'(한 명씩 넘겨보기)와
// '함께 보기'(학생이 친구 카드를 하나씩 열기)뿐이라, 여러 답을 나란히
// 놓고 견주는 장면을 만들 수 없었습니다. 이 화면이 그 자리를 맡습니다.
//
//   · 활동 하나를 정해, 그 활동의 답만 카드로 깔아 놓습니다
//   · 정렬 — 학번순 / 제출순 / 글자 수순
//   · 카드마다 '띄우기'(그 답 하나만 학급 화면에) + 🍎(멋진 순간)
//   · 위쪽 '이 화면 학급에 띄우기' — 깔린 답 전체를 학생 화면에 그대로
//
// 방송은 다른 활동과 같은 useEntryCast를 씁니다. 반마다 방송 문서가
// 하나뿐이라, 전체 띄우기와 한 장 띄우기는 서로를 자동으로 대체합니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { REWARD_MAX } from "@/lib/store";
import { useEntryCast } from "@/lib/useEntryCast";
import { sanitizeHtml, stripHtml } from "@/lib/html";
import { matchActivitySections, DONE_MIN_CHARS } from "@/lib/activities";

// 방송 꾸러미가 지나치게 커지지 않도록 답 하나의 길이를 자릅니다
// (문서 크기 한도보다, 학급 화면에서 읽히는 분량이 먼저 한계입니다).
const CAST_TEXT_MAX = 600;

const SORTS = [
  { key: "studentId", label: "학번순" },
  { key: "time", label: "제출순" },
  { key: "length", label: "글자순" },
];

export default function StudyActivityWall({
  board,
  index,
  user,
  roster = [],
  cards = [],
  onAward = null,
  onClose,
}) {
  const activities = board?.activities ?? [];
  const title = activities[index] ?? `활동 ${index + 1}`;
  const isGroup = board?.activityType === "group";
  const [sort, setSort] = useState("studentId");

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 학생 한 명당 답 하나 — 이 활동 칸만 뽑아냅니다
  const rows = useMemo(() => {
    return roster.map((s) => {
      const card = cards.find((c) =>
        isGroup ? c.memberUids?.includes(s.uid) : c.authorId === s.uid
      );
      const html = card ? matchActivitySections(card, activities)[index]?.content ?? "" : "";
      const text = stripHtml(html).trim();
      return {
        uid: s.uid,
        name: s.name,
        studentId: s.studentId ?? null,
        count: s.count ?? 0,
        html,
        text,
        chars: text.length,
        at: card?.updatedAt ?? card?.createdAt ?? null,
      };
    });
  }, [roster, cards, activities, index, isGroup]);

  const written = rows.filter((r) => r.chars > 0);
  const notYet = rows.filter((r) => r.chars === 0);

  const sorted = useMemo(() => {
    const list = [...written];
    if (sort === "length") return list.sort((a, b) => b.chars - a.chars);
    if (sort === "time") {
      return list.sort((a, b) => {
        const at = a.at?.toMillis?.() ?? +new Date(a.at ?? 0);
        const bt = b.at?.toMillis?.() ?? +new Date(b.at ?? 0);
        return at - bt;
      });
    }
    return list.sort((a, b) =>
      String(a.studentId ?? "").localeCompare(String(b.studentId ?? ""), "ko", { numeric: true })
    );
  }, [written, sort]);

  // ── 방송 ──
  const cast = useEntryCast(board?.classId, user);
  const wallLive = cast.isCasting("__wall__", index);

  const wallPayload = useMemo(
    () => ({
      mode: "wall",
      activityTitle: `활동 ${index + 1}`,
      topic: title,
      items: sorted.map((r) => ({
        name: r.name,
        text: r.text.slice(0, CAST_TEXT_MAX),
      })),
    }),
    [sorted, index, title]
  );

  // 방송 중에 학생이 고치거나 정렬을 바꾸면 학급 화면도 따라갑니다
  const livePayload = useMemo(() => {
    if (!cast.target) return null;
    if (cast.target.uid === "__wall__") return wallPayload;
    const row = rows.find((r) => r.uid === cast.target.uid);
    return row ? onePayload(row, index, title) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cast.target, wallPayload, rows, index, title]);
  cast.useLiveUpdate(livePayload);

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal wall-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`활동 ${index + 1} 모아보기`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wall-head">
          <div className="wall-head-title">
            <span className="activity-dash-no">활동 {index + 1}</span>
            <h3 title={title}>{title}</h3>
          </div>

          <span className="wall-count">
            {written.length}/{rows.length}명
          </span>

          <div className="wall-sorts" role="group" aria-label="정렬">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`wall-sort${sort === s.key ? " on" : ""}`}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>

          {cast.canCast && (
            <button
              type="button"
              className={`wall-cast-all${wallLive ? " on" : ""}`}
              onClick={() => cast.cast({ uid: "__wall__", key: index }, wallPayload)}
              disabled={!wallLive && written.length === 0}
              title={
                wallLive
                  ? "학생 화면을 원래대로 되돌립니다"
                  : "지금 깔린 답을 학생 화면에 그대로 띄웁니다"
              }
            >
              {wallLive && <span className="broadcast-live-dot" aria-hidden="true" />}
              {wallLive ? "띄우기 끝내기" : "이 화면 학급에 띄우기"}
            </button>
          )}

          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {written.length === 0 ? (
          <p className="lesson-note-empty">아직 이 활동을 쓴 학생이 없어요.</p>
        ) : (
          <div className="wall-grid">
            {sorted.map((r) => {
              const live = cast.isCasting(r.uid, index);
              const done = r.chars >= DONE_MIN_CHARS;
              return (
                <article key={r.uid} className={`wall-card${live ? " live" : ""}`}>
                  <header className="wall-card-head">
                    <span className="wall-card-who">
                      {r.studentId && <small>{r.studentId}</small>}
                      <strong>{r.name}</strong>
                    </span>
                    <span className={`wall-card-chars${done ? " ok" : ""}`}>{r.chars}자</span>
                  </header>

                  <div
                    className="study-card-content wall-card-body"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(r.html) }}
                  />

                  <footer className="wall-card-foot">
                    {cast.canCast && (
                      <button
                        type="button"
                        className={`wall-card-cast${live ? " on" : ""}`}
                        onClick={() => cast.cast({ uid: r.uid, key: index }, onePayload(r, index, title))}
                        title={live ? "학생 화면을 되돌립니다" : "이 답만 학급 화면에 띄웁니다"}
                      >
                        {live ? "끄기" : "띄우기"}
                      </button>
                    )}
                    {onAward && (
                      <button
                        type="button"
                        className="wall-card-award"
                        onClick={() => onAward(r.uid, Math.min(REWARD_MAX, r.count + 1))}
                        disabled={r.count >= REWARD_MAX}
                        title={r.count >= REWARD_MAX ? "이미 최대 개수예요" : `과일 주기 (현재 ${r.count}개)`}
                        aria-label="과일 주기"
                      >
                        🍎
                      </button>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}

        {notYet.length > 0 && (
          <p className="wall-notyet">
            <span>아직 안 쓴 학생 {notYet.length}명</span>
            {notYet.slice(0, 12).map((r) => r.name).join(" · ")}
            {notYet.length > 12 && " …"}
          </p>
        )}
      </div>
    </div>
  );
}

// 답 한 장을 방송 꾸러미로 — PresentationOverlay의 'entry' 모드가 그립니다
// (RAFT 글쓰기·KWLS와 같은 모양이라 학생 화면이 일관됩니다).
function onePayload(row, index, title) {
  return {
    mode: "entry",
    activityTitle: `활동 ${index + 1}`,
    topic: title,
    writerName: row.name,
    label: title,
    prompt: "",
    index,
    total: index + 1,
    fields: [{ label: "", text: row.text.slice(0, CAST_TEXT_MAX) }],
  };
}
