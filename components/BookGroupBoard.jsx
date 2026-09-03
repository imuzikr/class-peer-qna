"use client";

// =============================================================
// 독서 활동 작업 화면
// -------------------------------------------------------------
// 교사 — 세 칸으로 나뉩니다.
//     왼쪽   모둠 목록(세로). 고르면 가운데가 그 모둠의 판이 됩니다.
//            '개별 활동'이면 모둠 대신 학생 목록이 놓입니다.
//     가운데 고른 모둠(또는 학생)의 판 — 넣은 낱말을 사람 색으로 구분.
//     오른쪽 진행 상황. 모둠 활동은 그 모둠원만, 개별 활동은 반 전체 학생을
//            한 줄씩 보여 줍니다(개별 활동은 판 하나가 곧 한 사람이라,
//            고른 한 명만 보면 견줄 대상이 없습니다).
//            그날 결석한 학생은 '결석'으로 표시해, 아직 안 쓴 것인지
//            아예 못 온 것인지 구분되게 합니다.
//   머리말의 '전체 보기'로 반 전체 집계 화면으로 넘어갑니다.
//
// 학생 — 모둠이 없을 때만 이 화면을 봅니다(자유 구성에서 모둠 고르기).
//   모둠이 정해지면 곧바로 자기 판으로 들어가므로 여기를 거치지 않습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import {
  subscribeBookGroups,
  subscribeGroupWords,
  composeBookGroups,
  joinBookGroup,
  leaveBookGroup,
  subscribeClassStudyAttendance,
  todayDateKey,
  toDate,
} from "@/lib/store";
import { CELL_COUNT, CONSONANT_LABELS, cellKey } from "@/lib/consonants";
import { barTint, memberLegend, rowColor } from "@/lib/bookColors";
import GroupComposer from "./GroupComposer";
import ConsonantCanvas from "./ConsonantCanvas";
import { IconPeople, IconLock } from "./StatusIcons";

