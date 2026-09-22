"use client";

// =============================================================
// 수업 노트 살펴보기 (교사 전용) — '공부 기록' 모달의 한 탭
// -------------------------------------------------------------
// 교사가 실제로 하는 일은 "수업 끝났다, 오늘 애들이 뭘 적었나 보자"입니다.
// 그래서 **날짜 하나**를 기준으로 반 전체를 늘어놓습니다.
//
// [왜 학기 전체를 한 번에 받지 않는가]
// classes/{반}/cornellNotes는 학생 수 × 수업 일수만큼 쌓입니다(28명 × 한 학기면
// 수천 건). '누가 몇 장 썼나'를 카드마다 보이려면 그걸 다 읽어야 하는데,
// 이 화면은 수업 중에도 열립니다. 날짜로 좁히면 많아야 학생 수만큼입니다.
// 한 학생의 흐름은 카드를 눌러 들어가면 그때 그 학생 것만 받습니다.
// (책방 '14칸 완료 인원'을 활동 목록 카드에서 뺀 것과 같은 이유입니다)
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeClassCornellNotesOn, isCornellRewarded, todayDateKey } from "@/lib/store";
import { flipRoster, useSeatView } from "@/lib/seatView";
import SeatViewToggle from "./SeatViewToggle";
import SeatGrid from "./SeatGrid";
import CornellNoteReadModal from "./CornellNoteReadModal";

// 'YYYY-MM-DD'에서 며칠 옮기기 — 문자열로만 다루면 월말에서 어긋납니다.
function shiftDate(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return todayDateKey(dt);
}

