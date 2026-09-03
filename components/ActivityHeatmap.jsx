"use client";

// =============================================================
// 학습 활동 잔디 — 52주 히트맵
// -------------------------------------------------------------
// [무엇을 세는가]
// 예전에는 질문·답변 **건수**를 그대로 셌습니다. 활동이 늘면서 이 방식이
// 무너졌습니다 — 활동마다 '한 건'의 무게가 너무 다릅니다. 한 번에 여러 건이
// 나오는 활동을 한 날이 성실히 참여한 여러 날보다 진해집니다.
//
// 그래서 세는 단위를 바꿨습니다. **그날 몇 갈래로 참여했나**를 셉니다.
//   질문 1건 = 1 (하루 최대 2)   답변 1건 = 1 (하루 최대 2)
//   KWLS  읽기 전(K·W) 1 + 읽은 뒤(L·S) 1        네 칸을 다 채우면 +1
//   수업 노트 한 장 = 1                          세 칸을 다 채우면 +1
// 색의 뜻이 '얼마나 많이 썼나'에서 '무엇을 얼마나 골고루 했나'로 바뀝니다.
// 그래서 범례도 '적음–많음'이 아니라 '한 가지–여러 가지'입니다.
//
// **끝까지 마친 것에만 +1**을 줍니다. 개수를 더 세는 대신 마무리에 색을 주면
// '많이 쓴 사람'이 아니라 '끝낸 사람'이 짙어집니다.
//
// [책방 활동은 넣지 않습니다]
// 가짓수는 많지만 수시로 되풀이하는 활동이 아니라, 넣으면 그 활동을 한 날만
// 도드라지고 나머지 날의 차이가 묻힙니다. 읽기 비용도 그렇습니다 — 여기 드는
// 넷은 리포트가 **이미 받아 둔 것**이라 새로 읽는 문서가 하나도 없습니다.
// =============================================================
import { toDate } from "@/lib/store";
import { stripHtml } from "@/lib/html";
import { KWLS_COLUMNS, kwlsAnswersFromEntry } from "@/lib/kwls";
import ActivityOverview from "./ActivityOverview";

const WEEKS = 52;
const LEVEL_COLORS = ["#ebe9e2", "#c8e6ca", "#8ec892", "#5c9e68", "#3a7a48"];
const FUTURE_COLOR = "#f5f4ef";
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTH_NAMES = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

// 한 갈래가 하루에 가져갈 수 있는 최대치. 질문을 열 개 한 날이 열흘치보다
// 진해지지 않게 하는 뚜껑입니다.
const PER_KIND_CAP = 2;

const BEFORE_KEYS = KWLS_COLUMNS.filter((c) => c.phase === "before").map((c) => c.key);
const AFTER_KEYS = KWLS_COLUMNS.filter((c) => c.phase === "after").map((c) => c.key);
const ALL_KWLS_KEYS = KWLS_COLUMNS.map((c) => c.key);

