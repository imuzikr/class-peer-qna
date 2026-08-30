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
// [늘 보이는 것과, 눌러야 보이는 것]
// 목록에 흐르는 것은 '한 일'뿐입니다 — 이 화면은 수업 중 전자칠판에 그대로
// 비치는데 거기에 안 낸 사람 이름이 늘 떠 있으면 그 학생이 상합니다.
// '아직 안 한 학생' 명단은 위 네 칸을 눌러야 펼쳐집니다(기본 접힘). 교사가
// 미제출자를 확인하려면 프로젝트를 하나씩 열어 훑어야 했는데, 그 수고를
// 없애면서도 평소에는 화면에 뜨지 않게 하는 절충입니다.
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
  // 펼쳐 둔 칸 — null이면 모두 접힘(기본). 안 한 사람 명단이라 늘 접힌 채 시작합니다.
  const [openKind, setOpenKind] = useState(null);

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
      out.push({ at, kind: "fruit", uid: e.uid, amount: n, text: `과일 ${n}개를 받았어요` });
    });

    return out.sort((a, b) => b.at - a.at);
  }, [attendanceRecords, cardsByBoard, kwl, rewardEvents, today, titleOf]);

  const counts = useMemo(() => {
    const c = { attend: 0, card: 0, kwl: 0, fruit: 0 };
    events.forEach((e) => { c[e.kind] += 1; });
    return c;
  }, [events]);

  // 칸을 누르면 펼쳐지는 상세 명단.
  // -------------------------------------------------------------
  // 앞의 셋은 '오늘 아직 안 한 학생', 과일만 '받은 학생'입니다. 안 한 사람
  // 명단은 전자칠판에 그대로 비치면 곤란한 자료라, 늘 접어 두고 교사가 눌러야
  // 펼쳐지게 합니다(과일 이력과 같은 원칙).
  //
  // 기준은 넷 다 '오늘'입니다 — 이 패널 자체가 오늘치이고, 출석·성찰은 원래
  // 날짜별 기록입니다. 카드도 오늘 고친 것만 셉니다. 그래서 이름표를
  // '미제출자'가 아니라 '오늘 … 안 한 학생'으로 답니다. 어제 낸 학생이
  // 미제출로 읽히면 그게 더 나쁜 오해라서입니다.
  const details = useMemo(() => {
    const doneBy = { attend: new Set(), card: new Set(), kwl: new Set(), fruit: new Set() };
    events.forEach((e) => doneBy[e.kind].add(e.uid));
    const notYet = (kind) => roster.filter((s) => !doneBy[kind].has(s.uid));
    // 과일은 몇 개 받았는지까지 — 한 사람이 여러 번 받을 수 있어 합칩니다.
    const fruitBy = new Map();
    events
      .filter((e) => e.kind === "fruit")
      .forEach((e) => fruitBy.set(e.uid, (fruitBy.get(e.uid) ?? 0) + (e.amount ?? 0)));
    return {
      attend: { label: "오늘 출석 안 한 학생", rows: notYet("attend").map((s) => ({ uid: s.uid, name: s.name })) },
      card: { label: "오늘 카드를 안 낸 학생", rows: notYet("card").map((s) => ({ uid: s.uid, name: s.name })) },
      kwl: { label: "오늘 성찰을 안 쓴 학생", rows: notYet("kwl").map((s) => ({ uid: s.uid, name: s.name })) },
      fruit: {
        label: "오늘 과일 받은 학생",
        rows: [...fruitBy.entries()].map(([uid, n]) => ({ uid, name: nameOf(uid), suffix: `${n}` })),
      },
    };
  }, [events, roster, nameOf]);

  const open = openKind ? details[openKind] : null;
  const EMPTY = {
    attend: "모두 출석했어요.",
    card: "모두 카드를 냈어요.",
    kwl: "모두 성찰을 썼어요.",
    fruit: "아직 과일을 준 학생이 없어요.",
  };

  const ICON = { attend: "✋", card: "📝", kwl: "💭", fruit: "🍎" };
  const LABEL = { attend: "출석", card: "카드", kwl: "성찰", fruit: "과일" };

  return (
    <div className="today-feed">
      <p className="study-activity-panel-hint">
        오늘 이 반에서 일어난 일이에요. 프로젝트를 열면 이 자리가 활동 관리로 바뀝니다.
      </p>

      {/* 칸을 누르면 그 갈래의 명단이 아래에 펼쳐집니다. 같은 칸을 다시
          누르면 접힙니다(다른 칸을 누르면 그쪽으로 바뀝니다). */}
      <div className="today-feed-counts">
        {["attend", "card", "kwl", "fruit"].map((k) => (
          <button
            key={k}
            type="button"
            className={`today-feed-chip${openKind === k ? " is-open" : ""}`}
            onClick={() => setOpenKind((v) => (v === k ? null : k))}
            aria-expanded={openKind === k}
            title={`${LABEL[k]} — 눌러서 ${k === "fruit" ? "받은 학생" : "아직 안 한 학생"} 보기`}
          >
            <b>{counts[k]}</b> {LABEL[k]}
          </button>
        ))}
      </div>

      {open && (
        <div className="today-feed-detail">
          <div className="today-feed-detail-head">
            <span>{open.label}</span>
            <b>{open.rows.length}명</b>
          </div>
          {open.rows.length === 0 ? (
            <p className="today-feed-detail-empty">{EMPTY[openKind]}</p>
          ) : (
            <div className="today-feed-names">
              {open.rows.map((r) => (
                <span key={r.uid} className="today-feed-name">
                  {r.name}
                  {r.suffix && <em> {r.suffix}</em>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

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
