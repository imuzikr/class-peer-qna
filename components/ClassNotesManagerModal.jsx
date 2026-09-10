"use client";

// =============================================================
// 기록 관리 (교사 전용) — 반 학생 전체를 한 화면에서
// -------------------------------------------------------------
// 탭이 둘입니다. 주인이 반대인 두 기록을 한 자리에 모았습니다.
//   · 누가기록  — **교사가 쓰는** 학생 관찰 메모
//   · 수업 노트 — **학생이 쓴** 코넬 노트를 읽고 한 마디 남기기
// 둘 다 '반 학생 전체를 학번순으로 늘어놓고 하나를 골라 들어간다'는 같은
// 모양이라, 버튼을 하나 더 늘리는 대신 탭으로 묶었습니다.
//
// [누가기록 탭]
// 지금까지 누가기록은 자리표에서 학생 자리를 눌러 하나씩 들어가야 했습니다.
// "이번 학기에 누구 기록을 남겼고 누구를 아직 못 남겼나"를 보려면 자리를
// 스물여덟 번 눌러 봐야 했습니다.
//
// 그래서 이 화면은 '누가 몇 건'만 보여 줍니다. 기록 내용은 여기서 안 보여
// 줍니다 — 전자칠판에 공부방을 띄워 둔 채로 열 수 있는 화면이라, 관찰 메모가
// 통째로 뜨면 곤란합니다. 내용은 학생을 골라 들어가야 나옵니다.
//
// 학생을 고르면 기존 누가기록 모달(StudentNotesModal)이 그 위에 열리고,
// 거기서 ‹ 로 이 화면으로 돌아옵니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import SeatViewToggle from "./SeatViewToggle";
import { useSeatView } from "@/lib/seatView";
import {
  subscribeClassNoteCounts,
  subscribeClasses,
  subscribeClassMembers,
  fetchClassRosterProfiles,
} from "@/lib/store";
import StudentNotesModal from "./StudentNotesModal";
import CornellNotesPanel from "./CornellNotesPanel";
import { IconMyPost, IconRecord } from "./StatusIcons";

