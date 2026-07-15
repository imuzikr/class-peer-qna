"use client";

// =============================================================
// 모둠 구성 모달 (교사 전용) — 모둠 활동 보드
// -------------------------------------------------------------
// · 자동 구성:
//    - '모둠 수' 영역: 최대 6개의 모둠 슬롯을 미리 두고, 생성할 모둠만 체크.
//    - '모둠원 수' 영역: 목록 버튼으로 한 모둠 인원을 고르면 모둠 수가 자동 결정.
//    - 무작위 균등 배정(예: 22명·5모둠 → 5·5·4·4·4). 대표는 교사가 지정.
// · 직접 구성: 미배정 학생 이름을 드래그해서 모둠에 배정(클릭 배정도 가능).
// · 저장하면 모둠 수만큼 카드가 만들어지고(문서 ID=group_슬롯번호),
//   재구성 시 각 모둠 카드의 작성 내용은 유지된 채 명단·이름만 갱신됩니다.
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useMemo, useState } from "react";
import { composeStudyGroups } from "@/lib/store";
import { getCurrentUser } from "@/lib/user";

const MAX_GROUPS = 6;
const SIZE_OPTIONS = [2, 3, 4, 5, 6]; // 한 모둠당 인원 선택지

// 균등 분할 — total명을 n모둠으로: 앞쪽 (total % n)개 모둠만 +1명 (5,5,4,4,4)
function balancedSizes(total, n) {
  const base = Math.floor(total / n);
  const extra = total % n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function groupsFromCards(cards) {
  return cards
    .filter((c) => c.groupId && !c.retired)
    .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0))
    .map((c) => ({
      index: c.groupIndex,
      name: c.title || c.groupName || `${c.groupIndex}모둠`,
      members: c.members ?? [],
      leaderUid: c.leaderUid ?? null,
    }));
}

