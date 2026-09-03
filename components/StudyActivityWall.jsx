"use client";

// =============================================================
// 모아보기 — 한 칸에 대한 반 전체의 답을 한 화면에
// -------------------------------------------------------------
// 지금까지 결과를 함께 보는 길은 '발표 모드'(한 명씩 넘겨보기)와
// '함께 보기'(학생이 친구 카드를 하나씩 열기)뿐이라, 여러 답을 나란히
// 놓고 견주는 장면을 만들 수 없었습니다. 이 화면이 그 자리를 맡습니다.
//
//   · 정렬 — 학번순 / 제출순 / 글자 수순
//   · 이전/다음 — 한 명씩 차례로. 띄우는 중이면 학급 화면도 함께 넘어갑니다
//   · 카드마다 '띄우기'(그 답 하나만 학급 화면에) + 🍎(멋진 순간)
//   · 위쪽 '이 화면 학급에 띄우기' — 깔린 답 전체를 학생 화면에 그대로
//
// 어떤 칸이든 담을 수 있게 답은 부모가 만들어 넘깁니다(rows) — 프로젝트
// 활동은 카드에서, KWLS는 kwl 기록에서 뽑아 옵니다. 방송은 다른 활동과
// 같은 useEntryCast를 씁니다. 반마다 방송 문서가 하나뿐이라, 전체 띄우기와
// 한 장 띄우기는 서로를 자동으로 대체합니다.
//
// [이름]
// row에 anonName이 있으면 익명(닉네임)으로 그리고, 이름을 누른 교사에게만
// 실명이 펼쳐집니다 — 학급 화면에 띄우는 이름도 익명입니다. anonName이
// 없으면 지금까지처럼 name을 그대로 씁니다(공부방 프로젝트는 실명 공간).
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { REWARD_MAX } from "@/lib/store";
import { useEntryCast } from "@/lib/useEntryCast";
import { sanitizeHtml } from "@/lib/html";
import { DONE_MIN_CHARS } from "@/lib/activities";

// 방송 꾸러미가 지나치게 커지지 않도록 답 하나의 길이를 자릅니다
// (문서 크기 한도보다, 학급 화면에서 읽히는 분량이 먼저 한계입니다).
const CAST_TEXT_MAX = 600;

const SORTS = [
  { key: "studentId", label: "학번순" },
  { key: "time", label: "제출순" },
  { key: "length", label: "글자순" },
];