export default function CornellNotesPanel({ classId, roster = [], user }) {
  const today = useMemo(() => todayDateKey(), []);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState([]);
  const [onlyWritten, setOnlyWritten] = useState(false);
  const [selected, setSelected] = useState(null); // 열어 볼 학생
  // 늘어놓는 방향 — 자리표·누가기록 탭과 **같은 값**을 함께 씁니다
  // (lib/seatView.js). 화면마다 따로 기억하면 한 곳에서 뒤집어 놓고
  // 옮겼을 때 같은 반이 두 얼굴이 됩니다.
  const [teacherView, toggleSeatView] = useSeatView();

  useEffect(() => {
    if (!classId || !date) { setNotes([]); return; }
    return subscribeClassCornellNotesOn(classId, date, setNotes);
  }, [classId, date]);

  const noteByUid = useMemo(() => {
    const map = new Map();
    notes.forEach((n) => { if (n.uid) map.set(n.uid, n); });
    return map;
  }, [notes]);

  // 학번순 — 자리표·명단·누가기록과 같은 기준입니다.
  const students = useMemo(() => {
    const list = [...roster].sort((a, b) => {
      if (!a.studentId && !b.studentId) return (a.name || "").localeCompare(b.name || "", "ko");
      if (!a.studentId) return 1;
      if (!b.studentId) return -1;
      return String(a.studentId).localeCompare(String(b.studentId), "ko", { numeric: true });
    });
    const shown = onlyWritten ? list.filter((s) => noteByUid.has(s.uid)) : list;
    // 선생님 보기 — 누가기록 탭과 **같은 함수**로 돌립니다(`flipRoster`).
    // **줄 차례만 뒤집고 줄 안의 좌우는 그대로** 둡니다 — 맞춰야 할 상대가
    // 자리표라서요(까닭과 실측은 lib/seatView.js).
    return teacherView ? flipRoster(shown, 6) : shown;
  }, [roster, noteByUid, onlyWritten, teacherView]);

  const written = roster.filter((s) => noteByUid.has(s.uid)).length;

  if (roster.length === 0) {
    return <p className="empty-note">아직 이 반에 입장한 학생이 없어요.</p>;
  }

  return (
    <>
      <div className="notes-mgr-bar cornell-mgr-bar">
        {/* 화살표는 오른쪽에 모아 둡니다 — 칸 양끝에 떼어 놓으면 하루씩
            옮길 때마다 손이 칸을 가로질러 오갑니다(노트 넘기기와 같은 규칙) */}
        <div className="cornell-mgr-date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || today)}
            aria-label="날짜"
          />
          <div className="cornell-read-nav">
            <button
              type="button"
              className="cornell-read-step"
              onClick={() => setDate((d) => shiftDate(d, -1))}
              title="하루 앞으로"
            >
              ‹
            </button>
            <button
              type="button"
              className="cornell-read-step"
              onClick={() => setDate((d) => shiftDate(d, 1))}
              disabled={date >= today}
              title="하루 뒤로"
            >
              ›
            </button>
          </div>
          {date !== today && (
            <button type="button" className="notes-mgr-filter" onClick={() => setDate(today)}>
              오늘
            </button>
          )}
          <span className="notes-mgr-summary">
            쓴 학생 <strong>{written}</strong> / {roster.length}
          </span>
        </div>
        <div className="notes-mgr-actions">
          <SeatViewToggle teacherView={teacherView} onToggle={toggleSeatView} />
          <button
            type="button"
            className={`notes-mgr-filter${onlyWritten ? " active" : ""}`}
            onClick={() => setOnlyWritten((v) => !v)}
            aria-pressed={onlyWritten}
          >
            쓴 학생만
          </button>
        </div>
      </div>

      {students.length === 0 ? (
        <p className="empty-note">
          {onlyWritten ? "이 날 노트를 쓴 학생이 없어요." : "보여 줄 학생이 없어요."}
        </p>
      ) : (
        <SeatGrid className="notes-mgr-grid" scrollClassName="notes-mgr-scroll" ariaLabel="수업 노트 학생 목록">
          {students.map((s, i) => {
            // 덜 찬 줄을 채우는 빈 칸 — 자리만 차지합니다.
            if (!s) return <div key={`gap-${i}`} className="notes-mgr-gap" aria-hidden="true" />;
            const note = noteByUid.get(s.uid) ?? null;
            const hasFeedback = !!String(note?.feedback ?? "").trim();
            // 과일을 준 학생은 **초록**, 노트는 썼는데 아직 안 준 학생은
            // 주황(살구)입니다. 노트를 읽어 가며 주다 보면 누구까지 줬는지
            // 잊는데, 뱃지를 하나 더 다는 것보다 바탕색이 눈에 먼저
            // 들어옵니다. 안 쓴 학생은 지금까지대로 흰 카드입니다.
            //
            // **판정은 노트 문서의 도장 하나**(`isCornellRewarded` —
            // `rewardedAt`이 있나). 그 칸을 찍는 곳이 수업 노트 창의 과일
            // 단추뿐이라, 값이 있다는 것 자체가 '이 노트를 읽고 줬다'는
            // 뜻입니다 — 자리표에서 준 과일은 여기 안 남습니다(지급 이력으로
            // 세면 안 되는 까닭). 창의 단추를 걷는 판정도 **같은 칸**을
            // 보고 '오늘'만 더합니다(`isCornellRewardedToday`).
            // 이 화면이 이미 구독해 둔 노트로 보므로 **읽는 문서도 안 늡니다.**
            const awarded = isCornellRewarded(note);
            return (
              <button
                key={s.uid}
                type="button"
                className={`notes-mgr-card${note ? " has" : ""}${awarded ? " awarded" : ""}`}
                onClick={() => setSelected(s)}
                title={
                  note
                    ? `${s.name} — 이 날 노트를 열어 읽고 피드백 남기기${
                        awarded ? " (이 날 과일을 줬어요)" : ""
                      }`
                    : `${s.name} — 이 날은 안 썼어요. 눌러서 지난 노트 보기`
                }
              >
                <span className="notes-mgr-no">{s.studentId || "-"}</span>
                <span className="notes-mgr-name">{s.name}</span>
                {/* 카드 안은 누가기록 탭과 **똑같습니다**(학번·이름·뱃지).
                    한때 필기 미리보기를 두 줄 넣었는데, 두 탭을 오가며 같은
                    학생을 찾는 화면이라 카드 크기가 갈리면 눈이 매번 다시
                    자리를 잡아야 했습니다. 무엇을 썼는지는 눌러서 봅니다. */}
                <span className={`notes-mgr-badge${note ? " has" : ""}`}>
                  {note ? (hasFeedback ? "피드백 남김" : "노트 있음") : "없음"}
                </span>
              </button>
            );
          })}
        </SeatGrid>
      )}

      {selected && (
        <CornellNoteReadModal
          classId={classId}
          student={{
            uid: selected.uid,
            name: selected.name,
            emoji: selected.emoji ?? "🙂",
          }}
          user={user}
          initialDate={date}
          onBack={() => setSelected(null)}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
