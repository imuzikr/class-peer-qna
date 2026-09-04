"use client";

// =============================================================
// 공부중 전광판 — 학생들이 활동을 채워 가는 상황을 한눈에
// -------------------------------------------------------------
// 왼쪽에 학생 명단, 오른쪽에 활동 수만큼 칸이 생기고, 칸 색으로
// 그 학생이 그 활동을 썼는지 보여 줍니다.
//
//   초록 — 내용을 썼음
//   회색 — 아직 비어 있음
//   자물쇠 — 잠긴 활동(아직 열어 주지 않음)
//
// 활동 머리마다 자물쇠 버튼이 있어 교사가 활동을 하나씩 열어 줍니다.
// 잠긴 활동은 학생 카드에서 입력칸 대신 안내문이 보입니다.
//
// [잠금이 막는 범위]
// 카드 내용은 활동 여러 개가 한 덩어리 HTML로 저장되므로 보안 규칙이
// '몇 번째 활동이 바뀌었는지'를 알 수 없습니다. 그래서 활동별 잠금은
// 화면에서 입력을 막는 수업 진행 도구이지, 서버가 강제하는 권한이
// 아닙니다(보드 전체 잠금은 규칙으로도 막힙니다).
// =============================================================
import { Fragment, useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  subscribeCardsForBoards,
  fetchAnswerCounts,
  subscribeQuestionsByAuthors,
  todayDateKey,
} from "@/lib/store";
import { stripHtml } from "@/lib/html";
import { IconLockState } from "./StatusIcons";
import {
  matchActivitySections,
  isActivityLocked,
  DONE_MIN_CHARS,
} from "@/lib/activities";

// 판정 기준은 lib/activities.js에 있습니다(학생 카드 안내와 같은 값을 쓰려고).
// 여기서 다시 내보내는 건 이 파일에서 가져다 쓰던 기존 코드를 위해서입니다.
export { DONE_MIN_CHARS };

// 학생 카드 한 장 → 활동별로 "충분히 썼는지" 여부 배열
// (stripHtml이 태그를 지우고 연속 공백을 하나로 줄인 뒤 앞뒤를 다듬으므로,
//  세는 값은 사람이 눈으로 읽는 글자 수와 같습니다)
//
// [왜 두 단계로 짝짓는가]
// 활동은 교사가 수업 준비에서 언제든 이름을 바꾸거나 추가·삭제할 수 있는데,
// 학생 카드에는 '작성 당시의 활동 이름'이 섹션 제목으로 박혀 저장됩니다.
// 그래서 수업 도중 교사가 활동 제목을 고치면, 이미 낸 답의 섹션 제목이
// 현재 활동 이름과 달라집니다. 이때
//   · 제목으로만 찾으면  → 짝을 못 찾아 '작성 전'으로 보이고
//   · 위치로만 대조하면  → 활동 수가 줄어든 경우 엉뚱한(빈) 섹션을 집어
//                          역시 '작성 전'으로 보입니다
// 실제로 이 두 경우 모두 "학생은 분명히 냈는데 미제출로 표시"되는 신고로
// 이어졌습니다. 그래서 제목이 같은 것을 먼저 확정해 두고(1단계), 남은
// 활동에는 아직 짝이 없으면서 '내용이 있는' 섹션을 순서대로 이어 붙입니다
// (2단계). 이름이 바뀌었어도 학생이 쓴 내용은 그대로 살아남습니다.
export function cardProgress(card, activities) {
  const paired = matchActivitySections(card, activities);
  return paired.map(
    (sec) => stripHtml(sec?.content ?? "").length >= DONE_MIN_CHARS
  );
}

// 활동별 글자 수 — 칸을 눌렀을 때 "몇 자 썼는지"까지 보여 주려고 씁니다.
function cardCharCounts(card, activities) {
  return matchActivitySections(card, activities).map(
    (sec) => stripHtml(sec?.content ?? "").length
  );
}

