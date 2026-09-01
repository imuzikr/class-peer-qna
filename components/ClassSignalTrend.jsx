"use client";

// =============================================================
// 손들기 흐름 (교사 대시보드) — 최근 4주에 누가 몇 번 손을 들었나
// -------------------------------------------------------------
// 손들기는 오랫동안 아무 흔적도 남지 않았습니다. questionSignals는 '지금 손든
// 사람'만 담고 손이 내려가면 문서가 지워져서, 활발했던 수업도 끝나면 0이
// 됐습니다. 지금은 교사가 '확인'으로 받아 준 손을 signalEvents에 한 건씩
// 적습니다(닫기로 내린 손은 잘못 눌린 것이라 세지 않습니다).
//
// [무엇을 보나] 두 가지입니다.
//   · 누가 자주 묻는가 — 막대 길이
//   · 한 번도 손들지 않은 학생이 몇인가 — 이쪽이 더 중요합니다. 활발한
//     학생은 어차피 눈에 띄지만, 한 달째 손을 안 든 학생은 아무 화면에도
//     나타나지 않습니다.
//
// [색] 줄기가 '손든 횟수' 하나뿐이라 막대는 모두 같은 색입니다. 학생마다
// 색을 달리하면 색이 곧 순위가 되어, 한 명이 앞지를 때마다 판 전체가 다시
// 칠해집니다.
//
// [기간] 최근 4주. 한 반이 주 두세 시간이라 주별 값은 크게 출렁이는데,
// 4주로 묶어야 한두 건 차이가 신호처럼 보이지 않습니다.
// =============================================================
import { useMemo } from "react";
import { toDate } from "@/lib/store";

const WEEKS = 4;
const DAY = 24 * 60 * 60 * 1000;

// 손들기 이력은 대시보드가 한 번만 받아, 이 패널과 '참여의 폭'이 나눠 씁니다
// — 같은 컬렉션에 리스너를 둘 걸면 읽기가 두 배가 됩니다.
export default function ClassSignalTrend({ classId = null, roster = [], events = [], loaded = false }) {

  const { rows, total, silent, since } = useMemo(() => {
    const from = Date.now() - WEEKS * 7 * DAY;
    const recent = events.filter((e) => toDate(e.at).getTime() >= from);
    const byUid = new Map();
    recent.forEach((e) => byUid.set(e.uid, (byUid.get(e.uid) ?? 0) + 1));

    // 명단을 기준으로 세웁니다 — 이력에 나온 학생만 세면 '한 번도 안 든
    // 학생'이 목록에서 통째로 빠져, 정작 보려던 것이 안 보입니다.
    const list = (roster.length > 0
      ? roster.map((s) => {
          // 대시보드의 학생 객체는 uid가 아니라 id로 옵니다(ClassRewardTrend와 같음)
          const uid = s.uid ?? s.id;
          return {
            uid,
            name: s.realName || s.name || "이름 미설정",
            studentId: s.studentId ?? null,
            n: byUid.get(uid) ?? 0,
          };
        })
      : [...byUid].map(([uid, n]) => ({
          uid,
          name: recent.find((e) => e.uid === uid)?.name || "이름 미설정",
          studentId: null,
          n,
        }))
    ).sort(
      (a, b) =>
        b.n - a.n ||
        String(a.studentId || a.name).localeCompare(String(b.studentId || b.name), "ko", {
          numeric: true,
        })
    );

    return {
      rows: list,
      total: recent.length,
      silent: list.filter((r) => r.n === 0).length,
      since: new Date(from),
    };
  }, [events, roster]);

  if (!classId) return null;

  const max = rows.reduce((m, r) => Math.max(m, r.n), 0);
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

  return (
    <section className="admin-chart-panel signal-trend">
      <div className="admin-panel-head">
        <h2>✋ 손들기 흐름</h2>
        <span>최근 {WEEKS}주 · {fmt(since)}부터</span>
      </div>

      {!loaded ? (
        <p className="admin-empty">불러오는 중…</p>
      ) : total === 0 ? (
        // 데이터가 없는 이유가 둘입니다 — 정말 아무도 안 들었거나, 아직
        // 쌓이기 전이거나. 뒤쪽이면 '0'을 사실로 읽으면 안 되므로 밝힙니다.
        <p className="admin-empty">
          아직 받아 준 손이 없어요.
          <br />
          <small>
            손들기 이력은 교사가 <strong>‘🍎 확인’</strong>을 누른 순간부터 쌓입니다.
            이 기능을 넣기 전의 손들기는 남아 있지 않아, 처음 얼마간은 비어 있는 것이 정상입니다.
          </small>
        </p>
      ) : (
        <>
          <p className="signal-trend-sum">
            받아 준 손 <strong>{total}번</strong>
            {silent > 0 && (
              <>
                {" · "}
                <em className="signal-trend-silent">
                  {WEEKS}주째 한 번도 안 든 학생 {silent}명
                </em>
              </>
            )}
          </p>
          <ol className="signal-trend-list">
            {rows.map((r) => (
              <li
                key={r.uid}
                className="signal-trend-row"
                title={`${r.studentId ? `${r.studentId} ` : ""}${r.name} — 최근 ${WEEKS}주 ${r.n}번`}
              >
                <span className="signal-trend-name">{r.name}</span>
                <span className="signal-trend-track">
                  {r.n > 0 && (
                    <span
                      className="signal-trend-fill"
                      style={{ width: `${Math.max(4, (r.n / max) * 100)}%` }}
                    />
                  )}
                </span>
                <span className={`signal-trend-val${r.n === 0 ? " zero" : ""}`}>{r.n}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
