"use client";

// =============================================================
// 과일 바구니 — 공부방 제목 줄 맨 끝의 '과일 바구니'가 여는 창 (교사·학생)
// -------------------------------------------------------------
// 커다란 바구니에 과일이 수북하게 담긴 그림 한 장입니다(선생님 요청).
// 그림은 선생님이 주신 색연필 그림(public/fruit-basket.webp)입니다 — 처음에는
// SVG로 여기서 그렸는데, 주신 그림으로 바꿨습니다. 종이 바탕이 흰 창과
// 어긋나지 않게 CSS에서 multiply로 섞습니다(.fruit-basket-art).
//
// [과일 기부] 학생은 제 과일을 몇 개 **내놓아**(과일 내놓기) 반의 바구니를
// 채웁니다 — 내놓은 만큼 제 과일이 줄고, 몇 번이든 더 내놓을 수 있습니다.
// **응모하기 전까지는 '과일 거두기'로 되돌려 받습니다**(같은 입력칸의 개수만큼).
// 바구니가 100개에 닿으면 학생마다 '이벤트 응모'를 누르고, 교사 화면은 합계와
// 응모 현황(모두 응모하면 그 사실)을 봅니다. 셈은 lib/fruitBasket.js, 저장은
// lib/data/rewards.js(donateFruits · withdrawFruits · enterFruitEvent), 규칙은 firestore.rules의
// fruitBasket 절. 읽는 문서는 그 반의 바구니 문서들(학생 수만큼)뿐입니다 —
// 내 과일 수는 페이지가 이미 받아 둔 rewards에서 넘겨받습니다.
// 닫기는 다른 창과 같은 backdropClose(Esc·배경).
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  subscribeFruitBasket, donateFruits, withdrawFruits,
  enterFruitEvent, declineFruitEvent, cancelFruitEventChoice, receiveFruitEvent,
} from "@/lib/store";
import {
  FRUIT_GOAL, basketSummary, donationAmount, withdrawAmount, myBasketEntry, canEnterEvent,
} from "@/lib/fruitBasket";

// 바구니 그림 — public/fruit-basket.webp(색연필 그림, 1200×800 · 약 270KB).
// 크기를 적어 두어 그림이 오기 전에도 자리가 잡혀 창이 흔들리지 않습니다.
function BasketArt() {
  return (
    <img
      className="fruit-basket-art"
      src="/fruit-basket.webp"
      width={1200}
      height={800}
      alt="과일이 수북하게 담긴 커다란 과일 바구니"
      decoding="async"
      draggable={false}
    />
  );
}

