"use client";

// =============================================================
// 간편 메신저 창 — 떠 있는 동그라미(FloatingHub)에서 엽니다
// -------------------------------------------------------------
// 두 화면: 대화 목록 → 대화. 모달이 아니라 오른쪽 아래에 떠 있는 창이라
// 뒤 화면을 막지 않습니다(수업을 보며 대화).
//
//  · 교사 — 모둠 대화(기본 모둠) · 학생 대화(학번순). 반의 모든 방을 봅니다.
//  · 학생 — 우리 모둠(선생님 포함) · 선생님(1:1). 둘뿐입니다.
//
// 말 · 읽음 표시는 FloatingHub가 이미 구독해 둔 것을 받습니다(배지와 같은
// 자료 — 창을 열어도 리스너가 늘지 않습니다). 교사의 학생 명단만 창이
// 떠 있는 동안 따로 읽습니다.
//
// 보내기는 **Ctrl(⌘)+Enter**, Enter는 줄바꿈 — 앱의 다른 채팅 칸과 같습니다.
// 대화는 기록되고 선생님이 볼 수 있다는 것을 대화 맨 위에 적어 둡니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  sendChatMessage,
  deleteChatMessage,
  markChatRoomSeen,
  fetchClassRosterProfiles,
} from "@/lib/store";
import { useClassMembers } from "@/lib/useClassRoster";
import {
  buildChatRooms,
  roomMessages,
  roomSeenMark,
  chatTime,
  chatTimeLabel,
  cleanChatText,
  isGroupRoom,
  CHAT_TEXT_MAX,
} from "@/lib/messenger";
import { dateKeyOf, todayDateKey, dateKeyLabel } from "@/lib/dates";

function Avatar({ text, group = false }) {
  return (
    <span className={`msgr-avatar${group ? " msgr-avatar--group" : ""}`} aria-hidden="true">
      {String(text || "?").slice(0, 1)}
    </span>
  );
}

