"use client";

// =============================================================
// 책방 활동 통계 (교사 대시보드)
// -------------------------------------------------------------
// 대시보드에 책방은 그동안 아예 없었습니다. 수업 중에는
// ConsonantDashboard가 전자칠판에 실시간으로 띄워 주지만, 그건 '지금
// 함께 보는 화면'이지 끝난 뒤 돌아보는 자리가 아닙니다.
//
// [왜 활동을 하나 고르게 하나]
// 보안 규칙에 words·entries용 collectionGroup 규칙이 없습니다
// (firestore.rules의 {path=**} 규칙은 answers·cards뿐). 그래서 반의 책방
// 데이터를 한 번에 훑을 수가 없고, 활동 하나를 고른 뒤 그 활동의 모둠을
// 각각 구독합니다(모둠은 많아야 6개 — ConsonantDashboard와 같은 방식).
// 규칙을 넓히는 대신 이 길을 택한 이유는, 교사의 실제 물음이 "지난주 그
// 활동 어땠지"라서 활동 단위가 오히려 맞기 때문입니다.
//
// [두 가지를 봅니다]
//  · 닿소리 14칸 격자 — 어느 자음이 매번 비는가. 활동이 쓰는 3×5 격자를
//    그대로 써서, 교사가 수업 중 보던 배치 그대로 돌아보게 합니다.
// 개인 활동(곁텍스트·RAFT·KWLS·마인드맵)은 여기서 다루지 않습니다. 이 패널이
// 하는 일이 '모둠이 고르게 했는가'인데, 모둠이 없는 활동은 그 질문에 답할 게
// 없어 '몇 명이 냈다' 한 줄만 남았습니다. 개인 활동의 제출 현황은 학생별
// 분석에서 보는 편이 맞습니다.
//
//  · 모둠 기여 균형 — 모둠 총계로는 절대 안 보이는 '한 명이 다 썼다'를
//    드러냅니다. 막대를 [최다 기여자 몫 | 나머지] 두 조각으로만 나눕니다.
//    모둠원마다 다른 색을 주는 건 읽는 일과 어긋납니다 — 여기서 알고 싶은
//    건 '누구'가 아니라 '한 조각이 얼마나 큰가'(부분-전체)라서, 한 색조의
//    명도 두 단계면 충분하고 그편이 더 잘 읽힙니다.
//
// 색 #84c192 / #2a6039 은 학생 × 프로젝트 격자와 같은 램프입니다
// (dataviz ordinal 게이트 통과 — 단일 색조, ΔL ≥ 0.06, 밝은 단계 2.09:1).
// =============================================================
import { useEffect, useMemo, useState } from "react";
import {
  subscribeBookActivities,
  subscribeBookGroups,
  subscribeGroupWords,
  BOOK_SOLO_TYPES,
} from "@/lib/store";
import { CONSONANT_LABELS, GRID_SLOTS, CELL_COUNT, cellKey } from "@/lib/consonants";

const TYPE_LABEL = { consonant: "닿소리 채우기" };

// 한 칸에 모인 낱말 수 → 0~3단계. 0은 램프 밖 중립색으로 빼서
// '아무도 못 채운 칸'이 '조금 채운 칸'과 섞이지 않게 합니다.
function cellLevel(n) {
  if (n <= 0) return 0;
  if (n <= 2) return 1;
  if (n <= 5) return 2;
  return 3;
}

