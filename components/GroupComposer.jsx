"use client";

// =============================================================
// 모둠 구성 모달 (교사 전용) — 모둠 활동 보드
// -------------------------------------------------------------
// · 자동 구성: 모둠 수 또는 모둠원 수 기준으로 무작위 균등 배정.
//   인원은 항상 비슷하게(예: 22명 5모둠 → 5·5·4·4·4). 대표는 교사가
//   미리보기에서 직접 지정(미지정 가능).
// · 직접 구성: 모둠을 만들고 미배정 학생을 클릭해 원하는 모둠에 배정.
// · 저장하면 모둠 수만큼 카드가 만들어지고(문서 ID = group_순번),
//   재구성 시 기존 카드의 작성 내용은 유지한 채 명단만 갱신됩니다.
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useMemo, useState } from "react";
import { composeStudyGroups } from "@/lib/store";
import { getCurrentUser } from "@/lib/user";

// 균등 분할 — total명을 n모둠으로: 앞쪽 (total % n)개 모둠만 +1명
// 예) 22명 5모둠 → 5,5,4,4,4
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

// 기존 모둠 카드 → 편집용 그룹 배열
function groupsFromCards(cards) {
  return cards
    .filter((c) => c.groupId && !c.retired)
    .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0))
    .map((c) => ({
      index: c.groupIndex,
      name: c.groupName || `${c.groupIndex}모둠`,
      members: c.members ?? [],
      leaderUid: c.leaderUid ?? null,
    }));
}