export default function FruitBasketModal({
  onClose,
  classId,
  uid,                 // 지금 사용자 uid
  isTeacher = false,
  myFruit = 0,         // 학생: 지금 가진 과일(rewards.count — 내놓으면 줄어든 값)
  roster = [],         // 교사: 반 명단 [{ uid, name, studentId }] — '모두 응모' 판정·이름
}) {
  const [entries, setEntries] = useState(null); // null = 아직 안 옴
  useEffect(() => subscribeFruitBasket(classId, setEntries), [classId]);

  const memberUids = useMemo(() => (roster ?? []).map((r) => r.uid), [roster]);
  const sum = useMemo(
    () => basketSummary(entries ?? [], memberUids),
    [entries, memberUids]
  );
  const mine = useMemo(() => myBasketEntry(entries ?? [], uid), [entries, uid]);

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal fruit-basket-modal"
        role="dialog"
        aria-modal="true"
        aria-label="과일 바구니"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>🧺 과일 바구니</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="fruit-basket-body">
          <div className="fruit-basket-artbox">
            <BasketArt />
          </div>
          <div className="fruit-basket-side">
            <BasketTotal sum={sum} loading={entries === null} />
            {isTeacher ? (
              <TeacherPanel classId={classId} sum={sum} roster={roster} />
            ) : (
              <StudentPanel
                classId={classId}
                uid={uid}
                myFruit={myFruit}
                mine={mine}
                goalReached={sum.goalReached}
                total={sum.total}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 반 바구니 합계 — 교사·학생 공통. 목표에 닿으면 알림 한 줄을 함께 답니다.
function BasketTotal({ sum, loading }) {
  return (
    <section className="fb-total" aria-live="polite">
      <div className="fb-total-head">
        <span className="fb-label">우리 반 바구니</span>
        <strong className="fb-total-num">
          {loading ? "…" : sum.total}
          <em> / {sum.goal}개</em>
        </strong>
      </div>
      <div className="fb-bar" role="progressbar" aria-valuemin={0} aria-valuemax={sum.goal} aria-valuenow={Math.min(sum.total, sum.goal)}>
        <span style={{ width: `${sum.percent}%` }} />
      </div>
      {sum.goalReached && (
        <p className="fb-goal">🎉 과일 {sum.goal}개가 모였습니다. 이벤트에 응모할 수 있습니다.</p>
      )}
    </section>
  );
}

// 교사 — 이벤트 현황(응모 · 응모 안 함 · 아직) + '이벤트 접수'.
// 접수하면 응모한 학생들을 받아 두어 '멋진 순간' 자리표의 초록 점이 꺼지고,
// 그 학생의 선택은 그 뒤로 못 바꿉니다. 접수 뒤에 새로 고른 학생은 다시 점이
// 켜지므로 한 번 더 누르면 됩니다.
function TeacherPanel({ classId, sum, roster }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const nameOf = (u) => {
    const r = (roster ?? []).find((x) => x.uid === u);
    return r ? `${r.studentId ? `${r.studentId} ` : ""}${r.name ?? ""}`.trim() || "이름 없음" : "이름 없음";
  };
  const pending = sum.pendingUids.length;

  async function receive() {
    if (busy || !pending) return;
    setBusy(true);
    setMsg(null);
    try {
      const n = await receiveFruitEvent(classId, sum.pendingUids);
      setMsg({ ok: true, text: `${n}명의 응모를 접수했어요.` });
    } catch (e) {
      console.error("[fruitBasket] 접수 실패:", e?.code ?? e);
      setMsg({ ok: false, text: "접수하지 못했어요. 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fb-entry">
      <div className="fb-entry-head">
        <span className="fb-label">이벤트</span>
        <strong>응모 {sum.enteredCount} / {sum.memberCount}명</strong>
      </div>
      <p className="fb-note">
        응모하지 않기 {sum.declinedCount}명 · 아직 고르지 않음 {sum.waitingUids.length}명
      </p>
      {sum.allEntered ? (
        <p className="fb-all">✅ 전체 학생이 이벤트에 응모했습니다.</p>
      ) : sum.allResponded ? (
        <p className="fb-all">✅ 전체 학생이 응모 여부를 골랐습니다.</p>
      ) : (
        sum.waitingUids.length > 0 && (
          <p className="fb-note">
            아직 고르지 않은 학생 — {sum.waitingUids.map(nameOf).join(", ")}
          </p>
        )
      )}
      <button
        type="button"
        className="btn-primary fb-enter-btn fb-receive"
        onClick={receive}
        disabled={busy || !pending}
        title={pending ? "응모한 학생들을 접수합니다 — 자리표의 초록 점이 꺼지고, 그 뒤로는 바꿀 수 없어요" : "새로 응모한 학생이 없어요"}
      >
        {busy ? "접수하는 중…" : pending ? `이벤트 접수 (${pending}명)` : "이벤트 접수"}
      </button>
      <p className="fb-help">
        {pending
          ? "자리표의 초록 점은 응모했지만 아직 접수하지 않은 학생이에요."
          : "학생이 응모하면 자리표에 초록 점이 켜져요."}
      </p>
      {msg && <p className={`fb-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
    </section>
  );
}

// 학생 — 내 과일(내놓기 · 거두기) + 이벤트(응모하기 · 응모하지 않기)
// 입력칸 하나에 단추 둘 — 적은 개수만큼 내놓거나 거둡니다. 이벤트는 따로 한
// 칸: 응모하기(과일 1개 이상 · 반 바구니 100개) · 응모하지 않기(내놓은 과일을
// 모두 되돌려 받음). 두 단추는 고른 뒤에도 그대로 서서, 선생님이 접수하기
// 전까지 바꾸거나(다른 단추) 거둘 수 있습니다(고른 단추를 다시 누름).
// 응모한 동안은 과일을 거둘 수 없습니다(응모를 취소하면 다시 거둘 수 있음).
function StudentPanel({ classId, uid, myFruit, mine, goalReached, total }) {
  const [raw, setRaw] = useState("1"); // 개수 — −/＋ 단추로 고치고, 칸에 직접 적어도 됨
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);       // 과일 칸 { ok, text }
  const [eventMsg, setEventMsg] = useState(null); // 이벤트 칸 { ok, text }
  const giveAmt = donationAmount(raw, myFruit);
  const takeAmt = withdrawAmount(raw, mine.donated, myFruit, mine.entered);
  const canTake = !mine.entered && mine.donated > 0;
  const canEnter = canEnterEvent(mine, goalReached);
  // −/＋ 단추의 범위 — 1부터, 내놓을 수 있는 수(가진 과일)와 거둘 수 있는 수
  // (내놓은 과일) 가운데 큰 쪽까지. 한 칸이 두 단추에 함께 쓰이기 때문입니다.
  const stepMax = Math.max(1, myFruit, canTake ? mine.donated : 0);
  const stepNow = Math.max(0, Math.floor(Number(raw)) || 0);
  const noFruitAtAll = myFruit <= 0 && !canTake;
  const step = (d) => {
    const next = Math.min(stepMax, Math.max(1, (stepNow || (d > 0 ? 0 : 2)) + d));
    setRaw(String(next));
    setMsg(null);
  };

  async function run(fn, okText, failText, setOut = setMsg) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    setEventMsg(null);
    try {
      const out = await fn();
      setOut({ ok: true, text: okText(out) });
      if (setOut === setMsg) setRaw("1");
    } catch (e) {
      setOut({ ok: false, text: e?.message || failText });
    } finally {
      setBusy(false);
    }
  }
  const give = () => giveAmt && run(
    () => donateFruits(classId, uid, giveAmt),
    (left) => `과일 ${giveAmt}개를 내놓았어요. 남은 과일 ${left}개.`,
    "내놓지 못했어요. 다시 시도해 주세요."
  );
  const take = () => takeAmt && run(
    () => withdrawFruits(classId, uid, takeAmt),
    (left) => `과일 ${takeAmt}개를 거뒀어요. 가진 과일 ${left}개.`,
    "거두지 못했어요. 다시 시도해 주세요."
  );
  const enter = () => canEnter && run(
    () => enterFruitEvent(classId, uid),
    () => "이벤트에 응모했어요.",
    "응모하지 못했어요. 다시 시도해 주세요.",
    setEventMsg
  );
  const decline = () => !mine.received && run(
    () => declineFruitEvent(classId, uid),
    (back) => (back > 0 ? `응모하지 않기로 했어요. 내놓은 과일 ${back}개를 돌려받았어요.` : "응모하지 않기로 했어요."),
    "고르지 못했어요. 다시 시도해 주세요.",
    setEventMsg
  );
  const cancelChoice = () => run(
    () => cancelFruitEventChoice(classId, uid),
    () => (mine.entered ? "응모를 취소했어요." : "응모하지 않기를 취소했어요."),
    "취소하지 못했어요. 다시 시도해 주세요.",
    setEventMsg
  );

  // 적은 개수가 어느 쪽에도 안 맞으면 까닭을 적습니다.
  const typed = raw.trim() !== "";
  let hint = null;
  if (typed && !giveAmt && !takeAmt) {
    hint = canTake
      ? `내놓기는 가진 과일(${myFruit}개), 거두기는 내놓은 과일(${mine.donated}개) 안에서 적어 주세요.`
      : `가진 과일(${myFruit}개) 안에서 1개 이상 적어 주세요.`;
  }
  // 응모하기가 꺼진 까닭 — 아직 고르지 않았을 때만 적습니다.
  let enterWhy = null;
  if (!mine.choice && !canEnter) {
    enterWhy = mine.donated < 1
      ? "과일을 1개 이상 내놓아야 응모할 수 있어요."
      : `반 바구니에 과일 ${FRUIT_GOAL}개가 모이면 응모할 수 있어요(지금 ${total}개).`;
  }
  return (
    <>
      <section className="fb-mine">
        <div className="fb-mine-stats">
          <span>내가 가진 과일 <b>🍊 {myFruit}</b></span>
          <span>내가 내놓은 과일 <b>{mine.donated}</b></span>
        </div>
        <form
          className="fb-give"
          onSubmit={(e) => { e.preventDefault(); give(); }}
        >
          {/* 개수 — 가운데 칸 양옆의 −/＋로 하나씩(선생님 요청). 칸에 직접
              적을 수도 있습니다(숫자만 남김). */}
          <div className="fb-stepper" role="group" aria-label="내놓거나 거둘 과일 수">
            <button
              type="button"
              className="fb-step"
              onClick={() => step(-1)}
              disabled={busy || noFruitAtAll || stepNow <= 1}
              aria-label="하나 줄이기"
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={raw}
              onChange={(e) => { setRaw(e.target.value.replace(/[^0-9]/g, "").slice(0, 3)); setMsg(null); }}
              disabled={busy || noFruitAtAll}
              aria-label="과일 수"
            />
            <button
              type="button"
              className="fb-step"
              onClick={() => step(1)}
              disabled={busy || noFruitAtAll || stepNow >= stepMax}
              aria-label="하나 늘리기"
            >
              ＋
            </button>
          </div>
          <button type="submit" className="btn-primary" disabled={busy || !giveAmt}>
            과일 내놓기
          </button>
          <button
            type="button"
            className="btn-primary fb-take"
            onClick={take}
            disabled={busy || !takeAmt}
            title={
              mine.entered ? "응모한 동안은 과일을 거둘 수 없어요 — 응모하기를 다시 눌러 취소하면 거둘 수 있어요"
                : mine.donated <= 0 ? "아직 내놓은 과일이 없어요"
                : `내놓은 과일 ${mine.donated}개 안에서 거둬요`
            }
          >
            과일 거두기
          </button>
        </form>
        {hint && <p className="fb-msg err">{hint}</p>}
        {!hint && !msg && (
          <p className="fb-help">
            {mine.entered
              ? "응모한 동안은 과일을 거둘 수 없어요. 과일을 더 내놓을 수는 있어요."
              : "개수를 적고 내놓거나 거둬요. 이벤트에 응모하기 전까지는 언제든 거둘 수 있어요."}
          </p>
        )}
        {msg && <p className={`fb-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
      </section>

      {/* 이벤트 칸은 늘 섭니다 — 조건이 안 되면 꺼진 단추와 까닭 한 줄. */}
      <section className="fb-enter">
        <div className="fb-entry-head">
          <span className="fb-label">이벤트</span>
          {mine.received && <strong className="fb-received">선생님이 접수했어요</strong>}
        </div>
        {/* 두 단추는 고른 뒤에도 그대로 섭니다(선생님 요청) — 고른 쪽에 ✓,
            다른 쪽은 옅게. 다른 쪽을 누르면 바꾸고, 고른 쪽을 다시 누르면
            거둡니다. 선생님이 접수하면 둘 다 잠깁니다. */}
        <div className="fb-choice">
          <button
            type="button"
            className={`btn-primary fb-enter-btn${mine.choice === "declined" ? " fb-choice-off" : ""}`}
            aria-pressed={mine.choice === "entered"}
            onClick={mine.choice === "entered" ? cancelChoice : enter}
            disabled={busy || mine.received || (mine.choice !== "entered" && !canEnter)}
            title={mine.choice === "entered" ? "다시 누르면 응모를 취소해요" : undefined}
          >
            {mine.choice === "entered" ? "✓ 응모하기" : "응모하기"}
          </button>
          <button
            type="button"
            className={`btn-primary fb-enter-btn${mine.choice === "entered" ? " fb-choice-off" : ""}`}
            aria-pressed={mine.choice === "declined"}
            onClick={mine.choice === "declined" ? cancelChoice : decline}
            disabled={busy || mine.received}
            title={
              mine.choice === "declined" ? "다시 누르면 응모하지 않기를 취소해요"
                : mine.donated > 0 ? `내놓은 과일 ${mine.donated}개는 자동으로 돌려받아요`
                : "응모하지 않습니다"
            }
          >
            {mine.choice === "declined" ? "✓ 응모하지 않기" : "응모하지 않기"}
          </button>
        </div>
        <p className="fb-help fb-enter-wait">
          {mine.received
            ? "선생님이 접수해서 더 바꿀 수 없어요."
            : mine.choice
              ? "고른 단추를 다시 누르면 취소되고, 다른 단추를 누르면 바뀌어요."
              : enterWhy ??
                (mine.donated > 0
                  ? `응모하지 않기를 고르면 내놓은 과일 ${mine.donated}개를 자동으로 돌려받아요.`
                  : "응모 여부를 골라 주세요.")}
        </p>
        {eventMsg && <p className={`fb-msg ${eventMsg.ok ? "ok" : "err"}`}>{eventMsg.text}</p>}
      </section>
    </>
  );
}
