"use client";

// =============================================================
// KWLS 전체 화면 (교사 전용) — 학생들의 K·W·L·S를 4컬럼으로 크게
// -------------------------------------------------------------
// · 한 행 = 학생 한 명. K / W / L / S 네 컬럼을 나란히 보며 성찰 나눔.
// · 스크롤하며 전체 학생 기록을 훑을 수 있음. Esc로 닫기.
// · 컬럼(학생·K·W·L·S) 전체에 은은한 배경 띠를 깔아 한눈에 구분되게 합니다.
//
// [이름은 익명이 먼저입니다]
// 이 화면은 교실 앞에 띄워 함께 읽는 자리라, 배움나눔의 기본대로 닉네임과
// 이모지만 둡니다. 교사가 이름을 누르면 그 한 사람의 실명·학번이 아래 줄에
// 펼쳐집니다(누른 것만, 다시 누르면 접힘) — 과일을 줄 사람을 확인할 때처럼
// 필요한 순간에만 벗기는 방식입니다. 실명은 이미 받아 둔 사용자 디렉터리
// (subscribeUserDirectory)에서 꺼내 쓰므로 읽기가 늘지 않습니다.
//
// [날짜]
// 좌우 화살표(하루씩) + 달력. 달력은 이 반의 KWLS가 있는 날을 초록으로
// 칠하고 그날 쓴 사람 수를 적습니다 — 기록이 있는 날로 바로 건너뛰려고요.
// 날짜가 바뀔 때마다 그 날짜의 기록을 실시간 구독합니다.
// =============================================================
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  subscribeAllKwl,
  fetchAllKwlOnce,
  fetchKwlDays,
  invalidateKwlDays,
  getDirectoryUser,
  subscribeClassRewards,
  setStudentReward,
  REWARD_MAX,
} from "@/lib/store";
import { KWLS_COLUMNS, kwlsAnswersFromEntry } from "@/lib/kwls";

function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(dateStr, delta) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return toYMD(d);
}
function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}
const TODAY = toYMD(new Date());