export default function GroupComposer({ board, roster = [], cards = [], onClose, onSaved }) {
  const hasExisting = cards.some((c) => c.groupId && !c.retired);
  const [tab, setTab] = useState(hasExisting ? "manual" : "auto");
  // 자동 구성 설정
  const [autoBasis, setAutoBasis] = useState("count"); // count(모둠 수) | size(모둠원 수)
  const [autoValue, setAutoValue] = useState(4);
  // 편집 중인 그룹 미리보기 (자동 배정 결과 또는 직접 구성)
  const [groups, setGroups] = useState(() =>
    hasExisting ? groupsFromCards(cards) : []
  );
  const [activeGroup, setActiveGroup] = useState(0); // 직접 구성: 배정 대상 모둠
  const [saving, setSaving] = useState(false);

  const students = useMemo(
    () => roster.map((s) => ({ uid: s.uid, name: s.name, emoji: s.emoji })),
    [roster]
  );
  const assignedUids = new Set(groups.flatMap((g) => g.members.map((m) => m.uid)));
  const unassigned = students.filter((s) => !assignedUids.has(s.uid));

  // ── 자동 배정 ──
  function runAuto() {
    const total = students.length;
    if (total === 0) return;
    const v = Math.max(1, Math.round(autoValue) || 1);
    const n =
      autoBasis === "count"
        ? Math.min(v, total)
        : Math.max(1, Math.ceil(total / v));
    const sizes = balancedSizes(total, n);
    const pool = shuffle(students);
    let cursor = 0;
    const next = sizes.map((size, i) => {
      const members = pool.slice(cursor, cursor + size);
      cursor += size;
      return {
        index: i + 1,
        name: groups[i]?.name || `${i + 1}모둠`,
        members,
        leaderUid: null, // 대표는 교사가 직접 지정
      };
    });
    setGroups(next);
    setActiveGroup(0);
  }

  // ── 직접 구성 ──
  function setGroupCount(n) {
    const count = Math.max(1, Math.min(20, Math.round(n) || 1));
    setGroups((prev) => {
      const next = [...prev];
      while (next.length < count) {
        next.push({ index: next.length + 1, name: `${next.length + 1}모둠`, members: [], leaderUid: null });
      }
      return next.slice(0, count).map((g, i) => ({ ...g, index: i + 1 }));
    });
    setActiveGroup((i) => Math.min(i, count - 1));
  }
  function assignStudent(student) {
    if (groups.length === 0) return;
    setGroups((prev) =>
      prev.map((g, i) =>
        i === activeGroup ? { ...g, members: [...g.members, student] } : g
      )
    );
  }
  function unassignStudent(gi, uid) {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === gi
          ? {
              ...g,
              members: g.members.filter((m) => m.uid !== uid),
              leaderUid: g.leaderUid === uid ? null : g.leaderUid,
            }
          : g
      )
    );
  }
  function renameGroup(gi, name) {
    setGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, name } : g)));
  }
  function setLeader(gi, uid) {
    setGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, leaderUid: uid || null } : g)));
  }

  async function handleSave() {
    if (saving) return;
    const valid = groups.filter((g) => g.members.length > 0);
    if (valid.length === 0) return;
    setSaving(true);
    try {
      await composeStudyGroups(
        getCurrentUser(),
        board.id,
        valid.map((g, i) => ({
          index: i + 1,
          name: g.name.trim() || `${i + 1}모둠`,
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

        {/* 자동 / 직접 탭 */}
        <div className="gc-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "auto"}
            className={`gc-tab${tab === "auto" ? " active" : ""}`}
            onClick={() => setTab("auto")}
          >
            🎲 자동 구성
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "manual"}
            className={`gc-tab${tab === "manual" ? " active" : ""}`}
            onClick={() => setTab("manual")}
          >
            ✋ 직접 구성
          </button>
          <span className="gc-total">반 학생 {students.length}명</span>
        </div>

        {tab === "auto" ? (
          <div className="gc-auto-row">
            <label className="gc-radio">
              <input
                type="radio"
                checked={autoBasis === "count"}
                onChange={() => setAutoBasis("count")}
              />
              모둠 수
            </label>
            <label className="gc-radio">
              <input
                type="radio"
                checked={autoBasis === "size"}
                onChange={() => setAutoBasis("size")}
              />
              모둠원 수
            </label>
            <input
              type="number"
              className="gc-num"
              min={1}
              max={students.length || 1}
              value={autoValue}
              onChange={(e) => setAutoValue(Number(e.target.value))}
            />
            <button type="button" className="btn-primary gc-run" onClick={runAuto}>
              무작위 배정
            </button>
            <span className="gc-hint">인원은 균등하게 나눠요 (예: 22명·5모둠 → 5·5·4·4·4)</span>
          </div>
        ) : (
          <div className="gc-auto-row">
            <span className="gc-label">모둠 수</span>
            <input
              type="number"
              className="gc-num"
              min={1}
              max={20}
              value={groups.length || ""}
              placeholder="0"
              onChange={(e) => setGroupCount(Number(e.target.value))}
            />
            <span className="gc-hint">
              미배정 학생을 클릭하면 선택된 모둠에 들어가요. 모둠원 수는 자유입니다.
            </span>
          </div>
        )}

        {/* 미배정 학생 풀 */}
        {groups.length > 0 && unassigned.length > 0 && (
          <div className="gc-pool">
            <span className="gc-pool-label">미배정 {unassigned.length}명</span>
            <div className="gc-pool-chips">
              {unassigned.map((s) => (
                <button
                  key={s.uid}
                  type="button"
                  className="gc-chip"
                  onClick={() => assignStudent(s)}
                  title={tab === "manual" ? `${groups[activeGroup]?.name}에 배정` : "클릭해 배정"}
                >
                  {s.emoji} {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 모둠 미리보기/편집 */}
        {groups.length === 0 ? (
          <p className="gc-empty">
            {tab === "auto"
              ? "기준을 정하고 '무작위 배정'을 눌러 주세요."
              : "모둠 수를 입력하면 빈 모둠이 만들어져요."}
          </p>
        ) : (
          <div className="gc-groups">
            {groups.map((g, gi) => (
              <div
                key={gi}
                className={`gc-group${tab === "manual" && activeGroup === gi ? " active" : ""}`}
                onClick={tab === "manual" ? () => setActiveGroup(gi) : undefined}
              >
                <div className="gc-group-head">
                  {tab === "manual" && (
                    <input
                      type="radio"
                      name="gc-active"
                      checked={activeGroup === gi}
                      onChange={() => setActiveGroup(gi)}
                      title="이 모둠에 배정"
                    />
                  )}
                  <input
                    type="text"
                    className="gc-group-name"
                    value={g.name}
                    onChange={(e) => renameGroup(gi, e.target.value)}
                    maxLength={20}
                  />
                  <span className="gc-group-count">{g.members.length}명</span>
                </div>
                <div className="gc-group-members">
                  {g.members.length === 0 ? (
                    <span className="gc-group-empty">아직 모둠원이 없어요</span>
                  ) : (
                    g.members.map((m) => (
                      <button
                        key={m.uid}
                        type="button"
                        className={`gc-chip gc-chip--member${g.leaderUid === m.uid ? " leader" : ""}`}
                        onClick={() => unassignStudent(gi, m.uid)}
                        title="클릭하면 미배정으로 이동"
                      >
                        {g.leaderUid === m.uid && "👑 "}
                        {m.emoji} {m.name}
                      </button>
                    ))
                  )}
                </div>
                <div className="gc-leader-row">
                  <span>대표</span>
                  <select
                    value={g.leaderUid ?? ""}
                    onChange={(e) => setLeader(gi, e.target.value)}
                  >
                    <option value="">미지정</option>
                    {g.members.map((m) => (
                      <option key={m.uid} value={m.uid}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="gc-foot">
          {hasExisting && (
            <span className="gc-foot-note">
              재구성 시 각 모둠 카드의 작성 내용은 유지되고 명단만 바뀝니다.
            </span>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || groups.every((g) => g.members.length === 0)}
          >
            {saving ? "저장 중…" : "모둠 구성 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