function getLevel(score) {
  if (!score) return 0;
  if (score === 1) return 1;
  if (score === 2) return 2;
  if (score <= 4) return 3;
  return 4;
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// 'YYYY-MM-DD'(KWLS·수업 노트가 쓰는 형식) → 같은 열쇠.
// 로컬 자정 기준으로 읽습니다 — UTC로 읽으면 한국에서 하루가 밀립니다.
function dayKeyFromDateStr(str) {
  const d = new Date(`${String(str ?? "")}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : dayKey(d);
}

function bump(map, key, field, by = 1) {
  if (!key) return;
  const slot = (map[key] ??= { q: 0, a: 0, kwl: [], notes: [] });
  if (Array.isArray(slot[field])) return;
  slot[field] += by;
}

// 하루치를 점수와 '무엇을 했는지'로 바꿉니다. 툴팁에 그대로 씁니다 —
// 색만으로는 왜 진한지 알 수 없어서, 칸을 짚으면 갈래가 보여야 합니다.
function scoreDay(slot) {
  if (!slot) return { score: 0, parts: [] };
  const parts = [];
  let score = 0;

  if (slot.q > 0) {
    score += Math.min(slot.q, PER_KIND_CAP);
    parts.push(`질문 ${slot.q}`);
  }
  if (slot.a > 0) {
    score += Math.min(slot.a, PER_KIND_CAP);
    parts.push(`답변 ${slot.a}`);
  }

  if (slot.kwl.length > 0) {
    const filled = new Set();
    slot.kwl.forEach((e) => {
      const answers = kwlsAnswersFromEntry(e);
      ALL_KWLS_KEYS.forEach((k) => {
        if (String(answers[k] ?? "").trim()) filled.add(k);
      });
    });
    const before = BEFORE_KEYS.some((k) => filled.has(k));
    const after = AFTER_KEYS.some((k) => filled.has(k));
    const done = ALL_KWLS_KEYS.every((k) => filled.has(k));
    if (before) score += 1;
    if (after) score += 1;
    if (done) score += 1; // 네 칸을 다 채운 날
    if (before || after) parts.push(done ? "KWLS 완성" : "KWLS");
  }

  if (slot.notes.length > 0) {
    const full = slot.notes.some(
      (n) =>
        String(n.cue ?? "").trim() &&
        stripHtml(String(n.notes ?? "")).trim() &&
        String(n.summary ?? "").trim()
    );
    score += full ? 2 : 1; // 단서·필기·요약을 다 적은 날은 한 칸 더
    parts.push(full ? "수업 노트 완성" : "수업 노트");
  }

  return { score, parts };
}

export default function ActivityHeatmap({
  questions = [],
  answerEvents = [],
  // 아래 둘은 없으면 그냥 안 셉니다 — 관리자 화면처럼 받아 두지 않은
  // 자료가 있는 곳에서도 그대로 쓸 수 있게.
  kwl = [],
  notes = [],
  overviewValues,
}) {
  const today = new Date();

  const slots = {};
  questions.forEach((q) => bump(slots, dayKey(toDate(q.createdAt)), "q"));
  answerEvents.forEach((e) => bump(slots, dayKey(toDate(e.answer.createdAt)), "a"));
  kwl.forEach((e) => {
    const k = dayKeyFromDateStr(e.date);
    if (!k) return;
    (slots[k] ??= { q: 0, a: 0, kwl: [], notes: [] }).kwl.push(e);
  });
  notes.forEach((n) => {
    const k = dayKeyFromDateStr(n.date);
    if (!k) return;
    (slots[k] ??= { q: 0, a: 0, kwl: [], notes: [] }).notes.push(n);
  });

  const activity = {};
  const detail = {};
  Object.entries(slots).forEach(([k, slot]) => {
    const { score, parts } = scoreDay(slot);
    activity[k] = score;
    detail[k] = parts;
  });

  const start = new Date();
  start.setDate(start.getDate() - start.getDay() - (WEEKS - 1) * 7);
  start.setHours(0, 0, 0, 0);

  const weeks = Array.from({ length: WEEKS }, (_, w) => {
    const days = Array.from({ length: 7 }, (_, d) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const isFuture = date > today;
      const k = dayKey(date);
      return {
        date,
        count: isFuture ? null : (activity[k] ?? 0),
        parts: isFuture ? [] : (detail[k] ?? []),
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        isFuture,
      };
    });
    const firstMonth = days[0].date.getMonth();
    const prevFirstMonth = w > 0
      ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + (w - 1) * 7).getMonth()
      : -1;
    return { days, monthLabel: firstMonth !== prevFirstMonth ? MONTH_NAMES[firstMonth] : null };
  });

  const activeDays = Object.values(activity).filter(Boolean).length;
  // 머리말 숫자는 '무엇을 몇 번' 그대로 — 점수 합계를 적으면 그 숫자가
  // 무엇인지 아무도 모릅니다(점수는 색으로만 씁니다).
  const kwlDays = new Set(kwl.map((e) => dayKeyFromDateStr(e.date)).filter(Boolean)).size;
  const noteDays = new Set(notes.map((n) => dayKeyFromDateStr(n.date)).filter(Boolean)).size;

  return (
    <div className="heatmap-panel">
      <div className="admin-panel-head">
        <h2>학습 활동 기록</h2>
        <span>
          {activeDays}일 활동
          {questions.length > 0 && ` · 질문 ${questions.length}`}
          {answerEvents.length > 0 && ` · 답변 ${answerEvents.length}`}
          {kwlDays > 0 && ` · KWLS ${kwlDays}일`}
          {noteDays > 0 && ` · 노트 ${noteDays}일`}
        </span>
      </div>
      <div className="heatmap-outer">
        <div className="heatmap-body">
          <div className="heatmap-day-col">
            {DAY_LABELS.map((label, i) => (
              <span key={i} className="heatmap-day-label">
                {i % 2 !== 0 ? label : ""}
              </span>
            ))}
          </div>
          <div className="heatmap-right">
            <div className="heatmap-month-row">
              {weeks.map((week, wi) => (
                <span key={wi} className="heatmap-month-cell">
                  {week.monthLabel ?? ""}
                </span>
              ))}
            </div>
            <div className="heatmap-grid">
              {weeks.map((week, wi) => (
                <div key={wi} className="heatmap-week">
                  {week.days.map((day, di) => (
                    <div
                      key={di}
                      className="heatmap-cell"
                      style={{
                        background: day.isFuture
                          ? FUTURE_COLOR
                          : LEVEL_COLORS[getLevel(day.count)],
                      }}
                      /* 색만으로는 왜 진한지 알 수 없어, 그날 한 것을 그대로 적습니다 */
                      title={
                        day.isFuture
                          ? ""
                          : day.parts.length > 0
                            ? `${day.label} · ${day.parts.join(" · ")}`
                            : `${day.label} · 활동 없음`
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="heatmap-legend-row">
              {/* 색의 뜻이 '얼마나 많이'가 아니라 '몇 갈래로'입니다 */}
              <span className="heatmap-legend-text">한 가지</span>
              {LEVEL_COLORS.map((color, i) => (
                <span key={i} className="heatmap-legend-swatch" style={{ background: color }} />
              ))}
              <span className="heatmap-legend-text">여러 가지</span>
            </div>
          </div>
        </div>

        {overviewValues && (
          <ActivityOverview values={overviewValues} />
        )}
      </div>
    </div>
  );
}
