"use client";

// =============================================================
// 자리 배치 (학생) — 선생님이 정해 둔 자리에서 내 자리가 어디인가
// -------------------------------------------------------------
// 학생에게는 자리표를 보는 길이 아예 없었습니다. 교사 화면(참여 전광판·
// 수업 중 자리표·손든 학생 확인)은 전부 교사 전용이고, 학생은 새 학기·자리
// 바꾼 날 자기 자리를 물어서 찾아야 했습니다.
//
// [교사 화면과 다른 점 — 일부러 그렇습니다]
//  · **출석과 무관합니다.** 출석/결석으로 칠하지 않습니다. 급우가 오늘
//    왔는지는 학생이 알아야 할 일이 아니고, 이 화면이 답하는 물음은
//    '내 자리가 어디인가' 하나뿐입니다. 그래서 색은 두 가지 —
//    내 자리 한 칸만 초록(.attend-seat--me), 나머지는 늘 회색입니다.
//  · **누를 수 없습니다.** 과일 주기·누가기록은 교사의 일입니다. 자리 칸을
//    <button>이 아니라 <div>로 그려, 탭 이동에도 걸리지 않습니다.
//  · **끌어 옮길 수 없습니다.** 자리를 정하는 것은 선생님입니다.
//  · **'선생님 보기'가 없습니다.** 학생은 늘 앉은 자리에서 칠판을 보므로
//    뒤집을 일이 없습니다(useSeatView는 교사 화면들의 값입니다).
//
// [읽는 것] 자리표 문서 둘뿐입니다 — 기본 자리표(default)와 오늘 임시
// 자리표(daily_날짜). 순서도 교사 화면과 같습니다(오늘 것이 있으면 그것).
// 한쪽만 보면 선생님이 오늘 자리를 흔든 날 학생 화면만 옛 자리를 가리켜,
// 같은 교실에 두 개의 자리표가 생깁니다.
// 이름·학번은 페이지가 이미 갖고 있는 급우 명단(studentClassRoster)을
// 그대로 받습니다 — 여기서 새로 읽는 문서가 없습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  dailySeatLayoutId,
  subscribeStudySeatLayout,
  todayDateKey,
} from "@/lib/store";
import { normalizeSeats } from "@/lib/seats";

export default function MySeatModal({ classId, myUid, roster = [], onClose }) {
  const [seatLayout, setSeatLayout] = useState(null);
  const [dailySeatLayout, setDailySeatLayout] = useState(null);
  const todayLayoutId = dailySeatLayoutId(todayDateKey());

  useEffect(() => {
    if (!classId) return;
    return subscribeStudySeatLayout(classId, "default", setSeatLayout);
  }, [classId]);

  useEffect(() => {
    if (!classId) return;
    return subscribeStudySeatLayout(classId, todayLayoutId, setDailySeatLayout);
  }, [classId, todayLayoutId]);

  // 오늘 임시 자리표가 있으면 그것을, 없으면 기본 자리표를 씁니다
  const seats = useMemo(
    () => normalizeSeats(dailySeatLayout?.seats ?? seatLayout?.seats ?? [], roster),
    [dailySeatLayout?.seats, seatLayout?.seats, roster]
  );
  const byUid = useMemo(() => new Map(roster.map((s) => [s.uid, s])), [roster]);

  // 선생님이 아직 자리를 배정하지 않았는지 — normalizeSeats가 명단으로 빈
  // 자리를 채워 주므로 seats만 보면 '배정됨'과 구별되지 않습니다. 저장된
  // 문서가 하나도 없을 때만 안내를 띄웁니다.
  const noLayout = !dailySeatLayout && !seatLayout;
  const mySeatNo = seats.findIndex((uid) => uid === myUid);

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal my-seat-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="my-seat-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="my-seat-title">자리 배치</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {roster.length === 0 ? (
          /* 명단이 빈 것은 '아무도 없다'가 아니라 대개 '아직 안 왔다'입니다
             (급우 프로필을 한 명씩 읽어 오는 중). 그대로 그리면 자리가 전부
             점선 빈 칸이 되어 '자리가 없다'로 읽힙니다. */
          <p className="lesson-note-empty">명단을 불러오는 중이에요.</p>
        ) : noLayout ? (
          <p className="lesson-note-empty">선생님이 아직 자리를 정하지 않았어요.</p>
        ) : (
          <div className="attend-seatmap">
            <div className="attend-seatmap-head">
              <span className="attend-seatmap-board">칠판</span>
            </div>
            <div className="attend-seatmap-grid">
              {seats.map((uid, i) => {
                const s = uid ? byUid.get(uid) : null;
                if (!s) {
                  return <div key={`empty-${i}`} className="attend-seat attend-seat--empty" />;
                }
                const me = s.uid === myUid;
                return (
                  <div
                    key={s.uid}
                    className={`attend-seat attend-seat--${me ? "me" : "unchecked"}`}
                    title={`${s.name}${s.studentId ? ` · ${s.studentId}` : ""}${me ? " · 내 자리" : ""}`}
                  >
                    <span className="attend-seat-no">{s.studentId || "-"}</span>
                    <span className="attend-seat-name">{s.name}</span>
                  </div>
                );
              })}
            </div>
            <p className="my-seat-foot">
              {mySeatNo >= 0
                ? "초록으로 칠한 자리가 내 자리예요."
                : "아직 내 자리가 정해지지 않았어요 — 선생님께 말씀드리세요."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
