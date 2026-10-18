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
//
// [서식] 쓰는 칸은 앱의 서식 에디터(RichTextEditor, 모둠 메모와 같은 것)입니다 —
// 굵게 · 기울임 · 밑줄 · 글머리 · 번호 · 코드 블록(`- ` · ``` 단축키 포함).
// 저장은 정화한 HTML(`html`)과 글자만(`text`) 둘이고, 말풍선은 `html`이 있으면
// 다시 정화해 그립니다. **체크 줄은 뺐습니다**(`CHAT_TOOLS`) — 말은 못 고쳐
// 말풍선의 네모를 켜고 끌 길이 없어, 누를 것처럼 보이는 그림만 남습니다.
//
// [인용 답장] 말풍선의 문장을 끌어 고르면(마우스를 놓는 순간) 그 문장이 입력칸 위에
// 인용으로 붙고, 그것을 단 채 보통 답장을 보냅니다(`quote: { id, name, text }`).
// 교사 · 학생 모두 씁니다 — 교사에게는 '답장', 학생에게는 선생님 말의 그 대목을
// 짚어 다시 묻는 '질문'이라 말만 갈라 적습니다(자료 · 규칙은 같음).
// 원문 말은 고치지 않습니다 — 인용은 새 말에 붙는 사본입니다. 받은 말의 인용을
// 누르면 원문으로 굴러가 잠깐 밝아집니다. 인용 빼기는 ×, 또는 글이 빈 채 Esc.
//
// [읽음] 연 방 하나의 읽음 문서(chatRoomReads/{방} — { [uid]: ms })를 구독해
// 말마다 '읽음'을 답니다. 1:1은 내 말에만 '읽음 · 안 읽음', 모둠은 모든 말에
// '읽음 n/N'(보낸 사람을 뺀 모둠원 + 선생님) — 누르면 누가 읽었는지 펼칩니다.
//
// [공지] 반 공지(상단바 확성기로 보낸 것)의 최근 3건 — 학생은 '공지' 탭, 교사는
// 대화 목록 맨 위. 발송 기록(classes/{cId}/classNotices)을 읽습니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  sendChatMessage,
  deleteChatMessage,
  markChatRoomSeen,
  subscribeRoomReads,
  markRoomRead,
  fetchClass,
  fetchClassRosterProfiles,
  subscribeClassNotices,
} from "@/lib/store";
import { sanitizeHtml } from "@/lib/html";
import RichTextEditor from "./RichTextEditor";
import { useClassMembers } from "@/lib/useClassRoster";
import {
  buildChatRooms,
  roomMessages,
  roomSeenMark,
  chatTime,
  chatTimeLabel,
  chatPlainText,
  chatQuoteText,
  cleanChatQuote,
  roomParticipants,
  chatReceipt,
  isGroupRoom,
  CHAT_NOTICE_LIMIT,
} from "@/lib/messenger";
import { dateKeyOf, todayDateKey, dateKeyLabel } from "@/lib/dates";

// 쓰는 칸의 서식 — 에디터의 전부에서 체크 줄만 뺌(말은 못 고쳐 켜고 끌 수 없음).
// 모듈 상수라 렌더마다 새 배열이 생기지 않습니다.
const CHAT_TOOLS = [
  "bold", "italic", "underline",
  "insertUnorderedList", "insertOrderedList",
  "codeBlock",
];

// 반 공지 한 장 — 처음엔 세 줄까지, 누르면 펼침.
function NoticeCard({ notice }) {
  const [open, setOpen] = useState(false);
  const ms = chatTime(notice.sentAt);
  return (
    <button
      type="button"
      className={`msgr-notice-card${open ? " is-open" : ""}`}
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      title={open ? "접기" : "전체 보기"}
    >
      <span className="msgr-notice-meta">
        <span>{notice.sentAt ? chatTimeLabel(ms) : "보내는 중…"}</span>
        {notice.senderName && <span>{notice.senderName}</span>}
      </span>
      <span className="msgr-notice-text">{notice.text}</span>
    </button>
  );
}

