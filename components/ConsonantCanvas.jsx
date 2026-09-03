"use client";

// =============================================================
// 닿소리 채우기 캔버스 — 3×5 격자
// -------------------------------------------------------------
// 한가운데는 주제어(도서명), 나머지 14칸은 자음입니다.
// 칸을 누르면 입력창이 열리고, 넣은 단어는 칩으로 쌓입니다.
//
// 같은 판을 두 가지로 씁니다.
//  · viewMode="mine"  학생의 '내 판' — 내가 넣은 낱말만 보이고 입력합니다.
//  · viewMode="group" 교사의 '모둠 판' — 모둠원 전체의 낱말을 모아 보여 주고,
//      누가 넣었는지 색으로 구분합니다(위쪽에 이름·색 범례).
//
// 낱말은 예전과 같은 곳(모둠의 words)에 저장됩니다. 문서마다 authorId가
// 있어서, 걸러 보여 주는 기준만 달라질 뿐 자료 구조는 그대로입니다.
//
// [개별 활동(groupMode: 'solo')]
//   판 하나가 곧 학생 한 명입니다. 읽는 책이 저마다 다를 수 있어 교사는 주제어를
//   비워 둘 수 있고, 학생이 한가운데 칸을 두 번 눌러 직접 적습니다(판에 저장).
//   또 '누가 넣었는지'를 색으로 나눌 이유가 없으므로(한 판에 한 사람) 낱말에
//   사람 색을 입히지 않고 범례도 두지 않습니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  subscribeBookGroups,
  subscribeGroupWords,
  addConsonantWord,
  deleteConsonantWord,
  setBookGroupTopic,
} from "@/lib/store";
import { CONSONANT_LABELS, GRID_SLOTS, CELL_COUNT, cellKey } from "@/lib/consonants";
import { memberColor, memberLegend } from "@/lib/bookColors";
import { IconLock } from "./StatusIcons";

