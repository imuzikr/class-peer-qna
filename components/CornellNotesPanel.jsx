"use client";

// =============================================================
// 수업 노트 살펴보기 (교사 전용) — '기록 관리' 모달의 한 탭
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
import { subscribeClassCornellNotesOn, todayDateKey } from "@/lib/store";
import { stripHtml } from "@/lib/html";
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
    return onlyWritten ? list.filter((s) => noteByUid.has(s.uid)) : list;
  }, [roster, noteByUid, onlyWritten]);

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
        </div>
        <span className="notes-mgr-summary">
          쓴 학생 <strong>{written}</strong> / {roster.length}
        </span>
        <button
          type="button"
          className={`notes-mgr-filter${onlyWritten ? " active" : ""}`}
          onClick={() => setOnlyWritten((v) => !v)}
          aria-pressed={onlyWritten}
        >
          쓴 학생만
        </button>
      </div>

      {students.length === 0 ? (
        <p className="empty-note">
          {onlyWritten ? "이 날 노트를 쓴 학생이 없어요." : "보여 줄 학생이 없어요."}
        </p>
      ) : (
        <div className="notes-mgr-grid cornell-mgr-grid">
          {students.map((s) => {
            const note = noteByUid.get(s.uid) ?? null;
            const preview = note
              ? stripHtml(note.notes ?? "") || String(note.cue ?? "").trim() || String(note.summary ?? "").trim()
              : "";
            const hasFeedback = !!String(note?.feedback ?? "").trim();
            return (
              <button
                key={s.uid}
                type="button"
                className={`notes-mgr-card cornell-mgr-card${note ? " has" : ""}`}
                onClick={() => setSelected(s)}
                title={
                  note
                    ? `${s.name} — 이 날 노트를 열어 읽고 피드백 남기기`
                    : `${s.name} — 이 날은 안 썼어요. 눌러서 지난 노트 보기`
                }
              >
                <span className="notes-mgr-no">{s.studentId || "-"}</span>
                <span className="notes-mgr-name">{s.name}</span>
                {/* 미리보기 두 줄 — 열어 볼지 말지를 여기서 정합니다.
                    안 쓴 학생은 비워 둡니다(아래 뱃지가 이미 '없음'이라
                    같은 말을 두 번 하게 됩니다). 자리는 남겨 두어야 격자에서
                    뱃지 줄이 카드마다 어긋나지 않습니다 — CSS의 min-height. */}
                <span className="cornell-mgr-preview">
                  {note ? preview || "칸이 비어 있어요" : ""}
                </span>
                <span className={`notes-mgr-badge${note ? " has" : ""}`}>
                  {note ? (hasFeedback ? "피드백 남김" : "노트 있음") : "없음"}
                </span>
              </button>
            );
          })}
        </div>
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