export default function KwlFullscreenModal({ classId, initialDate, onClose }) {
  const [date, setDate] = useState(initialDate || TODAY);
  const [entries, setEntries] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [rewardMap, setRewardMap] = useState({}); // uid -> 과일 개수
  const [revealed, setRevealed] = useState(() => new Set()); // 실명을 펼친 uid
  const [calOpen, setCalOpen] = useState(false);
  const [days, setDays] = useState(null); // { 'YYYY-MM-DD': 쓴 사람 수 } — 달력용

  // 날짜가 바뀔 때마다 그 날짜의 기록을 실시간 구독
  useEffect(() => {
    if (!classId) return;
    return subscribeAllKwl(classId, date, setEntries);
  }, [classId, date]);

  // 이 반의 과일 보상 구독(날짜 무관, 실시간) — 여기서 바로 멋진 순간 부여
  useEffect(() => {
    if (!classId) return;
    return subscribeClassRewards(classId, (list) => {
      const m = {};
      list.forEach((r) => { m[r.uid] = r.count ?? 0; });
      setRewardMap(m);
    });
  }, [classId]);

  // 달력을 처음 열 때만 '어느 날에 기록이 있나'를 한 번 읽습니다
  // (반의 kwl을 통째로 읽는 질의라 열지 않으면 아예 읽지 않습니다).
  useEffect(() => {
    if (!calOpen || !classId || days) return;
    let alive = true;
    fetchKwlDays(classId).then((d) => { if (alive) setDays(d); });
    return () => { alive = false; };
  }, [calOpen, classId, days]);

  function awardFruit(uid, row = null) {
    const cur = rewardMap[uid] ?? 0;
    if (cur >= REWARD_MAX) return;
    // 과일 문서에 붙는 이름표는 그대로 실명입니다 — 공부방은 실명 참여
    // 공간이고, 학생 화면의 과일 이름표가 이 값을 씁니다. 이 화면이 익명으로
    // 보인다고 저장까지 익명으로 바꾸면 다른 화면의 이름표가 바뀝니다.
    setStudentReward(
      classId,
      uid,
      cur + 1,
      row
        ? {
            name: row.realName || row.authorName || "",
            emoji: row.authorEmoji || "🙂",
          }
        : null
    );
  }

  function toggleReveal(uid) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function goDate(next) {
    setDate(next);
    setCalOpen(false);
  }

  // Esc 닫기, ←/→ 날짜 이동 (입력 필드에 포커스 중일 땐 방향키 그대로 사용하게 제외)
  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      // 달력이 열려 있으면 Esc는 달력만 닫습니다 — 날짜를 고르다 실수로
      // 화면 전체가 닫히면 다시 열어 날짜를 맞춰야 합니다.
      if (e.key === "Escape") {
        if (calOpen) setCalOpen(false);
        else onClose();
      } else if (!typing && e.key === "ArrowLeft") setDate((d) => addDays(d, -1));
      else if (!typing && e.key === "ArrowRight") {
        setDate((d) => (d < TODAY ? addDays(d, 1) : d));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, calOpen]);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      setEntries(await fetchAllKwlOnce(classId, date));
      // 달력도 같이 최신으로 — 이 버튼을 누르는 이유가 '보는 동안 새로
      // 들어온 것'이라, 달력만 옛 요약으로 남으면 앞뒤가 안 맞습니다.
      invalidateKwlDays(classId);
      setDays(days ? await fetchKwlDays(classId, { force: true }) : null);
    } finally {
      setRefreshing(false);
    }
  }

  // 학생별로 정리 — 목록에는 익명(닉네임)만, 실명은 눌렀을 때만.
  // 차례는 학번순(디렉터리에 있을 때) → 없으면 닉네임 가나다.
  // 익명 이름으로 세우면 날마다 줄 차례가 뒤바뀌어 눈이 다시 헤매게 됩니다.
  const rows = useMemo(
    () =>
      entries
        .map((e) => {
          const dir = getDirectoryUser(e.userId);
          return {
            ...e,
            anonName: dir?.displayName || e.authorName || "익명",
            anonEmoji: dir?.emoji || e.authorEmoji || "🙂",
            realName: dir?.realName || "",
            studentId: dir?.studentId || "",
          };
        })
        .sort((a, b) => {
          const sid = String(a.studentId).localeCompare(String(b.studentId), "ko");
          return sid !== 0 ? sid : a.anonName.localeCompare(b.anonName, "ko");
        }),
    [entries]
  );

  // 달력에 깔 값 — 지금 보고 있는 날짜만은 실시간 구독으로 아는 정확한 수로
  // 덮어씁니다(요약은 달력을 연 시점의 것이라 한 박자 늦을 수 있습니다).
  const calDays = useMemo(() => {
    if (!days) return null;
    const live = new Set(entries.map((e) => e.userId).filter(Boolean)).size;
    const next = { ...days };
    if (live > 0) next[date] = live;
    else delete next[date];
    return next;
  }, [days, entries, date]);

  const isToday = date === TODAY;

  return (
    <div className="modal-backdrop present-backdrop" onClick={onClose}>
      <div className="present-modal kwlfs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="present-head">
          <div className="present-who">
            <strong className="present-name">📝 KWLS</strong>
            <span className="present-progress">{rows.length}명</span>

            {/* 날짜 이동 — 달력 열기(라벨) + 나란히 붙은 좌우 화살표 */}
            <div className="kwlfs-date-nav">
              <button
                type="button"
                className={`kwlfs-date-label${calOpen ? " on" : ""}`}
                onClick={() => setCalOpen((v) => !v)}
                aria-expanded={calOpen}
                title="달력에서 날짜 고르기 — 기록이 있는 날이 표시됩니다"
              >
                📅 {formatDateLabel(date)}
              </button>
              <div className="kwlfs-date-arrows">
                <button
                  type="button"
                  className="kwlfs-date-arrow"
                  onClick={() => goDate(addDays(date, -1))}
                  aria-label="전날"
                  title="전날 (←)"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="kwlfs-date-arrow"
                  onClick={() => goDate(addDays(date, 1))}
                  disabled={isToday}
                  aria-label="다음날"
                  title="다음날 (→)"
                >
                  ›
                </button>
              </div>
              {!isToday && (
                <button type="button" className="kwlfs-date-today-btn" onClick={() => goDate(TODAY)}>
                  오늘
                </button>
              )}

              {calOpen && (
                <KwlCalendar
                  date={date}
                  days={calDays}
                  onPick={goDate}
                  onClose={() => setCalOpen(false)}
                />
              )}
            </div>
          </div>
          <div className="kwlfs-head-actions">
            <button
              type="button"
              className={`kwlfs-refresh-btn${refreshing ? " spinning" : ""}`}
              onClick={handleRefresh}
              disabled={refreshing}
              title="새로고침 — 보는 동안 새로 추가된 기록도 불러옵니다"
            >
              🔄 {refreshing ? "새로고침 중…" : "새로고침"}
            </button>
            <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
          </div>
        </div>

        <div className="kwlfs-body">
          {rows.length === 0 ? (
            <p className="present-empty">{formatDateLabel(date)}에 저장된 KWLS가 없어요.</p>
          ) : (
            <div
              className="kwlfs-table"
              // 마지막에 1fr 트랙을 추가해, 내용이 짧아도 컬럼 배경이 빈 공간까지
              // 이어지게 합니다(콘텐츠가 길면 이 트랙은 그냥 축소되어 무해).
              style={{ gridTemplateRows: `repeat(${rows.length + 1}, auto) 1fr` }}
            >
              {/* 컬럼 배경 띠 — 헤더부터 하단 빈 공간까지 관통 (먼저 그려 셀 아래 깔림) */}
              <div className="kwlfs-colbg kwlfs-colbg--name" />
              {KWLS_COLUMNS.map((c, i) => (
                <div
                  key={c.key}
                  className={`kwlfs-colbg kwlfs-colbg--${c.letter.toLowerCase()}`}
                  style={{ gridColumn: i + 2 }}
                />
              ))}

              {/* 컬럼 헤더 */}
              <div className="kwlfs-cell kwlfs-head kwlfs-head--name" style={{ gridRow: 1, gridColumn: 1 }}>
                학생
                <em className="kwlfs-head-hint">눌러서 실명</em>
              </div>
              {KWLS_COLUMNS.map((c, i) => (
                <div
                  key={c.key}
                  className={`kwlfs-cell kwlfs-head kwlfs-head--${c.letter.toLowerCase()}`}
                  style={{ gridRow: 1, gridColumn: i + 2 }}
                >
                  <span className={`kwl-badge kwl-badge-${c.letter.toLowerCase()}`}>{c.letter}</span>
                  {c.ko}
                </div>
              ))}

              {rows.map((r, i) => {
                const rowNum = i + 2; // 1행은 헤더
                const answers = kwlsAnswersFromEntry(r);
                const open = revealed.has(r.userId);
                const hasReal = !!(r.realName || r.studentId);
                return (
                  <Fragment key={r.id}>
                    <div className="kwlfs-cell kwlfs-cell--name" style={{ gridRow: rowNum, gridColumn: 1 }}>
                      {/* 익명 이름 — 누르면 아래에 실명이 펼쳐집니다.
                          이름이 길어도 잘리지 않게 두 줄까지 흐릅니다. */}
                      <button
                        type="button"
                        className={`kwlfs-who${open ? " open" : ""}`}
                        onClick={() => toggleReveal(r.userId)}
                        disabled={!hasReal}
                        title={
                          !hasReal
                            ? "실명을 찾을 수 없어요"
                            : open
                              ? "눌러서 익명으로 되돌리기"
                              : "눌러서 실명 보기 (교사만 보입니다)"
                        }
                      >
                        <span className="kwlfs-avatar" aria-hidden="true">{r.anonEmoji}</span>
                        <span className="kwlfs-name-text">{r.anonName}</span>
                      </button>
                      {open && hasReal && (
                        <span className="kwlfs-real">
                          {r.studentId && <em>{r.studentId}</em>}
                          {r.realName || "이름 없음"}
                        </span>
                      )}
                      <span className="kwlfs-fruit">
                        <span className="kwlfs-fruit-count">🍎 {rewardMap[r.userId] ?? 0}</span>
                        <button
                          type="button"
                          className="kwlfs-fruit-btn"
                          onClick={() => awardFruit(r.userId, r)}
                          disabled={(rewardMap[r.userId] ?? 0) >= REWARD_MAX}
                          aria-label={`${r.anonName} 과일 주기`}
                          title="과일 주기"
                        >
                          ＋
                        </button>
                      </span>
                    </div>
                    {KWLS_COLUMNS.map((c, colIndex) => (
                      <div
                        key={c.key}
                        className="kwlfs-cell kwlfs-text"
                        style={{ gridRow: rowNum, gridColumn: colIndex + 2 }}
                      >
                        {answers[c.key] || <span className="kwlfs-none">—</span>}
                      </div>
                    ))}
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 날짜 달력 ──────────────────────────────────────────────
// 출석부 달력(StudyAttendanceModal)·수업 메모 달력과 같은 짜임·같은 CSS를
// 씁니다(.study-attendance-calendar). 교사가 이미 그 모양에 익숙하고,
// 격자·요일 머리·달 넘기기를 다시 만들 이유가 없습니다. 다른 점은 칸에
// 채우는 값뿐입니다 — 여기는 '그날 KWLS를 쓴 사람 수'.
//
// 기록이 없는 날도 누를 수 있게 둡니다. 이 달력의 쓰임은 '있는 날로 건너뛰기'
// 지만, 빈 날을 확인하러 가는 길까지 막을 이유는 없습니다(화살표로는 갈 수
// 있는데 달력에서만 막히면 오히려 고장으로 보입니다). 앞날만 막습니다.
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function shiftMonth(cursor, delta) {
  const m = cursor.month + delta;
  if (m < 0) return { year: cursor.year - 1, month: 11 };
  if (m > 11) return { year: cursor.year + 1, month: 0 };
  return { year: cursor.year, month: m };
}

function KwlCalendar({ date, days, onPick, onClose }) {
  const [cursor, setCursor] = useState(() => {
    const [y, m] = date.split("-").map(Number);
    return { year: y, month: (m || 1) - 1 };
  });

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const startWeekday = new Date(cursor.year, cursor.month, 1).getDay();
  const cells = Array.from({ length: startWeekday }, () => null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1)
  );
  const loading = days === null;

  return (
    <div className="kwlfs-cal" onClick={(e) => e.stopPropagation()}>
      <div className="study-attendance-calendar">
        <div className="study-cal-head">
          <button type="button" onClick={() => setCursor((c) => shiftMonth(c, -1))} aria-label="이전 달">‹</button>
          <span>{cursor.year}년 {cursor.month + 1}월</span>
          <button type="button" onClick={() => setCursor((c) => shiftMonth(c, 1))} aria-label="다음 달">›</button>
        </div>
        <div className="study-cal-weekdays" aria-hidden="true">
          {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
        </div>
        <div className="study-cal-grid">
          {cells.map((d, i) => {
            if (d === null) {
              return <span key={`blank${i}`} className="study-cal-cell study-cal-cell--blank" />;
            }
            const key = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const count = days?.[key] ?? 0;
            const cls = [
              "study-cal-cell",
              count > 0 && "has-record",
              key === date && "selected",
              key === TODAY && "today",
            ].filter(Boolean).join(" ");
            return (
              <button
                key={key}
                type="button"
                className={cls}
                onClick={() => onPick(key)}
                disabled={key > TODAY}
                title={count > 0 ? `${count}명이 썼어요` : "기록 없음"}
              >
                <span className="study-cal-day">{d}</span>
                {count > 0 && <span className="study-cal-count">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <p className="kwlfs-cal-foot">
        {loading ? (
          "기록이 있는 날을 찾는 중이에요…"
        ) : (
          <>
            <span className="kwlfs-cal-swatch" aria-hidden="true" />
            초록 = 쓴 날 · 숫자 = 사람 수
          </>
        )}
        <button type="button" className="kwlfs-cal-close" onClick={onClose}>닫기</button>
      </p>
    </div>
  );
}
