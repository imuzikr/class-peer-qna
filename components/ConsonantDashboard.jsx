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
import { useEffect, useMemo, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { subscribeBookGroups, subscribeGroupWords } from "@/lib/store";
import { CONSONANT_LABELS, GRID_SLOTS, CELL_COUNT, cellKey } from "@/lib/consonants";

// 모둠 색 — 순번대로 돌려 씁니다
const GROUP_COLORS = ["#E07A5F", "#3D8A72", "#5B7DB1", "#C1873B", "#8B6BB1", "#B5566E"];

export default function ConsonantDashboard({ activity, onClose }) {
  const [groups, setGroups] = useState([]);
  const [wordsByGroup, setWordsByGroup] = useState({});
  const [zoom, setZoom] = useState(false);      // 전체화면(칠판) 모드
  const [zoomSlot, setZoomSlot] = useState(null); // 크게 보기 모달
  const rootRef = useRef(null);

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

  const colorOf = (groupIndex) => GROUP_COLORS[(groupIndex - 1) % GROUP_COLORS.length];

  // 칸별 → 같은 단어끼리 묶되, 나온 횟수만큼 모둠 정보를 그대로 남깁니다.
  //   [{ text, count, from: [모둠번호, 모둠번호, …] }]  ← 많이 나온 단어가 위로
  const merged = useMemo(() => {
    const cells = {};
    groups.forEach((g) => {
      (wordsByGroup[g.id] ?? []).forEach((w) => {
        const key = (w.text ?? "").trim();
        if (!key) return;
        const bucket = (cells[w.cellKey] ??= new Map());
        const hit = bucket.get(key) ?? { text: key, from: [] };
        hit.from.push(g.groupIndex);
        bucket.set(key, hit);
      });
    });
    const out = {};
    Object.entries(cells).forEach(([k, bucket]) => {
      out[k] = [...bucket.values()]
        .map((w) => ({ ...w, count: w.from.length }))
        .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, "ko"));
    });
    return out;
  }, [groups, wordsByGroup]);

  // 모둠별 진행률 (몇 칸을 채웠는지)
  const progress = useMemo(
    () =>
      groups.map((g) => {
        const list = wordsByGroup[g.id] ?? [];
        return { ...g, cellsFilled: new Set(list.map((w) => w.cellKey)).size, total: list.length };
      }),
    [groups, wordsByGroup]
  );

  const totalFilled = useMemo(
    () => Array.from({ length: CELL_COUNT }, (_, i) => (merged[cellKey(i)] ?? []).length > 0)
      .filter(Boolean).length,
    [merged]
  );

  async function toggleZoom() {
    try {
      if (!document.fullscreenElement) {
        await rootRef.current?.requestFullscreen();
        setZoom(true);
      } else {
        await document.exitFullscreen();
        setZoom(false);
      }
    } catch {
      setZoom((v) => !v); // 전체화면 API가 막힌 환경에서는 확대만
    }
  }

  // ESC 등으로 브라우저가 전체화면을 빠져나가면 상태를 맞춰 줍니다.
  useEffect(() => {
    function onChange() { setZoom(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  return (
    <main className={`canvas-main dash-root${zoom ? " zoom" : ""}`} ref={rootRef}>
      <div className="canvas-head">
        {!zoom && (
          <button type="button" className="btn-ghost" onClick={onClose}>← 모둠</button>
        )}
        <div className="canvas-head-title">
          <strong>{activity.topic}</strong>
          <span>모둠 {groups.length}개 · {totalFilled} / {CELL_COUNT}칸</span>
        </div>
        <button type="button" className="btn-ghost" onClick={toggleZoom}>
          {zoom ? "축소" : "전체 화면"}
        </button>
      </div>

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
                title={`${CONSONANT_LABELS[slot]} 크게 보기`}
              >
                <span className="consonant-label">{CONSONANT_LABELS[slot]}</span>
                <WordRows list={list} colorOf={colorOf} />
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
                  <span className="dash-progress-bar">
                    <b style={{ width: `${(g.cellsFilled / CELL_COUNT) * 100}%`, background: colorOf(g.groupIndex) }} />
                  </span>
                  <span className="dash-progress-num">{g.cellsFilled}/{CELL_COUNT}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

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
                <WordRows list={merged[cellKey(zoomSlot)]} colorOf={colorOf} big />
              )}
            </div>
            <p className="dash-zoom-hint">
              같은 단어는 한 줄에 모았어요. 줄이 길수록 여러 모둠에서 나온 단어입니다.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

// 단어 한 줄 = 같은 단어. 나온 횟수만큼 카드를 반복해 늘어놓아
// 줄 길이만으로 어떤 단어가 많이 나왔는지 바로 보이게 합니다.
function WordRows({ list, colorOf, big = false }) {
  return (
    <div className={`dash-rows${big ? " big" : ""}`}>
      {list.map((w) => (
        <div key={w.text} className="dash-word-row">
          {w.from.map((groupIndex, i) => (
            <span
              key={i}
              className="consonant-chip dash-chip"
              style={{ borderColor: colorOf(groupIndex), color: colorOf(groupIndex) }}
              title={`${groupIndex}모둠`}
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
