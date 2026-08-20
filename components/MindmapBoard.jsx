"use client";

// =============================================================
// 마인드맵 — 교사 화면 (개인 활동)
// -------------------------------------------------------------
// 왼쪽에 학생 목록, 오른쪽에 고른 학생의 마인드맵. 다른 개인 활동은 목록과
// 상세가 화면을 갈아 끼우지만, 마인드맵은 그림이라 '옆 학생 것과 견주며
// 훑어보는' 일이 잦아 한 화면에 나란히 둡니다.
//
// 오른쪽 판의 '수업 시작'을 누르면 그 학생의 마인드맵이 학급 전체 화면에
// 뜹니다. 방송 중에 다른 학생을 고르면 끄지 않아도 그리로 곧바로 바뀝니다
// (방송 문서를 새 내용으로 덮어쓰기만 하므로 깜빡임이 없습니다).
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeParatextEntries } from "@/lib/store";
import { useEntryCast } from "@/lib/useEntryCast";
import {
  MINDMAP_LAYOUTS,
  branchCount,
  maxDepth,
  mindmapStarted,
  normalizeMindmap,
} from "@/lib/mindmap";
import { safeBookUrl } from "@/lib/paratext";
import MindmapCanvas from "./MindmapCanvas";
import CastBar from "./CastBar";
import { IconBook, IconLock } from "./StatusIcons";

// 방송에서 마인드맵은 통째로 하나 — 나눌 영역이 없어 키를 고정합니다.
const REGION_KEY = "map";