export default function BookActivityStats({ classId }) {
  const [allActivities, setAllActivities] = useState([]);
  const [actId, setActId] = useState(null);
  const [groups, setGroups] = useState([]);
  const [wordsByGroup, setWordsByGroup] = useState({});

  useEffect(() => {
    if (!classId) { setAllActivities([]); return; }
    return subscribeBookActivities(classId, setAllActivities);
  }, [classId]);

  // 모둠이 있는 활동만 — 지금은 닿소리 채우기 하나입니다.
  // 휴지통에 있는 것(deleted)은 뺍니다 — 목록에서 사라진 활동이 통계에만
  // 남아 있으면 어디서 온 숫자인지 알 수 없습니다.
  const activities = useMemo(
    () => allActivities.filter((a) => !a.deleted && !BOOK_SOLO_TYPES.includes(a.type)),
    [allActivities]
  );

  // 고른 활동은 state로 '채우지' 않고 렌더에서 바로 정합니다.
  // useEffect로 채우면 첫 렌더 한 프레임 동안 activity가 null이라, 아래
  // 렌더가 그 순간을 반드시 견뎌야 합니다(실제로 못 견뎌 터졌습니다).
  // 반을 바꿔 목록이 갈리면 옛 actId는 아무것도 못 찾으니 자연히 최신 활동으로
  // 떨어집니다 — 되돌리는 effect도 따로 필요 없습니다.
  // 목록은 만든 차례(오래된 것이 앞)라 '가장 최근'은 맨 끝입니다.
  const activity =
    activities.find((a) => a.id === actId) ?? activities.at(-1) ?? null;
  const currentId = activity?.id ?? null;

  useEffect(() => {
    if (!currentId) { setGroups([]); return; }
    return subscribeBookGroups(currentId, setGroups);
  }, [currentId]);

  // 모둠마다 낱말을 따로 구독 (규칙상 한 번에 못 읽습니다)
  const groupIdsKey = useMemo(
    () => groups.map((g) => g.id).sort().join(","),
    [groups]
  );
  useEffect(() => {
    if (!groupIdsKey) { setWordsByGroup({}); return; }
    const unsubs = groupIdsKey.split(",").map((gid) =>
      subscribeGroupWords(currentId, gid, (list) =>
        setWordsByGroup((prev) => ({ ...prev, [gid]: list }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [currentId, groupIdsKey]);

  const allWords = useMemo(
    () => groups.flatMap((g) => wordsByGroup[g.id] ?? []),
    [groups, wordsByGroup]
  );

  // 자음 14칸에 모인 낱말 수
  const cellCounts = useMemo(
    () =>
      Array.from({ length: CELL_COUNT }, (_, i) =>
        allWords.filter((w) => w.cellKey === cellKey(i)).length
      ),
    [allWords]
  );
  const emptyCells = cellCounts.filter((n) => n === 0).length;

  // 모둠별 — 총 낱말 수와 그 안의 최다 기여자 몫
  const groupRows = useMemo(
    () =>
      groups
        .map((g) => {
          const list = wordsByGroup[g.id] ?? [];
          const byAuthor = new Map();
          list.forEach((w) => {
            const key = w.authorId ?? "?";
            const cur = byAuthor.get(key) ?? { name: w.authorName || "이름 미상", n: 0 };
            cur.n += 1;
            byAuthor.set(key, cur);
          });
          const members = [...byAuthor.values()].sort((a, b) => b.n - a.n);
          const total = list.length;
          const top = members[0] ?? null;
          return {
            id: g.id,
            name: g.groupName || `${g.groupIndex}모둠`,
            index: g.groupIndex,
            total,
            members,
            topName: top?.name ?? null,
            topN: top?.n ?? 0,
            topShare: total > 0 ? Math.round(((top?.n ?? 0) / total) * 100) : 0,
          };
        })
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0)),
    [groups, wordsByGroup]
  );
  const maxTotal = Math.max(1, ...groupRows.map((r) => r.total));

  if (!classId) return null;

  return (
    <section className="admin-activity-panel">
      <div className="admin-panel-head">
        <h2>📖 책방 — 모둠 활동</h2>
        <span>{activities.length}개 활동</span>
      </div>

      {activities.length === 0 ? (
        <div className="admin-empty">
          이 반에 모둠으로 하는 책방 활동이 없습니다.
        </div>
      ) : (
        <>
          {/* 활동을 하나 고릅니다 — 위 주석의 규칙 제약 참고 */}
          <div className="bks-picker" role="group" aria-label="활동 선택">
            {activities.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`bks-pick${a.id === currentId ? " on" : ""}`}
                onClick={() => setActId(a.id)}
                title={`${TYPE_LABEL[a.type] ?? a.type} · ${a.topic ?? ""}`}
              >
                {a.title || TYPE_LABEL[a.type] || "활동"}
              </button>
            ))}
          </div>

          {activity && (
            <div className="bks-body">
              {/* ── 닿소리 14칸 ── */}
              <div className="bks-block">
                <h3 className="bks-title">
                  자음 칸별 낱말
                  <small>
                    낱말 {allWords.length}개
                    {emptyCells > 0 && ` · 빈 칸 ${emptyCells}개`}
                  </small>
                </h3>
                <div className="bks-grid">
                  {GRID_SLOTS.map((slot, i) => {
                    if (slot === null) {
                      return (
                        <div className="bks-gcell bks-gcell--topic" key={`t${i}`}>
                          {activity.topic || activity.title || "주제"}
                        </div>
                      );
                    }
                    const n = cellCounts[slot];
                    return (
                      <div
                        className={`bks-gcell lv${cellLevel(n)}`}
                        key={slot}
                        title={`${CONSONANT_LABELS[slot]} — 낱말 ${n}개`}
                      >
                        <b>{CONSONANT_LABELS[slot]}</b>
                        <em>{n}</em>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── 모둠 기여 균형 ── */}
              <div className="bks-block">
                <h3 className="bks-title">
                  모둠 기여 균형
                  <small>진한 쪽이 가장 많이 낸 한 사람의 몫</small>
                </h3>
                {groupRows.length === 0 ? (
                  <div className="admin-empty">모둠이 없습니다.</div>
                ) : (
                  <ul className="bks-groups">
                    {groupRows.map((r) => (
                      <li key={r.id}>
                        <span className="bks-gname" title={r.name}>{r.name}</span>
                        <span className="bks-bar" aria-hidden="true">
                          <span
                            className="bks-bar-fill"
                            style={{ width: `${(r.total / maxTotal) * 100}%` }}
                          >
                            {r.total > 0 && (
                              <span
                                className="bks-bar-top"
                                style={{ width: `${r.topShare}%` }}
                              />
                            )}
                          </span>
                        </span>
                        <span className="bks-gnum">
                          {r.total === 0 ? (
                            <i>아직 없음</i>
                          ) : (
                            <>
                              <b>{r.total}</b>개 · 최다 {r.topShare}%
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {/* 색만으로 값을 나르지 않도록, 모둠원별 낱말 수를 글자로도 답니다 */}
                {groupRows.some((r) => r.members.length > 0) && (
                  <p className="bks-members">
                    {groupRows
                      .filter((r) => r.members.length > 0)
                      .map((r) => (
                        <span key={r.id}>
                          <b>{r.name}</b>{" "}
                          {r.members.map((m) => `${m.name} ${m.n}`).join(" · ")}
                        </span>
                      ))}
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