// 칸 하나의 상태 — 색으로 구분합니다.
//   done   연한 초록 : 10자 이상 썼음 (잠겼더라도 쓴 건 쓴 것)
//   open   연한 주황 : 열려 있는데 아직 덜 씀
//   absent 연한 회색 : 오늘 결석이라 못 쓴 것 — '안 한' 것과 다릅니다
//   locked 빗금 회색 : 아직 열어 주지 않음
//
// 순서에 뜻이 있습니다. 쓴 것이 가장 셉니다(결석해도 집에서 썼으면 쓴 것),
// 그다음이 잠김입니다 — 잠긴 칸은 아무도 못 쓰는 칸이라 '결석해서 못 냈다'는
// 설명이 성립하지 않습니다.
function cellState(done, locked, absent) {
  if (done) return "done";
  if (locked) return "locked";
  return absent ? "absent" : "open";
}

export default function StudyProgressBoard({
  board,
  roster = [],
  cards = [],
  // 정보창의 학생 요약에 쓰는 반 단위 자료 — 안 넘기면 그 줄만 빠집니다.
  classBoards = [],        // 이 반의 프로젝트 전체(모든 활동 참여도)
  attendanceRecords = [],  // 이 반의 출석 기록 전체(출석률)
  groupAssignment = null,  // 반 기본 모둠(모둠 정보)
  onOpenStudent = null,    // 정보창의 '카드 열어 보기' — 안 넘기면 버튼이 없습니다
  onClose,
}) {
  // 학생별 '질문 수' — 이 반 학생들이 쓴 질문만 받습니다.
  // 예전에는 공부방 화면이 학교 전체 질문을 늘 받아 두고 그걸 넘겨줬는데,
  // 이 전광판은 교사가 열었을 때만 필요합니다. 세는 기준은 그대로
  // '이 학생이 지금까지 쓴 질문 전체'입니다 — 프로젝트 키워드로 좁히면
  // 숫자가 달라지므로 작성자 기준으로 따로 받습니다.
  const rosterUids = useMemo(
    () => roster.map((s) => s.uid).filter(Boolean),
    [roster]
  );
  const [questions, setQuestions] = useState([]);
  useEffect(() => {
    if (rosterUids.length === 0) { setQuestions([]); return; }
    return subscribeQuestionsByAuthors(rosterUids, setQuestions);
  }, [rosterUids]);

  const activities = board?.activities ?? [];
  const isGroup = board?.activityType === "group";

  // ── 오늘 결석한 학생 ──
  // 출석 기록은 '왔다'는 것만 남습니다(문서 ID = 날짜_uid). 그래서 오늘
  // 기록이 없으면 결석입니다.
  //
  // 다만 교사가 오늘 출석을 아예 시작하지 않았으면 모두가 기록이 없어 반
  // 전체가 결석으로 보입니다. 그러면 전광판이 통째로 회색이 되어 '아무도 안
  // 썼다'와 구분이 안 됩니다. 그래서 **오늘 출석 기록이 하나라도 있을 때만**
  // 이 구분을 씁니다(= 오늘 출석을 실시한 날).
  const todayKey = todayDateKey();
  const presentToday = useMemo(
    () =>
      new Set(
        attendanceRecords.filter((r) => r.date === todayKey).map((r) => r.uid)
      ),
    [attendanceRecords, todayKey]
  );
  const markAbsent = presentToday.size > 0;

  // 학생별 진행 상황 (카드가 아직 없으면 전부 미작성)
  // 모둠 보드는 카드 한 장을 모둠원 여럿이 공유하므로 memberUids로 찾음
  const rows = roster.map((s) => {
    const card = cards.find((c) =>
      isGroup ? c.memberUids?.includes(s.uid) : c.authorId === s.uid
    );
    return {
      ...s,
      done: cardProgress(card, activities),
      chars: cardCharCounts(card, activities),
      hasCard: !!card,
      card: card ?? null,
      absent: markAbsent && !presentToday.has(s.uid),
    };
  });
  const absentCount = rows.filter((r) => r.absent).length;

  // 활동별 작성 인원
  const doneCounts = activities.map(
    (_, i) => rows.filter((r) => r.done[i]).length
  );

  // ── 정보창용 반 단위 통계 ──
  // 전광판이 열려 있는 동안에만 모읍니다(닫으면 구독도 함께 끊깁니다).
  const boardIds = classBoards.map((b) => b.id).filter(Boolean);
  const boardIdsKey = boardIds.join(",");
  const [allCards, setAllCards] = useState({});
  useEffect(() => {
    if (!boardIdsKey) { setAllCards({}); return; }
    return subscribeCardsForBoards(boardIdsKey.split(","), setAllCards);
  }, [boardIdsKey]);

  // 답변 수는 질문 수를 함께 셀 수 있을 때만 셉니다 — 질문 수는 0인데
  // 답변 수만 진짜 값이 뜨면 두 숫자가 어긋나 보입니다.
  //
  // 예전에는 이 조건이 'questions prop이 넘어왔는가'였습니다(안 넘어오면
  // 빈 배열이라 길이 0). 이제 이 컴포넌트가 명단 기준으로 직접 받으므로,
  // 셀 대상(명단)이 있으면 질문 수는 언제나 진짜 값입니다 — 반 학생이 아직
  // 질문을 하나도 안 썼다는 이유로 칸을 숨길 이유는 없습니다(그 경우
  // 0개가 사실입니다).
  const rosterKey = roster.map((s) => s.uid).join(",");
  const wantQnaStats = rosterUids.length > 0;
  const [answerCounts, setAnswerCounts] = useState({});
  useEffect(() => {
    if (!rosterKey || !wantQnaStats) { setAnswerCounts({}); return; }
    let alive = true;
    fetchAnswerCounts(rosterKey.split(",")).then((c) => { if (alive) setAnswerCounts(c); });
    return () => { alive = false; };
  }, [rosterKey, wantQnaStats]);

  // 이 반이 출석을 실시한 날 수 — 출석률의 분모
  const attendDays = new Set(attendanceRecords.map((r) => r.date).filter(Boolean)).size;

  // 학생 한 명의 요약 — 격자가 담지 못하는 '이 학생은 평소 어떤가'를 모읍니다.
  function statsOf(uid) {
    // 모든 프로젝트의 활동 참여도 (활동이 있는 프로젝트만 셈)
    let actDone = 0;
    let actTotal = 0;
    classBoards.forEach((b) => {
      const acts = b.activities ?? [];
      if (acts.length === 0 || b.type === "notice") return;
      const list = allCards[b.id] ?? [];
      const c = list.find((x) =>
        b.activityType === "group" ? x.memberUids?.includes(uid) : x.authorId === uid
      );
      actTotal += acts.length;
      actDone += cardProgress(c, acts).filter(Boolean).length;
    });

    const group = (groupAssignment?.groups ?? []).find((g) =>
      (g.members ?? []).some((m) => m.uid === uid)
    );

    return {
      attendDays,
      present: attendanceRecords.filter((r) => r.uid === uid).length,
      actDone,
      actTotal,
      hasQna: wantQnaStats,
      asked: questions.filter((q) => q.authorId === uid).length,
      answered: answerCounts[uid] ?? 0,
      groupName: group?.name ?? null,
      groupSize: (group?.members ?? []).length,
    };
  }

  // 칸을 눌렀을 때 뜨는 작은 정보창 — 누른 칸 바로 옆에 붙습니다.
  // 화면 오른쪽/아래 끝에서는 잘리지 않도록 여는 방향을 뒤집습니다.
  const [popup, setPopup] = useState(null);
  const [tip, setTip] = useState(null);

  useEffect(() => {
    if (!popup) return;
    function onKey(e) { if (e.key === "Escape") setPopup(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popup]);

  const POPUP_W = 250; // 아래 CSS의 .progress-pop 폭과 맞춰 둡니다

  // 어느 칸을 누르든 그 학생의 활동 전체를 보여 줍니다 — 칸 하나만 열면
  // "그럼 나머지 활동은?"을 보려고 옆 칸을 다시 눌러야 했습니다.
  function openCell(e, row, i) {
    e.stopPropagation();
    if (popup?.uid === row.uid) { setPopup(null); return; } // 같은 학생을 다시 누르면 닫기
    const r = e.currentTarget.getBoundingClientRect();
    // 오른쪽 끝이면 왼쪽으로, 아래 끝이면 위로 열립니다.
    const openLeft = r.left + POPUP_W + 12 > window.innerWidth;
    const openUp = r.bottom + 60 + activities.length * 34 > window.innerHeight;
    const pos = {};
    if (openLeft) pos.right = Math.max(8, window.innerWidth - r.right);
    else pos.left = Math.max(8, r.left);
    if (openUp) pos.bottom = window.innerHeight - r.top + 6;
    else pos.top = r.bottom + 6;
    setPopup({ uid: row.uid, row, index: i, pos });
    setTip(null);
  }

  function showTip(e, text) {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({
      text,
      left: Math.min(Math.max(r.left + r.width / 2, 70), window.innerWidth - 70),
      bottom: window.innerHeight - r.top + 8,
    });
  }

  // 칸 하나를 말로 풀어 준 한 줄 — 툴팁·접근성 라벨에 함께 씁니다.
  function cellSummary(row, i) {
    const locked = isActivityLocked(board, i);
    const n = row.chars[i] ?? 0;
    const who = `${row.studentId ? `${row.studentId} ` : ""}${row.name}`;
    if (row.done[i]) return `${who} — 활동 ${i + 1} 제출함 (${n}자)`;
    if (locked) return `${who} — 활동 ${i + 1} 잠김 (아직 열지 않음)`;
    if (n > 0) return `${who} — 활동 ${i + 1} 작성 중 (${n}자, ${DONE_MIN_CHARS}자 필요)`;
    if (row.absent) return `${who} — 활동 ${i + 1} 미제출 (오늘 결석)`;
    return `${who} — 활동 ${i + 1} 아직 시작 전`;
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal progress-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="progress-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="progress-title">
            공부중 전광판
            {board?.title && <span className="progress-board-name">· {board.title}</span>}
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        {activities.length > 0 && roster.length > 0 && (
          <div className="progress-legend">
            <span className="progress-legend-item">
              <i className="progress-mark progress-mark--done" /> 작성함({DONE_MIN_CHARS}자 이상)
            </span>
            <span className="progress-legend-item">
              <i className="progress-mark progress-mark--open" /> 작성 전
            </span>
            {/* 결석 칸이 실제로 있을 때만 — 다 출석한 날에 쓰지 않는 색을
                범례에 남겨 두면 없는 상태를 찾게 됩니다. */}
            {absentCount > 0 && (
              <span className="progress-legend-item">
                <i className="progress-mark progress-mark--absent" /> 결석({absentCount}명)
              </span>
            )}
            <span className="progress-legend-item">
              <i className="progress-mark progress-mark--locked" /> 잠김
            </span>
          </div>
        )}

        {activities.length === 0 ? (
          <p className="lesson-note-empty">
            이 프로젝트에는 아직 활동이 없어요. ‘수업관리 → 공부방 프로젝트 연동’에서 활동을 추가해 주세요.
          </p>
        ) : roster.length === 0 ? (
          <p className="lesson-note-empty">
            이 반에 입장한 학생이 없어요. 입장 코드를 알려 주세요.
          </p>
        ) : (
          /* 잔디 히트맵 — 한 줄이 활동 하나, 한 칸이 학생 한 명(가로 배치).
             학생 이름은 칸에 적지 않습니다. 칸 수가 반 인원만큼이라 이름을
             넣으면 잔디가 아니라 표가 되고, 누구인지는 마우스를 올리면 뜨는
             설명과 눌렀을 때 열리는 정보창이 알려 줍니다. */
          <div
            className="progress-scroll"
            onClick={() => setPopup(null)}
            onScroll={() => { setTip(null); setPopup(null); }}
          >
            <div
              className="progress-grass"
              style={{ "--students": rows.length }}
            >
              {activities.map((act, i) => {
                const locked = isActivityLocked(board, i);
                return (
                  <Fragment key={i}>
                    <span className="grass-act">
                      <span className="grass-act-head">
                        <span className="grass-act-no">활동 {i + 1}</span>
                        <span className={`progress-act-state${locked ? " locked" : ""}`}>
                          <IconLockState locked={locked} size={12} />
                          {/* '편집'이라고 적었더니 옆 화면(책방 활동 카드)의
                              '편집' 단추(이름 고치기)와 같은 낱말이라, 상태를
                              말하는 자리인지 할 일을 말하는 자리인지 헷갈렸습니다.
                              **말은 두 화면이 같아야 합니다** — 여기만 고치면
                              같은 상태가 두 이름을 갖게 됩니다. */}
                          {locked ? "잠김" : "열림"}
                        </span>
                        <span className="grass-act-count">
                          {doneCounts[i]}/{roster.length}
                        </span>
                      </span>
                      <span className="grass-act-name" title={act}>{act}</span>
                    </span>
                    {rows.map((r) => {
                      const st = cellState(r.done[i], locked, r.absent);
                      const text = cellSummary(r, i);
                      return (
                        <button
                          key={r.uid}
                          type="button"
                          className={`grass-cell grass-cell--${st}${
                            popup?.uid === r.uid ? " active" : ""
                          }`}
                          onClick={(e) => openCell(e, r, i)}
                          onMouseEnter={(e) => showTip(e, text)}
                          onMouseLeave={() => setTip(null)}
                          onFocus={(e) => showTip(e, text)}
                          onBlur={() => setTip(null)}
                          aria-label={text}
                        />
                      );
                    })}
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* 호버 툴팁 — 칸 위쪽 가운데에 붙습니다 */}
        {tip && (
          <div
            className="progress-tip"
            role="tooltip"
            style={{ left: tip.left, bottom: tip.bottom }}
          >
            {tip.text}
          </div>
        )}

        {/* 칸을 누르면 뜨는 작은 정보창 */}
        {popup && (
          <CellPopup
            row={popup.row}
            stats={statsOf(popup.row.uid)}
            pos={popup.pos}
            onOpenStudent={onOpenStudent}
            onClose={() => setPopup(null)}
          />
        )}
      </div>
    </div>
  );
}

// 학생 한 명의 요약 — 누른 칸 옆에 뜨는 작은 창.
// -------------------------------------------------------------
// 이 프로젝트의 활동별 제출 여부는 잔디 격자가 이미 색으로 보여 주므로 여기서
// 되풀이하지 않습니다. 대신 '이 학생은 평소 어떤가'를 모았습니다 —
// 출석률, 반의 모든 프로젝트를 통틀어 본 활동 참여도, 질문방에서의 질문·답변
// 수, 그리고 어느 모둠인지. 수업 중 한 학생을 짚어 볼 때 필요한 것들입니다.
function CellPopup({ row, stats, pos, onOpenStudent, onClose }) {
  const attendPct =
    stats.attendDays > 0 ? Math.round((stats.present / stats.attendDays) * 100) : null;
  const actPct =
    stats.actTotal > 0 ? Math.round((stats.actDone / stats.actTotal) * 100) : null;

  return (
    <div
      className="progress-pop"
      role="dialog"
      aria-label="학생 정보"
      style={pos}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="progress-pop-head">
        <span className="progress-pop-who">
          {row.studentId && <small>{row.studentId}</small>}
          <strong>{row.name}</strong>
        </span>
        <button type="button" className="progress-pop-close" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>

      <dl className="progress-pop-rows">
        <div>
          <dt>출석률</dt>
          <dd>
            {attendPct === null ? (
              <small>출석 기록 없음</small>
            ) : (
              <>
                <strong>{attendPct}%</strong>
                <small> · {stats.present}/{stats.attendDays}일</small>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>활동 참여도</dt>
          <dd>
            {actPct === null ? (
              <small>활동 없음</small>
            ) : (
              <>
                <strong>{actPct}%</strong>
                <small> · {stats.actDone}/{stats.actTotal}칸</small>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>질문방</dt>
          <dd>
            {stats.hasQna ? (
              <>
                질문 <strong>{stats.asked}</strong>
                <small> · </small>
                답변 <strong>{stats.answered}</strong>
              </>
            ) : (
              <small>기록 없음</small>
            )}
          </dd>
        </div>
        <div>
          <dt>모둠</dt>
          <dd>
            {stats.groupName ? (
              <>
                {stats.groupName}
                <small> · {stats.groupSize}명</small>
              </>
            ) : (
              <small>배정 전</small>
            )}
          </dd>
        </div>
      </dl>

      {onOpenStudent && (
        <button
          type="button"
          className="progress-pop-open"
          onClick={() => onOpenStudent(row.uid)}
        >
          카드 열어 보기 →
        </button>
      )}
    </div>
  );
}
