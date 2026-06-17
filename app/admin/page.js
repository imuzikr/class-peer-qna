"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatTime,
  subscribeAnswers,
  subscribeKeywords,
  subscribeQuestions,
  toDate,
} from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { isAdmin } from "@/lib/user";
import { useCurrentUser } from "@/lib/useCurrentUser";
import TopNav from "@/components/TopNav";
import { getMeTooCount, isPinnedQuestion } from "@/lib/questionRanking";

const DAY_MS = 1000 * 60 * 60 * 24;

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function shortDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function collectStudent(map, item) {
  if (!item.authorId || item.authorId.startsWith("teacher_")) return;
  const current = map.get(item.authorId) ?? {
    id: item.authorId,
    name: item.authorName ?? "익명 학생",
    emoji: item.authorEmoji ?? "🙂",
    realName: item.authorRealName ?? "",
    asked: 0,
    answered: 0,
    meTooReceived: 0,
    lastActiveAt: null,
  };
  current.name = item.authorName ?? current.name;
  current.emoji = item.authorEmoji ?? current.emoji;
  current.realName = item.authorRealName ?? current.realName;
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

function buildDailyStats(student, questions, answerEvents) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getTime() - DAY_MS * (6 - index));
    return { date, label: shortDate(date), asked: 0, answered: 0 };
  });

  questions
    .filter((question) => question.authorId === student?.id)
    .forEach((question) => {
      const date = toDate(question.createdAt);
      const bucket = days.find((day) => sameDay(day.date, date));
      if (bucket) bucket.asked += 1;
    });

  answerEvents
    .filter((event) => event.answer.authorId === student?.id)
    .forEach((event) => {
      const date = toDate(event.answer.createdAt);
      const bucket = days.find((day) => sameDay(day.date, date));
      if (bucket) bucket.answered += 1;
    });

  return days;
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

function StatCard({ label, value, tone }) {
  return (
    <div className={`admin-stat ${tone ? `tone-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyPanel({ children }) {
  return <div className="admin-empty">{children}</div>;
}

export default function AdminDashboardPage() {
  const user = useCurrentUser();
  const [questions, setQuestions] = useState([]);
  const [keywordDocs, setKeywordDocs] = useState([]);
  const [answersByQuestion, setAnswersByQuestion] = useState({});
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const unsubQ = subscribeQuestions(setQuestions);
    const unsubK = subscribeKeywords(setKeywordDocs);
    return () => {
      unsubQ();
      unsubK();
    };
  }, []);

  useEffect(() => {
    setAnswersByQuestion({});
    const unsubs = questions.map((question) =>
      subscribeAnswers(question.id, (answers) => {
        setAnswersByQuestion((prev) => ({ ...prev, [question.id]: answers }));
      })
    );
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [questions]);

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

  useEffect(() => {
    if (!selectedId && students.length > 0) {
      setSelectedId(students[0].id);
    }
    if (selectedId && !students.some((student) => student.id === selectedId)) {
      setSelectedId(students[0]?.id ?? null);
    }
  }, [selectedId, students]);

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
  const dailyStats = buildDailyStats(selected, questions, answerEvents);
  const events = recentEvents(selected, questions, answerEvents);
  const maxKeyword = Math.max(1, ...keywordStats.map((item) => item.count));
  const maxDaily = Math.max(1, ...dailyStats.map((day) => day.asked + day.answered));
  const totalActivity = selectedQuestions.length + selectedAnswers.length;
  const askRatio = totalActivity === 0 ? 0 : Math.round((selectedQuestions.length / totalActivity) * 100);
  const answerRatio = 100 - askRatio;

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

      <div className="admin-layout">
        <aside className="student-panel">
          <div className="admin-panel-head">
            <h2>학생 목록</h2>
            <span>{students.length}명</span>
          </div>

          {students.length === 0 ? (
            <EmptyPanel>활동 데이터가 없습니다.</EmptyPanel>
          ) : (
            <div className="student-list">
              {students.map((student) => (
                <button
                  key={student.id}
                  className={`student-row ${student.id === selectedId ? "active" : ""}`}
                  onClick={() => setSelectedId(student.id)}
                >
                  <span className="avatar avatar-sm">{student.emoji}</span>
                  <span className="student-main">
                    <strong>{student.name}</strong>
                    <small>{student.realName || "실명 미등록"}</small>
                  </span>
                  <span className="student-count">{student.asked + student.answered}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="admin-main">
          {user && !isAdmin(user) && (
            <div className="admin-warning">
              관리자 보기로 전환하면 실명과 학습 활동 분석을 확인할 수 있습니다.
            </div>
          )}

          {selected ? (
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

              <section className="admin-stats-grid">
                <StatCard label="올린 질문" value={selectedQuestions.length} tone="ask" />
                <StatCard label="작성 답변" value={selectedAnswers.length} tone="answer" />
                <StatCard label="해결 질문" value={resolvedQuestions} tone="done" />
                <StatCard label="받은 궁금해요" value={totalMeToo} tone="metoo" />
                <StatCard label="상단 고정 질문" value={pinnedQuestions} tone="pin" />
              </section>

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

                <div className="admin-chart-panel">
                  <div className="admin-panel-head">
                    <h2>최근 7일 활동</h2>
                    <span>{totalActivity}건</span>
                  </div>
                  <div className="daily-chart">
                    {dailyStats.map((day) => {
                      const total = day.asked + day.answered;
                      return (
                        <div className="daily-bar" key={day.label}>
                          <div className="daily-stack" title={`${day.label} ${total}건`}>
                            <span
                              className="daily-answer"
                              style={{ height: `${(day.answered / maxDaily) * 100}%` }}
                            />
                            <span
                              className="daily-ask"
                              style={{ height: `${(day.asked / maxDaily) * 100}%` }}
                            />
                          </div>
                          <small>{day.label}</small>
                        </div>
                      );
                    })}
                  </div>
                  <div className="chart-legend">
                    <span><i className="legend-ask" />질문</span>
                    <span><i className="legend-answer" />답변</span>
                  </div>
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
              </section>

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
            </>
          ) : (
            <EmptyPanel>학생을 선택하면 활동 분석이 표시됩니다.</EmptyPanel>
          )}
        </main>
      </div>
    </div>
  );
}
