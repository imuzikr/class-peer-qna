"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  formatTime,
  subscribeAnswers,
  subscribeKeywords,
  subscribeQuestions,
  subscribeUserKwl,
  subscribeClasses,
  subscribeStudyBoards,
  subscribeStudyCards,
  subscribeKwlAll,
  toDate,
} from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { isAdmin } from "@/lib/user";
import { useCurrentUser } from "@/lib/useCurrentUser";
import TopNav from "@/components/TopNav";
import { getMeTooCount, isPinnedQuestion } from "@/lib/questionRanking";
import StudentEditModal from "@/components/StudentEditModal";
import ActivityHeatmap from "@/components/ActivityHeatmap";
import StudentKwlPanel from "@/components/StudentKwlPanel";
import ClassOverview from "@/components/ClassOverview";
import StudyRoomStats from "@/components/StudyRoomStats";

const DAY_MS = 1000 * 60 * 60 * 24;

function collectStudent(map, item) {
  if (!item.authorId || item.authorId.startsWith("teacher_")) return;
  const current = map.get(item.authorId) ?? {
    id: item.authorId,
    name: item.authorName ?? "익명 학생",
    emoji: item.authorEmoji ?? "🙂",
    realName: item.authorRealName ?? "",
    email: item.authorEmail ?? "",
    asked: 0,
    answered: 0,
    meTooReceived: 0,
    lastActiveAt: null,
  };
  current.name = item.authorName ?? current.name;
  current.emoji = item.authorEmoji ?? current.emoji;
  current.realName = item.authorRealName ?? current.realName;
  if (item.authorEmail) current.email = item.authorEmail;
  map.set(item.authorId, current);
  return current;
}

function buildStudentRows(questions, answerEvents) {
  const students = new Map();

  questions.forEach((question) => {
    const row = collectStudent(students, question);
    if (!row) return;
    row.asked += 1;
    row.meTooReceived += getMeTooCount(question);
    const createdAt = toDate(question.createdAt);
    if (!row.lastActiveAt || createdAt > row.lastActiveAt) {
      row.lastActiveAt = createdAt;
    }
  });

  answerEvents.forEach((event) => {
    const row = collectStudent(students, event.answer);
    if (!row) return;
    row.answered += 1;
    const createdAt = toDate(event.answer.createdAt);
    if (!row.lastActiveAt || createdAt > row.lastActiveAt) {
      row.lastActiveAt = createdAt;
    }
  });

  return [...students.values()].sort((a, b) => {
    const activityDiff = b.asked + b.answered - (a.asked + a.answered);
    return activityDiff || (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0);
  });
}

function buildKeywordStats(student, questions, answerEvents, keywordNames) {
  const counts = new Map(keywordNames.map((name) => [name, 0]));

  questions
    .filter((question) => question.authorId === student?.id)
    .forEach((question) => {
      counts.set(question.keyword, (counts.get(question.keyword) ?? 0) + 1);
    });

  answerEvents
    .filter((event) => event.answer.authorId === student?.id)
    .forEach((event) => {
      counts.set(event.question.keyword, (counts.get(event.question.keyword) ?? 0) + 1);
    });

  return [...counts.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword, "ko"));
}


function recentEvents(student, questions, answerEvents) {
  const asked = questions
    .filter((question) => question.authorId === student?.id)
    .map((question) => ({
      id: `q-${question.id}`,
      type: "질문",
      title: question.title,
      keyword: question.keyword,
      createdAt: question.createdAt,
    }));

  const answered = answerEvents
    .filter((event) => event.answer.authorId === student?.id)
    .map((event) => ({
      id: `a-${event.question.id}-${event.answer.id}`,
      type: "답변",
      title: event.question.title,
      keyword: event.question.keyword,
      createdAt: event.answer.createdAt,
    }));

  return [...asked, ...answered]
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
    .slice(0, 6);
}

const STAT_LABELS = {
  ask: "올린 질문",
  answer: "작성 답변",
  resolved: "해결 질문",
  metoo: "받은 궁금해요",
  pin: "상단 고정 질문",
};

const STAT_EMPTY = {
  ask: "올린 질문이 없습니다.",
  answer: "작성한 답변이 없습니다.",
  resolved: "해결된 질문이 없습니다.",
  metoo: "궁금해요를 받은 질문이 없습니다.",
  pin: "상단 고정된 질문이 없습니다.",
};