export default function GroupComposer({ board, roster = [], cards = [], onClose, onSaved }) {
  const hasExisting = cards.some((c) => c.groupId && !c.retired);
  const [tab, setTab] = useState(hasExisting ? "manual" : "auto");
  const [saving, setSaving] = useState(false);
  const [dragUid, setDragUid] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null); // 'pool' | 모둠 index
  const [activeIndex, setActiveIndex] = useState(null); // 클릭 배정 대상 모둠

  const students = useMemo(
    () => roster.map((s) => ({ uid: s.uid, name: s.name, emoji: s.emoji })),
    [roster]
  );
  const total = students.length;

  // 편집 중인 모둠 미리보기: [{ index, name, members[], leaderUid }]
  const [groups, setGroups] = useState(() =>
    hasExisting ? groupsFromCards(cards) : defaultGroups()
  );

  // 처음부터 최대(6) 모둠으로 시작 — 카드가 시작부터 제 크기로 배치됨
  function defaultGroups() {
    return Array.from({ length: MAX_GROUPS }, (_, i) => ({
      index: i + 1,
      name: `${i + 1}모둠`,
      members: [],
      leaderUid: null,
    }));
  }

  const assignedUids = new Set(groups.flatMap((g) => g.members.map((m) => m.uid)));
  const unassigned = students.filter((s) => !assignedUids.has(s.uid));
  const nameFor = (idx) => groups.find((g) => g.index === idx)?.name || `${idx}모둠`;
  // 클릭 배정 대상: 선택된 모둠(없으면 첫 모둠)
  const activeGroupIndex =
    activeIndex != null && groups.some((g) => g.index === activeIndex)
      ? activeIndex
      : groups[0]?.index ?? null;

  // 모둠 수를 n개로 (앞에서부터 1..n 슬롯) — 기존 이름/멤버는 보존
  function setGroupCount(n) {
    const count = Math.min(MAX_GROUPS, Math.max(1, n));
    setGroups((prev) => {
      const next = [];
      for (let i = 1; i <= count; i++) {
        next.push(prev.find((g) => g.index === i) || { index: i, name: `${i}모둠`, members: [], leaderUid: null });
      }
      return next;
    });
  }

  // ── 자동 배정 ──
  function autoAssign(groupIndices) {
    const idxs = [...groupIndices].sort((a, b) => a - b);
    const n = idxs.length;
    if (n === 0 || total === 0) return;
    const sizes = balancedSizes(total, n);
    const pool = shuffle(students);
    let cursor = 0;
    setGroups(
      idxs.map((idx, k) => {
        const members = pool.slice(cursor, cursor + sizes[k]);
        cursor += sizes[k];
        return { index: idx, name: nameFor(idx), members, leaderUid: null };
      })
    );
  }
  function shuffleCurrent() {
    autoAssign(groups.map((g) => g.index));
  }
  // 모둠원 수로 결정 → 모둠 수 자동 계산 후 균등 배정
  function assignBySize(size) {
    const n = Math.min(MAX_GROUPS, Math.max(1, Math.ceil(total / size)));
    autoAssign(Array.from({ length: n }, (_, i) => i + 1));
  }

  // ── 배정 이동(클릭·드래그 공통) ──
  function moveStudent(uid, targetIndex) {
    setGroups((prev) => {
      let moved = null;
      const cleaned = prev.map((g) => {
        const m = g.members.find((x) => x.uid === uid);
        if (m) moved = m;
        return {
          ...g,
          members: g.members.filter((x) => x.uid !== uid),
          leaderUid: g.leaderUid === uid ? null : g.leaderUid,
        };
      });
      const student = moved || students.find((s) => s.uid === uid);
      if (targetIndex == null || !student) return cleaned;
      return cleaned.map((g) =>
        g.index === targetIndex ? { ...g, members: [...g.members, student] } : g
      );
    });
  }
  function renameGroup(idx, name) {
    setGroups((prev) => prev.map((g) => (g.index === idx ? { ...g, name } : g)));
  }
  function setLeader(idx, uid) {
    setGroups((prev) => prev.map((g) => (g.index === idx ? { ...g, leaderUid: uid || null } : g)));
  }

  // ── 드래그 헬퍼 ──
  const dropProps = (key, onDrop) => ({
    onDragOver: (e) => { e.preventDefault(); setDragOverKey(key); },
    onDragLeave: () => setDragOverKey((k) => (k === key ? null : k)),
    onDrop: (e) => { e.preventDefault(); if (dragUid != null) onDrop(dragUid); setDragUid(null); setDragOverKey(null); },
  });
  const chipDrag = (uid) => ({
    draggable: true,
    onDragStart: (e) => { setDragUid(uid); e.dataTransfer.effectAllowed = "move"; },
    onDragEnd: () => { setDragUid(null); setDragOverKey(null); },
  });

  async function handleSave() {
    if (saving) return;
    const valid = groups.filter((g) => g.members.length > 0);
    if (valid.length === 0) return;
    setSaving(true);
    try {
      await composeStudyGroups(
        getCurrentUser(),
        board.id,
        valid.map((g) => ({
          index: g.index,
          name: g.name.trim() || `${g.index}모둠`,
          memberUids: g.members.map((m) => m.uid),
          members: g.members,
          leaderUid: g.leaderUid,
        }))
      );
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal modal-group-composer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>👥 모둠 구성 — {board.title}</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="gc-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "auto"}
            className={`gc-tab${tab === "auto" ? " active" : ""}`} onClick={() => setTab("auto")}>
            🎲 자동 구성
          </button>
          <button type="button" role="tab" aria-selected={tab === "manual"}
            className={`gc-tab${tab === "manual" ? " active" : ""}`} onClick={() => setTab("manual")}>
            ✋ 직접 구성
          </button>
          <span className="gc-total">반 학생 {total}명</span>
        </div>

        {/* 미배정 학생 명단 — 탭과 모둠 구성 영역 사이 가로 띠 (드롭하면 배정 해제) */}
        <div
          className={`gc-roster${dragOverKey === "pool" ? " drag-over" : ""}`}
          {...dropProps("pool", (uid) => moveStudent(uid, null))}
        >
          <span className="gc-pool-label">미배정 {unassigned.length}명</span>
          <div className="gc-pool-chips">
            {unassigned.length === 0 ? (
              <span className="gc-group-empty">모두 배정됐어요</span>
            ) : (
              unassigned.map((s) => (
                <button
                  key={s.uid}
                  type="button"
                  className="gc-chip"
                  {...chipDrag(s.uid)}
                  onClick={() => activeGroupIndex != null && moveStudent(s.uid, activeGroupIndex)}
                  title={
                    activeGroupIndex != null
                      ? `클릭하면 '${nameFor(activeGroupIndex)}'에 배정 · 드래그도 가능`
                      : "드래그해서 모둠에 배정"
                  }
                >
                  {s.emoji} {s.name}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="gc-body">
          {/* ── 왼쪽: 설정 (세로) ── */}
          <div className="gc-controls">
            {tab === "auto" ? (
              <>
                <div className="gc-section">
                  <div className="gc-section-title">① 모둠 수 <small>만들 모둠 수를 선택</small></div>
                  <div className="gc-slot-list">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`gc-slot${groups.length === n ? " on" : ""}`}
                        onClick={() => setGroupCount(n)}
                      >
                        {n}모둠
                      </button>
                    ))}
                  </div>
                  <button type="button" className="btn-primary gc-assign-btn" onClick={shuffleCurrent} disabled={total === 0}>
                    🎲 {groups.some((g) => g.members.length) ? "다시 섞기" : "무작위 배정"}
                  </button>
                </div>

                <div className="gc-section">
                  <div className="gc-section-title">② 모둠원 수로 정하기 <small>선택 시 모둠 수 자동</small></div>
                  <div className="gc-size-list">
                    {SIZE_OPTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="gc-size-btn"
                        onClick={() => assignBySize(s)}
                        disabled={total === 0}
                      >
                        한 모둠에 {s}명씩
                        <small>{Math.min(MAX_GROUPS, Math.ceil((total || 1) / s))}모둠</small>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="gc-section">
                <div className="gc-section-title">모둠 수 <small>이름을 드래그해 배정</small></div>
                <div className="gc-slot-list">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`gc-slot${groups.length === n ? " on" : ""}`}
                      onClick={() => setGroupCount(n)}
                    >
                      {n}개 모둠
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── 오른쪽: 모둠 미리보기 (드롭 대상) ── */}
          <div className="gc-groups">
            {groups.length === 0 ? (
              <p className="gc-empty">생성할 모둠을 선택해 주세요.</p>
            ) : (
              groups.map((g) => (
                <div
                  key={g.index}
                  className={`gc-group${dragOverKey === g.index ? " drag-over" : ""}${activeGroupIndex === g.index ? " active" : ""}`}
                  onClick={() => setActiveIndex(g.index)}
                  {...dropProps(g.index, (uid) => moveStudent(uid, g.index))}
                >
                  <div className="gc-group-head">
                    <span
                      className="gc-group-pick"
                      title="이 모둠을 선택 — 미배정 학생을 클릭하면 여기로 배정"
                      aria-hidden="true"
                    >
                      {activeGroupIndex === g.index ? "◉" : "○"}
                    </span>
                    <input
                      type="text"
                      className="gc-group-name"
                      value={g.name}
                      onChange={(e) => renameGroup(g.index, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      maxLength={20}
                    />
                    <span className="gc-group-count">{g.members.length}명</span>
                  </div>
                  <div className="gc-group-members">
                    {g.members.length === 0 ? (
                      <span className="gc-group-empty">여기로 이름을 드래그</span>
                    ) : (
                      g.members.map((m) => (
                        <span
                          key={m.uid}
                          className={`gc-chip gc-chip--member${g.leaderUid === m.uid ? " leader" : ""}`}
                          {...chipDrag(m.uid)}
                          onClick={(e) => { e.stopPropagation(); moveStudent(m.uid, null); }}
                          title="클릭하면 미배정 · 드래그로 다른 모둠 이동"
                        >
                          {g.leaderUid === m.uid && "👑 "}
                          {m.emoji} {m.name}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="gc-leader-row">
                    <span>대표</span>
                    <select value={g.leaderUid ?? ""} onChange={(e) => setLeader(g.index, e.target.value)}>
                      <option value="">미지정</option>
                      {g.members.map((m) => (
                        <option key={m.uid} value={m.uid}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="gc-foot">
          {hasExisting && (
            <span className="gc-foot-note">재구성해도 각 모둠 카드의 작성 내용은 유지됩니다.</span>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button type="button" className="btn-primary" onClick={handleSave}
            disabled={saving || groups.every((g) => g.members.length === 0)}>
            {saving ? "저장 중…" : "모둠 구성 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
