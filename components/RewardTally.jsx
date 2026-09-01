"use client";

// =============================================================
// 궁금한 순간 — 반 전체가 지금까지 받은 과일을 한눈에
// -------------------------------------------------------------
// '멋진 순간' 자리표의 🍎 뱃지는 **오늘** 받은 개수입니다. 누가 얼마나
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
import { useEffect, useMemo, useState } from "react";
import { subscribeClassRewards } from "@/lib/store";

const OPEN_KEY = "rewardTallyOpen";

export default function RewardTally({ classId = null, roster = [] }) {
  const [open, setOpen] = useState(false);
  const [rewards, setRewards] = useState([]);

  // 펼침 상태 복원 — 개인 화면 설정이라 localStorage에 둡니다('멋진 순간'
  // 패널의 접힘과 같은 방식).
  useEffect(() => {
    try { setOpen(localStorage.getItem(OPEN_KEY) === "1"); } catch { /* 무시 */ }
  }, []);
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
    <div className="reward-tally">
      {/* 제목은 '멋진 순간'과 같은 .reward-title을 그대로 씁니다 — 같은 패널의
          두 칸이라 글꼴·크기가 갈리면 하나만 덧붙인 것처럼 보입니다. 값을
          그대로 베끼지 않고 클래스를 함께 쓰므로 한쪽만 바뀔 일이 없습니다. */}
      <button
        type="button"
        className="reward-tally-toggle"
        onClick={toggle}
        aria-expanded={open}
        title={open ? "접기" : "반 전체가 받은 과일 보기"}
      >
        <span className="reward-title">🍎 궁금한 순간</span>
        <span className="reward-tally-caret" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>

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
                  <li
                    key={r.uid}
                    className="reward-tally-row"
                    title={`${r.studentId ? `${r.studentId} ` : ""}${r.name} — 과일 ${r.count}개`}
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
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
