"use client";

// =============================================================
// 닿소리 집계 대시보드 (교사 전용) — 전자칠판 미러링용
// -------------------------------------------------------------
// 모든 모둠의 단어를 하나의 격자에 모아 실시간으로 보여 줍니다.
//  · 모둠마다 칩 색이 달라 어느 모둠이 냈는지 한눈에 보입니다.
//  · 여러 모둠이 같은 단어를 내면 하나로 합치고 ×N으로 표시합니다.
//    (겹치는 단어가 곧 '모두가 떠올린 핵심어'라 수업에서 짚기 좋습니다)
//  · 오른쪽에 모둠별 진행률이 있어 막힌 모둠을 바로 찾을 수 있습니다.
//  · 전체화면 버튼으로 글씨를 키워 칠판에 띄웁니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeBookGroups, subscribeGroupWords } from "@/lib/store";
import { CONSONANT_LABELS, GRID_SLOTS, CELL_COUNT, cellKey } from "@/lib/consonants";

// 모둠 색 — 순번대로 돌려 씁니다
const GROUP_COLORS = ["#E07A5F", "#3D8A72", "#5B7DB1", "#C1873B", "#8B6BB1", "#B5566E"];

export default function ConsonantDashboard({ activity, onClose }) {
  const [groups, setGroups] = useState([]);
  const [wordsByGroup, setWordsByGroup] = useState({});
  const [zoom, setZoom] = useState(false); // 전체화면(칠판) 모드
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

  // 칸별로 전체 모둠 단어를 모으고, 같은 단어는 합쳐서 셉니다.
  const merged = useMemo(() => {
    const cells = {};
    groups.forEach((g) => {
      (wordsByGroup[g.id] ?? []).forEach((w) => {
        const bucket = (cells[w.cellKey] ??= new Map());
        const key = w.text.trim();
        if (!key) return;
        const hit = bucket.get(key) ?? { text: key, count: 0, groupIndexes: new Set() };
        hit.count += 1;
        hit.groupIndexes.add(g.groupIndex);
        bucket.set(key, hit);
      });
    });
    const out = {};
    Object.entries(cells).forEach(([k, bucket]) => {
      out[k] = [...bucket.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, "ko"));
    });
    return out;
  }, [groups, wordsByGroup]);

  // 모둠별 진행률 (몇 칸을 채웠는지)
  const progress = useMemo(
    () =>
      groups.map((g) => {
        const list = wordsByGroup[g.id] ?? [];
        const cellsFilled = new Set(list.map((w) => w.cellKey)).size;
        return { ...g, cellsFilled, total: list.length };
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
              <div key={pos} className={`consonant-cell${list.length ? " has-words" : ""}`}>
                <span className="consonant-label">{CONSONANT_LABELS[slot]}</span>
                <div className="consonant-words">
                  {list.map((w) => {
                    const idx = [...w.groupIndexes];
                    // 여러 모둠이 함께 낸 단어는 크게 강조합니다.
                    const shared = idx.length > 1;
                    return (
                      <span
                        key={w.text}
                        className={`consonant-chip dash-chip${shared ? " shared" : ""}`}
                        style={shared ? undefined : { borderColor: colorOf(idx[0]), color: colorOf(idx[0]) }}
                        title={`${idx.sort((a, b) => a - b).map((i) => `${i}모둠`).join(", ")}`}
                      >
                        {w.text}
                        {w.count > 1 && <em className="dash-chip-count">×{w.count}</em>}
                      </span>
                    );
                  })}
                </div>
              </div>
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
    </main>
  );
}
