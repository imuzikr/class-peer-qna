"use client";

// =============================================================
// KWLS 차트 — 교사용 사이드 패널 (공부방 왼쪽, 밀어내기 방식)
// -------------------------------------------------------------
// 학생용 패널(KwlPanel)은 '내가 쓰는 곳'이지만, 교사에게 필요한 건
// '누가 어디까지 썼고 무엇을 궁금해하는가'입니다. 그래서 같은 자리에
// 다른 내용을 담습니다.
//
// 위에서부터
//   [날짜]   하루씩 이동 + 전체 화면(KwlFullscreenModal)으로 넘어가기
//   [집계]   K·W·L·S 칸마다 몇 명이 썼는지 + 아직 아무것도 안 쓴 학생
//   [W 모음] 오늘 학생들이 쓴 '알기를 원하는 것'만 모아 보기 —
//            수업 중 다룰 질문을 여기서 바로 골라 학급 화면에 띄웁니다
//   [격자]   학생 × K·W·L·S 잔디 격자. 칸을 누르면 그 학생의 전문이
//            팝오버로 뜨고, 거기서도 학급 화면에 띄울 수 있습니다
//
// 격자·팝오버는 공부중 전광판(StudyProgressBoard)과 같은 시각 언어를
// 씁니다 — 색만 보고 'K·W만 쓰고 멈춘 학생'과 'L·S까지 마친 학생'이
// 갈리도록. 방송은 RAFT 글쓰기와 같은 useEntryCast를 그대로 씁니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeAllKwl, todayDateKey, getDirectoryUser } from "@/lib/store";
import { useEntryCast } from "@/lib/useEntryCast";
import {
  KWLS_COLUMNS,
  kwlsAnswersFromEntry,
  kwlsStarted,
} from "@/lib/kwls";
import KwlFullscreenModal from "./KwlFullscreenModal";
import StudyActivityWall from "./StudyActivityWall";

// 접어 둔 묶음을 기억하는 자리 (브라우저마다·교사마다)
const FOLD_KEY = "tkwl-folded";