// 통계 카드 드릴다운 — 선택한 학생의 질문/답변을 카드 종류별로 펼칩니다.
function buildStatDetailItems(activeStatKey, questions, answerEvents) {
  switch (activeStatKey) {
    case "ask":
      return questions.map((q) => ({
        key: q.id,
        questionId: q.id,
        keyword: q.keyword,
        title: q.title,
        badge: q.resolved ? "✅ 해결됨" : "🙋 미해결",
        time: q.createdAt,
      }));
    case "answer": {
      const seen = new Set();
      return answerEvents
        .filter((e) => {
          if (seen.has(e.question.id)) return false;
          seen.add(e.question.id);
          return true;
        })
        .map((e) => ({
          key: `a-${e.question.id}`,
          questionId: e.question.id,
          keyword: e.question.keyword,
          title: e.question.title,
          badge: null,
          time: e.answer.createdAt,
        }));
    }
    case "resolved":
      return questions
        .filter((q) => q.resolved)
        .map((q) => ({
          key: q.id,
          questionId: q.id,
          keyword: q.keyword,
          title: q.title,
          badge: null,
          time: q.createdAt,
        }));
    case "metoo":
      return questions
        .filter((q) => getMeTooCount(q) > 0)
        .sort((a, b) => getMeTooCount(b) - getMeTooCount(a))
        .map((q) => ({
          key: q.id,
          questionId: q.id,
          keyword: q.keyword,
          title: q.title,
          badge: `🙋 ${getMeTooCount(q)}`,
          time: q.createdAt,
        }));
    case "pin":
      return questions.filter(isPinnedQuestion).map((q) => ({
        key: q.id,
        questionId: q.id,
        keyword: q.keyword,
        title: q.title,
        badge: "📌 고정",
        time: q.createdAt,
      }));
    default:
      return [];
  }
}

