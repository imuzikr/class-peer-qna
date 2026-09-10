"use client";

// =============================================================
// 궁금한 순간 — 반 전체가 지금까지 받은 과일을 한눈에
// -------------------------------------------------------------
// '멋진 순간' 자리표의 🍊 뱃지는 **오늘** 받은 개수입니다. 누가 얼마나
// 쌓아 왔는지는 자리를 하나씩 눌러 과일 주기 모달을 열어야 알 수 있었습니다.
// 이 패널은 누적 총계를 많이 받은 순으로 가로 막대에 늘어놓습니다.
//
// [읽기] 열었을 때만 구독합니다. 닫아 두면 한 건도 읽지 않습니다 — 늘 보는
// 자리가 아니라 가끔 확인하는 자리라서. 반 하나의 rewards라 열어도 학생 수
// 만큼(수십 건)입니다.
//
// [왜 roster의 count를 안 쓰나] 공부방(app/study)의 roster에는 count가 실려
// 있지만 책방(app/books)의 roster에는 없습니다. 같은 패널을 두 화면이 쓰므로
// 한쪽에서만 0으로 보이지 않도록 여기서 직접 받습니다.
//
// [색] 줄기가 '과일 수' 하나뿐이라 막대는 모두 같은 색입니다. 학생마다 색을
// 달리하면 색이 곧 순위가 되어, 한 명이 앞지를 때마다 화면 전체가 다시
// 칠해집니다. 길이가 이미 크기를 말하므로 색은 거들지 않습니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeClassRewards } from "@/lib/store";
import StudentRewardTrend from "./StudentRewardTrend";

const OPEN_KEY = "rewardTallyOpen";

