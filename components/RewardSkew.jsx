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
//
// [기간을 반드시 밝힙니다] 이 칸이 보는 것은 **이력(rewardEvents)** 이지
// 총계(rewards)가 아닙니다. 이력은 2026-08-29에 기록을 시작했고, 그 전에
// 준 과일은 총계에만 남아 있어 여기 한 건도 없습니다. 기간을 안 적으면
// "아직 한 개도 못 받은 학생 24명"이 '한 학기 내내 못 받았다'로 읽혀,
// 사실은 그동안 잘 주고 있던 교사가 자기를 오해하게 됩니다. 그래서 첫
// 기록일을 문장 안에 넣습니다.
// =============================================================
import { useMemo } from "react";
import { toDate } from "@/lib/store";

// 상위 몇 명을 한 덩어리로 볼 것인가 — 한 모둠 크기입니다.
const TOP = 5;
// 진하기 네 단계(같은 색의 밝기만). 크고 작음은 순서가 있는 값이라
// 여러 색을 섞으면 오히려 못 읽습니다.
const BANDS = ["#b85c3f", "#d98a63", "#eeba9e", "#f7e3d8"];

export default function RewardSkew({ events = [], roster = [], loaded = false }) {
  const stat = useMemo(() => {
    // 회수(delta 음수)는 빼고 '준 것'만 셉니다 — 쏠림은 눈길이 어디로
    // 갔는지의 이야기라, 도로 거둔 건이 상쇄하면 안 됩니다.
    // 다만 **감추지는 않습니다**(아래 taken). 자리 카드에는 지금 보유량이
    // 찍히는데 여기 숫자는 누적 지급량이라, 회수가 크면 두 수가 크게 벌어져
    // '계산이 안 맞는다'로 보입니다. 실제로 그렇게 보고를 받았습니다
    // (카드 4개 / 이 칸 56개 — 테스트로 준 것을 도로 뺀 경우).
    const given = events.filter((e) => (e.delta ?? 0) > 0);
    const byUid = new Map();
    given.forEach((e) => byUid.set(e.uid, (byUid.get(e.uid) ?? 0) + (e.delta ?? 0)));

    const people = roster.map((s) => {
      const uid = s.uid ?? s.id;
      return {
        uid,
        name: s.realName || s.name || "이름 미설정",
        studentId: s.studentId ?? null,
        n: byUid.get(uid) ?? 0,
      };
    });

    // 총량은 **명단 안에서만** 셉니다. 예전에는 이력 전체를 더해 놓고 비율은
    // 명단으로만 냈는데, 전학 간 학생처럼 명단 밖 uid의 과일이 분모에만
    // 들어가 띠의 합이 100%에 못 미쳤습니다. 명단 밖 몫은 따로 적습니다.
    const rosterUids = new Set(people.map((p) => p.uid));
    const total = people.reduce((sum, p) => sum + p.n, 0);
    let outside = 0;
    byUid.forEach((v, k) => {
      if (!rosterUids.has(k)) outside += v;
    });

    // 도로 거둔 양 — 비율 계산에는 안 쓰고 문장에만 적습니다. 명단 안 학생
    // 것만 세어 위 total과 같은 범위를 유지합니다.
    const taken = events.reduce(
      (sum, e) =>
        (e.delta ?? 0) < 0 && rosterUids.has(e.uid) ? sum + -(e.delta ?? 0) : sum,
      0
    );

    // 이력이 시작된 날 — 이 칸의 모든 문장이 이 날부터의 이야기입니다.
    const times = given
      .map((e) => toDate(e.at)?.getTime())
      .filter((t) => t != null && !Number.isNaN(t));
    const firstAt = times.length > 0 ? new Date(Math.min(...times)) : null;

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
      taken,
      firstAt,
      days: new Set(
        times.map((t) => {
          const d = new Date(t);
          return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        })
      ).size,
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
  const since = stat.firstAt
    ? `${stat.firstAt.getMonth() + 1}월 ${stat.firstAt.getDate()}일`
    : null;

  return (
    <div className="skew">
      <p className="skew-lead">
        {stat.total === 0 ? (
          <>아직 준 과일이 없어요.</>
        ) : (
          <>
            {/* 기간이 문장 맨 앞에 옵니다 — 뒤에 붙이면 숫자를 먼저 읽고
                넘어가서, 이 칸이 언제부터의 이야기인지 못 보고 지나갑니다. */}
            {since && <span className="skew-since">{since}부터</span>}
            준 과일 <strong>{stat.total}개</strong>가{" "}
            <strong>{stat.reached}명</strong>에게 갔어요
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

      {/* 회수 — 이 칸은 '준 것'만 세는데 자리 카드에는 지금 보유량이 찍혀,
          도로 거둔 양이 크면 두 수가 벌어져 '반영이 안 됐다'로 읽힙니다.
          비율은 그대로 두고(눈길이 어디로 갔는지가 회수로 지워지진 않으므로)
          어긋나는 이유만 밝혀 둡니다. */}
      {stat.taken > 0 && (
        <p className="skew-outside">
          이 중 <strong>{stat.taken}개</strong>는 나중에 도로 거뒀어요 (순증{" "}
          {stat.total - stat.taken}개). 위 <strong>{stat.total}개</strong>는
          <strong> 지금까지 준 양</strong>이라 회수를 빼지 않습니다 — 자리 카드에
          찍히는 <strong>지금 보유량</strong>과는 다른 숫자예요.
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
          <strong>
            {/* '아직'이라고만 쓰면 학기 전체로 읽힙니다. 이력에 없을 뿐
                그 전에 받은 과일은 총계에 그대로 있습니다. */}
            {since ? `${since} 이후 ` : ""}한 개도 못 받은 학생 {stat.none.length}명
          </strong>
          <span className="skew-none-names">
            {stat.none.slice(0, 12).map((p) => p.name).join(" · ")}
            {stat.none.length > 12 && ` 외 ${stat.none.length - 12}명`}
          </span>
          {/* 기록이 며칠 안 됐을 때는 이 목록이 '소외된 학생 명단'이 아니라
              '아직 표본이 얕다'는 뜻입니다. 수업 두어 번이면 반 전체를 한
              바퀴 돌 수 없으니, 그 말을 대신 해 둡니다. */}
          {stat.days > 0 && stat.days < 5 && (
            <em className="skew-thin">
              지급 이력은 {since}에 기록을 시작했어요 — 아직 수업 {stat.days}일치라
              이 명단은 ‘소외된 학생’이 아니라 표본이 얕다는 뜻에 가깝습니다.
              그 전에 준 과일은 학생별 총계에 그대로 있습니다.
            </em>
          )}
        </p>
      )}
    </div>
  );
}