export default function ClassNotesManagerModal({
  classId,
  className = "",
  roster = [],
  user = null,
  onClose,
}) {
  const [tab, setTab] = useState("notes"); // notes | cornell
  const [counts, setCounts] = useState({});
  const [selected, setSelected] = useState(null); // 기록을 열어 볼 학생
  const [onlyEmpty, setOnlyEmpty] = useState(false); // '아직 없는 학생만' 보기
  // 카드를 늘어놓는 쪽 — 자리표와 같은 값을 함께 씁니다(lib/seatView.js).
  const [teacherView, toggleSeatView] = useSeatView();

  // ── 반 고르기 ───────────────────────────────────────────────
  // 이 창은 '지금 이 반'의 맥락에서 열리지만, 교사가 실제로 하는 일은
  // '오늘 세 반 중 누가 노트를 썼나'를 훑는 것입니다. 예전에는 반 이름
  // 배지뿐이라 옆 반을 보려면 창을 닫고 화면에서 반을 바꾼 뒤 다시 열어야
  // 했습니다. 머리말의 고르개로 창 안에서 바꿉니다.
  const [pickedId, setPickedId] = useState(classId);
  const [myClasses, setMyClasses] = useState([]);
  // 다른 반을 고른 동안의 명단. **`null`은 '아직 안 왔다'**, `[]`는 '없다'
  // 입니다 — 갈라 두지 않으면 반을 바꿀 때마다 '입장한 학생이 없어요'가
  // 한 번 스칩니다(CLAUDE.md '첫 화면' 절의 그 함정).
  const [otherRoster, setOtherRoster] = useState(null);

  // 화면에서 반을 바꾸면 창도 따라갑니다 — 안 그러면 머리말은 새 반인데
  // 목록은 앞 반이라 어느 반을 보는 중인지 어긋납니다.
  useEffect(() => { setPickedId(classId); }, [classId]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return subscribeClasses((list) =>
      setMyClasses(list.filter((c) => c.createdBy === user.uid))
    );
  }, [user?.uid]);

  // 지금 보는 반이 창을 연 그 반인가. 그렇다면 **페이지가 이미 만들어 둔
  // 명단을 그대로 씁니다** — 흔한 경우라 여기서 읽는 문서가 하나도 없습니다.
  const isHome = pickedId === classId;

  // 옆 반을 고른 동안만 그 반 명단을 만듭니다(소속 → 이름·학번).
  // `subscribeUserDirectory`(users 통째로)를 안 쓰는 까닭: 여기 필요한 것은
  // 그 반 학생 스물몇 명뿐이라, uid를 아는 사람만 한 건씩 읽는 편이 좁습니다.
  useEffect(() => {
    if (isHome || !pickedId) { setOtherRoster(null); return undefined; }
    let alive = true;
    setOtherRoster(null);
    const unsub = subscribeClassMembers(pickedId, async (uids) => {
      const list = await fetchClassRosterProfiles(uids);
      if (alive) setOtherRoster(list);
    });
    return () => { alive = false; unsub(); };
  }, [pickedId, isHome]);

  const shownRoster = isHome ? roster : otherRoster ?? [];
  const rosterLoading = !isHome && otherRoster === null;

  // 반을 바꾸면 열어 둔 학생 창을 닫습니다 — 앞 반 학생이 그대로 남으면
  // 새 반 맥락에서 남의 반 기록을 보게 됩니다.
  useEffect(() => { setSelected(null); }, [pickedId]);

  useEffect(() => {
    if (!pickedId) { setCounts({}); return; }
    return subscribeClassNoteCounts(pickedId, setCounts);
  }, [pickedId]);

  // 학번순 — 자리표·명단과 같은 기준이라 눈으로 찾기 쉽습니다.
  const students = useMemo(() => {
    const list = [...shownRoster].sort((a, b) => {
      if (!a.studentId && !b.studentId) return (a.name || "").localeCompare(b.name || "", "ko");
      if (!a.studentId) return 1;
      if (!b.studentId) return -1;
      return String(a.studentId).localeCompare(String(b.studentId), "ko", { numeric: true });
    });
    const shown = onlyEmpty ? list.filter((s) => !(counts[s.uid] > 0)) : list;
    // 선생님 보기 — 교탁에서 본 방향. **여기서는 배열을 뒤집습니다.**
    // 자리표(빈 칸이 섞인 격자)는 그림을 180도 돌려야 하지만, 이 격자는
    // 빈 칸도 자리 번호도 없는 그냥 명단이라 뒤집는 편이 낫습니다 —
    // 돌리면 (ㄱ) 목록이 길 때 안쪽 스크롤이 거꾸로 되고, (ㄴ) 마지막 줄의
    // 남는 자리가 첫 줄 왼쪽에 생겨 어색합니다.
    return teacherView ? [...shown].reverse() : shown;
  }, [shownRoster, counts, onlyEmpty, teacherView]);

  const withNotes = shownRoster.filter((s) => counts[s.uid] > 0).length;

  return (
    <>
      <div className="modal-backdrop" {...backdropClose(onClose)}>
        <div
          className="modal modal-notes-manager"
          role="dialog"
          aria-modal="true"
          aria-label="누가기록 관리"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-head">
            <h3 className="head-icon">
              <IconMyPost size={20} /> 기록 관리
              {/* 고를 반이 하나뿐이면 지금까지처럼 이름 배지입니다 — 한 줄짜리
                  고르개는 누를 것이 없는데 눌러 보게 만듭니다(책방 머리말의
                  반 고르개와 같은 판정·같은 클래스). */}
              {myClasses.length > 1 ? (
                <select
                  className="study-class-select notes-mgr-class"
                  value={pickedId ?? ""}
                  onChange={(e) => setPickedId(e.target.value)}
                  title="반을 바꾸면 그 반의 기록을 봅니다"
                  aria-label="반 고르기"
                >
                  {myClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : (
                className && <span className="notes-student">{className}</span>
              )}
            </h3>
            <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
          </div>

          <div className="notes-mgr-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "notes"}
              className={`notes-mgr-tab${tab === "notes" ? " active" : ""}`}
              onClick={() => setTab("notes")}
            >
              <IconMyPost size={15} /> 누가기록
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "cornell"}
              className={`notes-mgr-tab${tab === "cornell" ? " active" : ""}`}
              onClick={() => setTab("cornell")}
              title="학생이 수업 중에 적은 코넬 노트를 읽고 피드백을 남깁니다"
            >
              <IconRecord size={15} /> 수업 노트
            </button>
          </div>

          {/* 옆 반 명단을 받아 오는 동안 — 빈 배열로 그리면 '입장한 학생이
              없어요'가 한 번 스칩니다(위 `otherRoster` 주석 참고). */}
          {rosterLoading ? (
            <p className="empty-note">명단을 불러오는 중이에요…</p>
          ) : tab === "cornell" ? (
            <CornellNotesPanel classId={pickedId} roster={shownRoster} user={user} />
          ) : shownRoster.length === 0 ? (
            <p className="empty-note">아직 이 반에 입장한 학생이 없어요.</p>
          ) : (
            <>
              <div className="notes-mgr-bar">
                <span className="notes-mgr-summary">
                  기록 있음 <strong>{withNotes}</strong> · 아직 없음{" "}
                  <strong>{shownRoster.length - withNotes}</strong>
                </span>
                {/* 이 화면을 여는 가장 흔한 이유가 '누구를 아직 못 남겼나'라
                    그 추리기를 버튼 하나로 둡니다. */}
                {/* 교실에서 보이는 자리 차례로 훑을 수 있게 — 자리표의 그
                    단추와 같은 값을 씁니다(한쪽에서 뒤집으면 함께 바뀝니다) */}
                <SeatViewToggle teacherView={teacherView} onToggle={toggleSeatView} />
                <button
                  type="button"
                  className={`notes-mgr-filter${onlyEmpty ? " active" : ""}`}
                  onClick={() => setOnlyEmpty((v) => !v)}
                  aria-pressed={onlyEmpty}
                >
                  아직 없는 학생만
                </button>
              </div>

              {students.length === 0 ? (
                <p className="empty-note">모든 학생에게 기록이 있어요.</p>
              ) : (
                <div className="notes-mgr-grid">
                  {students.map((s) => {
                    const n = counts[s.uid] ?? 0;
                    return (
                      <button
                        key={s.uid}
                        type="button"
                        className={`notes-mgr-card${n > 0 ? " has" : ""}`}
                        onClick={() => setSelected(s)}
                        title={
                          n > 0
                            ? `${s.name} — 누가기록 ${n}건 보기`
                            : `${s.name} — 아직 기록이 없어요. 눌러서 남기기`
                        }
                      >
                        {/* 학번을 위, 이름을 아래로. 동물 아이콘은 뺐습니다 —
                            서른 장을 학번순으로 훑는 화면이라 눈이 따라가는
                            것은 숫자인데, 그 위에 아이콘이 한 줄 더 있으면
                            숫자가 카드 가운데로 밀려 줄이 안 맞습니다. */}
                        <span className="notes-mgr-no">{s.studentId || "-"}</span>
                        <span className="notes-mgr-name">{s.name}</span>
                        {/* 있음/없음이 한눈에 갈리도록 색과 글자를 함께 씁니다 —
                            색만으로 나누면 색 구분이 어려운 사람에게 안 보입니다. */}
                        <span className={`notes-mgr-badge${n > 0 ? " has" : ""}`}>
                          {n > 0 ? `${n}건` : "없음"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 학생별 기록 — 이 화면 위에 열리고, ‹ 로 여기로 돌아옵니다 */}
      {selected && (
        <StudentNotesModal
          student={{
            uid: selected.uid,
            name: selected.name,
            emoji: selected.emoji ?? "🙂",
          }}
          classId={pickedId}
          onBack={() => setSelected(null)}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