function StatCard({ label, value, tone, isActive, onClick }) {
  return (
    <button
      type="button"
      className={`admin-stat${tone ? ` tone-${tone}` : ""}${isActive ? " is-active" : ""}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function EmptyPanel({ children }) {
  return <div className="admin-empty">{children}</div>;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [questions, setQuestions] = useState([]);
  const [keywordDocs, setKeywordDocs] = useState([]);
  const [answersByQuestion, setAnswersByQuestion] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [pendingOpen, setPendingOpen] = useState(true);
  const [editingStudent, setEditingStudent] = useState(null);
  const [activeStatKey, setActiveStatKey] = useState(null); // 통계 카드 드릴다운
  const [selectedKwl, setSelectedKwl] = useState([]); // 선택 학생 KWL 기록
  const [view, setView] = useState("students"); // 'students' | 'overview'
  const [selectedClassId, setSelectedClassId] = useState(null); // null = 전체 학급
  const [classes, setClasses] = useState([]);
  const [studyBoards, setStudyBoards] = useState([]);
  const [cardsByBoard, setCardsByBoard] = useState({});
  const [allKwl, setAllKwl] = useState([]);

  // 관리자 대시보드는 관리자 전용 — 학생 보기로 바뀌면 학습 리포트로 이동
  const isStudent = user ? !isAdmin(user) : false;
  useEffect(() => {
    if (isStudent) router.replace("/report");
  }, [isStudent, router]);

  useEffect(() => {
    const unsubQ = subscribeQuestions(setQuestions);
    const unsubK = subscribeKeywords(setKeywordDocs);
    const unsubC = subscribeClasses(setClasses);
    const unsubB = subscribeStudyBoards(setStudyBoards);
    const unsubKwl = subscribeKwlAll(setAllKwl);
    return () => {
      unsubQ();
      unsubK();
      unsubC();
      unsubB();
      unsubKwl();
    };
  }, []);

  // 공부방 보드별 카드 구독 — 보드 id 집합이 바뀔 때만 재연결 (공부방별 통계용)
  const boardIdsKey = useMemo(
    () => [...new Set(studyBoards.map((b) => b.id))].sort().join(","),
    [studyBoards]
  );
  useEffect(() => {
    if (!boardIdsKey) {
      setCardsByBoard({});
      return;
    }
    const ids = boardIdsKey.split(",");
    const unsubs = ids.map((id) =>
      subscribeStudyCards(id, (cards) =>
        setCardsByBoard((prev) => ({ ...prev, [id]: cards }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [boardIdsKey]);

  // 답변 구독은 "질문 id 집합"이 바뀔 때만 다시 연결합니다.
  // (questions 배열은 좋아요/해결 등으로 매번 새 참조가 되므로 그대로
  //  의존성에 쓰면 모든 답변 리스너가 매 업데이트마다 재구독되어 느려집니다.)
  const questionIdsKey = useMemo(
    () => [...new Set(questions.map((q) => q.id))].sort().join(","),
    [questions]
  );
  useEffect(() => {
    if (!questionIdsKey) {
      setAnswersByQuestion({});
      return;
    }
    const ids = questionIdsKey.split(",");
    const unsubs = ids.map((id) =>
      subscribeAnswers(id, (answers) => {
        setAnswersByQuestion((prev) => ({ ...prev, [id]: answers }));
      })
    );
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [questionIdsKey]);

  const keywordNames = useMemo(
    () => keywordDocs.map((keyword) => keyword.name),
    [keywordDocs]
  );

  const answerEvents = useMemo(
    () =>
      questions.flatMap((question) =>
        (answersByQuestion[question.id] ?? []).map((answer) => ({
          question,
          answer,
        }))
      ),
    [answersByQuestion, questions]
  );

  const students = useMemo(
    () => buildStudentRows(questions, answerEvents),
    [answerEvents, questions]
  );

  const allPendingReflections = useMemo(
    () => questions.filter(
      (q) => q.reflectionPending && q.authorId && !q.authorId.startsWith("teacher_")
    ),
    [questions]
  );

  // 학급 전체 통계 — 선택한 반(selectedClassId)의 참여 학생 집합.
  // 질문은 반 구분이 없으므로, "그 반의 공부방/KWL에 참여한 학생"을 반의
  // 명부로 보고 그들의 (전역) 질문·답변을 집계합니다. null = 전체 학급.
  const classParticipantIds = useMemo(() => {
    if (!selectedClassId) return null;
    const ids = new Set();
    studyBoards
      .filter((b) => b.classId === selectedClassId && b.type !== "notice")
      .forEach((b) =>
        (cardsByBoard[b.id] ?? []).forEach((c) => {
          if (c.authorId && !c.authorId.startsWith("teacher_")) ids.add(c.authorId);
        })
      );
    allKwl
      .filter((e) => e.classId === selectedClassId)
      .forEach((e) => {
        if (e.userId && !String(e.userId).startsWith("teacher_")) ids.add(e.userId);
      });
    return ids;
  }, [selectedClassId, studyBoards, cardsByBoard, allKwl]);

  const overviewStudents = classParticipantIds
    ? students.filter((s) => classParticipantIds.has(s.id))
    : students;
  const overviewQuestions = classParticipantIds
    ? questions.filter((q) => classParticipantIds.has(q.authorId))
    : questions;
  const overviewAnswerEvents = classParticipantIds
    ? answerEvents.filter((e) => classParticipantIds.has(e.answer.authorId))
    : answerEvents;

  useEffect(() => {
    if (!selectedId && students.length > 0) {
      setSelectedId(students[0].id);
    }
    if (selectedId && !students.some((student) => student.id === selectedId)) {
      setSelectedId(students[0]?.id ?? null);
    }
  }, [selectedId, students]);

  // 선택한 학생의 KWL 기록 구독 (반 무관)
  useEffect(() => {
    if (!selectedId) {
      setSelectedKwl([]);
      return;
    }
    return subscribeUserKwl(selectedId, setSelectedKwl);
  }, [selectedId]);

  const selected = students.find((student) => student.id === selectedId) ?? null;
  const selectedQuestions = questions.filter((question) => question.authorId === selected?.id);
  const selectedAnswers = answerEvents.filter((event) => event.answer.authorId === selected?.id);
  const resolvedQuestions = selectedQuestions.filter((question) => question.resolved).length;
  const pinnedQuestions = selectedQuestions.filter(isPinnedQuestion).length;
  const totalMeToo = selectedQuestions.reduce(
    (sum, question) => sum + getMeTooCount(question),
    0
  );
  const keywordStats = buildKeywordStats(selected, questions, answerEvents, keywordNames);
  const events = recentEvents(selected, questions, answerEvents);
  const maxKeyword = Math.max(1, ...keywordStats.map((item) => item.count));
  const totalActivity = selectedQuestions.length + selectedAnswers.length;
  const askRatio = totalActivity === 0 ? 0 : Math.round((selectedQuestions.length / totalActivity) * 100);
  const answerRatio = 100 - askRatio;

  const withReflection = selectedQuestions.filter((q) => q.reflection).length;
  const reflectionRate = selectedQuestions.length === 0 ? 0 : Math.round((withReflection / selectedQuestions.length) * 100);
  const resolveRate = selectedQuestions.length === 0 ? 0 : Math.round((resolvedQuestions / selectedQuestions.length) * 100);
  const statDetailItems = buildStatDetailItems(activeStatKey, selectedQuestions, selectedAnswers);

  const maxAsked = Math.max(1, ...students.map((s) => s.asked));
  const maxAnswered = Math.max(1, ...students.map((s) => s.answered));
  const maxMeToo = Math.max(1, ...students.map((s) => s.meTooReceived));
  const overviewValues = selected ? [
    Math.min(selectedQuestions.length / maxAsked, 1),
    Math.min(selectedAnswers.length / maxAnswered, 1),
    resolveRate / 100,
    reflectionRate / 100,
    Math.min(totalMeToo / maxMeToo, 1),
  ] : null;

  // 학생 보기로 전환된 경우 대시보드를 그리지 않고 이동 대기 화면을 보여줍니다
  if (isStudent) {
    return (
      <div className="admin-shell">
        <TopNav active="admin" />
        <p className="empty-note">학습 리포트로 이동 중…</p>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      {!isFirebaseConfigured && (
        <div className="demo-banner">
          ⚠️ 데모 모드 — Firebase 설정 전이라 데이터가 브라우저에만 임시
          저장됩니다 (새로고침 시 초기화). <code>lib/firebase.js</code>에
          설정값을 입력하면 Firestore에 저장됩니다.
        </div>
      )}

      <TopNav active="admin" />

      {allPendingReflections.length > 0 && (
        <div className="pending-section pending-global">
          <button
            type="button"
            className={`reflection-toggle ${pendingOpen ? "open" : ""}`}
            onClick={() => setPendingOpen((v) => !v)}
          >
            <h2>📝 인사이트 미완료</h2>
            <span className="reflection-count">{allPendingReflections.length}건</span>
            <span className="reflection-chevron" aria-hidden="true">▾</span>
          </button>
          {pendingOpen && (
            <div className="stat-detail-list">
              {allPendingReflections.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className="stat-detail-item"
                  onClick={() => router.push(`/board?open=${q.id}`)}
                >
                  <span className="student-mini">{q.authorEmoji || "🙂"} {q.authorName || "익명"} · #{q.keyword}</span>
                  <span className="stat-detail-title">{q.title}</span>
                  <span />
                  <time>{formatTime(q.createdAt)}</time>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="admin-layout">
        <aside className="student-panel">
          {view === "overview" ? (
            <>
              <div className="admin-panel-head">
                <h2>학급 목록</h2>
                <span>{classes.length}개 반</span>
              </div>
              <div className="student-list">
                <button
                  type="button"
                  className={`class-row ${selectedClassId === null ? "active" : ""}`}
                  onClick={() => setSelectedClassId(null)}
                >
                  <span className="class-row-icon">🏫</span>
                  <span className="student-main"><strong>전체 학급</strong></span>
                </button>
                {classes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`class-row ${selectedClassId === c.id ? "active" : ""}`}
                    onClick={() => setSelectedClassId(c.id)}
                  >
                    <span className="class-row-icon">📚</span>
                    <span className="student-main"><strong>{c.name}</strong></span>
                  </button>
                ))}
              </div>
            </>
          ) : (
          <>
          <div className="admin-panel-head">
            <h2>학생 목록</h2>
            <span>{students.length}명</span>
          </div>

          {students.length === 0 ? (
            <EmptyPanel>활동 데이터가 없습니다.</EmptyPanel>
          ) : (
            <div className="student-list">
              {students.map((student) => (
                <div
                  key={student.id}
                  className={`student-row ${student.id === selectedId ? "active" : ""}`}
                >
                  <button
                    type="button"
                    className="student-row-main"
                    onClick={() => {
                      setSelectedId(student.id);
                      setActiveStatKey(null);
                    }}
                  >
                    <span className="avatar avatar-sm">{student.emoji}</span>
                    <span className="student-main">
                      <strong>{student.realName || student.name}</strong>
                      <small>{student.realName ? student.name : "실명 미등록"}</small>
                    </span>
                    <span className="student-count">{student.asked + student.answered}</span>
                  </button>
                  <button
                    type="button"
                    className="student-more-btn"
                    onClick={() => setEditingStudent(student)}
                    title="프로필 편집"
                    aria-label={`${student.name} 프로필 편집`}
                  >
                    ···
                  </button>
                </div>
              ))}
            </div>
          )}
          </>
          )}
        </aside>

        <main className="admin-main">
          {students.length > 0 && (
            <div className="admin-view-tabs">
              <button
                type="button"
                className={`admin-view-tab ${view === "students" ? "active" : ""}`}
                onClick={() => setView("students")}
              >
                학생별 분석
              </button>
              <button
                type="button"
                className={`admin-view-tab ${view === "overview" ? "active" : ""}`}
                onClick={() => setView("overview")}
              >
                학급 전체 통계
              </button>
            </div>
          )}
          {view === "overview" ? (
            <>
              <ClassOverview
                questions={overviewQuestions}
                answerEvents={overviewAnswerEvents}
                students={overviewStudents}
                onOpenQuestion={(id) => router.push(`/board?open=${id}`)}
              />
              <StudyRoomStats
                classes={classes}
                boards={studyBoards}
                cardsByBoard={cardsByBoard}
                kwl={allKwl}
                classId={selectedClassId}
              />
            </>
          ) : selected ? (
            <>
              <section className="admin-hero">
                <div>
                  <div className="admin-student-title">
                    <span className="avatar">{selected.emoji}</span>
                    <div>
                      <h1>{selected.name}</h1>
                      <p>{selected.realName || "실명 미등록"} · 최근 활동 {formatTime(selected.lastActiveAt)}</p>
                    </div>
                  </div>
                </div>
                <div className="admin-health">
                  <span>질문 비율</span>
                  <strong>{askRatio}%</strong>
                </div>
              </section>

              <ActivityHeatmap questions={selectedQuestions} answerEvents={selectedAnswers} overviewValues={overviewValues} />

              <section className="admin-charts">
                <div className="admin-chart-panel">
                  <div className="admin-panel-head">
                    <h2>키워드 분포</h2>
                    <span>{keywordStats.length}개 과목</span>
                  </div>
                  {keywordStats.length === 0 ? (
                    <EmptyPanel>키워드 활동이 없습니다.</EmptyPanel>
                  ) : (
                    <div className="keyword-bars">
                      {keywordStats.map((item) => (
                        <div className="bar-row" key={item.keyword}>
                          <span>{item.keyword}</span>
                          <div className="bar-track">
                            <div
                              className="bar-fill"
                              style={{ width: `${(item.count / maxKeyword) * 100}%` }}
                            />
                          </div>
                          <strong>{item.count}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="admin-chart-panel compact">
                  <div className="admin-panel-head">
                    <h2>참여 균형</h2>
                    <span>{answerRatio}% 답변</span>
                  </div>
                  <div
                    className="donut"
                    style={{
                      background: `conic-gradient(var(--primary) 0 ${askRatio}%, #5c9e68 ${askRatio}% 100%)`,
                    }}
                  >
                    <span>{totalActivity}</span>
                  </div>
                  <div className="chart-legend centered">
                    <span><i className="legend-ask" />질문 {selectedQuestions.length}</span>
                    <span><i className="legend-answer" />답변 {selectedAnswers.length}</span>
                  </div>
                </div>

                <div className="admin-chart-panel compact">
                  <div className="admin-panel-head">
                    <h2>인사이트 완성률</h2>
                    <span>{reflectionRate}% 완성</span>
                  </div>
                  {selectedQuestions.length === 0 ? (
                    <EmptyPanel>질문 없음</EmptyPanel>
                  ) : (
                    <>
                      <div
                        className="donut"
                        style={{
                          background: `conic-gradient(#5c9e68 0 ${reflectionRate}%, #e8e5dd ${reflectionRate}% 100%)`,
                        }}
                      >
                        <span>{withReflection}</span>
                      </div>
                      <div className="chart-legend centered">
                        <span><i className="legend-answer" />작성 {withReflection}</span>
                        <span><i className="legend-neutral" />미작성 {selectedQuestions.length - withReflection}</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="admin-chart-panel compact">
                  <div className="admin-panel-head">
                    <h2>질문 해결 현황</h2>
                    <span>{resolveRate}% 해결</span>
                  </div>
                  {selectedQuestions.length === 0 ? (
                    <EmptyPanel>질문 없음</EmptyPanel>
                  ) : (
                    <>
                      <div
                        className="donut"
                        style={{
                          background: `conic-gradient(#5c9e68 0 ${resolveRate}%, var(--primary) ${resolveRate}% 100%)`,
                        }}
                      >
                        <span>{resolvedQuestions}</span>
                      </div>
                      <div className="chart-legend centered">
                        <span><i className="legend-answer" />해결 {resolvedQuestions}</span>
                        <span><i className="legend-ask" />미해결 {selectedQuestions.length - resolvedQuestions}</span>
                      </div>
                    </>
                  )}
                </div>
              </section>

              <section className="admin-stats-grid">
                {[
                  { key: "ask", label: "올린 질문", value: selectedQuestions.length, tone: "ask" },
                  { key: "answer", label: "작성 답변", value: selectedAnswers.length, tone: "answer" },
                  { key: "resolved", label: "해결 질문", value: resolvedQuestions, tone: "done" },
                  { key: "metoo", label: "받은 궁금해요", value: totalMeToo, tone: "metoo" },
                  { key: "pin", label: "상단 고정 질문", value: pinnedQuestions, tone: "pin" },
                ].map(({ key, label, value, tone }) => (
                  <StatCard
                    key={key}
                    label={label}
                    value={value}
                    tone={tone}
                    isActive={activeStatKey === key}
                    onClick={() => setActiveStatKey((k) => (k === key ? null : key))}
                  />
                ))}
              </section>

              {activeStatKey && (
                <section className="stat-detail">
                  <div className="stat-detail-head">
                    <h3>{STAT_LABELS[activeStatKey]}</h3>
                    <span className="stat-detail-count">{statDetailItems.length}건</span>
                  </div>
                  {statDetailItems.length === 0 ? (
                    <EmptyPanel>{STAT_EMPTY[activeStatKey]}</EmptyPanel>
                  ) : (
                    <div className="stat-detail-list">
                      {statDetailItems.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className="stat-detail-item"
                          onClick={() => router.push(`/board?open=${item.questionId}`)}
                        >
                          <span className="keyword-chip"># {item.keyword}</span>
                          <span className="stat-detail-title">{item.title}</span>
                          {item.badge && (
                            <span className="stat-detail-badge">{item.badge}</span>
                          )}
                          <time>{formatTime(item.time)}</time>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <section className="admin-activity-panel">
                <div className="admin-panel-head">
                  <h2>최근 활동</h2>
                  <span>{events.length}건</span>
                </div>
                {events.length === 0 ? (
                  <EmptyPanel>최근 활동이 없습니다.</EmptyPanel>
                ) : (
                  <div className="activity-list">
                    {events.map((event) => (
                      <div className="activity-row" key={event.id}>
                        <span className={`activity-type ${event.type === "질문" ? "ask" : "answer"}`}>
                          {event.type}
                        </span>
                        <strong>{event.title}</strong>
                        <span>#{event.keyword}</span>
                        <time>{formatTime(event.createdAt)}</time>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <StudentKwlPanel entries={selectedKwl} />
            </>
          ) : (
            <EmptyPanel>학생을 선택하면 활동 분석이 표시됩니다.</EmptyPanel>
          )}
        </main>
      </div>

      {editingStudent && (
        <StudentEditModal
          student={editingStudent}
          onClose={() => setEditingStudent(null)}
        />
      )}
    </div>
  );
}