// embedded — 탭 안에 끼워 넣는 모습. 제목 줄과 접기를 두지 않고 늘 펼쳐
// 있습니다(탭 자체가 여닫는 구실을 하므로 접기 단추가 겹칩니다). 이 모드에서는
// 탭을 떠나면 컴포넌트가 통째로 사라져 구독도 함께 끊깁니다.
export default function RewardTally({ classId = null, roster = [], embedded = false }) {
  const [open, setOpen] = useState(embedded);
  const [rewards, setRewards] = useState([]);
  // 누른 줄의 이력을 그 옆에 띄웁니다 — { row, x, y }
  // (모달이 아니라 **팝오버**입니다: 뒤를 막지 않고, 누른 것 옆에 붙고,
  //  바깥을 누르면 닫힙니다.)
  const [picked, setPicked] = useState(null);

  // 펼침 상태 복원 — 개인 화면 설정이라 localStorage에 둡니다('멋진 순간'
  // 패널의 접힘과 같은 방식). 끼워 넣은 모습에서는 접는 개념이 없어 건너뜁니다.
  useEffect(() => {
    if (embedded) return;
    try { setOpen(localStorage.getItem(OPEN_KEY) === "1"); } catch { /* 무시 */ }
  }, [embedded]);
  function toggle() {
    setOpen((v) => {
      try { localStorage.setItem(OPEN_KEY, v ? "0" : "1"); } catch { /* 무시 */ }
      return !v;
    });
  }

  useEffect(() => {
    if (!open || !classId) { setRewards([]); return; }
    return subscribeClassRewards(classId, setRewards);
  }, [open, classId]);

  // 접으면 열어 둔 팝오버도 함께 닫습니다 — 패널이 사라졌는데 그 옆에
  // 작은 창만 떠 있으면 무엇에 딸린 것인지 알 수 없습니다.
  useEffect(() => { if (!open) setPicked(null); }, [open]);

  // ── 이력 팝오버 ──────────────────────────────────────────
  // **`position: fixed`로 띄웁니다.** 목록이 `max-height: 320px`로 구르므로,
  // 줄 안에 절대 배치로 넣으면 목록 밖으로 나가는 부분이 잘립니다.
  const popRef = useRef(null);

  function openFor(row, el) {
    const r = el.getBoundingClientRect();
    const W = 300;
    const H = 260;
    const GAP = 10;
    // 오른쪽에 자리가 있으면 오른쪽, 없으면 왼쪽 — 이 패널은 화면 왼쪽 끝에
    // 붙어 있을 때가 많아 대개 오른쪽으로 섭니다.
    const right = r.right + GAP;
    const x = right + W <= window.innerWidth - 8 ? right : Math.max(8, r.left - GAP - W);
    // 줄 높이에 맞춰 띄우되 화면 아래로 넘치면 위로 끌어올립니다.
    const y = Math.min(Math.max(8, r.top - 8), Math.max(8, window.innerHeight - H - 8));
    setPicked({ row, x, y });
  }

  // 바깥을 누르거나 Esc면 닫힙니다(팝오버의 성격 — 모달과 달리 뒤를 막지
  // 않습니다). `isConnected` 한 줄은 이 앱의 약속입니다: 누르는 순간 스스로
  // 사라지는 것이 안에 있으면 그 노드가 문서에서 떨어져 나가 `contains`가
  // false가 되고, '바깥을 눌렀다'로 잘못 읽힙니다(CLAUDE.md 참고).
  useEffect(() => {
    if (!picked) return undefined;
    function onDown(e) {
      if (!e.target.isConnected) return;
      if (popRef.current?.contains(e.target)) return;
      if (e.target.closest?.(".reward-tally-row")) return; // 다른 줄로 옮겨 가는 중
      setPicked(null);
    }
    function onKey(e) { if (e.key === "Escape") setPicked(null); }
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [picked]);

  const rows = useMemo(() => {
    const countByUid = new Map(rewards.map((r) => [r.uid, r.count ?? 0]));
    return roster
      .map((s) => ({
        uid: s.uid,
        name: s.name,
        studentId: s.studentId ?? null,
        count: countByUid.get(s.uid) ?? 0,
      }))
      // 집계 화면이라 많이 받은 순입니다. 같은 개수는 학번순으로 붙여 두어
      // 과일이 하나 오갈 때마다 동점자들의 자리가 흔들리지 않게 합니다.
      .sort(
        (a, b) =>
          b.count - a.count ||
          (a.studentId || a.name).localeCompare(b.studentId || b.name, "ko")
      );
  }, [rewards, roster]);

  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className={`reward-tally${embedded ? " reward-tally--embedded" : ""}`}>
      {/* 제목은 '멋진 순간'과 같은 .reward-title을 그대로 씁니다 — 같은 패널의
          두 칸이라 글꼴·크기가 갈리면 하나만 덧붙인 것처럼 보입니다. 값을
          그대로 베끼지 않고 클래스를 함께 쓰므로 한쪽만 바뀔 일이 없습니다. */}
      {!embedded && (
        <button
          type="button"
          className="reward-tally-toggle"
          onClick={toggle}
          aria-expanded={open}
          title={open ? "접기" : "반 전체가 받은 과일 보기"}
        >
          <span className="reward-title">🍊 궁금한 순간</span>
          <span className="reward-tally-caret" aria-hidden="true">
            {open ? "▴" : "▾"}
          </span>
        </button>
      )}

      {open && (
        <div className="reward-tally-body">
          {rows.length === 0 ? (
            <p className="reward-tally-empty">반 명단이 아직 없어요.</p>
          ) : max === 0 ? (
            <p className="reward-tally-empty">아직 받은 과일이 없어요.</p>
          ) : (
            <>
              {/* 막대에 눈금을 두지 않는 대신 줄 끝에 숫자를 답니다 — 폭이
                  288px뿐이라 눈금까지 넣으면 이름 자리가 남지 않습니다. */}
              <p className="reward-tally-sum">
                모두 {total}개 · 가장 많이 {max}개
              </p>
              <ol className="reward-tally-list">
                {rows.map((r) => (
                  <li key={r.uid}>
                    {/* 줄 전체가 단추입니다 — 막대만 누르게 하면 과일이 적은
                        학생일수록 누를 곳이 좁아집니다(0개면 아예 없습니다). */}
                    <button
                      type="button"
                      className={`reward-tally-row${picked?.row.uid === r.uid ? " on" : ""}`}
                      onClick={(e) => openFor(r, e.currentTarget)}
                      aria-expanded={picked?.row.uid === r.uid}
                      title={`${r.studentId ? `${r.studentId} ` : ""}${r.name} — 과일 ${r.count}개 · 눌러서 받은 흐름 보기`}
                    >
                      <span className="reward-tally-name">{r.name}</span>
                      <span className="reward-tally-track">
                        {r.count > 0 && (
                          <span
                            className="reward-tally-fill"
                            style={{ width: `${Math.max(4, (r.count / max) * 100)}%` }}
                          />
                        )}
                      </span>
                      <span
                        className={`reward-tally-val${r.count === 0 ? " zero" : ""}`}
                      >
                        {r.count}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      {/* 이력 팝오버 — 누른 줄 옆. 모달이 아니라 뒤가 그대로 살아 있어,
          다른 줄을 바로 눌러 옮겨 갈 수 있습니다. */}
      {picked && (
        <div
          ref={popRef}
          className="tally-pop"
          style={{ left: picked.x, top: picked.y }}
          role="dialog"
          aria-label={`${picked.row.name} 과일 받은 흐름`}
        >
          <div className="tally-pop-head">
            <strong>
              {picked.row.studentId && <em>{picked.row.studentId}</em>}
              {picked.row.name}
            </strong>
            <span className="tally-pop-count">🍊 {picked.row.count}</span>
            <button
              type="button"
              className="btn-close"
              onClick={() => setPicked(null)}
              aria-label="닫기"
            >
              ×
            </button>
          </div>
          {/* 접는 단추도 제목도 없이 흐름만 — 위 머리줄이 누구인지와 몇 개인지를
              이미 말합니다(`bare`·`flush`·`showToggle={false}`). */}
          <StudentRewardTrend
            studentUid={picked.row.uid}
            classId={classId}
            defaultOpen
            bare
            flush
            showToggle={false}
          />
        </div>
      )}
    </div>
  );
}
