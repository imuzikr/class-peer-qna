"use client";

// =============================================================
// 오늘의 움직임 — 프로젝트 대시보드 왼쪽 패널 (교사 전용)
// -------------------------------------------------------------
// 프로젝트를 열기 전에는 이 자리에 '프로젝트를 열면…' 한 줄뿐이었습니다.
// 그런데 교사가 공부방을 여는 순간 가장 알고 싶은 건 "지금 이 반이 어떤
// 상태인가"입니다. 그건 화면 어디에도 모여 있지 않았습니다 — 출석은 출석
// 모달에, 카드는 프로젝트를 하나씩 열어야, KWLS는 KWL 패널에, 과일은
// 자리표에 흩어져 있었습니다. 오늘 하루치만 한자리에 모읍니다.
//
// [무엇을 '움직임'으로 보나]
// 학생이 스스로 한 일(출석·카드 제출·KWLS)과 교사가 준 것(과일)입니다.
// 넷 다 시각이 남아 있어 시간순으로 세울 수 있습니다.
//   · 출석  attendanceRecords.attendedAt
//   · 카드  cards.updatedAt
//   · KWLS  kwl.createdAt
//   · 과일  rewardEvents.at
//
// [왜 '한 일'만 보여주나]
// '아직 안 한 사람' 목록은 만들지 않았습니다. 이 화면은 수업 중 전자칠판에
// 그대로 비치는데, 거기에 안 낸 사람 이름이 뜨면 그 학생이 상합니다.
// 한 일만 모으면 같은 자료가 격려가 됩니다 — 미제출은 프로젝트 카드의
// 제출 인원(12/28)으로 이미 셀 수 있습니다.
//
// 카드는 프로젝트마다 따로 있는 하위 컬렉션이라 보드 수만큼 구독합니다
// (프로젝트 대시보드가 카드 한 장마다 하는 것과 같은 방식).
// =============================================================
import { useEffect, useMemo, useState } from "react";
import {
  subscribeAllKwl,
  subscribeClassRewardEvents,
  subscribeStudyCards,
  toDate,
  todayDateKey,
} from "@/lib/store";
import { stripHtml } from "@/lib/html";
import { isTeacherAuthoredCard } from "@/lib/activities";

// 목록에 세우는 최대 건수 — 넘으면 최근 것부터 남깁니다.
const MAX_ROWS = 30;

function hhmm(d) {
  if (!d) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function StudyTodayFeed({
  classId,
  boards = [],
  roster = [],
  attendanceRecords = [],
}) {
  const today = todayDateKey();
  const [kwl, setKwl] = useState([]);
  const [rewardEvents, setRewardEvents] = useState([]);
  const [cardsByBoard, setCardsByBoard] = useState({});

  // 프로젝트만 — '수업 자료'(notice) 보드에는 학생 카드가 없습니다.
  const projects = useMemo(() => boards.filter((b) => b.type !== "notice"), [boards]);
  const projectKey = projects.map((b) => b.id).join(",");

  useEffect(() => {
    if (!classId) { setKwl([]); return; }
    return subscribeAllKwl(classId, today, setKwl);
  }, [classId, today]);

  useEffect(() => {
    if (!classId) { setRewardEvents([]); return; }
    return subscribeClassRewardEvents(classId, setRewardEvents);
  }, [classId]);

  useEffect(() => {
    setCardsByBoard({});
    if (!projectKey) return;
    const ids = projectKey.split(",");
    const unsubs = ids.map((id) =>
      subscribeStudyCards(id, (list) =>
        setCardsByBoard((prev) => ({ ...prev, [id]: list }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [projectKey]);

  const nameOf = useMemo(() => {
    const m = new Map(roster.map((s) => [s.uid, s.name]));
    return (uid) => m.get(uid) ?? "이름 미설정";
  }, [roster]);

  const titleOf = useMemo(() => {
    const m = new Map(projects.map((b) => [b.id, b.title]));
    return (id) => m.get(id) ?? "프로젝트";
  }, [projects]);

  // 네 갈래를 한 줄기로 합쳐 시간순(최근 먼저)으로 세웁니다.
  const events = useMemo(() => {
    const out = [];
    const isToday = (d) => d && !Number.isNaN(d.getTime()) && todayDateKey(d) === today;

    attendanceRecords
      .filter((r) => r.date === today)
      .forEach((r) => {
        const at = toDate(r.attendedAt || r.createdAt);
        if (at) out.push({ at, kind: "attend", uid: r.uid, text: "출석했어요" });
      });

    Object.entries(cardsByBoard).forEach(([boardId, list]) => {
      (list ?? []).forEach((c) => {
        if (isTeacherAuthoredCard(c)) return;
        const at = toDate(c.updatedAt);
        if (!isToday(at)) return;
        // 빈 카드(틀만 저장된 것)는 '제출'로 세지 않습니다.
        if (stripHtml(c.content ?? "").trim().length === 0) return;
        out.push({
          at,
          kind: "card",
          uid: c.authorId,
          text: `${titleOf(boardId)}에 카드를 냈어요`,
        });
      });
    });

    kwl.forEach((e) => {
      const at = toDate(e.createdAt);
      if (!isToday(at)) return;
      out.push({ at, kind: "kwl", uid: e.userId, text: "오늘의 성찰(KWLS)을 썼어요" });
    });

    rewardEvents.forEach((e) => {
      const at = toDate(e.at);
      if (!isToday(at)) return;
      const n = typeof e.delta === "number" ? e.delta : 0;
      if (n <= 0) return; // 회수는 격려의 자리가 아니라 빼 둡니다
      out.push({ at, kind: "fruit", uid: e.uid, text: `과일 ${n}개를 받았어요` });
    });

    return out.sort((a, b) => b.at - a.at);
  }, [attendanceRecords, cardsByBoard, kwl, rewardEvents, today, titleOf]);

  const counts = useMemo(() => {
    const c = { attend: 0, card: 0, kwl: 0, fruit: 0 };
    events.forEach((e) => { c[e.kind] += 1; });
    return c;
  }, [events]);

  const ICON = { attend: "✋", card: "📝", kwl: "💭", fruit: "🍎" };

  return (
    <div className="today-feed">
      <p className="study-activity-panel-hint">
        오늘 이 반에서 일어난 일이에요. 프로젝트를 열면 이 자리가 활동 관리로 바뀝니다.
      </p>

      <div className="today-feed-counts">
        <span className="today-feed-chip"><b>{counts.attend}</b> 출석</span>
        <span className="today-feed-chip"><b>{counts.card}</b> 카드</span>
        <span className="today-feed-chip"><b>{counts.kwl}</b> 성찰</span>
        <span className="today-feed-chip"><b>{counts.fruit}</b> 과일</span>
      </div>

      {events.length === 0 ? (
        <p className="study-activity-panel-empty">아직 오늘의 움직임이 없어요.</p>
      ) : (
        <ul className="today-feed-list">
          {events.slice(0, MAX_ROWS).map((e, i) => (
            <li key={`${e.kind}-${e.uid}-${i}`} className="today-feed-item">
              <span className="today-feed-icon" aria-hidden="true">{ICON[e.kind]}</span>
              <span className="today-feed-body">
                <b>{nameOf(e.uid)}</b> {e.text}
              </span>
              <time className="today-feed-time">{hhmm(e.at)}</time>
            </li>
          ))}
        </ul>
      )}

      {events.length > MAX_ROWS && (
        <p className="study-activity-panel-hint">최근 {MAX_ROWS}건만 보여 줍니다.</p>
      )}
    </div>
  );
}