export default function MessengerWindow({
  classId,
  user,
  isTeacher,
  groups = [],
  messages = [],
  seen = {},
  classes = [],
  onClassChange = null,
  onClose,
}) {
  const myUid = user?.uid;
  // 고른 방은 **그 반과 짝으로** 듭니다 — 교사가 반을 바꾸는 순간 앞 반의 방이
  // 새 반의 이름으로 한 박자 남지 않게(읽음 표시가 엉뚱한 반에 적히지 않게).
  const [roomSel, setRoomSel] = useState({ cls: classId, room: null });
  const room = roomSel.cls === classId ? roomSel.room : null;
  const setRoom = (next) => setRoomSel({ cls: classId, room: next });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // ── 교사의 학생 명단 — 창이 떠 있는 동안만 ──
  const memberUids = useClassMembers(classId, !!isTeacher);
  const [roster, setRoster] = useState([]);
  const memberKey = memberUids.join(",");
  useEffect(() => {
    if (!isTeacher || !memberKey) { setRoster([]); return undefined; }
    let alive = true;
    fetchClassRosterProfiles(memberKey.split(",")).then((list) => {
      if (!alive) return;
      setRoster(
        [...list].sort((a, b) =>
          String(a.studentId ?? "~").localeCompare(String(b.studentId ?? "~"), "ko", { numeric: true })
        )
      );
    });
    return () => { alive = false; };
  }, [isTeacher, memberKey]);

  const rooms = useMemo(
    () => buildChatRooms({ isTeacher, myUid, groups, roster, messages, seen }),
    [isTeacher, myUid, groups, roster, messages, seen]
  );
  const allRows = [...rooms.groups, ...rooms.people];
  const current = room ? allRows.find((r) => r.room === room) ?? null : null;
  const thread = useMemo(() => (room ? roomMessages(messages, room) : []), [messages, room]);

  // ── 학생 — 목록 없이 탭 둘(선생님 · 우리 모둠) ──
  // 처음에는 안 읽은 말이 있는 쪽, 없으면 선생님 대화를 엽니다.
  const studentDm = !isTeacher ? rooms.people[0] ?? null : null;
  const studentGroup = !isTeacher ? rooms.groups[0] ?? null : null;
  useEffect(() => {
    if (isTeacher || room) return;
    const pick = studentGroup?.unread > 0 && !(studentDm?.unread > 0) ? studentGroup : studentDm;
    if (pick) setRoom(pick.room);
    // 처음 한 번만 고릅니다 — 안 읽은 수가 바뀔 때마다 다시 고르면 학생이 고른
    // 탭이 저절로 넘어갑니다(그 뒤로는 학생이 탭으로 고름).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, room, studentDm?.room]);

  // ── 연 방은 '여기까지 봤다' ──
  const seenMs = room ? seen?.[room] ?? 0 : 0;
  useEffect(() => {
    if (!room) return;
    const mark = roomSeenMark(messages, room);
    if (mark > seenMs) {
      markChatRoomSeen(classId, myUid, room, mark).catch((e) =>
        console.warn("[메신저] 읽음 표시를 못 적었어요:", e?.code, e?.message)
      );
    }
  }, [room, messages, seenMs, classId, myUid]);

  // 새 말이 오면 맨 아래로
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, room]);

  useEffect(() => {
    setDraft("");
    setError("");
    setConfirmDel(null);
    if (room) setTimeout(() => inputRef.current?.focus(), 0);
  }, [room]);

  async function send() {
    const text = cleanChatText(draft);
    if (!text || !room || sending) return;
    setSending(true);
    setError("");
    try {
      await sendChatMessage(classId, user, { room, role: isTeacher ? "teacher" : "student", text });
      setDraft("");
      inputRef.current?.focus();
    } catch (e) {
      console.warn("[메신저] 못 보냈어요:", e?.code, e?.message);
      setError("메시지를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  }

  async function removeMessage(id) {
    setConfirmDel(null);
    try {
      await deleteChatMessage(classId, id);
    } catch (e) {
      console.warn("[메신저] 못 지웠어요:", e?.code, e?.message);
      setError("메시지를 지우지 못했어요.");
    }
  }

  function onKeyDown(e) {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    // 쓰던 글이 있으면 Esc로 안 닫습니다(앱의 다른 창과 같은 약속).
    if (cleanChatText(draft)) return;
    e.preventDefault();
    e.stopPropagation();
    // 교사는 대화 → 목록 → 닫기, 학생은 목록이 없어 곧바로 닫습니다.
    if (room && isTeacher) setRoom(null);
    else onClose?.();
  }

  const today = todayDateKey();
  const groupTalk = room ? isGroupRoom(room) : false;

  return (
    <section
      className="msgr"
      role="dialog"
      aria-label="메신저"
      onKeyDown={onKeyDown}
    >
      <header className="msgr-head">
        {room && isTeacher ? (
          <button type="button" className="msgr-back" onClick={() => setRoom(null)} aria-label="대화 목록으로">
            ‹
          </button>
        ) : null}
        {room ? (
          <>
            <Avatar text={current?.title} group={groupTalk} />
            <div className="msgr-head-title">
              <strong>{current?.title ?? "대화"}</strong>
              <span>{groupTalk ? `모둠 대화 · ${current?.sub ?? ""}` : isTeacher ? "학생과 주고받은 대화" : "선생님과 나눈 대화"}</span>
            </div>
          </>
        ) : (
          <div className="msgr-head-title">
            <strong>메신저</strong>
            <span>{isTeacher ? "학생 · 모둠과 대화해요" : "선생님 · 우리 모둠과 대화해요"}</span>
          </div>
        )}
        <button type="button" className="btn-close msgr-close" onClick={onClose} aria-label="메신저 닫기">
          ×
        </button>
      </header>

      {/* 교사 — 맨 위에서 반을 고릅니다. 공부방에서 고른 반과 따로라, 어느
          화면에서든 원하는 반과 대화합니다(공부방의 반은 안 바뀝니다). */}
      {isTeacher && classes.length > 0 && (
        <div className="msgr-classbar">
          <label htmlFor="msgr-class">반</label>
          {classes.length > 1 ? (
            <select
              id="msgr-class"
              className="msgr-class-select"
              value={classId ?? ""}
              onChange={(e) => onClassChange?.(e.target.value)}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <span id="msgr-class" className="msgr-class-name">{classes[0].name}</span>
          )}
        </div>
      )}

      {/* 학생 — 선생님과 할지 모둠에서 할지 고릅니다 */}
      {!isTeacher && (
        <div className="msgr-tabs" role="tablist" aria-label="대화 고르기">
          {[
            { row: studentDm, label: "선생님", empty: "" },
            { row: studentGroup, label: studentGroup?.title ?? "우리 모둠", empty: "아직 모둠이 정해지지 않았어요" },
          ].map(({ row, label, empty }) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={!!row && room === row.room}
              className={`msgr-tab${row && room === row.room ? " on" : ""}`}
              disabled={!row}
              title={row ? `${label}과(와) 대화합니다` : empty}
              onClick={() => row && setRoom(row.room)}
            >
              {label}
              {row?.unread > 0 && room !== row.room && (
                <span className="msgr-tab-badge" aria-label={`안 읽은 말 ${row.unread}개`}>
                  {row.unread > 99 ? "99+" : row.unread}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {!room && !isTeacher ? (
        <p className="msgr-empty msgr-empty--center">대화를 불러오는 중이에요…</p>
      ) : !room ? (
        <div className="msgr-list">
          {[
            { key: "groups", title: isTeacher ? "모둠 대화" : "우리 모둠", rows: rooms.groups },
            { key: "people", title: isTeacher ? "학생 대화" : "선생님", rows: rooms.people },
          ].map((sec) => (
            <section key={sec.key} className="msgr-sec">
              <h4 className="msgr-sec-title">
                {sec.title} <span>{sec.rows.length}</span>
              </h4>
              {sec.rows.length === 0 ? (
                <p className="msgr-empty">
                  {sec.key === "groups"
                    ? isTeacher
                      ? "기본 모둠을 짜면 모둠 대화가 생겨요."
                      : "아직 모둠이 정해지지 않았어요."
                    : "아직 입장한 학생이 없어요."}
                </p>
              ) : (
                sec.rows.map((r) => {
                  const lastMine = r.last?.fromUid === myUid;
                  return (
                    <button key={r.room} type="button" className="msgr-row" onClick={() => setRoom(r.room)}>
                      <Avatar text={r.title} group={r.kind === "group"} />
                      <span className="msgr-row-copy">
                        <span className="msgr-row-name">
                          {r.title}
                          {r.sub && <em>{r.sub}</em>}
                        </span>
                        <span className="msgr-row-preview">
                          {r.last ? `${lastMine ? "나: " : r.kind === "group" ? `${r.last.fromName}: ` : ""}${r.last.text}` : "새로운 대화를 시작해 보세요"}
                        </span>
                      </span>
                      {r.unread > 0 ? (
                        <span className="msgr-unread" aria-label={`안 읽은 말 ${r.unread}개`}>
                          {r.unread > 99 ? "99+" : r.unread}
                        </span>
                      ) : (
                        <span className="msgr-row-time">{r.last ? chatTimeLabel(chatTime(r.last.at)) : ""}</span>
                      )}
                    </button>
                  );
                })
              )}
            </section>
          ))}
        </div>
      ) : (
        <>
          <div className="msgr-thread" ref={scrollRef}>
            <p className="msgr-notice">
              🔒 <strong>대화 기록 안내</strong> ·{" "}
              {isTeacher ? "이 대화는 기록되어 언제든 다시 볼 수 있어요." : "이 대화는 기록되고 선생님이 볼 수 있어요."}
            </p>
            {thread.length === 0 && <p className="msgr-empty msgr-empty--center">첫 메시지를 보내 보세요.</p>}
            {thread.map((m, i) => {
              const t = chatTime(m.at);
              const key = dateKeyOf(new Date(t));
              const prevKey = i > 0 ? dateKeyOf(new Date(chatTime(thread[i - 1].at))) : null;
              const mine = m.fromUid === myUid;
              const showName = !mine && (groupTalk || m.fromRole === "teacher") &&
                (i === 0 || thread[i - 1].fromUid !== m.fromUid || key !== prevKey);
              return (
                <div key={m.id}>
                  {key !== prevKey && (
                    <div className="msgr-day">
                      <span>{key === today ? "오늘" : dateKeyLabel(key)}</span>
                    </div>
                  )}
                  <div className={`msgr-msg${mine ? " msgr-msg--mine" : ""}${m.fromRole === "teacher" && !mine ? " msgr-msg--teacher" : ""}`}>
                    {showName && <span className="msgr-msg-name">{m.fromName}</span>}
                    <div className="msgr-bubble">{m.text}</div>
                    <span className="msgr-msg-meta">
                      {m.at ? chatTimeLabel(t) : "보내는 중…"}
                      {isTeacher && m.at && (
                        <span className={`msgr-del-wrap${confirmDel === m.id ? " is-sure" : ""}`}>
                          {" · "}
                          {confirmDel === m.id ? (
                            <>
                              <button type="button" className="msgr-del msgr-del--sure" onClick={() => removeMessage(m.id)}>
                                정말 지우기
                              </button>
                              <button type="button" className="msgr-del" onClick={() => setConfirmDel(null)}>
                                취소
                              </button>
                            </>
                          ) : (
                            <button type="button" className="msgr-del" onClick={() => setConfirmDel(m.id)}>
                              지우기
                            </button>
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <form
            className="msgr-compose"
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, CHAT_TEXT_MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder={`${current?.title ?? ""}에게 메시지 보내기`}
              aria-label="보낼 메시지"
            />
            <button type="submit" className="msgr-send" disabled={sending || !cleanChatText(draft)} aria-label="보내기">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 12 20 4l-6 16-2.6-6.4L4 12Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
          <p className="msgr-hint">
            {error || "Ctrl(⌘)+Enter로 보내기 · Enter는 줄바꿈"}
          </p>
        </>
      )}
    </section>
  );
}
