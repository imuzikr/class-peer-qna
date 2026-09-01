"use client";

// =============================================================
// 학급 전체 통계 (교사용) — 질문 게시판 전반의 활동을 한눈에.
// 질문/답변은 반 구분이 없어 학급 전체 합계로 집계합니다.
// =============================================================
import { getMeTooCount } from "@/lib/questionRanking";

function EmptyPanel({ children }) {
  return <div className="admin-empty">{children}</div>;
}

export default function ClassOverview({
  questions = [],
  answerEvents = [],
  students = [],
  fruitTotal = 0,
  classFruitStats = null, // 전체 학급일 때만: [{ classId, name, total }]
  onOpenQuestion,
}) {
  const totalQuestions = questions.length;
  const unresolved = questions.filter((q) => !q.resolved).length;
  const totalAnswers = answerEvents.length;
  const participants = students.length;
  const maxFruit = Math.max(1, ...(classFruitStats ?? []).map((c) => c.total));

  // 궁금해요 많은 질문 Top 5
  const topMeToo = questions
    .map((q) => ({ q, count: getMeTooCount(q) }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 키워드별 질문 분포
  const kwCount = new Map();
  questions.forEach((q) => {
    if (q.keyword) kwCount.set(q.keyword, (kwCount.get(q.keyword) ?? 0) + 1);
  });
  const keywordStats = [...kwCount.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count);
  const maxKw = Math.max(1, ...keywordStats.map((k) => k.count));

  return (
    <>
      {/* 요약 카드 — 멋진 순간을 맨 앞에 배치 */}
      <section className="admin-stats-grid">
        {/* 멋진 순간 — 전체 학급이면 학급별 비교 막대, 특정 반이면 합계 숫자 */}
        {classFruitStats && classFruitStats.length > 0 ? (
          <div className="admin-stat tone-moments stat-fruit-chart">
            <span>🍎 멋진 순간</span>
            <div className="stat-fruit-bars">
              {classFruitStats.map((c) => (
                <div className="stat-fruit-row" key={c.classId}>
                  <span className="stat-fruit-name" title={c.name}>{c.name}</span>
                  <div className="bar-track">
                    {c.total > 0 && (
                      <div
                        className="bar-fill bar-fill-fruit"
                        style={{ width: `${(c.total / maxFruit) * 100}%` }}
                      />
                    )}
                  </div>
                  <strong className="stat-fruit-num">{c.total}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="admin-stat tone-moments"><span>🍎 멋진 순간</span><strong>{fruitTotal}</strong></div>
        )}

        <div className="admin-stat tone-ask"><span>전체 질문</span><strong>{totalQuestions}</strong></div>
        <div className="admin-stat tone-metoo"><span>미해결 질문</span><strong>{unresolved}</strong></div>
        <div className="admin-stat tone-answer"><span>전체 답변</span><strong>{totalAnswers}</strong></div>
        <div className="admin-stat tone-done"><span>참여 학생</span><strong>{participants}</strong></div>
      </section>

      {/* 예전에는 여기에 '학생별 활동' 표가 있었습니다 — 반 인원을 한 줄씩
          모두 늘어놓아(135명) 화면이 그 표 하나로 덮였고, 정작 훑어야 할
          키워드 분포와 궁금해요 순위가 한참 아래로 밀렸습니다. 학생 한 명의
          활동은 히트맵에서 학생을 고르면 그대로 볼 수 있습니다. */}
      <section className="admin-charts overview-charts">
        {/* 키워드별 질문 분포 */}
        <div className="admin-chart-panel">
          <div className="admin-panel-head">
            <h2>키워드별 질문</h2>
            <span>{keywordStats.length}개</span>
          </div>
          {keywordStats.length === 0 ? (
            <EmptyPanel>질문이 없습니다.</EmptyPanel>
          ) : (
            <div className="keyword-bars">
              {keywordStats.map((it) => (
                <div className="bar-row" key={it.keyword}>
                  <span>{it.keyword}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(it.count / maxKw) * 100}%` }} />
                  </div>
                  <strong>{it.count}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 궁금해요 많은 질문 */}
      <section className="admin-activity-panel">
        <div className="admin-panel-head">
          <h2>🙋 궁금해요 많은 질문</h2>
          <span>Top {topMeToo.length}</span>
        </div>
        {topMeToo.length === 0 ? (
          <EmptyPanel>아직 궁금해요를 받은 질문이 없습니다.</EmptyPanel>
        ) : (
          <div className="stat-detail-list">
            {topMeToo.map(({ q, count }) => (
              <button
                key={q.id}
                type="button"
                className="stat-detail-item"
                onClick={() => onOpenQuestion?.(q.id)}
              >
                <span className="keyword-chip"># {q.keyword}</span>
                <span className="stat-detail-title">{q.title}</span>
                {!q.resolved && <span className="ov-unresolved">미해결</span>}
                <span className="stat-detail-badge">🙋 {count}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
