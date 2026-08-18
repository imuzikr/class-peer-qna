"use client";

// =============================================================
// 참여 전광판 — 발표 중 학생들이 화면을 보고 있는지 한눈에
// -------------------------------------------------------------
// 교실 자리처럼 5×6(30자리) 격자로 그립니다. 학생 수가 적으면 남는
// 자리는 빈 책상으로 두어 자리 위치가 흔들리지 않게 했습니다.
//
//   초록 — 지금 이 화면을 보고 있음
//   주황 — 다른 창/탭에 가려져 있음
//   회색 — 접속하지 않았거나 연결이 끊김(빈 책상도 회색)
//
// 학생 기기는 20초마다 신호를 보냅니다. 그보다 한참(PRESENCE_STALE_MS)
// 소식이 없으면 접속이 끊긴 것으로 봅니다 — PC가 갑자기 꺼져도 '보는 중'
// 으로 남지 않게.
// =============================================================
import { useEffect, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { PRESENCE_STALE_MS, toDate } from "@/lib/store";

const DESK_COUNT = 30; // 5열 × 6행

// 학생 한 명의 상태를 'on' | 'away' | 'off'로 판정
export function deskState(presence, nowMs) {
  if (!presence) return "off";
  const t = presence.updatedAt ? toDate(presence.updatedAt).getTime() : 0;
  // 서버 시각이 아직 확정되지 않았으면(막 쓴 직후) 살아 있는 것으로 봅니다.
  if (t && nowMs - t > PRESENCE_STALE_MS) return "off";
  return presence.visible ? "on" : "away";
}

// 명단 + 참여 상태 → 책상 30칸
export function buildDesks(roster, presence, nowMs) {
  const byUid = new Map(presence.map((p) => [p.uid, p]));
  return Array.from({ length: DESK_COUNT }, (_, i) => {
    const s = roster[i];
    if (!s) return { key: `empty-${i}`, empty: true, state: "off" };
    return {
      key: s.uid,
      name: s.name,
      studentId: s.studentId ?? null,
      state: deskState(byUid.get(s.uid), nowMs),
    };
  });
}

const LABEL = { on: "보는 중", away: "화면 가려짐", off: "미접속" };

export default function AttendanceBoard({ roster = [], presence = [], onClose }) {
  // 학생이 조용해지면(신호 끊김) 스냅샷이 더 오지 않으므로, 시간이 흐른
  // 것만으로도 회색으로 바뀌도록 주기적으로 다시 계산합니다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const desks = buildDesks(roster, presence, now);
  const counts = desks.reduce(
    (acc, d) => {
      if (!d.empty) acc[d.state] += 1;
      return acc;
    },
    { on: 0, away: 0, off: 0 }
  );

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal attend-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attend-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="attend-title">참여 전광판</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="attend-legend">
          <span className="attend-legend-item">
            <i className="attend-chip attend-chip--on" /> 보는 중 {counts.on}
          </span>
          <span className="attend-legend-item">
            <i className="attend-chip attend-chip--away" /> 화면 가려짐 {counts.away}
          </span>
          <span className="attend-legend-item">
            <i className="attend-chip attend-chip--off" /> 미접속 {counts.off}
          </span>
        </div>

        {roster.length === 0 ? (
          <p className="lesson-note-empty">
            이 반에 입장한 학생이 없어요. 입장 코드를 알려 주세요.
          </p>
        ) : (
          <div className="attend-grid">
            {desks.map((d) => (
              <div
                key={d.key}
                className={`attend-desk attend-desk--${d.empty ? "empty" : d.state}`}
                title={d.empty ? "빈 자리" : `${d.name} · ${LABEL[d.state]}`}
              >
                {!d.empty && (
                  <>
                    {d.studentId && <span className="attend-desk-no">{d.studentId}</span>}
                    <span className="attend-desk-name">{d.name}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