function NoticeList({ notices, isTeacher }) {
  if (notices === null) return <p className="msgr-empty">공지를 불러오는 중이에요…</p>;
  if (notices.length === 0) {
    return (
      <p className="msgr-empty">
        {isTeacher ? "아직 보낸 반 공지가 없어요. 상단바의 확성기로 보냅니다." : "아직 받은 반 공지가 없어요."}
      </p>
    );
  }
  return (
    <div className="msgr-notice-list">
      {notices.map((n) => (
        <NoticeCard key={n.id} notice={n} />
      ))}
    </div>
  );
}

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
  // 쓰는 칸은 서식 에디터(비제어) — 글은 HTML로 받아 두고, 보낸 뒤에는 열쇠를
  // 바꿔 새 칸으로 갈아 끼웁니다(composeSeq).
  const [draft, setDraft] = useState("");
  const [composeSeq, setComposeSeq] = useState(0);
  const draftEmpty = !chatPlainText(draft);
  // 학생의 '공지' 탭 · 반 공지 최근 3건(null = 아직 안 옴)
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [notices, setNotices] = useState(null);
  useEffect(() => {
    setNotices(null);
    if (!classId) return undefined;
    return subscribeClassNotices(classId, setNotices, CHAT_NOTICE_LIMIT);
  }, [classId]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const scrollRef = useRef(null);
  const composeRef = useRef(null);
  // 인용 답장 — 입력칸 위에 붙은 문장 { id, name, text } · 원문으로 굴러간 말(잠깐 밝힘)
  const [quote, setQuote] = useState(null);
  const [flashId, setFlashId] = useState(null);

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
    setQuote(null);
    setReceiptOpen(null);
  }, [room]);

  // ── 인용 — 말풍선 하나 안에서 고른 글만 받습니다(이름 · 시각 · 다른 말풍선에
  //    걸친 선택은 무시). 붙이면 선택을 풀고 쓰는 칸 끝으로 커서를 옮깁니다.
  const threadRef = useRef(thread);
  threadRef.current = thread;
  function captureQuote() {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const bubbleOf = (node) => {
      const el = node?.nodeType === 1 ? node : node?.parentElement;
      return el?.closest?.(".msgr-bubble") ?? null;
    };
    const bubble = bubbleOf(sel.anchorNode);
    if (!bubble || bubble !== bubbleOf(sel.focusNode) || !scrollRef.current?.contains(bubble)) return;
    const text = chatQuoteText(sel.toString());
    const m = threadRef.current.find((x) => x.id === bubble.dataset.mid);
    if (!text || !m) return;
    setQuote({ id: m.id, name: m.fromName ?? "", text });
    sel.removeAllRanges();
    const area = composeRef.current?.querySelector(".rte-area");
    if (area) {
      area.focus();
      const r = document.createRange();
      r.selectNodeContents(area);
      r.collapse(false);
      const caret = window.getSelection();
      caret.removeAllRanges();
      caret.addRange(r);
    }
  }
  // 마우스는 놓는 순간 판정합니다. 손가락은 손잡이로 선택을 늘였다 줄이므로
  // 선택이 멈추고 0.7초 뒤에 판정합니다(놓는 순간을 알 수 없어서).
  const touchRef = useRef(false);
  useEffect(() => {
    let t = null;
    const onSel = () => {
      if (!touchRef.current) return;
      clearTimeout(t);
      t = setTimeout(captureQuote, 700);
    };
    document.addEventListener("selectionchange", onSel);
    return () => {
      clearTimeout(t);
      document.removeEventListener("selectionchange", onSel);
    };
  }, []);
  function onThreadPointerDown(e) {
    touchRef.current = e.pointerType === "touch";
  }
  function onThreadPointerUp(e) {
    if (e.pointerType === "touch") return;
    // 선택은 마우스를 놓은 뒤에 굳으므로 한 박자 뒤에 읽습니다.
    setTimeout(captureQuote, 0);
  }

  // 받은 말의 인용을 누르면 원문으로 — 없으면(지워짐 · 오래되어 목록 밖) 꺼 둡니다.
  function jumpTo(id) {
    const el = scrollRef.current?.querySelector(`[data-mid="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlashId(id);
  }
  useEffect(() => {
    if (!flashId) return undefined;
    const t = setTimeout(() => setFlashId(null), 1400);
    return () => clearTimeout(t);
  }, [flashId]);
  const threadIds = useMemo(() => new Set(thread.map((m) => m.id)), [thread]);

  // ── 읽음 — 연 방 하나의 읽음 문서. null은 '아직 안 옴'(그 전에는 제 칸을 안 씀) ──
  const [roomReads, setRoomReads] = useState(null);
  useEffect(() => {
    setRoomReads(null);
    if (!classId || !room) return undefined;
    return subscribeRoomReads(classId, room, setRoomReads);
  }, [classId, room]);
  const myReadMs = roomReads?.[myUid] ?? 0;
  useEffect(() => {
    if (!room || !roomReads) return;
    const mark = roomSeenMark(messages, room);
    // 안 읽은 수(chatReads)와 따로 봅니다 — 한쪽 쓰기가 실패해도 다른 쪽이 다음에 따라잡게.
    if (mark > myReadMs) {
      markRoomRead(classId, myUid, room, mark).catch((e) =>
        console.warn("[메신저] 읽음을 못 적었어요:", e?.code, e?.message)
      );
    }
  }, [room, roomReads, myReadMs, messages, classId, myUid]);
  // 선생님 — 교사 화면은 나(규칙이 반을 만든 교사에게만 메신저를 엶), 학생은 반 문서의
  // 만든 사람을 한 번 읽습니다(반이 바뀔 때만).
  const [ownerUid, setOwnerUid] = useState(null);
  useEffect(() => {
    if (isTeacher || !classId) { setOwnerUid(null); return undefined; }
    let alive = true;
    fetchClass(classId).then((c) => { if (alive) setOwnerUid(c?.createdBy ?? null); });
    return () => { alive = false; };
  }, [isTeacher, classId]);
  const teacherUid = isTeacher ? myUid : ownerUid;
  const participants = useMemo(
    () => (room ? roomParticipants({ room, groups, teacher: teacherUid ? { uid: teacherUid, name: "선생님" } : null }) : []),
    [room, groups, teacherUid]
  );
  // 누가 읽었는지 펼친 말(모둠) — 한 번에 하나
  const [receiptOpen, setReceiptOpen] = useState(null);
  // 맨 아래 말의 목록을 펴면 대화 칸 밖으로 나가므로, 펼친 목록이 보이게 굴립니다.
  useEffect(() => {
    if (!receiptOpen) return;
    scrollRef.current?.querySelector(".msgr-receipt-list")?.scrollIntoView({ block: "nearest" });
  }, [receiptOpen]);
  // 인용한 원문이 내 말이면 이름 대신 '내 말'로(원문이 목록에 있을 때만 압니다)
  const quotedMine = useMemo(
    () => new Set(thread.filter((m) => m.fromUid === myUid).map((m) => m.id)),
    [thread, myUid]
  );

  async function send() {
    if (draftEmpty || !room || sending) return;
    setSending(true);
    setError("");
    try {
      await sendChatMessage(classId, user, {
        room,
        role: isTeacher ? "teacher" : "student",
        html: draft,
        quote,
      });
      setDraft("");
      setQuote(null);
      setComposeSeq((n) => n + 1);
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
    if (!draftEmpty) return;
    e.preventDefault();
    e.stopPropagation();
    // 붙은 인용이 있으면 그것부터 뺍니다.
    if (quote) {
      setQuote(null);
      return;
    }
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
        {!isTeacher && noticesOpen ? (
          <div className="msgr-head-title">
            <strong>반 공지</strong>
            <span>선생님이 반에 보낸 공지 — 최근 {CHAT_NOTICE_LIMIT}개</span>
          </div>
        ) : room ? (
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
        <div className="msgr-tabs msgr-tabs--3" role="tablist" aria-label="대화 고르기">
          {[
            { row: studentDm, label: "선생님", empty: "" },
            { row: studentGroup, label: studentGroup?.title ?? "우리 모둠", empty: "아직 모둠이 정해지지 않았어요" },
          ].map(({ row, label, empty }) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={!noticesOpen && !!row && room === row.room}
              className={`msgr-tab${!noticesOpen && row && room === row.room ? " on" : ""}`}
              disabled={!row}
              title={row ? `${label}과(와) 대화합니다` : empty}
              onClick={() => {
                if (!row) return;
                setNoticesOpen(false);
                setRoom(row.room);
              }}
            >
              {label}
              {row?.unread > 0 && (noticesOpen || room !== row.room) && (
                <span className="msgr-tab-badge" aria-label={`안 읽은 말 ${row.unread}개`}>
                  {row.unread > 99 ? "99+" : row.unread}
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={noticesOpen}
            className={`msgr-tab${noticesOpen ? " on" : ""}`}
            title="선생님이 보낸 반 공지 — 최근 3개"
            onClick={() => setNoticesOpen(true)}
          >
            공지
          </button>
        </div>
      )}

      {!isTeacher && noticesOpen ? (
        <div className="msgr-list">
          <section className="msgr-sec">
            <h4 className="msgr-sec-title">반 공지 <span>최근 {CHAT_NOTICE_LIMIT}개</span></h4>
            <NoticeList notices={notices} isTeacher={false} />
          </section>
        </div>
      ) : !room && !isTeacher ? (
        <p className="msgr-empty msgr-empty--center">대화를 불러오는 중이에요…</p>
      ) : !room ? (
        <div className="msgr-list">
          {isTeacher && (
            <section className="msgr-sec">
              <h4 className="msgr-sec-title">최근 공지 <span>{notices?.length ?? 0}</span></h4>
              <NoticeList notices={notices} isTeacher />
            </section>
          )}
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
          <div
            className="msgr-thread"
            ref={scrollRef}
            onPointerDown={onThreadPointerDown}
            onPointerUp={onThreadPointerUp}
            // Shift+방향키로 고른 글도 같은 길로(키보드만 쓰는 사람)
            onKeyUp={(e) => {
              if (e.shiftKey) captureQuote();
            }}
          >
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
              const q = cleanChatQuote(m.quote);
              const qHere = !!q && threadIds.has(q.id);
              // 읽음 — 1:1은 내 말에만, 모둠은 모든 말에(보낸 사람을 뺀 참여자 기준)
              const rc = roomReads && (groupTalk || mine) ? chatReceipt(m, participants, roomReads) : null;
              const rcAll = !!rc && rc.read.length === rc.total;
              const nameOf = (p) => (p.uid === myUid ? "나" : p.name);
              return (
                <div key={m.id}>
                  {key !== prevKey && (
                    <div className="msgr-day">
                      <span>{key === today ? "오늘" : dateKeyLabel(key)}</span>
                    </div>
                  )}
                  <div className={`msgr-msg${mine ? " msgr-msg--mine" : ""}${m.fromRole === "teacher" && !mine ? " msgr-msg--teacher" : ""}${flashId === m.id ? " is-flash" : ""}`}>
                    {showName && <span className="msgr-msg-name">{m.fromName}</span>}
                    {q && (
                      <button
                        type="button"
                        className="msgr-quote"
                        disabled={!qHere}
                        title={qHere ? "원문으로 가기" : "원문이 지금 대화 목록에 없어요"}
                        onClick={() => jumpTo(q.id)}
                      >
                        <span className="msgr-quote-name">
                          {quotedMine.has(q.id) ? "내 말" : q.name || "인용"}
                        </span>
                        <span className="msgr-quote-text">{q.text}</span>
                      </button>
                    )}
                    {m.html ? (
                      <div
                        data-mid={m.id}
                        className="msgr-bubble msgr-bubble--rich"
                        // 저장할 때 정화했지만 남이 쓴 값이라 그릴 때 한 번 더 거릅니다
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.html) }}
                      />
                    ) : (
                      <div className="msgr-bubble" data-mid={m.id}>
                        {m.text}
                      </div>
                    )}
                    <span className="msgr-msg-meta">
                      {m.at ? chatTimeLabel(t) : "보내는 중…"}
                      {rc && rc.total > 0 && (
                        groupTalk ? (
                          <>
                            {" · "}
                            <button
                              type="button"
                              className={`msgr-receipt${rcAll ? " is-all" : ""}`}
                              aria-expanded={receiptOpen === m.id}
                              title={rcAll ? "모두 읽었어요" : `아직 안 읽음: ${rc.unread.map(nameOf).join(", ")}`}
                              onClick={() => setReceiptOpen((cur) => (cur === m.id ? null : m.id))}
                            >
                              읽음 {rc.read.length}/{rc.total}
                            </button>
                          </>
                        ) : (
                          <>
                            {" · "}
                            <span className={`msgr-receipt${rcAll ? " is-all" : ""}`}>{rcAll ? "읽음" : "안 읽음"}</span>
                          </>
                        )
                      )}
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
                    {rc && receiptOpen === m.id && (
                      <div className="msgr-receipt-list">
                        <span>
                          <b>읽음 {rc.read.length}</b> {rc.read.map(nameOf).join(" · ") || "아직 없어요"}
                        </span>
                        {rc.unread.length > 0 && (
                          <span>
                            <b>안 읽음 {rc.unread.length}</b> {rc.unread.map(nameOf).join(" · ")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="msgr-compose" ref={composeRef}>
            {quote && (
              <div className="msgr-quote-draft">
                <span className="msgr-quote-draft-copy">
                  <span className="msgr-quote-name">
                    {/* 학생에게는 '답장'이 아니라 선생님 말의 그 대목을 짚어 다시 묻는 자리 */}
                    {isTeacher
                      ? `${quotedMine.has(quote.id) ? "내 말" : quote.name || "인용"}에 답장`
                      : quotedMine.has(quote.id)
                        ? "내 말에 덧붙여 질문"
                        : `${quote.name || "선생님"} 말에 대해 질문`}
                  </span>
                  <span className="msgr-quote-text">{quote.text}</span>
                </span>
                <button
                  type="button"
                  className="msgr-quote-x"
                  onClick={() => setQuote(null)}
                  aria-label="인용 빼기"
                  title="인용 빼기"
                >
                  ×
                </button>
              </div>
            )}
            <RichTextEditor
              key={`${classId}|${room}|${composeSeq}`}
              variant="chat"
              /* 꾸미개가 먼저, 쓰는 칸이 그다음 — 모둠 메모와 같은 순서 */
              toolbarTop
              tools={CHAT_TOOLS}
              autoFocus
              className="msgr-rte"
              placeholder={`${current?.title ?? ""}에게 메시지 보내기`}
              onChange={setDraft}
              onSend={send}
              sendDisabled={sending || draftEmpty}
            />
          </div>
          <p className="msgr-hint">
            {error ||
              (isTeacher
                ? "Ctrl(⌘)+Enter로 보내기 · 말풍선의 문장을 끌어 고르면 인용해 답해요"
                : "Ctrl(⌘)+Enter로 보내기 · 궁금한 문장을 끌어 고르면 그 부분을 짚어 물어봐요")}
          </p>
        </>
      )}
    </section>
  );
}