export default function MindmapBoard({
  activity,
  className = "",
  classId = null,
  user = null,
  roster = [],
  onBack,
}) {
  const [entries, setEntries] = useState([]);
  const [openUid, setOpenUid] = useState(null);

  useEffect(() => subscribeParatextEntries(activity.id, setEntries), [activity.id]);

  const bookUrl = safeBookUrl(activity.bookUrl);
  const cast = useEntryCast(classId, user);

  const cards = useMemo(() => {
    const byUid = new Map(entries.map((e) => [e.authorId, e]));
    const fromRoster = roster.map((s) => ({
      uid: s.uid,
      name: s.name,
      studentId: s.studentId,
      map: normalizeMindmap(byUid.get(s.uid)?.answers, activity.topic),
      hasEntry: byUid.has(s.uid),
    }));
    const seen = new Set(roster.map((s) => s.uid));
    const strays = entries
      .filter((e) => !seen.has(e.authorId))
      .map((e) => ({
        uid: e.authorId,
        name: e.authorName || "이름 미설정",
        studentId: null,
        map: normalizeMindmap(e.answers, activity.topic),
        hasEntry: true,
      }));
    return [...fromRoster, ...strays];
  }, [roster, entries, activity.topic]);

  // 처음 열면 첫 학생을 골라 둡니다 — 빈 오른쪽 판만 보이면 무엇을 해야 할지 모호합니다
  useEffect(() => {
    if (openUid === null && cards.length > 0) setOpenUid(cards[0].uid);
  }, [cards, openUid]);

  const open = openUid ? cards.find((c) => c.uid === openUid) ?? null : null;
  const startedCount = cards.filter((c) => mindmapStarted(c.map)).length;

  const castCard = cast.target ? cards.find((c) => c.uid === cast.target.uid) ?? null : null;

  const livePayload = useMemo(() => {
    if (!castCard) return null;
    return buildPayload(activity, castCard);
  }, [castCard, activity]);
  cast.useLiveUpdate(livePayload);

  function toggleCast(card) {
    cast.cast({ uid: card.uid, key: REGION_KEY }, buildPayload(activity, card));
  }

  const openLive = open ? cast.isCasting(open.uid, REGION_KEY) : false;

  return (
    <main className="books-main mindmap-board-main">
      <div className="books-head">
        <div className="books-head-main">
          <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
          <h1 className="book-group-title">
            {activity.title}
            <span className="book-group-topic">{activity.topic}</span>
            {className && <span className="book-group-class">{className}</span>}
          </h1>
          {bookUrl && (
            <a
              className="btn-primary book-info-btn"
              href={bookUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBook size={15} /> 도서 정보
            </a>
          )}
        </div>
        <span className="paratext-sum">
          시작 {startedCount}명 / 전체 {cards.length}명
        </span>
      </div>

      {cast.target && castCard && (
        <CastBar
          who={castCard.name}
          label="마인드맵"
          index={0}
          total={1}
          onPrev={null}
          onNext={null}
          onStop={cast.stop}
        />
      )}

      {activity.locked && (
        <p className="book-locked-note">
          <IconLock size={15} /> 지금은 잠겨 있어 학생이 고칠 수 없어요.
        </p>
      )}

      {cards.length === 0 ? (
        <p className="empty-note">
          아직 이 반에 들어온 학생이 없어요. 학생이 반에 들어오면 목록이 생깁니다.
        </p>
      ) : (
        <div className="mindmap-board-body">
          {/* ── 왼쪽: 학생 목록 ── */}
          <aside className="dash-side mindmap-student-side">
            <h3>학생 {cards.length}명</h3>
            <ul className="mindmap-student-list">
              {cards.map((c) => {
                const branches = branchCount(c.map);
                const casting = cast.target?.uid === c.uid;
                return (
                  <li key={c.uid}>
                    <button
                      type="button"
                      className={`mindmap-student-card${openUid === c.uid ? " on" : ""}${
                        mindmapStarted(c.map) ? " done" : ""
                      }${casting ? " casting" : ""}`}
                      onClick={() => setOpenUid(c.uid)}
                    >
                      <span className="paratext-student-head">
                        <strong>{c.name}</strong>
                        {c.studentId && (
                          <span className="paratext-student-no">{c.studentId}</span>
                        )}
                        {casting && <span className="broadcast-live-dot" aria-hidden="true" />}
                      </span>
                      <span className="paratext-student-meta">
                        {branches === 0
                          ? "아직 시작 전"
                          : `가지 ${branches}개 · ${maxDepth(c.map)}단계`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* ── 오른쪽: 고른 학생의 마인드맵 ── */}
          <section className="mindmap-view">
            {open ? (
              <>
                <header className="mindmap-view-head">
                  <span className="mindmap-view-who">
                    <strong>{open.name}</strong>
                    {open.studentId && (
                      <span className="paratext-student-no">{open.studentId}</span>
                    )}
                  </span>
                  <span className="mindmap-layout-tag">
                    {MINDMAP_LAYOUTS.find((l) => l.key === open.map.layout)?.ko}
                  </span>
                  <span className="mindmap-view-meta">
                    가지 {branchCount(open.map)}개 · {maxDepth(open.map)}단계
                  </span>
                  {cast.canCast && (
                    <button
                      type="button"
                      className={`btn-ghost dash-cast-btn${openLive ? " on" : ""}`}
                      onClick={() => toggleCast(open)}
                      title={
                        openLive
                          ? "학생 화면을 원래대로 되돌립니다"
                          : "이 마인드맵을 학급 전체 화면에 띄웁니다"
                      }
                    >
                      {openLive && <span className="broadcast-live-dot" aria-hidden="true" />}
                      {openLive ? "수업 종료" : "수업 시작"}
                    </button>
                  )}
                </header>
                {mindmapStarted(open.map) ? (
                  <MindmapCanvas map={open.map} fitKey={open.uid} className="mindmap-view-stage" />
                ) : (
                  <p className="empty-note">
                    {open.name} 학생은 아직 마인드맵을 시작하지 않았어요.
                  </p>
                )}
              </>
            ) : (
              <p className="empty-note">왼쪽에서 학생을 골라 주세요.</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

// 마인드맵 한 장을 방송 꾸러미로. 학생은 남의 기록을 직접 읽을 권한이 없어
// 그림을 그릴 재료(형태·노드)를 방송 문서에 실어 보냅니다.
function buildPayload(activity, card) {
  return {
    mode: "mindmap",
    activityTitle: activity.title ?? "",
    topic: activity.topic ?? "",
    writerName: card.name,
    layout: card.map.layout,
    nodes: card.map.nodes.map((n) => ({
      id: n.id,
      parentId: n.parentId,
      text: n.text,
      // Firestore는 undefined를 저장하지 못해 빈 자리는 null로 맞춥니다
      x: Number.isFinite(n.x) ? n.x : null,
      y: Number.isFinite(n.y) ? n.y : null,
    })),
  };
}