export default function BookGroupBoard({
  activity,
  className = "",
  user,
  isTeacher,
  roster = [],
  baseGroupAssignment = null,
  onOpenAll,
  onBack,
  onToast,
  // 누가기록 관리·수업 메모 버튼 묶음 (교사 전용, 없으면 null)
  classTools = null,
}) {
  const [groups, setGroups] = useState([]);
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickedId, setPickedId] = useState(null); // 교사가 고른 모둠
  // 모둠 안에서 한 학생만 골라 볼 때 그 학생 uid. 모둠 판은 모둠원 낱말이
  // 섞여 있어 "이 학생이 뭘 넣었지"를 보려면 색을 눈으로 좇아야 했습니다.
  // 이름을 누르면 그 학생 낱말만 남고, 다시 누르면 모둠 판으로 돌아옵니다.
  const [focusUid, setFocusUid] = useState(null);

  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);

  // 교사 화면 전용 — 학생 쪽 roster는 항상 빈 배열(권한상 구독 안 함)이라
  // 이 값은 isTeacher 분기(아래) 안에서만 씁니다.
  const rosterUids = useMemo(() => new Set(roster.map((s) => s.uid)), [roster]);

  const freeMode = activity.groupMode === "free";
  // 개별 활동 — 판 하나가 곧 학생 한 명입니다. '활동 모둠'(GroupComposer)은
  // 최대 6개까지만 다루도록 만들어져 있어, 학생 수만큼 있는 이 판들에 쓰면
  // 나머지가 사라집니다. 그래서 이 모드에서는 아예 열지 않습니다.
  const perStudent = activity.groupMode === "solo";
  const maxPerGroup = activity.maxPerGroup ?? 6;

  // 내가 속한 모둠 (자유 구성에서 '이미 참여했는지' 판단에도 씁니다)
  const myGroup = useMemo(
    () => groups.find((g) => (g.memberUids ?? []).includes(user?.uid)),
    [groups, user?.uid]
  );

  // ── 결석 표시 ────────────────────────────────────────────────
  // 기준일은 '오늘'이 아니라 '활동을 연 날'입니다. 오늘 출석으로 판단하면
  // 지난주에 한 활동을 오늘 열어 봤을 때 엉뚱한 사람이 결석으로 찍힙니다.
  const [attendance, setAttendance] = useState([]);
  useEffect(() => {
    if (!isTeacher || !activity?.classId) { setAttendance([]); return; }
    return subscribeClassStudyAttendance(activity.classId, setAttendance);
  }, [isTeacher, activity?.classId]);

  const activityDate = useMemo(() => {
    const d = activity?.createdAt ? toDate(activity.createdAt) : null;
    return d && !Number.isNaN(d.getTime()) ? todayDateKey(d) : todayDateKey();
  }, [activity?.createdAt]);

  const presentUids = useMemo(() => {
    const set = new Set();
    attendance.forEach((r) => { if (r.date === activityDate && r.uid) set.add(r.uid); });
    return set;
  }, [attendance, activityDate]);

  // 그날 출석을 한 건도 받지 않았다면 '출석을 안 받은 날'입니다 — 그때
  // 명단 전체를 결석으로 칠하면 완전히 잘못된 그림이 되므로 표시하지 않습니다.
  const attendanceKnown = presentUids.size > 0;
  const absentUids = useMemo(() => {
    if (!attendanceKnown) return new Set();
    return new Set(roster.filter((s) => !presentUids.has(s.uid)).map((s) => s.uid));
  }, [attendanceKnown, presentUids, roster]);

  // 교사가 활동에 처음 들어오면 아직 어느 모둠도 고르지 않은 상태입니다.
  // 임의로 첫 모둠을 열어 두면 마치 교사가 그 모둠을 고른 것처럼 보이므로,
  // 실제로 고르기 전까지 가운데 칸은 비워 둡니다.
  const picked = groups.find((g) => g.id === pickedId) ?? null;

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

  const head = (
    <div className="books-head">
      {/* 제목 · 돌아가는 길 · 도구 순서 — 공부방 머리말과 같은 차례입니다.
          화면을 한 단계 되돌리는 버튼이 도구보다 앞섭니다. */}
      <div className="books-head-title">
        <h1 className="book-group-title">{activity.title}</h1>
        <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
        {classTools}
      </div>
      <div className="books-head-row">
        <div className="books-head-main">
          {isTeacher && !freeMode && !perStudent && (
            <button type="button" className="btn-ghost" onClick={() => setComposing(true)}>
              <IconPeople size={15} /> 활동 모둠
            </button>
          )}
          {/* 개별 활동은 주제어를 비워 둘 수 있습니다(학생이 자기 판에 적음) */}
          {(activity.topic ?? "").trim() && (
            <span className="book-group-topic">{activity.topic}</span>
          )}
          {/* 이 활동이 어느 반 것인지 — 학생에게 안 보이면 반이 다른 경우가 많아 표시 */}
          {className && <span className="book-group-class">{className}</span>}
          {/* 잠김 안내도 이 줄에 — 예전엔 머리말 아래 제 줄을 하나 차지했는데,
              이 줄은 배지 한두 개뿐이라 오른쪽이 통째로 비어 있었습니다.
              '지금 잠겨 있다'는 활동에 붙는 상태라 배지들과 같은 성격입니다. */}
          {activity.locked && (
            <span className="book-locked-note book-locked-chip">
              <IconLock size={14} /> 지금은 잠겨 있어 새 단어를 넣을 수 없어요.
            </span>
          )}
        </div>
        {isTeacher && (
          <button type="button" className="btn-primary book-allview-btn" onClick={onOpenAll}>
            전체 보기
          </button>
        )}
      </div>
    </div>
  );

  const composer = composing && (
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
      baseGroups={baseGroupAssignment?.groups ?? []}
      groupSetName={activity.groupSetName || `${activity.topic || activity.title || "독서 활동"} 활동 모둠`}
      onClose={() => setComposing(false)}
      onSaved={() => onToast?.("모둠을 구성했어요.")}
    />
  );

  // ── 학생(모둠 없음) — 예전처럼 카드를 늘어놓고 고르게 합니다 ──
  if (!isTeacher) {
    return (
      <main className="books-main">
        {/* 잠김 안내는 head의 머리말 둘째 줄에 들어 있습니다 */}
        {head}
        {groups.length === 0 ? (
          <p className="empty-note">
            {perStudent
              ? "아직 내 판이 만들어지지 않았어요. 선생님께 말해 주세요."
              : "아직 모둠이 만들어지지 않았어요. 잠시 기다려 주세요."}
          </p>
        ) : (
          <>
            {freeMode && !myGroup && (
              <p className="book-free-hint">함께할 모둠을 골라 ‘참여하기’를 눌러 주세요.</p>
            )}
            <div className="book-group-grid">
              {groups.map((g) => {
                const members = g.members ?? [];
                const mine = g.id === myGroup?.id;
                const full = members.length >= maxPerGroup;
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
                    {freeMode && (
                      <div className="book-group-card-actions">
                        {mine ? (
                          <button type="button" className="btn-ghost" onClick={() => handleLeave(g)} disabled={busy}>
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
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    );
  }

  // ── 교사 — 왼쪽 모둠 목록 · 가운데 모둠 판 · 오른쪽 진행 ──
  return (
    <main className="books-main book-workspace-main">
      {/* 잠김 안내는 head의 머리말 둘째 줄에 들어 있습니다 */}
      {head}

      {groups.length === 0 ? (
        <p className="empty-note">
          {perStudent
            ? "학생 판이 아직 없어요. 반에 학생이 있는지 확인해 주세요."
            : "아직 모둠이 없어요. ‘모둠 구성’으로 모둠을 만들어 주세요."}
        </p>
      ) : (
        <div className="book-workspace">
          {/* 왼쪽 — 모둠 목록(개별 활동이면 학생 목록) */}
          <aside className="book-group-rail">
            {groups.map((g) => {
              // 모둠에 저장된 members는 배정 당시 스냅샷이라, 반에서 빠진
              // (탈퇴 처리된) 학생도 그대로 남아 보였습니다 — 교사 화면의
              // 반 명단(roster)에 있는 학생만 남깁니다.
              const members = (g.members ?? []).filter((m) => rosterUids.has(m.uid));
              const on = g.id === picked?.id;

              // 개별 활동 — 판 하나가 곧 학생 한 명입니다. '5명' 같은 인원
              // 수나 모둠원 줄이 있으면 오히려 읽기 어려워 학생 한 줄로 둡니다.
              if (perStudent) {
                const me = members[0] ?? (g.members ?? [])[0] ?? null;
                const absent = me && absentUids.has(me.uid);
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`book-rail-card book-rail-card--student${on ? " on" : ""}`}
                    onClick={() => setPickedId(g.id)}
                    aria-pressed={on}
                  >
                    <span className="book-rail-head">
                      <strong>{me?.name || g.groupName || "이름 미설정"}</strong>
                      {absent && <span className="book-absent-chip">결석</span>}
                    </span>
                    {me?.studentId && (
                      <span className="book-rail-members">{me.studentId}</span>
                    )}
                  </button>
                );
              }

              // 카드는 '모둠 고르기' 하나만 합니다. 한때 카드 안의 이름도
              // 각각 단추였는데, 모둠을 고르는 것인지 학생을 고르는 것인지
              // 구분이 어려웠습니다. 학생 고르기는 **판 위의 색 칩**이 맡습니다
              // (ConsonantCanvas의 범례).
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`book-rail-card${on ? " on" : ""}`}
                  onClick={() => setPickedId(g.id)}
                  aria-pressed={on}
                >
                  <span className="book-rail-head">
                    <strong>{g.groupName || `${g.groupIndex}모둠`}</strong>
                    <span className="book-group-count">{members.length}명</span>
                  </span>
                  {members.length === 0 ? (
                    <span className="book-group-empty">아직 모둠원이 없어요</span>
                  ) : (
                    <span className="book-rail-members">
                      {members.map((m) => m.name).join(" · ")}
                    </span>
                  )}
                </button>
              );
            })}
          </aside>

          {/* 가운데 — 고른 모둠의 판 */}
          <div className="book-workspace-center">
            {picked ? (
              <ConsonantCanvas
                key={picked.id}
                activity={activity}
                groupId={picked.id}
                user={user}
                isTeacher
                viewMode="group"
                embedded
                onFocusChange={setFocusUid}
              />
            ) : (
              <p className="empty-note">
                왼쪽에서 {perStudent ? "학생" : "모둠"}을 골라 주세요.
              </p>
            )}
          </div>

          {/* 오른쪽 — 진행 상황.
              모둠 활동은 고른 모둠의 모둠원만, 개별 활동은 반 전체 학생을
              보여 줍니다(판 하나가 곧 한 사람이라 한 명만 보면 견줄 대상이
              없습니다). 개별 활동은 고르기 전에도 바로 보입니다. */}
          {(perStudent || picked) && (
            <GroupProgress
              activity={activity}
              groups={perStudent ? groups : picked ? [picked] : []}
              title={perStudent ? "학생별 진행" : "모둠원별 진행"}
              absentUids={absentUids}
              attendanceKnown={attendanceKnown}
              activityDate={activityDate}
              pickedUid={perStudent ? (picked?.members ?? [])[0]?.uid ?? null : focusUid}
              colorByRow={perStudent}
              roster={roster}
            />
          )}
        </div>
      )}

      {composer}
    </main>
  );
}

// 오른쪽 패널 — 모둠 전체가 아니라 '학생 개인'이 어디까지 했는지.
// 전체 집계 화면의 히트맵과 같은 생김새로, 한 사람당 한 줄(이름 + 칸별 히트맵)씩
// 보여 줍니다 — 누가 아직 못 채웠는지 한눈에 비교할 수 있게.
//
// groups로 여러 판을 한꺼번에 받습니다. 모둠 활동은 고른 모둠 하나만,
// 개별 활동은 반 전체(판 = 학생)를 넘겨 한 화면에서 견주게 합니다.
//
// [결석을 따로 표시하는 이유]
// 0칸은 '아직 안 썼다'와 '그날 못 왔다' 둘 다일 수 있는데, 교사가 볼 때
// 이 둘은 완전히 다른 이야기입니다. 출석 기록이 있는 날에만 결석을
// 구분해 붙입니다(출석을 안 받은 날은 아무 표시도 하지 않습니다).
//
// [이름 앞의 학번, 이름 뒤의 *]
// 같은 성씨·비슷한 이름이 흔해 이름만으로는 명단에서 짚기 어렵습니다. 학번을
// 앞에 붙이면 자리표·출석부와 같은 순서·같은 표기로 읽힙니다(판에 저장된
// members에는 학번이 없을 수 있어 반 명단에서 찾습니다).
// 낱말을 STAR_FROM개 이상 넣은 학생에게는 이름 끝에 *를 답니다 — 칸을 다 채운
// 사람이 여럿일 때 '많이 한 사람'이 숫자를 읽지 않아도 눈에 띕니다.
//
// [colorByRow — 개별 활동의 줄 색]
// 모둠 활동의 색은 '모둠 안에서 몇 번째 자리인가'로 정합니다. 그런데 개별
// 활동은 판마다 사람이 한 명뿐이라 모두가 첫 번째 색 하나로만 칠해집니다.
// 그래서 이때는 모둠 자리가 아니라 목록의 줄 번호로 색을 정합니다(10색 되풀이).
const STAR_FROM = 20;

function GroupProgress({
  activity,
  groups = [],
  title = "모둠원별 진행",
  absentUids = new Set(),
  attendanceKnown = false,
  activityDate = "",
  pickedUid = null,
  colorByRow = false,
  roster = [],
}) {
  const [wordsByGroup, setWordsByGroup] = useState({});

  // 판이 바뀌면 각 판의 낱말을 각각 구독합니다(전체 집계 화면과 같은 방식).
  const idsKey = useMemo(
    () => groups.map((g) => g.id).sort().join(","),
    [groups]
  );
  useEffect(() => {
    if (!idsKey) { setWordsByGroup({}); return; }
    const ids = idsKey.split(",");
    const unsubs = ids.map((gid) =>
      subscribeGroupWords(activity.id, gid, (list) =>
        setWordsByGroup((prev) => ({ ...prev, [gid]: list }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [activity.id, idsKey]);

  // 사람별 칸 채움 현황 — 자음 14칸 순서 그대로(그 사람이 그 칸에 넣은 낱말 수)
  const rows = useMemo(() => {
    const out = [];
    groups.forEach((g) => {
      const words = wordsByGroup[g.id] ?? [];
      memberLegend(g).forEach((m) => {
        const mine = words.filter((w) => w.authorId === m.uid);
        const cellCounts = Array.from(
          { length: CELL_COUNT },
          (_, i) => mine.filter((w) => w.cellKey === cellKey(i)).length
        );
        out.push({
          ...m,
          groupId: g.id,
          cellCounts,
          filled: cellCounts.filter((n) => n > 0).length,
          total: mine.length,
        });
      });
    });
    return colorByRow ? out.map((m, i) => ({ ...m, color: rowColor(i) })) : out;
  }, [groups, wordsByGroup, colorByRow]);

  // 학번은 판에 저장된 members가 아니라 반 명단에서 찾습니다 — 예전에 만든
  // 판에는 학번이 없고, 명단 쪽이 늘 최신입니다.
  const sidOf = useMemo(() => {
    const m = new Map(roster.map((s) => [s.uid, s.studentId]));
    return (uid) => m.get(uid) || "";
  }, [roster]);

  const absentCount = rows.filter((m) => absentUids.has(m.uid)).length;

  // 14칸을 다 채운 사람 수 — '이제 다음으로 넘어가도 되나'에 바로 답합니다.
  // 이 패널이 이미 세어 둔 rows에서 나오는 값이라 읽기가 1건도 안 늡니다.
  //
  // 세는 범위가 화면마다 다릅니다. 개별 활동은 반 전체 판을 다 받으므로 반
  // 전체이고, 모둠 활동은 고른 모둠 하나만 받으므로 그 모둠원입니다 — 반
  // 전체를 보려면 '전체 보기'로 갑니다(그 화면은 모든 판을 받습니다).
  // 없는 자료를 여기서 더 읽어 채우면 이 화면이 활동 크기에 비례해 무거워집니다.
  const doneCount = rows.filter((m) => m.filled >= CELL_COUNT).length;

  return (
    <aside className="dash-side book-group-progress">
      <h3>
        {title}
        {rows.length > 0 && (
          <b
            className="book-progress-done"
            title={`${CELL_COUNT}칸을 다 채운 ${colorByRow ? "학생" : "모둠원"} ${doneCount}명 / ${rows.length}명`}
          >
            다 채움 {doneCount} / {rows.length}
          </b>
        )}
      </h3>
      {attendanceKnown && (
        <p className="book-progress-legend">
          {activityDate} 출석 기준 · 결석 {absentCount}명
        </p>
      )}
      {rows.length === 0 ? (
        <p className="dash-side-empty">아직 참여한 학생이 없어요.</p>
      ) : (
        <ul className="dash-progress-list">
          {rows.map((m) => {
            const absent = absentUids.has(m.uid);
            return (
              <li
                key={`${m.groupId}_${m.uid}`}
                className={`${absent ? "is-absent" : ""}${
                  pickedUid && m.uid === pickedUid ? " is-picked" : ""
                }`}
              >
                <span className="dash-progress-name">
                  <i className="dash-dot" style={{ background: m.color.border }} />
                  {sidOf(m.uid) && (
                    <em className="dash-progress-sid">{sidOf(m.uid)}</em>
                  )}
                  {/* 이름과 *는 한 덩어리 — 부모가 flex라 따로 두면 *가
                      이름에서 떨어져 나갑니다(칸 사이 간격이 붙습니다) */}
                  <span className="dash-progress-who">
                    {m.name}
                    {m.total >= STAR_FROM && (
                      <sup className="dash-progress-star" title={`낱말 ${STAR_FROM}개 이상`}>
                        *
                      </sup>
                    )}
                  </span>
                  {absent && <span className="book-absent-chip">결석</span>}
                </span>
                <span className="dash-progress-num">
                  {m.filled}/{CELL_COUNT}칸
                  <span className="dash-progress-words"> · 낱말 {m.total}개</span>
                </span>
                {/* '모둠별 진행'(전체 보기)과 같은 막대 — 두 패널은 같은
                    활동을 다른 자리에서 보는 것이라 생김새가 같아야 합니다.
                    칸 수는 숫자로도 적혀 있지만, 줄이 스무 개 넘게 이어지면
                    숫자만으로는 누가 뒤처지는지 한눈에 안 들어옵니다. */}
                <span className="dash-progress-bar">
                  <b
                    style={{
                      width: `${(m.filled / CELL_COUNT) * 100}%`,
                      background: barTint(m.color.border),
                    }}
                  />
                </span>
                {/* 이 패널은 '그 칸을 채웠나 안 채웠나'만 봅니다. 낱말 수를
                    진하기로 나타내면 한 개 넣은 칸이 옅게 보여 안 채운 칸과
                    헷갈리고, 진행률을 눈으로 세기 어려워집니다.
                    (모둠별 진행 대시보드는 그대로 진하기를 씁니다 — 거기서는
                    '어디에 얼마나 모였나'가 그 패널의 주제입니다)
                    14칸을 다 채우면 마지막 칸에 붉은 점 — 손들기 표시와 같은
                    점이라 '다 됐다'가 목록을 훑는 중에도 눈에 걸립니다. */}
                <span className="dash-heat">
                  {m.cellCounts.map((n, i) => (
                    <i
                      key={i}
                      className={`dash-heat-cell${
                        m.filled >= CELL_COUNT && i === CELL_COUNT - 1 ? " is-done" : ""
                      }`}
                      style={n > 0 ? { background: m.color.border } : undefined}
                      title={`${CONSONANT_LABELS[i]} · 낱말 ${n}개`}
                    />
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