export default function ConsonantCanvas({
  activity,
  groupId,
  user,
  isTeacher,
  viewMode = "group",
  // embedded — 교사 화면 가운데 칸에 끼워 넣는 형태(자체 머리말·뒤로가기 없음)
  embedded = false,
  onBack,
  // 모둠 판에서 한 사람의 낱말만 보고 싶을 때(교사가 왼쪽에서 이름을 누름).
  // '내 판'(mineOnly)이 자기 것만 거르는 것과 같은 방식입니다.
  focusUid = null,
  focusName = "",
  onClearFocus = null,
}) {
  const [words, setWords] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null); // 입력창이 열린 자음 칸
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);
  const [topicEditing, setTopicEditing] = useState(false); // 개별 활동 — 주제어 고치는 중
  const [topicDraft, setTopicDraft] = useState("");
  const topicRef = useRef(null);

  useEffect(() => subscribeGroupWords(activity.id, groupId, setWords), [activity.id, groupId]);
  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);

  const group = groups.find((g) => g.id === groupId);
  const isMember = (group?.memberUids ?? []).includes(user?.uid);
  const mineOnly = viewMode === "mine";
  // 교사는 확인만 하고, 입력은 그 모둠 학생이 합니다. 잠긴 활동도 입력 불가.
  const canWrite = mineOnly && isMember && !activity.locked;

  // 개별 활동 — 판 하나가 한 사람. 사람 색 구분(범례·낱말 색)이 필요 없습니다.
  const perStudent = activity.groupMode === "solo";
  // 판에 적은 주제어가 있으면 그것이 우선, 없으면 교사가 활동에 적어 둔 것.
  const boardTopic = ((perStudent ? group?.topic : "") || activity.topic || "").trim();
  // 주제어를 고칠 수 있는 사람 — 개별 활동에서 자기 판을 보는 학생, 그리고 교사.
  const canEditTopic = perStudent && !activity.locked && (mineOnly ? isMember : !!isTeacher);

  // '내 판'은 내가 넣은 낱말만 담습니다.
  // 교사가 한 사람을 골랐으면(focusUid) 그 사람 것만 — 같은 거르기입니다.
  const shown = useMemo(() => {
    if (mineOnly) return words.filter((w) => w.authorId === user?.uid);
    if (focusUid) return words.filter((w) => w.authorId === focusUid);
    return words;
  }, [words, mineOnly, user?.uid, focusUid]);

  // 모둠원 이름·색 (개별 활동은 한 판에 한 사람이라 없음)
  //
  // '내 판'에도 띄웁니다. 예전에는 모둠 판에만 있었는데, 학생 화면에는
  // '2모둠'이라는 이름만 있어 누구와 같은 모둠인지 알 길이 없었습니다.
  // 색까지 함께 두면 선생님이 모둠 판이나 전체 보기를 띄웠을 때 '내 색'으로
  // 자기 낱말을 짚을 수 있습니다 — 내 판에는 내 낱말만 보이므로 여기서는
  // 색이 낱말과 이어지지 않지만, 그 색을 미리 익히는 자리로는 맞습니다.
  const legend = useMemo(
    () => (perStudent ? [] : memberLegend(group)),
    [perStudent, group]
  );

  // 자음 칸별로 단어를 모아 둡니다 (오래된 순)
  const byCell = useMemo(() => {
    const map = {};
    shown.forEach((w) => {
      (map[w.cellKey] ??= []).push(w);
    });
    Object.values(map).forEach((list) =>
      list.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
    );
    return map;
  }, [shown]);

  const filled = useMemo(
    () => Array.from({ length: CELL_COUNT }, (_, i) => (byCell[cellKey(i)] ?? []).length > 0)
      .filter(Boolean).length,
    [byCell]
  );

  useEffect(() => {
    if (activeIndex !== null) inputRef.current?.focus();
  }, [activeIndex]);

  async function handleAdd(index) {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await addConsonantWord(activity.id, groupId, { cellKey: cellKey(index), text }, user);
    inputRef.current?.focus(); // 연달아 입력할 수 있게
  }

  function openCell(index) {
    if (!canWrite) return;
    setActiveIndex(index);
    setDraft("");
  }

  // ── 한가운데 주제어 (개별 활동) ──
  useEffect(() => {
    if (topicEditing) topicRef.current?.select();
  }, [topicEditing]);

  function startTopicEdit() {
    if (!canEditTopic) return;
    setTopicDraft(((perStudent ? group?.topic : "") || "").trim());
    setTopicEditing(true);
  }

  async function saveTopic() {
    const text = topicDraft.trim();
    setTopicEditing(false);
    if (text === ((group?.topic ?? "").trim())) return;
    await setBookGroupTopic(activity.id, groupId, text);
  }

  const Root = embedded ? "div" : "main";
  return (
    <Root className={embedded ? "canvas-embed" : "canvas-main"}>
      {!embedded && (
        <div className="canvas-head">
          <button type="button" className="btn-ghost" onClick={onBack}>
            {mineOnly ? "← 활동 목록" : "← 모둠"}
          </button>
          <div className="canvas-head-title">
            <strong>
              {mineOnly ? "내 판" : group?.groupName || "모둠"}
            </strong>
            <span>
              {activity.title}
              {mineOnly && group && ` · ${group.groupName || "모둠"}`}
            </span>
          </div>
          <div className="canvas-progress">
            <div className="canvas-progress-bar">
              <span style={{ width: `${(filled / CELL_COUNT) * 100}%` }} />
            </div>
            <span className="canvas-progress-text">{filled} / {CELL_COUNT}칸</span>
          </div>
        </div>
      )}

      {activity.locked ? (
        <p className="book-locked-note">
          <IconLock size={15} /> 잠긴 활동이라 새 단어를 넣을 수 없어요.
        </p>
      ) : !mineOnly ? (
        !embedded && (
          <p className="book-locked-note">
            모둠원이 각자 넣은 낱말을 모아 봅니다. 색으로 누가 넣었는지 알 수 있어요.
          </p>
        )
      ) : !isMember ? (
        <p className="book-locked-note">이 모둠의 구성원만 단어를 넣을 수 있어요.</p>
      ) : null}

      {/* 한 사람만 보는 중 — 모둠 판인데 낱말이 확 줄어 보이므로, 왜 그런지
          이 자리에서 밝히고 되돌아가는 길도 함께 둡니다.
          (왼쪽 목록에서 그 이름을 다시 눌러도 돌아옵니다) */}
      {focusUid && (
        <p className="canvas-focus-note">
          {/* 문장을 span으로 묶습니다 — 부모가 flex라 <b>와 뒤 글자가 따로
              떨어져 '손수빈 의 낱말만'처럼 사이가 벌어집니다 */}
          <span>
            <b>{focusName || "이 학생"}</b>의 낱말만 보는 중
          </span>
          {onClearFocus && (
            <button type="button" className="canvas-focus-clear" onClick={onClearFocus}>
              모둠 전체 보기
            </button>
          )}
        </p>
      )}

      {/* 모둠원 — 이름과 색을 짝지어. 내 판에서는 나를 굵게 표시합니다 */}
      {legend.length > 0 && (
        <div className="canvas-legend">
          {legend.map((m) => (
            <span
              key={m.uid}
              className={`canvas-legend-item${m.uid === user?.uid ? " me" : ""}`}
            >
              <i
                className="canvas-legend-swatch"
                style={{ background: m.color.bg, borderColor: m.color.border }}
              />
              {m.name}
              {m.uid === user?.uid && <em className="canvas-legend-me">나</em>}
            </span>
          ))}
        </div>
      )}

      <div className="consonant-grid">
        {GRID_SLOTS.map((slot, pos) => {
          // 한가운데 — 주제어 칸
          if (slot === null) {
            return (
              <div
                key={pos}
                className={`consonant-cell consonant-center${canEditTopic ? " editable" : ""}`}
                onDoubleClick={startTopicEdit}
                title={canEditTopic ? "두 번 눌러 주제를 적을 수 있어요" : undefined}
              >
                <span className="consonant-center-label">학습주제 · 도서명</span>
                {topicEditing ? (
                  <input
                    ref={topicRef}
                    className="consonant-center-input"
                    value={topicDraft}
                    onChange={(e) => setTopicDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); saveTopic(); }
                      else if (e.key === "Escape") setTopicEditing(false);
                    }}
                    onBlur={saveTopic}
                    placeholder="주제어 · 도서명"
                    maxLength={40}
                  />
                ) : boardTopic ? (
                  <strong className="consonant-center-topic">{boardTopic}</strong>
                ) : (
                  <strong className="consonant-center-topic is-empty">
                    {canEditTopic ? "두 번 눌러 적기" : "주제 미정"}
                  </strong>
                )}
              </div>
            );
          }

          const list = byCell[cellKey(slot)] ?? [];
          const open = activeIndex === slot;
          return (
            <div
              key={pos}
              className={`consonant-cell${list.length > 0 ? " has-words" : ""}${open ? " open" : ""}`}
            >
              <div className="consonant-cell-head">
                <span className="consonant-label">{CONSONANT_LABELS[slot]}</span>
                {canWrite && !open && (
                  <button
                    type="button"
                    className="consonant-add"
                    onClick={() => openCell(slot)}
                    title={`${CONSONANT_LABELS[slot]} 단어 넣기`}
                    aria-label={`${CONSONANT_LABELS[slot]} 단어 넣기`}
                  >
                    ＋
                  </button>
                )}
              </div>

              <div className="consonant-words">
                {list.map((w) => {
                  // 모둠 판에서는 낱말 색으로 누가 넣었는지 구분합니다.
                  // (개별 활동은 한 판에 한 사람뿐이라 색을 나눌 게 없습니다)
                  const c = mineOnly || perStudent ? null : memberColor(group, w.authorId);
                  return (
                  <span
                    key={w.id}
                    className={`consonant-chip${c ? " tinted" : ""}`}
                    title={w.authorName || ""}
                    style={c ? { background: c.bg, borderColor: c.border, color: c.text } : undefined}
                  >
                    {w.text}
                    {(w.authorId === user?.uid || isTeacher) && !activity.locked && (
                      <button
                        type="button"
                        className="consonant-chip-x"
                        aria-label={`${w.text} 지우기`}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConsonantWord(activity.id, groupId, w.id);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </span>
                  );
                })}
              </div>

              {open && (
                <input
                  ref={inputRef}
                  className="consonant-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdd(slot);
                    } else if (e.key === "Escape") {
                      setActiveIndex(null);
                      setDraft("");
                    }
                  }}
                  onBlur={() => {
                    if (!draft.trim()) setActiveIndex(null);
                  }}
                  placeholder="단어 입력 후 Enter"
                  maxLength={20}
                />
              )}
            </div>
          );
        })}
      </div>

      {canWrite && (
        <p className="canvas-hint">
          칸의 ＋를 누르고 단어를 적은 뒤 Enter를 누르세요. 내가 넣은 단어는 ×로 지울 수 있어요.
          {canEditTopic && " 한가운데 칸을 두 번 누르면 주제어를 적을 수 있어요."}
        </p>
      )}
    </Root>
  );
}
