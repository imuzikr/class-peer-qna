"use client";

// =============================================================
// 쏠림 — 과일이 누구에게 갔나 (교사 자기 점검)
// -------------------------------------------------------------
// 이 패널이 재는 것은 학생이 아니라 **교사의 관찰**입니다. 과일은 교사가
// 주는 것이라, 많이 받은 학생이 곧 참여를 많이 한 학생이라고 읽으면
// 순환논리가 됩니다("내가 많이 준 학생이 참여를 많이 한 학생").
// 그래서 여기서 묻는 것은 하나입니다 — **내 눈길이 고른가.**
//
// [세 가지를 봅니다]
//   · 상위 다섯 명이 전체의 몇 %를 가져갔나
//   · 아직 한 명도 못 받은 학생이 몇인가, 누구인가
//   · 몇 명에게나 갔나 (받은 사람 수 / 반 전체)
//
// [왜 지니 계수 같은 지표를 안 쓰나] 한 반 25명에 몇 십 건이라 표본이
// 너무 작습니다. 0.38 같은 숫자는 정밀해 보이지만 한두 건에 크게 흔들리고,
// 무엇보다 교사가 그 값을 보고 할 일이 없습니다. '상위 5명 34%'와
// '아직 0명인 학생 6명'은 바로 다음 수업에서 할 일이 됩니다.
//
// [구독하지 않습니다] 과일 이력은 옆의 '반 전체 과일 흐름'이 이미 받아
// 두고 있어, 그 배열을 그대로 받아 씁니다. 같은 컬렉션에 리스너를 하나 더
// 걸면 읽기가 두 배가 됩니다.
// =============================================================
import { useMemo } from "react";

// 상위 몇 명을 한 덩어리로 볼 것인가 — 한 모둠 크기입니다.
const TOP = 5;
// 진하기 네 단계(같은 색의 밝기만). 크고 작음은 순서가 있는 값이라
// 여러 색을 섞으면 오히려 못 읽습니다.
const BANDS = ["#b85c3f", "#d98a63", "#eeba9e", "#f7e3d8"];

export default function RewardSkew({ events = [], roster = [], loaded = false }) {
  const stat = useMemo(() => {
    // 회수(delta 음수)는 빼고 '준 것'만 셉니다 — 쏠림은 눈길이 어디로
    // 갔는지의 이야기라, 도로 거둔 건이 상쇄하면 안 됩니다.
    const given = events.filter((e) => (e.delta ?? 0) > 0);
    const byUid = new Map();
    given.forEach((e) => byUid.set(e.uid, (byUid.get(e.uid) ?? 0) + (e.delta ?? 0)));

    const total = [...byUid.values()].reduce((a, b) => a + b, 0);
    const people = roster.map((s) => {
      const uid = s.uid ?? s.id;
      return {
        uid,
        name: s.realName || s.name || "이름 미설정",
        studentId: s.studentId ?? null,
        n: byUid.get(uid) ?? 0,
      };
    });

    const sorted = [...people].sort((a, b) => b.n - a.n);
    const bandOf = (from, to) =>
      sorted.slice(from, to).reduce((sum, p) => sum + p.n, 0);

    // 아직 한 개도 못 받은 학생 — 이름까지 보여 줍니다. 숫자만으로는
    // 다음 수업에서 누구를 볼지 정할 수 없습니다.
    const none = people
      .filter((p) => p.n === 0)
      .sort((a, b) =>
        String(a.studentId || a.name).localeCompare(String(b.studentId || b.name), "ko", {
          numeric: true,
        })
      );

    return {
      total,
      reached: people.filter((p) => p.n > 0).length,
      size: people.length,
      none,
      bands: [
        { label: `상위 ${TOP}명`, v: bandOf(0, TOP) },
        { label: `다음 ${TOP}명`, v: bandOf(TOP, TOP * 2) },
        { label: "다음 10명", v: bandOf(TOP * 2, TOP * 2 + 10) },
        { label: "나머지", v: bandOf(TOP * 2 + 10, sorted.length) },
      ].filter((b) => b.v > 0),
    };
  }, [events, roster]);

  if (!loaded || stat.size === 0) return null;

  const pct = (v) => Math.round((v / stat.total) * 100);
  const topShare = stat.total > 0 ? pct(stat.bands[0]?.v ?? 0) : 0;

  return (
    <div className="skew">
      <p className="skew-lead">
        {stat.total === 0 ? (
          <>아직 준 과일이 없어요.</>
        ) : (
          <>
            준 과일 <strong>{stat.total}개</strong>가{" "}
            <strong>{stat.reached}명</strong>에게 갔어요
            <span className="skew-of"> / {stat.size}명 중</span>
            {stat.bands.length > 0 && (
              <>
                {" · "}상위 {TOP}명이 <strong>{topShare}%</strong>
              </>
            )}
          </>
        )}
      </p>

      {stat.total > 0 && (
        <>
          <div className="skew-bar" role="img"
               aria-label={stat.bands.map((b) => `${b.label} ${pct(b.v)}%`).join(", ")}>
            {stat.bands.map((b, i) => (
              <span key={b.label} style={{ flex: b.v, background: BANDS[i] }} />
            ))}
          </div>
          <div className="skew-legend">
            {stat.bands.map((b, i) => (
              <span key={b.label}>
                <i className="skew-swatch" style={{ background: BANDS[i] }} />
                {b.label} {pct(b.v)}%
              </span>
            ))}
          </div>
        </>
      )}

      {/* 이 줄이 이 패널의 요점입니다 — 많이 받은 학생은 어차피 눈에 띄고,
          한 번도 못 받은 학생은 어느 화면에도 나타나지 않습니다. */}
      {stat.none.length > 0 && (
        <p className="skew-none">
          <strong>아직 한 개도 못 받은 학생 {stat.none.length}명</strong>
          <span className="skew-none-names">
            {stat.none.slice(0, 12).map((p) => p.name).join(" · ")}
            {stat.none.length > 12 && ` 외 ${stat.none.length - 12}명`}
          </span>
        </p>
      )}
    </div>
  );
}
