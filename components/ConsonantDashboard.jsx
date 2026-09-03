"use client";

// =============================================================
// 닿소리 집계 대시보드 (교사 전용) — 전자칠판 미러링용
// -------------------------------------------------------------
// 모든 모둠의 단어를 하나의 격자에 모아 실시간으로 보여 줍니다.
//  · 같은 단어는 한 줄에 모으고, 나온 횟수만큼 카드를 반복해 늘어놓습니다.
//    줄이 길수록 많이 나온 단어 — 막대그래프처럼 한눈에 비교됩니다.
//  · 카드 색은 그 단어를 낸 모둠 색이라 어느 모둠에서 나왔는지 보입니다.
//  · 자음 칸을 누르면 모달로 크게 볼 수 있습니다(칠판에 띄워 함께 보기).
//  · 오른쪽에 모둠별 진행률이 있어 막힌 모둠을 바로 찾을 수 있습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  subscribeBookGroups,
  subscribeGroupWords,
  startBroadcast,
  stopBroadcast,
  toDate,
} from "@/lib/store";
import {
  CONSONANT_LABELS,
  GRID_SLOTS,
  CELL_COUNT,
  cellKey,
  groupColorOf,
  groupBarColorOf,
  heatOpacity,
} from "@/lib/consonants";
import { cloudWords, CLOUD_TOP_N } from "@/lib/wordCloud";
import WordCloud from "./WordCloud";

