"use client";

// =============================================================
// 수업 메모 (교사 전용) — 수업 중에 짧게 적어 두는 곳
// -------------------------------------------------------------
// 누가기록(studentNotes)과 다릅니다. 그쪽은 '학생 한 명에 대한 기록'이라
// 학생을 먼저 고르고 들어가야 합니다. 수업 중에 떠오르는 것들은 대개
// 특정 학생의 일이 아니라 그 시간에 대한 것입니다 — "3번 활동 설명이
// 길었다", "다음엔 예시를 먼저" 같은 것들이요. 그걸 적을 자리가 없어
// 수업이 끝나면 사라졌습니다.
//
// 그래서 이 화면은 쓰는 칸이 먼저입니다. 지난 메모는 접어 두고(드롭다운),
// 펼쳐야 보입니다 — 수업 중에 여는 화면이라 쓰기까지 한 번에 닿아야 합니다.
//
// 학생은 이 메모를 읽지 못합니다(firestore.rules).
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  subscribeLessonMemos,
  subscribeClasses,
  addLessonMemo,
  updateLessonMemo,
  deleteLessonMemo,
  lessonMemoDate,
  todayDateKey,
  formatTime,
} from "@/lib/store";

const MAX_LEN = 2000; // 규칙(firestore.rules)과 같은 값