export default function StudyActivityWall({
  classId,
  user,
  label,          // 왼쪽 작은 딱지 (예: "활동 2", "W")
  title,          // 제목 (활동 이름 · KWLS 칸 이름)
  castKey,        // 방송 대상 구분 키 — 화면마다 달라야 서로 섞이지 않습니다
  // [{ uid, name, studentId, count, html, text, chars, at,
  //    anonName?, anonEmoji?, realName? }]
  rows = [],
  onAward = null,
  onClose,
}) {
  const [sort, setSort] = useState("studentId");
  const [focus, setFocus] = useState(0);            // 이전/다음으로 짚는 자리
  const [revealed, setRevealed] = useState(() => new Set()); // 실명을 펼친 uid
  const [showRealNotYet, setShowRealNotYet] = useState(false); // 안 쓴 학생 줄만
  const cardRefs = useRef(new Map());

  // 부모가 익명 이름을 실어 보냈는지 — 이 화면 전체의 이름 규칙이 갈립니다
  const anonymous = rows.some((r) => r.anonName);
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
  const cast = useEntryCast(classId, user);
  const wallLive = cast.isCasting("__wall__", castKey);
  // 한 장을 띄우고 있는 중인지 — 이전/다음이 학급 화면까지 끌고 갈지 가릅니다
  const castingOne =
    !!cast.target && cast.target.uid !== "__wall__" && cast.target.key === castKey;

  const wallPayload = useMemo(
    () => ({
      mode: "wall",
      activityTitle: label,
      topic: title,
      items: sorted.map((r) => ({
        name: castName(r),
        text: r.text.slice(0, CAST_TEXT_MAX),
      })),
    }),
    [sorted, label, title]
  );

  // 방송 중에 학생이 고치거나 정렬을 바꾸면 학급 화면도 따라갑니다
  const livePayload = useMemo(() => {
    if (!cast.target) return null;
    if (cast.target.uid === "__wall__") return wallPayload;
    const row = rows.find((r) => r.uid === cast.target.uid);
    return row ? onePayload(row, label, title) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cast.target, wallPayload, rows, label, title]);
  cast.useLiveUpdate(livePayload);

  // ── 이전/다음 — 한 명씩 차례로 ──
  // 짚은 카드를 또렷하게 하고 화면 안으로 끌어옵니다. 한 장을 띄우는
  // 중이었다면 학급 화면도 함께 넘어갑니다 — 여럿을 이어서 함께 읽는
  // 자리라, 넘길 때마다 카드를 찾아 '띄우기'를 다시 누르게 하면 흐름이 끊깁니다.
  const at = Math.min(focus, Math.max(0, sorted.length - 1));

  function goTo(next, alsoCast = castingOne) {
    if (sorted.length === 0) return;
    const idx = (next + sorted.length) % sorted.length;
    setFocus(idx);
    const target = sorted[idx];
    cardRefs.current.get(target.uid)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // 같은 사람이면 cast()가 토글이라 방송이 꺼집니다 — 한 명뿐일 때
    if (alsoCast && !cast.isCasting(target.uid, castKey)) {
      cast.cast({ uid: target.uid, key: castKey }, onePayload(target, label, title));
    }
  }

  // 정렬을 바꾸면 짚던 자리가 다른 사람을 가리키므로 처음으로 되돌립니다
  useEffect(() => { setFocus(0); }, [sort, castKey]);

  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if (e.key === "Escape") onClose();
      else if (!typing && e.key === "ArrowLeft") goTo(at - 1);
      else if (!typing && e.key === "ArrowRight") goTo(at + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggleReveal(uid) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal wall-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${label} 모아보기`}
        // 깔린 카드 수만큼만 넓힙니다(최대 4열) — 두 장뿐인데 1240px로 열리면
        // 오른쪽이 텅 빈 채라 화면이 덜 그려진 것처럼 보입니다.
        // (두 열 아래로는 줄이지 않습니다 — 제목·정렬·띄우기가 있는 머리줄이
        //  그보다 좁으면 여러 줄로 접혀 오히려 커집니다)
        style={{ "--wall-cols": Math.min(4, Math.max(2, written.length)) }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wall-head">
          <div className="wall-head-title">
            <span className="activity-dash-no">{label}</span>
            <h3 title={title}>{title}</h3>
          </div>

          <span className="wall-count">
            {written.length}/{rows.length}명
          </span>

          {/* 한 명씩 차례로 — 띄우는 중이면 학급 화면도 함께 넘어갑니다 */}
          {written.length > 1 && (
            <div className="wall-nav" role="group" aria-label="한 명씩 보기">
              <button
                type="button"
                className="wall-nav-btn"
                onClick={() => goTo(at - 1)}
                title="이전 (←)"
              >
                ‹ 이전
              </button>
              <span className="wall-nav-pos">
                {at + 1} <i>/</i> {written.length}
              </span>
              <button
                type="button"
                className="wall-nav-btn"
                onClick={() => goTo(at + 1)}
                title="다음 (→)"
              >
                다음 ›
              </button>
              {castingOne && <span className="wall-nav-note">띄운 화면도 따라 넘어가요</span>}
            </div>
          )}

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
              onClick={() => cast.cast({ uid: "__wall__", key: castKey }, wallPayload)}
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
          <p className="lesson-note-empty">아직 쓴 학생이 없어요.</p>
        ) : (
          <div className="wall-grid">
            {sorted.map((r, i) => {
              const live = cast.isCasting(r.uid, castKey);
              const done = r.chars >= DONE_MIN_CHARS;
              const open = revealed.has(r.uid);
              const hasReal = !!(r.realName || r.studentId);
              return (
                <article
                  key={r.uid}
                  ref={(el) => {
                    if (el) cardRefs.current.set(r.uid, el);
                    else cardRefs.current.delete(r.uid);
                  }}
                  className={`wall-card${live ? " live" : ""}${i === at ? " focus" : ""}`}
                >
                  <header className="wall-card-head">
                    {r.anonName ? (
                      /* 익명이 먼저 — 교사가 이름을 누르면 그 한 사람만 실명이
                         펼쳐집니다(다시 누르면 접힘). 학급 화면에 나가는 이름도
                         익명이라, 여기서 벗겨도 학생 화면은 그대로입니다. */
                      <button
                        type="button"
                        className={`wall-card-who wall-who-btn${open ? " open" : ""}`}
                        onClick={() => toggleReveal(r.uid)}
                        disabled={!hasReal}
                        title={
                          !hasReal
                            ? "실명을 찾을 수 없어요"
                            : open
                              ? "눌러서 익명으로 되돌리기"
                              : "눌러서 실명 보기 (교사만 보입니다)"
                        }
                      >
                        {r.anonEmoji && <span aria-hidden="true">{r.anonEmoji}</span>}
                        <strong>{r.anonName}</strong>
                        {open && hasReal && (
                          <em className="wall-who-real">
                            {r.studentId} {r.realName || "이름 없음"}
                          </em>
                        )}
                      </button>
                    ) : (
                      <span className="wall-card-who">
                        {r.studentId && <small>{r.studentId}</small>}
                        <strong>{r.name}</strong>
                      </span>
                    )}
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
                        onClick={() => {
                          setFocus(i); // 여기서부터 이전/다음이 이어지도록
                          cast.cast({ uid: r.uid, key: castKey }, onePayload(r, label, title));
                        }}
                        title={live ? "학생 화면을 되돌립니다" : "이 답만 학급 화면에 크게 띄웁니다"}
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
                        🍎<span className="wall-card-award-n">{r.count ?? 0}</span>
                      </button>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}

        {/* 아직 안 쓴 학생 — 여기도 익명이 먼저입니다(카드와 같은 화면이라
            한쪽만 실명이면 익명으로 둔 뜻이 없어집니다). 다만 이 줄은
            '누구를 챙길까'를 보는 자리라, 딱지를 누르면 통째로 실명이 됩니다. */}
        {notYet.length > 0 && (
          <p className="wall-notyet">
            {anonymous ? (
              <button
                type="button"
                className={`wall-notyet-toggle${showRealNotYet ? " on" : ""}`}
                onClick={() => setShowRealNotYet((v) => !v)}
                title={showRealNotYet ? "익명으로 되돌리기" : "실명 보기 (교사만 보입니다)"}
              >
                아직 안 쓴 학생 {notYet.length}명
              </button>
            ) : (
              <span>아직 안 쓴 학생 {notYet.length}명</span>
            )}
            {notYet
              .slice(0, 12)
              .map((r) => (showRealNotYet ? r.realName || r.name : castName(r)))
              .join(" · ")}
            {notYet.length > 12 && " …"}
          </p>
        )}
      </div>
    </div>
  );
}

// 학급 화면에 나가는 이름 — 익명이 있으면 익명입니다.
// (교사 화면에서 실명을 펼쳐 봤더라도 학생들이 보는 쪽은 그대로 익명)
function castName(row) {
  return row.anonName || row.name;
}

// 답 한 장을 방송 꾸러미로 — PresentationOverlay의 'entry' 모드가 그립니다
// (RAFT 글쓰기·KWLS와 같은 모양이라 학생 화면이 일관됩니다).
function onePayload(row, label, title) {
  return {
    mode: "entry",
    activityTitle: label,
    topic: title,
    writerName: castName(row),
    label: title,
    prompt: "",
    fields: [{ label: "", text: row.text.slice(0, CAST_TEXT_MAX) }],
  };
}