// [학생 화면에 중계]
// 학생은 보안 규칙상 '자기 모둠 낱말'만 읽을 수 있어서, 스스로는 반 전체
// 집계를 만들 수 없습니다. 그래서 집계 결과를 방송 문서(broadcasts/{반})에
// 실어 보냅니다 — 학생은 그 문서만 읽으면 되고, 규칙은 그대로 둡니다.
// 낱말이 바뀌거나 교사가 칸을 크게 열면 그 상태도 같이 실려 갑니다.
export default function ConsonantDashboard({
  activity,
  classId = null,
  user = null,
  onClose,
  embedded = false,
  // 누가기록 관리·수업 메모 버튼 묶음 (교사 전용, 없으면 null)
  classTools = null,
}) {
  const [groups, setGroups] = useState([]);
  const [wordsByGroup, setWordsByGroup] = useState({});
  const [zoomSlot, setZoomSlot] = useState(null); // 크게 보기 모달
  // 같은 집계의 두 얼굴 — 격자(첫 글자로 나뉜 자리) / 낱말 구름(낱말만)
  const [view, setView] = useState("grid");

  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);

  // 모둠이 바뀌면 각 모둠의 단어를 각각 구독합니다(모둠은 많아야 6개).
  const groupIdsKey = useMemo(() => groups.map((g) => g.id).sort().join(","), [groups]);
  useEffect(() => {
    if (!groupIdsKey) { setWordsByGroup({}); return; }
    const ids = groupIdsKey.split(",");
    const unsubs = ids.map((gid) =>
      subscribeGroupWords(activity.id, gid, (list) =>
        setWordsByGroup((prev) => ({ ...prev, [gid]: list }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [activity.id, groupIdsKey]);

  const colorOf = groupColorOf;
  // 툴팁에 '1모둠' 대신 교사가 지어 준 이름(나무·소리…)을 보여 줍니다.
  const groupNameOf = useMemo(() => {
    const byIndex = new Map(
      groups.map((g) => [g.groupIndex, g.groupName || `${g.groupIndex}모둠`])
    );
    return (i) => byIndex.get(i) ?? `${i}모둠`;
  }, [groups]);

  // 칸별 → 같은 단어끼리 묶되, 나온 횟수만큼 모둠 정보를 그대로 남깁니다.
  //   [{ text, count, firstAt, from: [모둠번호, 모둠번호, …] }]
  //
  // 정렬은 ① 많이 나온 순 ② 같으면 먼저 채운 순입니다. 격자에는 위에서
  // 다섯 개만 서는데, 동점이 여섯이면 무엇이 잘릴지 가나다순으로 정하면
  // 수업의 흐름과 아무 상관 없는 기준이 됩니다. 먼저 적은 낱말이 남는 쪽이
  // '누가 먼저 떠올렸나'와 맞아, 칠판에서 이야기를 이어가기 좋습니다.
  const merged = useMemo(() => {
    const cells = {};
    groups.forEach((g) => {
      (wordsByGroup[g.id] ?? []).forEach((w) => {
        const key = (w.text ?? "").trim();
        if (!key) return;
        const bucket = (cells[w.cellKey] ??= new Map());
        const hit = bucket.get(key) ?? { text: key, from: [], firstAt: Infinity };
        hit.from.push(g.groupIndex);
        // 방금 넣어 서버 시각이 아직 안 붙은 낱말은 맨 뒤로 둡니다(Infinity).
        const at = w.createdAt ? toDate(w.createdAt).getTime() : Infinity;
        if (Number.isFinite(at) && at < hit.firstAt) hit.firstAt = at;
        bucket.set(key, hit);
      });
    });
    const out = {};
    Object.entries(cells).forEach(([k, bucket]) => {
      out[k] = [...bucket.values()]
        .map((w) => ({ ...w, count: w.from.length }))
        .sort(
          (a, b) =>
            b.count - a.count ||
            a.firstAt - b.firstAt ||
            a.text.localeCompare(b.text, "ko")
        );
    });
    return out;
  }, [groups, wordsByGroup]);

  // 낱말 구름에 세울 상위 70개 — 격자와 같은 순서 기준으로 고릅니다.
  // 이미 만들어 둔 merged를 다시 펴는 것뿐이라 읽는 문서가 늘지 않습니다.
  const cloud = useMemo(() => cloudWords(merged, CLOUD_TOP_N), [merged]);

  // 모둠별 진행률 (몇 칸을 채웠는지)
  const progress = useMemo(
    () =>
      groups.map((g) => {
        const list = wordsByGroup[g.id] ?? [];
        // 자음 14칸 각각에 낱말이 몇 개 들어갔는지 (낱말 분포 히트맵용)
        const cellCounts = Array.from({ length: CELL_COUNT }, (_, i) =>
          list.filter((w) => w.cellKey === cellKey(i)).length
        );
        return {
          ...g,
          cellsFilled: new Set(list.map((w) => w.cellKey)).size,
          total: list.length,
          cellCounts,
        };
      }),
    [groups, wordsByGroup]
  );

  // 14칸을 다 채운 학생 수 — '이제 다음으로 넘어가도 되나'에 바로 답하는 값.
  //
  // 세는 단위는 낱말이 아니라 **칸**입니다. 한 칸에 낱말을 셋 넣어도 그 칸은
  // 하나로 셉니다(13칸에 낱말 14개면 13칸). 낱말 수로 세면 한 칸에 몰아 넣은
  // 학생이 골고루 채운 학생보다 앞서 보입니다.
  //
  // 분모는 그 활동에 배정된 학생 전원 — 한 칸도 안 채운 학생도 들어갑니다.
  // 그러지 않으면 둘만 참여한 반이 100%로 보입니다.
  //
  // 이 화면은 이미 모든 판의 낱말을 구독하고 있어(위 wordsByGroup) 이 값을
  // 내는 데 **추가로 읽는 문서가 없습니다**. 활동 목록 카드에 두지 않고 여기에
  // 둔 이유가 그것입니다 — 목록은 카드가 쌓이는 곳이라 카드마다 활동의 낱말을
  // 전부 읽으면 활동 수에 정비례해 무거워집니다.
  const doneCount = useMemo(() => {
    const cells = new Map(); // uid → 채운 칸 집합
    groups.forEach((g) => {
      (g.members ?? []).forEach((m) => { if (m?.uid) cells.set(m.uid, new Set()); });
      (g.memberUids ?? []).forEach((u) => { if (u && !cells.has(u)) cells.set(u, new Set()); });
    });
    groups.forEach((g) => {
      (wordsByGroup[g.id] ?? []).forEach((w) => {
        // 반에서 빠진 학생이 남긴 낱말은 세지 않습니다('학생별 진행'과 같은 기준)
        if (w.authorId && w.cellKey && cells.has(w.authorId)) {
          cells.get(w.authorId).add(w.cellKey);
        }
      });
    });
    const filled = [...cells.values()].map((c) => c.size);
    return {
      students: filled.length,
      done: filled.filter((n) => n >= CELL_COUNT).length,
      totalFilled: filled.reduce((a, b) => a + b, 0),
    };
  }, [groups, wordsByGroup]);

  // 반 전체가 지금까지 모은 낱말 수 (칸 수와 별개로 활동량을 보여 줍니다)
  const totalWords = useMemo(
    () => Object.values(wordsByGroup).reduce((n, list) => n + (list?.length ?? 0), 0),
    [wordsByGroup]
  );

  const totalFilled = useMemo(
    () => Array.from({ length: CELL_COUNT }, (_, i) => (merged[cellKey(i)] ?? []).length > 0)
      .filter(Boolean).length,
    [merged]
  );

  // ── 학생 화면에 중계 ──────────────────────────────────────
  const [casting, setCasting] = useState(false);
  const canCast = !!(classId && user);

  // 지금 화면에 보이는 것을 그대로 담은 방송 꾸러미.
  // (낱말 문서를 통째로 보내지 않고, 이미 합쳐 놓은 결과만 담아 가볍습니다)
  const castPayload = useMemo(() => {
    const cells = {};
    Object.entries(merged).forEach(([k, list]) => {
      cells[k] = list.map((w) => ({
        text: w.text,
        count: w.count,
        from: w.from,
      }));
    });
    return {
      mode: "consonant",
      activityTitle: activity.title ?? "",
      topic: activity.topic ?? "",
      cells,
      // 낱말 구름은 **고른 결과만** 실어 보냅니다. 학생 쪽에서 다시 고르게
      // 하면 정렬 기준(먼저 채운 순)에 쓰는 시각이 방송 문서에 없어서 교사
      // 화면과 다른 70개가 뽑힙니다 — 같은 화면이 두 얼굴이 됩니다.
      view,
      cloud:
        view === "cloud"
          ? cloud.words.map((w) => ({
              text: w.text,
              count: w.count,
              from: w.from,
              slot: w.slot,
            }))
          : [],
      cloudRest: view === "cloud" ? cloud.rest : 0,
      groupNames: groups.map((g) => ({
        index: g.groupIndex,
        name: g.groupName || `${g.groupIndex}모둠`,
      })),
      zoomSlot: zoomSlot ?? null,
      totalFilled,
      totalWords,
      groupCount: groups.length,
    };
  }, [merged, groups, zoomSlot, totalFilled, totalWords, view, cloud, activity.title, activity.topic]);

  // 방송 중에는 화면이 바뀔 때마다 다시 보냅니다. 학생이 낱말을 넣을 때마다
  // 쓰기가 몰리지 않도록 0.8초 쉬었다가 한 번만 보냅니다.
  const payloadKey = JSON.stringify(castPayload);
  useEffect(() => {
    if (!casting || !canCast) return;
    const t = setTimeout(() => {
      startBroadcast(user, classId, castPayload).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casting, canCast, payloadKey]);

  // 화면을 벗어나면 방송도 반드시 종료 — 학생 화면이 갇히지 않게
  useEffect(() => {
    if (!casting || !canCast) return;
    return () => { stopBroadcast(classId).catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casting, canCast, classId]);

  async function toggleCast() {
    if (!canCast) return;
    if (casting) {
      setCasting(false);
      await stopBroadcast(classId).catch(() => {});
    } else {
      setCasting(true);
      await startBroadcast(user, classId, castPayload).catch(() => {});
    }
  }

  const Root = embedded ? "section" : "main";
  return (
    <Root className={`${embedded ? "dash-embed" : "canvas-main"} dash-root`}>
      {/* 머리말은 한 줄입니다 — 제목 · 돌아가는 길 · 도구 · 수업 시작이 왼쪽에
          붙고, 숫자는 오른쪽 끝에 섭니다. 공부방 머리말(.study-title-row)과
          같은 짜임·같은 버튼 크기라, 두 화면을 오가도 줄의 높이가 흔들리지
          않습니다. 자리가 모자라면 접히지 않고 가로로 밀립니다. */}
      <div className="canvas-head">
        <strong className="canvas-head-name">
          {embedded ? "집계 보기" : activity.topic}
        </strong>
        {!embedded && (
          <button type="button" className="btn-ghost" onClick={onClose}>← 모둠</button>
        )}
        {/* 제목 바로 뒤 — 수업 중에 관찰한 것을 적으러 화면을 옮기지 않게 */}
        {classTools}
        {/* 격자 / 낱말 구름 — 같은 집계를 보는 방법만 바뀝니다(읽기는 그대로).
            중계 중이면 학생 화면도 함께 바뀝니다. */}
        <div className="dash-view-tabs" role="tablist" aria-label="보는 방법">
          <button
            type="button"
            role="tab"
            aria-selected={view === "grid"}
            className={`dash-view-tab${view === "grid" ? " on" : ""}`}
            onClick={() => setView("grid")}
          >
            격자
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "cloud"}
            className={`dash-view-tab${view === "cloud" ? " on" : ""}`}
            onClick={() => setView("cloud")}
          >
            낱말 구름
          </button>
        </div>
        <div className="dash-head-actions">
          {canCast && (
            <button
              type="button"
              className={`btn-ghost dash-cast-btn${casting ? " on" : ""}`}
              onClick={toggleCast}
              title={
                casting
                  ? "학생 화면을 원래대로 되돌립니다"
                  : "이 집계 화면을 학생들 화면에 그대로 띄웁니다"
              }
            >
              {casting && <span className="broadcast-live-dot" aria-hidden="true" />}
              {casting ? "수업 종료" : "수업 시작"}
            </button>
          )}
        </div>
        {/* 숫자는 오른쪽 끝 — 버튼과 섞이면 무엇이 누를 것인지 흐려집니다 */}
        <span className="canvas-head-stats">
          모둠 {groups.length}개 · {totalFilled} / {CELL_COUNT}칸 · 낱말 {totalWords}개
          {doneCount.students > 0 && (
            <b
              className="dash-done-count"
              title={
                `${CELL_COUNT}칸을 다 채운 학생 ${doneCount.done}명 / ${doneCount.students}명\n` +
                `반 평균 ${(doneCount.totalFilled / doneCount.students).toFixed(1)}칸`
              }
            >
              다 채운 학생 {doneCount.done} / {doneCount.students}
            </b>
          )}
        </span>
      </div>

      {view === "cloud" ? (
        // 구름은 판을 넓게 쓸수록 낱말이 커집니다 — 진행 패널은 접어 두고
        // 가로를 다 씁니다(진행이 궁금하면 격자로 돌아갑니다).
        <div className="dash-body dash-body--cloud">
          <WordCloud
            words={cloud.words}
            rest={cloud.rest}
            onPick={(w) => { if (w.slot != null) setZoomSlot(w.slot); }}
          />
        </div>
      ) : (
      <div className="dash-body">
        <div className="consonant-grid dash-grid">
          {GRID_SLOTS.map((slot, pos) => {
            if (slot === null) {
              return (
                <div key={pos} className="consonant-cell consonant-center">
                  <span className="consonant-center-label">학습주제 · 도서명</span>
                  <strong className="consonant-center-topic">{activity.topic}</strong>
                </div>
              );
            }
            const list = merged[cellKey(slot)] ?? [];
            return (
              <button
                key={pos}
                type="button"
                className={`consonant-cell dash-cell${list.length ? " has-words" : ""}`}
                onClick={() => setZoomSlot(slot)}
              >
                <span className="consonant-cell-head">
                  <span className="consonant-label">{CONSONANT_LABELS[slot]}</span>
                  {list.length > 0 && (
                    <span className="dash-cell-count">{list.length}개</span>
                  )}
                </span>
                <TopWords list={list} />
              </button>
            );
          })}
        </div>

        <aside className="dash-side">
          <h3>모둠별 진행</h3>
          {progress.length === 0 ? (
            <p className="dash-side-empty">아직 모둠이 없어요.</p>
          ) : (
            <ul className="dash-progress-list">
              {progress.map((g) => (
                <li key={g.id}>
                  <span className="dash-progress-name">
                    <i className="dash-dot" style={{ background: colorOf(g.groupIndex) }} />
                    {g.groupName || `${g.groupIndex}모둠`}
                  </span>
                  <span className="dash-progress-num">
                    {g.cellsFilled}/{CELL_COUNT}칸
                    <span className="dash-progress-words"> · 낱말 {g.total}개</span>
                  </span>
                  {/* 막대만 옅은 색(groupBarColorOf) — 누가 몇 줄인지는 왼쪽
                      점이 원래 색으로 알려 주고, 막대가 하는 일은 '얼마나
                      채웠나'뿐입니다. 스무 줄 넘게 이어지는 자리라 원래 색이면
                      패널이 색띠 더미처럼 보입니다. */}
                  <span className="dash-progress-bar">
                    <b
                      style={{
                        width: `${(g.cellsFilled / CELL_COUNT) * 100}%`,
                        background: groupBarColorOf(g.groupIndex),
                      }}
                    />
                  </span>
                  {/* 낱말 분포 — 자음 14칸을 그대로 늘어놓고, 낱말이 많을수록 진하게.
                      막대(몇 칸을 건드렸나)와 달리 '어디에 얼마나 모였나'가 보입니다. */}
                  <span className="dash-heat">
                    {g.cellCounts.map((n, i) => (
                      <i
                        key={i}
                        className="dash-heat-cell"
                        style={
                          n > 0
                            ? { background: colorOf(g.groupIndex), opacity: heatOpacity(n) }
                            : undefined
                        }
                        title={`${CONSONANT_LABELS[i]} · 낱말 ${n}개`}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
      )}

      {/* 자음 한 칸 크게 보기 — 칠판에 띄워 함께 짚어 볼 때 */}
      {zoomSlot !== null && (
        <div className="modal-backdrop" {...backdropClose(() => setZoomSlot(null))}>
          <div className="modal dash-zoom-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>
                <span className="dash-zoom-label">{CONSONANT_LABELS[zoomSlot]}</span>
                <span className="dash-zoom-topic">{activity.topic}</span>
              </h3>
              <button
                type="button"
                className="btn-close"
                onClick={() => setZoomSlot(null)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="dash-zoom-body">
              {(merged[cellKey(zoomSlot)] ?? []).length === 0 ? (
                <p className="dash-side-empty">아직 이 칸에 나온 단어가 없어요.</p>
              ) : (
                <WordRows list={merged[cellKey(zoomSlot)]} colorOf={colorOf} nameOf={groupNameOf} big />
              )}
            </div>
            <p className="dash-zoom-hint">
              같은 단어는 한 줄에 모았어요. 줄이 길수록 여러 모둠에서 나온 단어입니다.
            </p>
          </div>
        </div>
      )}
    </Root>
  );
}

// 단어 한 줄 = 같은 단어. 나온 횟수만큼 카드를 반복해 늘어놓아
// 줄 길이만으로 어떤 단어가 많이 나왔는지 바로 보이게 합니다.
// 격자 칸 — 많이 나온 낱말 다섯 개만.
//
// 예전에는 칸마다 모든 낱말을, 그것도 나온 횟수만큼 반복해 늘어놓았습니다.
// 낱말이 쉰 개일 때는 '줄 길이 = 언급 횟수'가 막대그래프처럼 읽혔지만,
// 오백 개가 되자 글자가 잘리고(폭 62px 고정) 칸마다 안쪽 스크롤이 생겨
// 대부분이 영영 안 보이는 화면이 됐습니다. 칠판에서는 굴릴 수도 없습니다.
//
// 그래서 격자는 '많이 나온 다섯 개'만 크게 보여 주는 자리로 바꿉니다.
// 반복 대신 ×3 배지로 횟수를 적고, 폭 고정을 풀어 잘리지 않게 합니다.
// 나머지는 '+29개'로 접고, 칸을 누르면 뜨는 크게 보기에 전부 있습니다
// (거기는 한 칸만 쓰므로 예전처럼 모둠 색과 반복을 그대로 둡니다).
const TOP_N = 5;

function TopWords({ list }) {
  if (!list?.length) return null;
  const shown = list.slice(0, TOP_N);
  const rest = list.length - shown.length;
  // 막대 길이는 그 칸에서 가장 많이 나온 수에 견줍니다(0에서 시작).
  // 칸끼리가 아니라 '그 칸 안에서'의 비율이라, 낱말이 35개인 칸과 10개인
  // 칸이 같은 리듬으로 읽힙니다.
  const peak = Math.max(...shown.map((w) => w.count));
  return (
    <div className="dash-top">
      {shown.map((w) => (
        <span
          key={w.text}
          className="dash-top-word"
          style={{ "--t": w.count / peak }}
          title={`${w.text} — ${w.count}번`}
        >
          <span className="dash-top-label">
            <span className="dash-top-text">{w.text}</span>
            <em>{w.count}</em>
          </span>
          <span className="dash-top-bar" aria-hidden="true"><i /></span>
        </span>
      ))}
      {rest > 0 && <span className="dash-top-more">+{rest}개 · 눌러서 보기</span>}
    </div>
  );
}

function WordRows({ list, colorOf, nameOf, big = false }) {
  return (
    <div className={`dash-rows${big ? " big" : ""}`}>
      {list.map((w) => (
        <div key={w.text} className="dash-word-row">
          {w.from.map((groupIndex, i) => (
            <span
              key={i}
              className="consonant-chip dash-chip"
              style={{ borderColor: colorOf(groupIndex), color: colorOf(groupIndex) }}
              // 폭이 고정돼 긴 낱말은 잘리므로, 전체 낱말을 툴팁으로 보여 줍니다.
              title={`${w.text} — ${nameOf(groupIndex)}`}
            >
              {w.text}
            </span>
          ))}
          {w.count > 1 && <em className="dash-row-count">{w.count}</em>}
        </div>
      ))}
    </div>
  );
}
