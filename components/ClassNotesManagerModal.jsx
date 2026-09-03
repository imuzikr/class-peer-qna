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
import { subscribeClassNoteCounts } from "@/lib/store";
import StudentNotesModal from "./StudentNotesModal";
import CornellNotesPanel from "./CornellNotesPanel";

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

  useEffect(() => {
    if (!classId) { setCounts({}); return; }
    return subscribeClassNoteCounts(classId, setCounts);
  }, [classId]);

  // 학번순 — 자리표·명단과 같은 기준이라 눈으로 찾기 쉽습니다.
  const students = useMemo(() => {
    const list = [...roster].sort((a, b) => {
      if (!a.studentId && !b.studentId) return (a.name || "").localeCompare(b.name || "", "ko");
      if (!a.studentId) return 1;
      if (!b.studentId) return -1;
      return String(a.studentId).localeCompare(String(b.studentId), "ko", { numeric: true });
    });
    return onlyEmpty ? list.filter((s) => !(counts[s.uid] > 0)) : list;
  }, [roster, counts, onlyEmpty]);

  const withNotes = roster.filter((s) => counts[s.uid] > 0).length;

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
            <h3>
              📝 기록 관리
              {className && <span className="notes-student">{className}</span>}
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
              📝 누가기록
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "cornell"}
              className={`notes-mgr-tab${tab === "cornell" ? " active" : ""}`}
              onClick={() => setTab("cornell")}
              title="학생이 수업 중에 적은 코넬 노트를 읽고 피드백을 남깁니다"
            >
              📓 수업 노트
            </button>
          </div>

          {tab === "cornell" ? (
            <CornellNotesPanel classId={classId} roster={roster} user={user} />
          ) : roster.length === 0 ? (
            <p className="empty-note">아직 이 반에 입장한 학생이 없어요.</p>
          ) : (
            <>
              <div className="notes-mgr-bar">
                <span className="notes-mgr-summary">
                  기록 있음 <strong>{withNotes}</strong> · 아직 없음{" "}
                  <strong>{roster.length - withNotes}</strong>
                </span>
                {/* 이 화면을 여는 가장 흔한 이유가 '누구를 아직 못 남겼나'라
                    그 추리기를 버튼 하나로 둡니다. */}
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
          classId={classId}
          onBack={() => setSelected(null)}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
