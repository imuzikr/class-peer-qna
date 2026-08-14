"use client";

// =============================================================
// 모둠 대시보드 — 활동에 들어가면 처음 만나는 관문 화면
// -------------------------------------------------------------
// · 전체 모둠 카드를 보여 줍니다(누가 어느 모둠인지 서로 알 수 있게).
//   단, 판 안의 '단어'는 자기 모둠 것만 볼 수 있습니다(규칙에서 강제).
// · 학생: 자기 모둠 카드로 들어갑니다. 자유 구성 모드면 빈자리가 있는
//   모둠에 직접 참여하고, 마음이 바뀌면 나올 수 있습니다.
// · 교사: 모둠 구성(교사 배정·무작위)과 집계 대시보드 진입을 여기서 합니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import {
  subscribeBookGroups,
  composeBookGroups,
  joinBookGroup,
  leaveBookGroup,
} from "@/lib/store";
import GroupComposer from "./GroupComposer";
import { IconPeople, IconLock } from "./StatusIcons";

export default function BookGroupBoard({
  activity,
  className = "",
  user,
  isTeacher,
  roster = [],
  onOpenGroup,
  onOpenDashboard,
  onBack,
  onToast,
}) {
  const [groups, setGroups] = useState([]);
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);

  const freeMode = activity.groupMode === "free";
  const maxPerGroup = activity.maxPerGroup ?? 6;

  // 내가 속한 모둠 (자유 구성에서 '이미 참여했는지' 판단에도 씁니다)
  const myGroup = useMemo(
    () => groups.find((g) => (g.memberUids ?? []).includes(user?.uid)),
    [groups, user?.uid]
  );

  async function handleJoin(group) {
    if (busy) return;
    setBusy(true);
    try {
      if (myGroup && myGroup.id !== group.id) {
        onToast?.("이미 다른 모둠에 있어요. 먼저 나온 뒤에 참여해 주세요.");
        return;
      }
      await joinBookGroup(activity.id, group.id, user);
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave(group) {
    if (busy) return;
    setBusy(true);
    try {
      const stored = (group.members ?? []).find((m) => m.uid === user.uid) ?? null;
      await leaveBookGroup(activity.id, group.id, user, stored);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="books-main">
      <div className="books-head">
        <div className="books-head-main">
          <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
          <h1 className="book-group-title">
            {activity.title}
            <span className="book-group-topic">{activity.topic}</span>
            {/* 이 활동이 어느 반 것인지 — 학생에게 안 보이면 반이 다른 경우가 많아 표시 */}
            {className && <span className="book-group-class">{className}</span>}
          </h1>
        </div>
        {isTeacher && (
          <div className="book-head-actions">
            {!freeMode && (
              <button className="btn-ghost" onClick={() => setComposing(true)}>
                <IconPeople size={15} /> 모둠 구성
              </button>
            )}
            <button className="btn-primary" onClick={onOpenDashboard}>
              집계 보기
            </button>
          </div>
        )}
      </div>

      {activity.locked && (
        <p className="book-locked-note">
          <IconLock size={15} /> 지금은 잠겨 있어 새 단어를 넣을 수 없어요.
        </p>
      )}

      {groups.length === 0 ? (
        <p className="empty-note">
          {isTeacher
            ? "아직 모둠이 없어요. ‘모둠 구성’으로 모둠을 만들어 주세요."
            : "아직 모둠이 만들어지지 않았어요. 잠시 기다려 주세요."}
        </p>
      ) : (
        <>
          {freeMode && !myGroup && !isTeacher && (
            <p className="book-free-hint">
              함께할 모둠을 골라 ‘참여하기’를 눌러 주세요.
            </p>
          )}
          <div className="book-group-grid">
            {groups.map((g) => {
              const members = g.members ?? [];
              const mine = g.id === myGroup?.id;
              const full = members.length >= maxPerGroup;
              // 들어갈 수 있는 사람: 그 모둠원 또는 교사(교사는 어느 모둠이든 확인 가능)
              const canEnter = isTeacher || mine;
              return (
                <div key={g.id} className={`book-group-card${mine ? " mine" : ""}`}>
                  <div className="book-group-card-head">
                    <strong>{g.groupName || `${g.groupIndex}모둠`}</strong>
                    <span className="book-group-count">
                      {members.length}
                      {freeMode && ` / ${maxPerGroup}`}명
                    </span>
                  </div>

                  {members.length === 0 ? (
                    <p className="book-group-empty">아직 모둠원이 없어요</p>
                  ) : (
                    <ul className="book-group-members">
                      {members.map((m) => (
                        <li key={m.uid} className={m.uid === user?.uid ? "me" : ""}>
                          {m.uid === g.leaderUid && "👑 "}
                          {m.name}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="book-group-card-actions">
                    {canEnter && (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => onOpenGroup(g.id)}
                      >
                        {mine ? "우리 모둠 판" : "판 보기"}
                      </button>
                    )}
                    {freeMode && !isTeacher && (
                      mine ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => handleLeave(g)}
                          disabled={busy}
                        >
                          나가기
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => handleJoin(g)}
                          disabled={busy || full || !!myGroup}
                        >
                          {full ? "자리 참" : "참여하기"}
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {composing && (
        <GroupComposer
          board={{ id: activity.id, title: activity.title }}
          roster={roster}
          cards={groups.map((g) => ({
            groupId: g.id,
            groupIndex: g.groupIndex,
            title: g.groupName,
            groupName: g.groupName,
            members: g.members ?? [],
            leaderUid: g.leaderUid,
            retired: g.retired,
          }))}
          onCompose={composeBookGroups}
          keepEmpty
          onClose={() => setComposing(false)}
          onSaved={() => onToast?.("모둠을 구성했어요.")}
        />
      )}
    </main>
  );
}
