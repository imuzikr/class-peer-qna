"use client";

// =============================================================
// 참여의 폭 — 몇 갈래로 참여하나
// -------------------------------------------------------------
// 쏠림은 '고른가', 변화는 '움직이나'를 봅니다. 이 칸이 보는 것은 **결**
// 입니다. 총량 지표에서 똑같이 '적게 참여'로 뭉뚱그려지던 두 학생이,
// 사실은 서로 반대 방향의 도움을 필요로 한다는 것이 여기서 갈립니다.
//
//   말은 없지만 활동·성찰은 꼬박 쓰는 아이  → 쓰는 힘은 있고 말할 자리가 필요
//   손은 들고 질문도 하지만 쓰기에서 막히는 아이 → 그 반대
//
// 다섯 갈래: 질문 · 답변 · 활동 · 성찰 · 손들기.
//
// [왜 개수가 아니라 갈래인가] 개수는 이미 다른 칸들이 보여 줍니다. 여기서
// 켜고 끄는 것만 세는 이유는, '질문 7개'와 '질문 1개'의 차이보다 '질문을
// 한 번이라도 했나'가 이 물음에 더 맞기 때문입니다.
//
// [기간] 다른 칸과 같은 4주. 활동 카드만 성격이 다릅니다 — 카드는 사건이
// 아니라 계속 고쳐 쓰는 문서라, 마지막으로 손댄 때(updatedAt)로 봅니다.
//
// [손들기] 이력이 이제 막 쌓이기 시작해, 한동안 다섯 번째 점은 대부분
// 꺼져 있습니다. 그것을 '참여 안 함'으로 읽지 않도록 아래에 밝혀 둡니다.
// =============================================================
import { useMemo } from "react";
import { toDate } from "@/lib/store";
import { stripHtml } from "@/lib/html";

const WEEKS = 4;
const DAY = 24 * 60 * 60 * 1000;
// 갈래가 적은 쪽부터 이만큼만 세웁니다 — 다 늘어놓으면 요점이 묻힙니다.
const SHOW = 8;
const CHANNELS = ["질문", "답변", "활동", "성찰", "손들기"];

export default function ParticipationBreadth({
  roster = [],
  questions = [],
  answerEvents = [],
  cards = [],        // 이 반 프로젝트의 학생 카드 전체
  kwl = [],          // 이 반의 KWLS 기록
  signalEvents = [],
  loaded = false,
}) {
  const stat = useMemo(() => {
    const from = Date.now() - WEEKS * 7 * DAY;
    const inWindow = (v) => v != null && toDate(v).getTime() >= from;

    const has = (set, uid) => set.has(uid);
    const asked = new Set(
      questions.filter((q) => inWindow(q.createdAt)).map((q) => q.authorId)
    );
    const answered = new Set(
      answerEvents
        .filter((e) => inWindow(e.answer?.createdAt ?? e.createdAt))
        .map((e) => e.answer?.authorId)
    );
    // 카드는 '있다'가 아니라 '무언가 썼다'여야 참여입니다 — 빈 카드는
    // 학생이 열기만 하고 나간 경우라 갈래를 켜면 안 됩니다.
    const wrote = new Set(
      cards
        .filter(
          (c) =>
            inWindow(c.updatedAt ?? c.createdAt) &&
            stripHtml(c.content ?? "").trim().length > 0
        )
        .map((c) => c.authorId)
    );
    const reflected = new Set(
      kwl.filter((e) => inWindow(e.createdAt ?? e.updatedAt)).map((e) => e.userId)
    );
    const raised = new Set(
      signalEvents.filter((e) => inWindow(e.at)).map((e) => e.uid)
    );

    const rows = roster.map((s) => {
      const uid = s.uid ?? s.id;
      const on = [
        has(asked, uid),
        has(answered, uid),
        has(wrote, uid),
        has(reflected, uid),
        has(raised, uid),
      ];
      return {
        uid,
        name: s.realName || s.name || "이름 미설정",
        studentId: s.studentId ?? null,
        on,
        n: on.filter(Boolean).length,
      };
    });

    // 갈래가 적은 쪽부터. 같은 수면 학번순으로 붙여 두어, 값이 하나 바뀔
    // 때마다 동점자들의 자리가 흔들리지 않게 합니다.
    const sorted = [...rows].sort(
      (a, b) =>
        a.n - b.n ||
        String(a.studentId || a.name).localeCompare(String(b.studentId || b.name), "ko", {
          numeric: true,
        })
    );

    return {
      sorted,
      size: rows.length,
      none: rows.filter((r) => r.n === 0).length,
      // 갈래별로 몇 명이 썼나 — 반 전체가 어느 통로를 안 쓰는지 드러납니다.
      perChannel: CHANNELS.map((_, i) => rows.filter((r) => r.on[i]).length),
    };
  }, [roster, questions, answerEvents, cards, kwl, signalEvents]);

  if (!loaded || stat.size === 0) return null;

  return (
    <section className="admin-chart-panel breadth">
      <div className="admin-panel-head">
        <h2>🧭 참여의 폭</h2>
        <span>최근 {WEEKS}주 · 다섯 갈래</span>
      </div>

      {/* 반 전체가 어느 통로를 쓰고 있나 — 개인을 보기 전에 판을 봅니다.
          한 갈래가 통째로 비어 있으면 그건 학생이 아니라 수업 설계의 문제일
          수 있습니다. */}
      <ul className="breadth-channels">
        {CHANNELS.map((label, i) => (
          <li key={label} className={stat.perChannel[i] === 0 ? "empty" : ""}>
            <span className="breadth-ch-name">{label}</span>
            <strong className="breadth-ch-n">{stat.perChannel[i]}</strong>
            <span className="breadth-ch-of">/ {stat.size}</span>
          </li>
        ))}
      </ul>

      <ol className="breadth-list">
        {stat.sorted.slice(0, SHOW).map((r) => (
          <li
            key={r.uid}
            className="breadth-row"
            title={`${r.name} — ${
              r.n === 0 ? "최근 4주 참여 흔적 없음" : CHANNELS.filter((_, i) => r.on[i]).join(" · ")
            }`}
          >
            <span className="breadth-name">{r.name}</span>
            <span className="breadth-dots" aria-hidden="true">
              {r.on.map((v, i) => (
                <i key={CHANNELS[i]} className={`breadth-dot${v ? " on" : ""}`} />
              ))}
            </span>
            <span className={`breadth-tags${r.n === 0 ? " none" : ""}`}>
              {r.n === 0 ? "흔적 없음" : CHANNELS.filter((_, i) => r.on[i]).join(" · ")}
            </span>
          </li>
        ))}
      </ol>

      <p className="breadth-foot">
        {stat.sorted.length > SHOW && `갈래가 적은 ${SHOW}명 · `}
        {stat.none > 0
          ? `최근 ${WEEKS}주 참여 흔적이 없는 학생 ${stat.none}명`
          : `모든 학생이 최소 한 갈래로 참여했어요`}
        {/* 손들기는 이력이 이제 막 쌓이기 시작했습니다. 꺼져 있는 다섯 번째
            점을 '참여 안 함'으로 읽으면 안 되므로 밝혀 둡니다. */}
        {stat.perChannel[4] === 0 && (
          <em className="breadth-note">
            손들기는 ‘🍎 확인’을 누른 순간부터 쌓입니다 — 아직 기록이 없어
            다섯 번째 점은 모두 꺼져 있어요.
          </em>
        )}
      </p>
    </section>
  );
}
