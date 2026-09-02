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
// [무엇을 세나 — 이력이 아니라 총계]
// 한때 이 칸은 지급 이력(rewardEvents)에서 **더한 것만** 합쳤습니다. 두 가지가
// 어긋났습니다.
//  · 실수로 주고 도로 뺀 것이 그대로 남았습니다. 자리 카드에는 4개가 찍히는데
//    여기에는 56개로 나와, 같은 화면의 두 숫자가 서로를 반박했습니다.
//  · 이력은 2026-08-29에 기록을 시작해서, 그 전에 준 과일이 통째로 빠졌습니다.
//    "한 개도 못 받은 학생 24명"이 사실이 아닌데도 그렇게 보였습니다.
// 지금은 총계(rewards)를 봅니다 — 더하고 뺀 것이 이미 반영된, 그 학생이 지금
// 실제로 갖고 있는 수입니다. 기록 시작일 이전 것도 들어 있어 기간 단서도
// 필요 없습니다. 자리 카드·'궁금한 순간'과 같은 값을 보므로 어긋날 수 없습니다.
//
// 이력(events)은 '그동안 주고 거둔 양'을 한 줄로 덧붙이는 데만 씁니다.
//
// [구독하지 않습니다] 총계도 이력도 부모가 이미 받아 둔 것을 그대로 받습니다.
// 같은 컬렉션에 리스너를 하나 더 걸면 읽기가 두 배가 됩니다.
// =============================================================
import { useMemo } from "react";

// 상위 몇 명을 한 덩어리로 볼 것인가 — 한 모둠 크기입니다.
const TOP = 5;
// 진하기 네 단계(같은 색의 밝기만). 크고 작음은 순서가 있는 값이라
// 여러 색을 섞으면 오히려 못 읽습니다.
const BANDS = ["#b85c3f", "#d98a63", "#eeba9e", "#f7e3d8"];

export default function RewardSkew({
  rewards = [],   // [{ uid, count }] — 지금 갖고 있는 수(더하고 뺀 결과)
  events = [],    // 지급 이력 — '그동안 주고 거둔 양' 한 줄에만 씁니다
  roster = [],
  loaded = false,
}) {
  const stat = useMemo(() => {
    // 총계를 봅니다 — 회수가 이미 반영된 값이라 따로 뺄 것이 없습니다.
    const byUid = new Map();
    rewards.forEach((r) => {
      if (r?.uid) byUid.set(r.uid, (byUid.get(r.uid) ?? 0) + (r.count ?? 0));
    });

    const people = roster.map((s) => {
      const uid = s.uid ?? s.id;
      return {
        uid,
        name: s.realName || s.name || "이름 미설정",
        studentId: s.studentId ?? null,
        n: byUid.get(uid) ?? 0,
      };
    });

    // 총량은 **명단 안에서만** 셉니다. 예전에는 전체를 더해 놓고 비율은
    // 명단으로만 냈는데, 전학 간 학생처럼 명단 밖 uid의 과일이 분모에만
    // 들어가 띠의 합이 100%에 못 미쳤습니다. 명단 밖 몫은 따로 적습니다.
    const rosterUids = new Set(people.map((p) => p.uid));
    const total = people.reduce((sum, p) => sum + p.n, 0);
    let outside = 0;
    byUid.forEach((v, k) => {
      if (!rosterUids.has(k)) outside += v;
    });

    // 그동안 주고 거둔 양 — 총계와 달리 '얼마나 손이 오갔나'입니다. 위
    // 숫자를 만들지는 않고, 회수가 있었다는 사실만 한 줄로 알립니다.
    let gave = 0;
    let took = 0;
    events.forEach((e) => {
      const d = e.delta ?? 0;
      if (!rosterUids.has(e.uid)) return;
      if (d > 0) gave += d;
      else if (d < 0) took += -d;
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
      outside,
      gave,
      took,
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
  }, [rewards, events, roster]);

  if (!loaded || stat.size === 0) return null;

  const pct = (v) => Math.round((v / stat.total) * 100);
  const topShare = stat.total > 0 ? pct(stat.bands[0]?.v ?? 0) : 0;

  return (
    <div className="skew">
      <p className="skew-lead">
        {stat.total === 0 ? (
          <>아직 과일을 가진 학생이 없어요.</>
        ) : (
          <>
            지금 반이 가진 과일 <strong>{stat.total}개</strong>가{" "}
            <strong>{stat.reached}명</strong>에게 있어요
            <span className="skew-of"> / {stat.size}명 중</span>
            {/* 받은 사람이 다섯 명 이하면 '상위 5명이 100%'는 아무것도 말해
                주지 않습니다(다섯 칸에 다섯 명이 다 들어가니 늘 100%).
                그 구간에서는 쏠림이 아니라 인원 자체가 요점입니다. */}
            {stat.bands.length > 0 && stat.reached > TOP && (
              <>
                {" · "}상위 {TOP}명이 <strong>{topShare}%</strong>
              </>
            )}
          </>
        )}
      </p>

      {/* 명단 밖 uid(전학·탈퇴)의 과일 — 위 비율에는 안 들어갑니다.
          숨기면 격자 합계와 이 칸의 총량이 달라 보여 혼란스럽습니다. */}
      {stat.outside > 0 && (
        <p className="skew-outside">
          명단에 없는 학생에게 간 {stat.outside}개는 위 비율에서 뺐어요.
        </p>
      )}

      {/* 손이 오간 양 — 위 숫자를 만들지는 않습니다. 회수가 있었다는 사실만
          알려, 이력 격자의 음수 칸이 왜 있는지 읽히게 합니다. */}
      {stat.took > 0 && (
        <p className="skew-outside">
          기록이 남은 기간에 준 것 {stat.gave}개 · 도로 거둔 것 {stat.took}개.
          위 숫자는 회수까지 반영한 <strong>지금 보유량</strong>이에요.
        </p>
      )}

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
          {/* 기간 단서가 필요 없습니다 — 총계는 학기 처음부터의 값이라
              '한 개도 없다'가 곧이곧대로 맞습니다. */}
          <strong>과일이 한 개도 없는 학생 {stat.none.length}명</strong>
          <span className="skew-none-names">
            {stat.none.slice(0, 12).map((p) => p.name).join(" · ")}
            {stat.none.length > 12 && ` 외 ${stat.none.length - 12}명`}
          </span>
        </p>
      )}
    </div>
  );
}