export default function LessonMemoModal({ classId, className = "", user, onClose }) {
  const [text, setText] = useState("");
  // 이 메모가 '어느 수업의 일'인가 — 수업이 끝난 뒤 떠올라 적는 일이 잦아
  // 쓴 시각만으로는 언제 일인지 알 수 없습니다(누가기록과 같은 방식).
  const [date, setDate] = useState(() => todayDateKey());
  const [memos, setMemos] = useState([]);
  const [busy, setBusy] = useState(false);
  // 지난 메모를 보는 방식 — null(접힘) | "list" | "calendar"
  const [historyView, setHistoryView] = useState(null);
  // 캘린더용 — 내가 맡은 반 전체와 그 반들의 메모
  // (달력에서 고른 날짜·반·메모는 패널이 스스로 들고 있습니다 — 패널을
  //  닫으면 함께 사라져야 하는 값이라 여기 둘 이유가 없습니다)
  const [myClasses, setMyClasses] = useState([]);
  const [otherMemos, setOtherMemos] = useState({});
  const [editing, setEditing] = useState(null); // { id, text, date }
  const [confirmDelete, setConfirmDelete] = useState(null); // memoId
  const fieldRef = useRef(null);

  useEffect(() => {
    if (!classId) { setMemos([]); return; }
    return subscribeLessonMemos(classId, setMemos);
  }, [classId]);

  // [캘린더 보기를 켤 때만 다른 반까지 읽습니다]
  // 이 모달은 '지금 이 반'의 맥락에서 열리지만, 달력은 성격이 다릅니다 —
  // 하루에 여러 반 수업이 들어 있어, 9월 1일을 눌렀는데 한 반 것만 나오면
  // 그날을 되짚는 데 쓸 수가 없습니다. 그래서 달력에서는 내가 맡은 반을
  // 모두 모아 보여 주고 메모마다 어느 반인지 붙입니다.
  //
  // 쓰기 화면(기본)에서는 지금처럼 이 반 하나만 구독합니다. 반이 서너 개인
  // 교사가 달력을 열 때만 그만큼 리스너가 늘고, 규칙상 내가 맡은 반만
  // 읽히므로(ownsClass) 남의 반은 애초에 걸리지 않습니다.
  const calendarOn = historyView === "calendar";
  useEffect(() => {
    if (!calendarOn) { setMyClasses([]); return; }
    return subscribeClasses((list) =>
      setMyClasses(list.filter((c) => c.createdBy === user?.uid))
    );
  }, [calendarOn, user?.uid]);

  // 반 목록은 구독이 갱신될 때마다 새 배열로 오므로, 실제로 반이 바뀐
  // 때만 다시 걸도록 id 문자열을 열쇠로 씁니다(ConsonantDashboard와 같은 방식).
  const otherClassIds = myClasses.map((c) => c.id).filter((id) => id !== classId);
  const otherKey = otherClassIds.join(",");
  useEffect(() => {
    if (!calendarOn || !otherKey) { setOtherMemos({}); return; }
    const unsubs = otherKey.split(",").map((cid) =>
      subscribeLessonMemos(cid, (list) =>
        setOtherMemos((prev) => ({ ...prev, [cid]: list }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [calendarOn, otherKey]);

  // 달력에 깔 메모 — 이 반 + 내 다른 반. 반 이름을 미리 붙여 둡니다.
  const nameOfClass = useMemo(() => {
    const map = new Map(myClasses.map((c) => [c.id, c.name]));
    if (classId) map.set(classId, className || map.get(classId) || "이 반");
    return (cid) => map.get(cid) ?? "";
  }, [myClasses, classId, className]);

  // 보관된 반은 규칙(ownsClassEditable)이 쓰기를 막습니다. 달력에서 그 반을
  // 골랐을 때 입력칸을 내주면 저장을 눌러야 실패를 알게 되므로 미리 가립니다.
  const archivedClassIds = useMemo(
    () => new Set(myClasses.filter((c) => c.archived).map((c) => c.id)),
    [myClasses]
  );

  const calendarMemos = useMemo(() => {
    const rows = memos.map((m) => ({ ...m, classId }));
    for (const [cid, list] of Object.entries(otherMemos)) {
      for (const m of list) rows.push({ ...m, classId: cid });
    }
    return rows;
  }, [memos, otherMemos, classId]);

  // 날짜 → 그날 메모들. 같은 날이면 이 반 것이 먼저, 그다음 반 이름순.
  const byDate = useMemo(() => {
    const map = new Map();
    for (const m of calendarMemos) {
      const key = lessonMemoDate(m);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.classId !== b.classId) {
          if (a.classId === classId) return -1;
          if (b.classId === classId) return 1;
          return nameOfClass(a.classId).localeCompare(nameOfClass(b.classId));
        }
        return 0;
      });
    }
    return map;
  }, [calendarMemos, classId, nameOfClass]);

  // 열면 바로 쓸 수 있게 — 수업 중에 여는 화면입니다
  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  async function handleSave() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await addLessonMemo(classId, user, body, date);
      setText("");
      // 날짜는 오늘로 되돌립니다 — 지난 수업 것을 하나 적고 나서 다음 메모가
      // 그 날짜에 눌러앉아 있으면 알아채기 어렵습니다.
      setDate(todayDateKey());
      // 방금 적은 것이 목록에 들어가는 것을 보여 줍니다 — 저장됐는지
      // 따로 확인하러 가지 않아도 되게. 달력을 보던 중이면 그대로 둡니다
      // (그 날짜의 건수가 바로 늘어 저장된 것이 거기서도 보입니다).
      setHistoryView((v) => (v === "calendar" ? v : "list"));
    } finally {
      setBusy(false);
    }
  }

  // Ctrl/⌘+Enter로 저장 — 앱의 다른 입력칸과 같은 약속입니다
  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  }

  async function handleEditSave() {
    const body = editing?.text.trim();
    if (!body) return;
    await updateLessonMemo(classId, editing.id, body, editing.date);
    setEditing(null);
  }

  async function handleDelete(memoId) {
    await deleteLessonMemo(classId, memoId);
    setConfirmDelete(null);
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      {/* 모달과 달력 패널을 한 줄로 묶습니다 — 달력을 모달 안에 쌓으니
          세로로 너무 길어져(달력 하나가 250px), 쓰는 칸이 화면 위로
          밀려났습니다. 파이썬 실행 패널(.py-panel)과 같은 방식으로
          옆에서 미끄러져 나옵니다. */}
      <div className="memo-modal-row">
      <div
        className="modal modal-lesson-memo"
        role="dialog"
        aria-modal="true"
        aria-label="수업 메모"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>
            🗒️ 수업 메모
            {className && <span className="notes-student">{className}</span>}
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <label className="notes-date-row">
          <span>날짜</span>
          <input
            type="date"
            className="notes-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={todayDateKey()}
          />
        </label>

        <textarea
          ref={fieldRef}
          className="memo-field"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={handleKeyDown}
          rows={5}
          placeholder="수업 중 기억해 둘 것을 적어 주세요. 학생에게는 보이지 않아요."
        />

        <div className="memo-foot">
          <span className="memo-hint">Ctrl(⌘)+Enter로도 저장돼요</span>
          <button
            type="button"
            className="btn-primary memo-save"
            onClick={handleSave}
            disabled={busy || !text.trim()}
          >
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>

        {/* 지난 메모 — 접어 둡니다. 수업 중에는 쓰는 일이 먼저입니다. */}
        <div className="memo-history">
          <div className="memo-history-head">
            <button
              type="button"
              className="memo-history-toggle"
              onClick={() => setHistoryView((v) => (v === "list" ? null : "list"))}
              aria-expanded={historyView === "list"}
            >
              <span className={`memo-caret${historyView === "list" ? " open" : ""}`} aria-hidden="true">›</span>
              지난 메모 {memos.length > 0 && <em>{memos.length}</em>}
            </button>
            {/* 달력은 옆 패널로 엽니다(아래 memo-cal-panel).
                켤 때만 다른 반까지 읽습니다(위 구독 참고). */}
            <button
              type="button"
              className={`memo-cal-btn${calendarOn ? " on" : ""}`}
              onClick={() => setHistoryView((v) => (v === "calendar" ? null : "calendar"))}
              aria-pressed={calendarOn}
              aria-expanded={calendarOn}
              title="메모가 있는 날짜를 달력에서 봅니다 — 내가 맡은 반을 모두 모아서"
            >
              캘린더 보기
            </button>
          </div>

          {historyView === "list" && (
            memos.length === 0 ? (
              <p className="memo-empty">아직 적어 둔 메모가 없어요.</p>
            ) : (
              <ul className="memo-list">
                {memos.map((m) => (
                  <li key={m.id} className="memo-item">
                    {editing?.id === m.id ? (
                      <>
                        <label className="notes-date-row">
                          <span>날짜</span>
                          <input
                            type="date"
                            className="notes-date"
                            value={editing.date}
                            onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                            max={todayDateKey()}
                          />
                        </label>
                        <textarea
                          className="memo-field memo-field--edit"
                          value={editing.text}
                          onChange={(e) =>
                            setEditing({ ...editing, text: e.target.value.slice(0, MAX_LEN) })
                          }
                          rows={3}
                        />
                        <div className="memo-item-actions">
                          <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
                            취소
                          </button>
                          <button
                            type="button"
                            className="btn-primary memo-save"
                            onClick={handleEditSave}
                            disabled={!editing.text.trim()}
                          >
                            저장
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="memo-item-head">
                          <span className="memo-item-time">
                            <b className="memo-item-date">{lessonMemoDate(m)}</b>
                            {/* 쓴 시각도 남깁니다 — 같은 날 여러 번 적을 때
                                순서를 알아볼 수 있어야 합니다 */}
                            <span className="memo-item-clock">{formatTime(m.createdAt)}</span>
                          </span>
                          <span className="memo-item-actions">
                            <button
                              type="button"
                              className="memo-mini-btn"
                              onClick={() =>
                                setEditing({ id: m.id, text: m.text, date: lessonMemoDate(m) })
                              }
                            >
                              수정
                            </button>
                            {confirmDelete === m.id ? (
                              <>
                                <button
                                  type="button"
                                  className="memo-mini-btn danger"
                                  onClick={() => handleDelete(m.id)}
                                >
                                  정말 지울까요?
                                </button>
                                <button
                                  type="button"
                                  className="memo-mini-btn"
                                  onClick={() => setConfirmDelete(null)}
                                >
                                  취소
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="memo-mini-btn"
                                onClick={() => setConfirmDelete(m.id)}
                              >
                                삭제
                              </button>
                            )}
                          </span>
                        </div>
                        <p className="memo-item-text">{m.text}</p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </div>

      {/* 달력 패널 — 모달 오른쪽에서 미끄러져 나옵니다 */}
      {calendarOn && (
        <MemoCalendarPanel
          byDate={byDate}
          nameOfClass={nameOfClass}
          archivedClassIds={archivedClassIds}
          currentClassId={classId}
          user={user}
          onClose={() => setHistoryView(null)}
        />
      )}
      </div>
    </div>
  );
}

// ── 메모 달력 ──────────────────────────────────────────
// 출석부 달력(StudyAttendanceModal)과 같은 짜임·같은 CSS를 씁니다. 교사가
// 이미 그 모양에 익숙하고, 격자·요일 머리·달 넘기기를 다시 만들 이유가
// 없습니다. 다른 점은 칸에 채우는 값뿐입니다 — 출석은 '몇 명 왔나',
// 여기는 '메모 몇 건'.
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function toDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftMonth(cursor, delta) {
  const m = cursor.month + delta;
  if (m < 0) return { year: cursor.year - 1, month: 11 };
  if (m > 11) return { year: cursor.year + 1, month: 0 };
  return { year: cursor.year, month: m };
}

function formatDateLabel(dateKey) {
  if (!dateKey) return "";
  const [y, m, d] = String(dateKey).split("-");
  return `${y}.${m}.${d}`;
}

function MemoCalendarPanel({ byDate, nameOfClass, archivedClassIds, currentClassId, user, onClose }) {
  // 처음 여는 달 — 가장 최근 메모가 있는 달. 오늘로 열면 방학이나 주말에
  // 열었을 때 빈 달이 나옵니다.
  const [cursor, setCursor] = useState(() => {
    const anchor = [...byDate.keys()].sort().at(-1) || todayDateKey();
    const [y, m] = anchor.split("-").map(Number);
    return { year: y, month: m - 1 };
  });
  // 날짜 → 반 → 메모, 세 걸음입니다. 하루에 여러 반 수업이 들어 있어
  // 날짜만으로는 어느 시간 이야기인지 갈리지 않습니다.
  const [picked, setPicked] = useState("");        // 고른 날짜
  const [pickedClass, setPickedClass] = useState(""); // 고른 반
  const [pickedMemo, setPickedMemo] = useState("");   // 펼친 메모
  // 고른 반의 그날 메모를 여기서 바로 적고 고칩니다 — 달력에서 지난 수업을
  // 되짚다가 "아, 이것도 적어 둘걸" 하는 자리가 여기입니다. 그때 모달로
  // 돌아가 날짜와 반을 다시 맞추게 하면 하던 일이 끊깁니다.
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 반을 고르면 달력을 접습니다 — 그 반의 메모를 읽고 적는 자리가 되므로,
  // 좁은 패널에서 달력이 250px을 차지하고 있을 이유가 없습니다.
  const calendarOpen = !pickedClass;

  function pickDate(key) {
    setPicked((prev) => (prev === key ? "" : key));
    setPickedClass("");
    resetWrite();
  }

  function pickClass(cid) {
    setPickedClass(cid);
    resetWrite();
  }

  function resetWrite() {
    setPickedMemo("");
    setDraft("");
    setEditingId("");
    setEditText("");
    setError("");
  }

  const readOnly = archivedClassIds?.has(pickedClass) ?? false;

  async function saveNew() {
    const body = draft.trim();
    if (!body || busy || !picked || !pickedClass) return;
    setBusy(true);
    setError("");
    try {
      await addLessonMemo(pickedClass, user, body, picked);
      setDraft("");
    } catch (e) {
      setError(`저장하지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    const body = editText.trim();
    if (!body || busy) return;
    setBusy(true);
    setError("");
    try {
      // 날짜는 그대로 둡니다 — 달력에서 고른 그 날짜의 메모라, 여기서
      // 날짜를 바꾸면 방금 보던 목록에서 사라져 어디로 갔는지 알 수 없습니다.
      await updateLessonMemo(pickedClass, editingId, body, picked);
      setEditingId("");
      setEditText("");
    } catch (e) {
      setError(`저장하지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setBusy(false);
    }
  }

  const today = todayDateKey();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const startWeekday = new Date(cursor.year, cursor.month, 1).getDay();
  const cells = Array.from({ length: startWeekday }, () => null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1)
  );

  const dayMemos = picked ? byDate.get(picked) ?? [] : [];

  // 그날 수업이 있던 반들 — 순서는 byDate에서 이미 이 반이 먼저로 정렬돼 있습니다.
  const dayClasses = [];
  for (const m of dayMemos) {
    const found = dayClasses.find((c) => c.id === m.classId);
    if (found) found.count += 1;
    else dayClasses.push({ id: m.classId, count: 1 });
  }

  const classMemos = pickedClass ? dayMemos.filter((m) => m.classId === pickedClass) : [];

  return (
    <aside className="memo-cal-panel" onClick={(e) => e.stopPropagation()} aria-label="수업 메모 캘린더">
      <div className="memo-cal-panel-head">
        <h4>캘린더</h4>
        <button type="button" className="btn-close" onClick={onClose} aria-label="캘린더 닫기">×</button>
      </div>

      <div className="memo-cal-panel-body">
        {calendarOpen && (
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
              const key = toDateKey(cursor.year, cursor.month, d);
              const list = byDate.get(key) ?? [];
              const has = list.length > 0;
              // 이 반 메모가 있는 날은 또렷하게 — 모달을 연 맥락이 이 반이라,
              // 다른 반 메모만 있는 날과 같아 보이면 헷갈립니다.
              const mine = list.some((m) => m.classId === currentClassId);
              const cls = [
                "study-cal-cell",
                has && "has-record",
                has && !mine && "memo-cal-other",
                key === picked && "selected",
                key === today && "today",
              ].filter(Boolean).join(" ");
              return (
                <button
                  key={key}
                  type="button"
                  className={cls}
                  onClick={() => pickDate(key)}
                  disabled={!has}
                  title={has ? `메모 ${list.length}건` : undefined}
                >
                  <span className="study-cal-day">{d}</span>
                  {has && <span className="study-cal-count">{list.length}</span>}
                </button>
              );
            })}
          </div>
        </div>
        )}

        {!picked ? (
          <p className="memo-cal-hint">
            {byDate.size === 0
              ? "아직 적어 둔 메모가 없어요."
              : "메모가 있는 날짜를 눌러 보세요."}
          </p>
        ) : !pickedClass ? (
          /* 두 번째 걸음 — 그날 수업이 있던 반 */
          <div className="memo-cal-step">
            <p className="memo-cal-step-head">{formatDateLabel(picked)}</p>
            <ul className="memo-cal-picks">
              {dayClasses.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`memo-cal-pick${c.id === currentClassId ? " mine" : ""}`}
                    onClick={() => setPickedClass(c.id)}
                  >
                    <span className="memo-cal-pick-name">{nameOfClass(c.id) || "반 이름 없음"}</span>
                    <span className="memo-cal-pick-count">{c.count}건</span>
                    <span className="memo-cal-pick-caret" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          /* 세 번째 걸음 — 그 반의 그날 메모. 달력은 접혔습니다.
             읽기만 하는 자리가 아니라 여기서 바로 적고 고칩니다. */
          <div className="memo-cal-step memo-cal-step--open">
            <div className="memo-cal-step-head memo-cal-step-back">
              <button type="button" className="memo-cal-back" onClick={() => pickClass("")}>
                ‹ 반 목록
              </button>
              <span className="memo-cal-step-where">
                {formatDateLabel(picked)} · {nameOfClass(pickedClass)}
              </span>
            </div>

            {/* 이 날짜·이 반으로 한 건 더 — 달력에서 지난 수업을 되짚다가
                떠오른 것을 그 자리에서 적습니다. 날짜와 반은 지금 보고 있는
                그것이라 따로 고를 것이 없습니다. */}
            {readOnly ? (
              <p className="memo-cal-readonly">보관된 반이라 메모를 더할 수 없어요.</p>
            ) : (
              <div className="memo-cal-write">
                <textarea
                  className="memo-field memo-field--edit"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
                  rows={3}
                  placeholder={`${formatDateLabel(picked)} 수업에 적어 둘 것`}
                />
                <div className="memo-cal-write-foot">
                  <button
                    type="button"
                    className="btn-primary memo-save"
                    onClick={saveNew}
                    disabled={busy || !draft.trim()}
                  >
                    {busy ? "저장 중…" : "저장"}
                  </button>
                </div>
              </div>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}

            <ul className="memo-cal-picks">
              {classMemos.map((m) => {
                if (editingId === m.id) {
                  return (
                    <li key={m.id} className="memo-cal-editing">
                      <textarea
                        className="memo-field memo-field--edit"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value.slice(0, MAX_LEN))}
                        rows={3}
                      />
                      <div className="memo-item-actions">
                        <button type="button" className="btn-ghost" onClick={() => setEditingId("")}>
                          취소
                        </button>
                        <button
                          type="button"
                          className="btn-primary memo-save"
                          onClick={saveEdit}
                          disabled={busy || !editText.trim()}
                        >
                          저장
                        </button>
                      </div>
                    </li>
                  );
                }
                const open = pickedMemo === m.id;
                return (
                  <li key={m.id} className="memo-cal-row">
                    <button
                      type="button"
                      className={`memo-cal-pick memo-cal-memo${open ? " open" : ""}`}
                      onClick={() => setPickedMemo(open ? "" : m.id)}
                      aria-expanded={open}
                    >
                      <span className="memo-item-clock">{formatTime(m.createdAt)}</span>
                      <span className={`memo-cal-memo-text${open ? "" : " clamp"}`}>{m.text}</span>
                    </button>
                    {!readOnly && (
                      <button
                        type="button"
                        className="memo-mini-btn memo-cal-edit"
                        onClick={() => { setEditingId(m.id); setEditText(m.text); setPickedMemo(""); }}
                      >
                        수정
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}
