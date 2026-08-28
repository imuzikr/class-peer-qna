"use client";

// =============================================================
// 학생 × 프로젝트 제출 격자 (교사 대시보드)
// -------------------------------------------------------------
// StudyRoomStats는 반별 '평균' 제출률을 냅니다. 그 평균이 정작 교사가
// 알아야 할 두 가지를 덮습니다 — 어느 학생이 계속 안 내는지, 어느
// 프로젝트가 통째로 막혔는지. 한 반의 학생 × 프로젝트를 한 판에 깔면
// 가로줄로 앞의 것이, 세로줄로 뒤의 것이 그냥 보입니다.
//
// [형태] 격자에서 크기(얼마나 썼나)를 비교하는 일이라 순서형(ordinal)
// 한 색조 램프를 씁니다. 프로젝트마다 다른 색을 주면 색이 '정체'를
// 말하게 되어, 정작 신호인 '빈 칸'이 묻힙니다.
//
// [색] #84c192 → #4f9364 → #2a6039. 눈대중이 아니라 dataviz 검증기의
// ordinal 게이트를 통과시킨 값입니다(단일 색조 2°, 단계 간 ΔL ≥ 0.06,
// 가장 밝은 단계도 흰 바탕 대비 2.09:1). 공부방 잔디 히트맵의 기존
// 초록 램프를 그대로 쓰지 않은 이유는 그 램프가 이 격자에서 가장 중요한
// 구분인 '미작성 ↔ 일부작성'에서 ΔL 0.038, 정상 시야 ΔE 5.8로 붙어
// 있어서입니다(같은 검증기가 잡아냈습니다).
//
// '미작성'은 램프에 태우지 않고 따뜻한 중립색으로 뺍니다 — 초록 계열의
// 가장 옅은 단계로 두면 '조금 썼다'와 헷갈리는데, 여기서는 그 둘이
// 절대 섞이면 안 됩니다.
// =============================================================
import { useMemo, useState } from "react";
import { cardActivitySummary, DONE_MIN_CHARS } from "@/lib/activities";
import { stripHtml } from "@/lib/html";

const SORTS = [
  { key: "studentId", label: "학번순" },
  { key: "behind", label: "미제출 많은 순" },
];

// 카드 한 장 → 0~3단계.
//  0 미작성 · 1 일부 · 2 절반 이상 · 3 전부
// 활동 목록이 없는 예전 보드는 '카드에 충분히 썼는가' 하나로만 봅니다.
function levelOf(card, board) {
  if (!card) return 0;
  const activities = board.activities ?? [];
  if (activities.length === 0) {
    return stripHtml(card.content ?? "").length >= DONE_MIN_CHARS ? 3 : 0;
  }
  const { filled, total } = cardActivitySummary(card, activities);
  if (filled === 0) return 0;
  if (filled >= total) return 3;
  return filled / total >= 0.5 ? 2 : 1;
}

const LEVEL_TEXT = ["미작성", "일부", "절반 이상", "전부"];

export default function StudyProjectGrid({
  boards = [],
  cardsByBoard = {},
  students = [],
  className = "",
}) {
  const [sort, setSort] = useState("studentId");

  // 학생 카드를 쓰는 보드만 — '선생님 보드'(공지)는 제출 대상이 아닙니다
  const projects = useMemo(
    () => boards.filter((b) => b.type !== "notice"),
    [boards]
  );

  const rows = useMemo(() => {
    const list = students.map((s) => {
      const levels = projects.map((b) => {
        const card = (cardsByBoard[b.id] ?? []).find((c) => c.authorId === s.id);
        return levelOf(card, b);
      });
      return {
        id: s.id,
        name: s.realName || s.name,
        studentId: s.studentId || "",
        levels,
        done: levels.filter((v) => v === 3).length,
        untouched: levels.filter((v) => v === 0).length,
      };
    });
    if (sort === "behind") {
      return list.sort(
        (a, b) =>
          b.untouched - a.untouched ||
          a.done - b.done ||
          String(a.studentId).localeCompare(String(b.studentId), "ko", { numeric: true })
      );
    }
    return list.sort((a, b) =>
      String(a.studentId).localeCompare(String(b.studentId), "ko", { numeric: true })
    );
  }, [students, projects, cardsByBoard, sort]);

  // 프로젝트별 '전부 채운 학생 수' — 아래쪽 요약 줄. 세로줄로 읽히는
  // '이 프로젝트가 막혔다'를 숫자로도 한 번 더 받쳐 줍니다(색만으로
  // 정보를 나르지 않도록).
  const colDone = projects.map(
    (_, i) => rows.filter((r) => r.levels[i] === 3).length
  );

  if (projects.length === 0 || rows.length === 0) {
    return (
      <section className="admin-activity-panel">
        <div className="admin-panel-head">
          <h2>🧩 학생 × 프로젝트 제출</h2>
        </div>
        <div className="admin-empty">
          {projects.length === 0
            ? "이 반에 학생용 프로젝트가 없습니다."
            : "이 반에 소속된 학생이 없습니다."}
        </div>
      </section>
    );
  }

  return (
    <section className="admin-activity-panel">
      <div className="admin-panel-head">
        <h2>🧩 학생 × 프로젝트 제출</h2>
        <span>
          {className ? `${className} · ` : ""}학생 {rows.length}명 · 프로젝트{" "}
          {projects.length}개
        </span>
      </div>

      <div className="spg-tools" role="group" aria-label="정렬">
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`spg-sort${sort === s.key ? " on" : ""}`}
            onClick={() => setSort(s.key)}
          >
            {s.label}
          </button>
        ))}
        <span className="spg-legend">
          <i className="spg-swatch lv0" /> 미작성
          <i className="spg-swatch lv1" /> 일부
          <i className="spg-swatch lv2" /> 절반↑
          <i className="spg-swatch lv3" /> 전부
        </span>
      </div>

      <div className="spg-scroll">
        <table className="spg-table">
          <thead>
            <tr>
              <th className="spg-name-col">학생</th>
              {projects.map((b) => (
                <th key={b.id} className="spg-proj-col" title={b.title}>
                  <span>{b.title}</span>
                </th>
              ))}
              <th className="spg-sum-col">완료</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th className="spg-name-col" scope="row" title={r.name}>
                  {r.studentId && <em>{r.studentId}</em>}
                  {r.name}
                </th>
                {r.levels.map((lv, i) => (
                  <td key={projects[i].id} className="spg-cell-wrap">
                    <span
                      className={`spg-cell lv${lv}`}
                      title={`${r.name} · ${projects[i].title} — ${LEVEL_TEXT[lv]}`}
                      aria-label={`${r.name} ${projects[i].title} ${LEVEL_TEXT[lv]}`}
                    />
                  </td>
                ))}
                <td className="spg-sum-col">
                  <b>{r.done}</b>/{projects.length}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="spg-name-col" scope="row">
                전부 채운 학생
              </th>
              {colDone.map((n, i) => (
                <td key={projects[i].id} className="spg-foot-num">
                  {n}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