// 날짜를 하루씩 옮깁니다 (YYYY-MM-DD 문자열 기준)
function shiftDate(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateLabel(dateKey) {
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export default function TeacherKwlPanel({
  classId,
  user,
  roster = [],
  onAward = null, // 모아보기 카드에서 바로 과일 주기 (uid, 새 개수)
  onClose,
}) {
  const [date, setDate] = useState(() => todayDateKey());
  const [entries, setEntries] = useState([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [picked, setPicked] = useState(null); // { uid, key } — 팝오버 대상
  const [wallKey, setWallKey] = useState(null); // 모아보기로 크게 볼 칸(W·S)
  // 접어 둔 묶음 — 학생이 늘면 W·S 목록이 길어져 아래 것들이 화면 밖으로
  // 밀립니다. 무엇을 접어 뒀는지는 다음에 열 때도 그대로 두는 편이 낫습니다
  // (수업마다 보는 자리가 대개 정해져 있어서).
  const [folded, setFolded] = useState(() => new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FOLD_KEY);
      if (raw) setFolded(new Set(JSON.parse(raw)));
    } catch {}
  }, []);
  function toggleFold(key) {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem(FOLD_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  useEffect(() => {
    if (!classId) { setEntries([]); return; }
    return subscribeAllKwl(classId, date, setEntries);
  }, [classId, date]);

  // 학생 한 명당 한 줄 — 오늘(고른 날짜) 기록을 붙여 둡니다.
  // KWLS는 하루 1개라 uid로 바로 짝지어집니다.
  // 한 학생이 같은 날 여러 건을 쓸 수 있습니다 — 공부방에서 하루치 성찰을
  // 쓰고 책방 KWLS 활동도 했다면 두 건입니다. 예전에는 Map에 덮어써서 뒤엣
  // 것만 남고 앞엣것이 조용히 사라졌습니다. 칸마다 '누구든 썼는가'로 합치고,
  // 원문은 출처별로 따로 들고 있다가 팝오버에서 나란히 보여 줍니다.
  const rows = useMemo(() => {
    const byUid = new Map();
    entries.forEach((e) => {
      if (!e.userId) return;
      if (!byUid.has(e.userId)) byUid.set(e.userId, []);
      byUid.get(e.userId).push(e);
    });
    return roster.map((s) => {
      const mine = byUid.get(s.uid) ?? [];
      const parts = mine.map((e) => ({
        // 책방 활동에서 온 기록은 어느 활동인지 밝혀 둡니다
        source: e.activityId ? e.activityTitle || e.topic || "책방 활동" : null,
        answers: kwlsAnswersFromEntry(e),
      }));
      // 칸별 대표 텍스트 — 여러 건이면 줄바꿈으로 이어 붙입니다(격자·모아보기용)
      const answers = {};
      KWLS_COLUMNS.forEach((c) => {
        answers[c.key] = parts
          .map((p) => String(p.answers[c.key] ?? "").trim())
          .filter(Boolean)
          .join("\n");
      });
      // 익명 이름 — 학급 화면에 나가는 이름이고, 모아보기 카드에 적히는
      // 이름입니다. 실명은 교사가 눌렀을 때만 펼쳐집니다.
      // (디렉터리는 공부방 화면이 이미 구독해 둔 것이라 읽기가 늘지 않습니다)
      const dir = getDirectoryUser(s.uid);
      return {
        uid: s.uid,
        name: s.name,
        anonName: dir?.displayName || "익명",
        anonEmoji: dir?.emoji || s.emoji || "🙂",
        studentId: s.studentId ?? null,
        count: s.count ?? 0, // 지금까지 받은 과일
        answers,
        parts,
        started: kwlsStarted(answers),
      };
    });
  }, [roster, entries]);

  // [집계] 칸마다 몇 명이 썼는지 + 아직 아무것도 안 쓴 학생
  const counts = KWLS_COLUMNS.map(
    (c) => rows.filter((r) => (r.answers[c.key] ?? "").trim().length > 0).length
  );
  const notStarted = rows.filter((r) => !r.started);

  // [모음] 학생이 '묻고 남긴' 두 칸만 따로 모읍니다 —
  //   W 알기를 원하는 것 / S 더 알고 싶은 것.
  // 수업에서 곧바로 다룰거리가 되는 칸이라, K·L(사실 정리)과 달리
  // 목록으로 훑고 골라 띄우는 쓰임이 있습니다.
  const COLLECT = KWLS_COLUMNS.filter((c) => c.letter === "W" || c.letter === "S");
  function textsOf(key) {
    return rows
      .map((r) => ({ ...r, text: (r.answers[key] ?? "").trim() }))
      .filter((r) => r.text.length > 0);
  }

  // 모아보기에 넘길 답 — 안 쓴 학생까지 포함해야 '몇 명 중 몇 명'이 맞습니다.
  // anonName을 실어 보내면 모아보기가 익명으로 그립니다(카드도 학급 화면도).
  const wallRows =
    wallKey === null
      ? []
      : rows.map((r) => {
          const text = (r.answers[wallKey] ?? "").trim();
          return {
            uid: r.uid,
            name: r.name,
            anonName: r.anonName,
            anonEmoji: r.anonEmoji,
            realName: r.name,
            studentId: r.studentId,
            count: r.count,
            html: text,
            text,
            chars: text.length,
            at: null,
          };
        });
  const wallCol = KWLS_COLUMNS.find((c) => c.key === wallKey) ?? null;

  // ── 학급 화면에 띄우기 (RAFT 글쓰기와 같은 방식) ──
  const cast = useEntryCast(classId, user);
  const castTarget = cast.target;
  const livePayload = useMemo(() => {
    if (!castTarget) return null;
    const row = rows.find((r) => r.uid === castTarget.uid);
    if (!row) return null;
    return buildPayload(row, castTarget.key, date);
  }, [castTarget, rows, date]);
  cast.useLiveUpdate(livePayload);

  function castCell(row, key) {
    cast.cast({ uid: row.uid, key }, buildPayload(row, key, date));
  }

  const pickedRow = picked ? rows.find((r) => r.uid === picked.uid) : null;

  return (
    <aside className="kwl-panel teacher-kwl">
      {onClose && (
        <button className="kwl-mobile-close" onClick={onClose} aria-label="닫기">
          ×
        </button>
      )}

      {/* ── 날짜 ── */}
      <div className="tkwl-head">
        <div className="tkwl-date">
          <button
            type="button"
            onClick={() => setDate((d) => shiftDate(d, -1))}
            aria-label="이전 날"
          >
            ‹
          </button>
          <span>{dateLabel(date)}</span>
          <button
            type="button"
            onClick={() => setDate((d) => shiftDate(d, 1))}
            aria-label="다음 날"
          >
            ›
          </button>
        </div>
        <div className="tkwl-head-actions">
          {date !== todayDateKey() && (
            <button
              type="button"
              className="tkwl-today"
              onClick={() => setDate(todayDateKey())}
            >
              오늘
            </button>
          )}
          <button
            type="button"
            className="tkwl-full"
            onClick={() => setFullscreen(true)}
            title="학생 전원의 K·W·L·S를 큰 화면으로"
          >
            ⛶ 전체 화면
          </button>
        </div>
      </div>

      {roster.length === 0 ? (
        <p className="tkwl-empty">이 반에 입장한 학생이 없어요.</p>
      ) : (
        <>
          {/* ── [C] 집계 ── */}
          <section className="tkwl-section">
            <FoldTitle
              open={!folded.has("counts")}
              onToggle={() => toggleFold("counts")}
              title="작성 현황"
            />
            {!folded.has("counts") && (
            <>
            <div className="tkwl-counts">
              {KWLS_COLUMNS.map((c, i) => (
                <span key={c.key} className="tkwl-count" title={c.ko}>
                  <b>{c.letter}</b>
                  <em>{counts[i]}</em>
                </span>
              ))}
              <span className="tkwl-count tkwl-count--total">/ {rows.length}명</span>
            </div>
            {notStarted.length > 0 && (
              <p className="tkwl-notstarted">
                <span>아직 시작 전 {notStarted.length}명</span>
                {notStarted.slice(0, 8).map((r) => r.name).join(" · ")}
                {notStarted.length > 8 && " …"}
              </p>
            )}
            </>
            )}
          </section>

          {/* ── [B] W·S 모아보기 ── */}
          {COLLECT.map((col) => {
            const list = textsOf(col.key);
            const open = !folded.has(col.key);
            return (
              <section className="tkwl-section" key={col.key}>
                <FoldTitle
                  open={open}
                  onToggle={() => toggleFold(col.key)}
                  title={col.ko}
                  note={`${col.letter} · ${list.length}개`}
                >
                  {/* 접혀 있어도 모아보기는 그대로 — 접는 이유가 '자리를
                      줄이려는 것'이지 '안 쓰려는 것'이 아닙니다 */}
                  <button
                    type="button"
                    className="tkwl-wall-btn"
                    onClick={() => setWallKey(col.key)}
                    disabled={list.length === 0}
                    title={
                      list.length === 0
                        ? "아직 쓴 학생이 없어요"
                        : "큰 화면에 모아 놓고 골라 띄웁니다"
                    }
                  >
                    모아보기
                  </button>
                </FoldTitle>
                {!open ? null : list.length === 0 ? (
                  <p className="tkwl-empty">아직 쓴 학생이 없어요.</p>
                ) : (
                  <ul className="tkwl-wants">
                    {list.map((r) => {
                      const live = cast.isCasting(r.uid, col.key);
                      return (
                        <li key={r.uid} className={live ? "live" : ""}>
                          <p className="tkwl-want-text">{r.text}</p>
                          <span className="tkwl-want-foot">
                            <span className="tkwl-want-who">{r.name}</span>
                            {cast.canCast && (
                              <button
                                type="button"
                                className={`tkwl-cast${live ? " on" : ""}`}
                                onClick={() => castCell(r, col.key)}
                                title={live ? "학생 화면을 되돌립니다" : "학급 전체 화면에 띄웁니다"}
                              >
                                {live ? "끄기" : "띄우기"}
                              </button>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}

          {/* ── [A] 학생 × K·W·L·S 격자 ── */}
          <section className="tkwl-section">
            <FoldTitle
              open={!folded.has("grid")}
              onToggle={() => toggleFold("grid")}
              title="학생별 진행"
              note={`${rows.length}명`}
            />
            {/* 머리글을 스크롤 영역 '안'에 두고 위에 붙여 둡니다 —
                밖에 두면 세로 막대 너비만큼 칸과 어긋나 보이고, 스크롤을
                내리면 K·W·L·S가 무엇이었는지도 사라집니다. */}
            {!folded.has("grid") && (
            <div className="tkwl-grid">
              <div className="tkwl-grid-head">
                <span />
                {KWLS_COLUMNS.map((c) => (
                  <span key={c.key} title={c.ko}>{c.letter}</span>
                ))}
              </div>
              {rows.map((r) => (
                <div className="tkwl-row" key={r.uid}>
                  <span className="tkwl-row-name" title={r.name}>
                    {r.studentId && <em>{r.studentId}</em>}
                    {r.name}
                  </span>
                  {KWLS_COLUMNS.map((c) => {
                    const text = (r.answers[c.key] ?? "").trim();
                    const on = text.length > 0;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        className={`tkwl-cell${on ? ` on ${c.phase}` : ""}${
                          picked?.uid === r.uid && picked?.key === c.key ? " picked" : ""
                        }`}
                        onClick={() =>
                          setPicked((p) =>
                            p?.uid === r.uid && p?.key === c.key
                              ? null
                              : { uid: r.uid, key: c.key }
                          )
                        }
                        title={`${r.name} · ${c.letter} ${c.ko} — ${on ? `${text.length}자` : "아직 안 씀"}`}
                        aria-label={`${r.name} ${c.letter} ${on ? "작성함" : "작성 전"}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            )}
          </section>
        </>
      )}

      {/* 칸을 누르면 그 학생의 그 칸 전문 */}
      {pickedRow && (
        <div className="tkwl-pop">
          <div className="tkwl-pop-head">
            <strong>{pickedRow.name}</strong>
            <button type="button" onClick={() => setPicked(null)} aria-label="닫기">
              ×
            </button>
          </div>
          {KWLS_COLUMNS.filter((c) => c.key === picked.key).map((c) => {
            const text = (pickedRow.answers[c.key] ?? "").trim();
            const live = cast.isCasting(pickedRow.uid, c.key);
            return (
              <div key={c.key}>
                <p className="tkwl-pop-label">
                  {c.letter} · {c.ko}
                </p>
                {text ? (
                  /* 출처가 여럿이면(공부방 하루 성찰 + 책방 활동) 어디서 쓴
                     것인지 밝혀 나란히 보여 줍니다 — 이어 붙여 한 덩어리로
                     두면 누가 어느 자리에서 쓴 말인지 알 수 없습니다. */
                  pickedRow.parts
                    .filter((part) => String(part.answers[c.key] ?? "").trim())
                    .map((part, i) => (
                      <div key={i} className="tkwl-pop-part">
                        {part.source && (
                          <span className="tkwl-pop-src">📖 {part.source}</span>
                        )}
                        <p className="tkwl-pop-text">
                          {String(part.answers[c.key]).trim()}
                        </p>
                      </div>
                    ))
                ) : (
                  <p className="tkwl-pop-text empty">아직 쓰지 않았어요</p>
                )}
                {cast.canCast && text && (
                  <button
                    type="button"
                    className={`tkwl-cast${live ? " on" : ""}`}
                    onClick={() => castCell(pickedRow, c.key)}
                  >
                    {live ? "학급 화면 끄기" : "학급 화면에 띄우기"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {wallCol && (
        <StudyActivityWall
          classId={classId}
          user={user}
          label={wallCol.letter}
          title={wallCol.ko}
          castKey={`kwls:${wallCol.key}`}
          rows={wallRows}
          onAward={onAward}
          onClose={() => setWallKey(null)}
        />
      )}

      {fullscreen && (
        <KwlFullscreenModal
          classId={classId}
          initialDate={date}
          onClose={() => setFullscreen(false)}
        />
      )}
    </aside>
  );
}

// ── 접었다 펴는 묶음 머리 ──────────────────────────────────
// KWLS가 쌓이면 W·S 목록이 길어져 아래 묶음이 화면 밖으로 밀립니다.
// 머리를 눌러 접어 두면 그 자리를 되찾습니다. 접혀 있어도 개수(note)는
// 남겨 두어, 펼치지 않고도 얼마나 쌓였는지 보입니다.
function FoldTitle({ open, onToggle, title, note = "", children = null }) {
  return (
    <h4 className="tkwl-title">
      <button
        type="button"
        className="tkwl-fold"
        onClick={onToggle}
        aria-expanded={open}
        title={open ? "접기" : "펼치기"}
      >
        <span className={`tkwl-fold-caret${open ? " open" : ""}`} aria-hidden="true">›</span>
        {title}
        {note && <small>{note}</small>}
      </button>
      {children}
    </h4>
  );
}

// 한 칸을 방송 꾸러미로 — PresentationOverlay의 'entry' 모드가 그립니다.
function buildPayload(row, key, date) {
  const col = KWLS_COLUMNS.find((c) => c.key === key);
  if (!col) return null;
  return {
    mode: "entry",
    activityTitle: "KWLS 성찰",
    topic: dateLabel(date),
    // 학생들이 보는 쪽에는 익명으로 — 이 패널은 교사만 보는 자리라 실명을
    // 그대로 두지만, 학급 화면으로 나가는 이름은 닉네임입니다.
    writerName: row.anonName || row.name,
    letter: col.letter,
    label: col.ko,
    labelEn: col.en,
    prompt: col.prompt ?? "",
    index: KWLS_COLUMNS.indexOf(col),
    total: KWLS_COLUMNS.length,
    fields: [{ label: "", text: (row.answers[key] ?? "").trim() }],
  };
}
