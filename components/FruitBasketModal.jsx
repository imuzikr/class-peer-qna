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
// 과일을 1개 이상 내놓은 학생은 언제든 '이벤트 응모'를 누릅니다(반 바구니
// 100개와는 별개 — 선생님 요청). 교사 화면은 합계와 응모 현황을 봅니다. 셈은 lib/fruitBasket.js, 저장은
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
  basketSummary, donationAmount, withdrawAmount, myBasketEntry, canEnterEvent,
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
              <TeacherPanel classId={classId} sum={sum} />
            ) : (
              <StudentPanel
                classId={classId}
                uid={uid}
                myFruit={myFruit}
                mine={mine}
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
        <p className="fb-goal">🎉 우리 반 바구니에 과일 {sum.goal}개가 모였습니다.</p>
      )}
    </section>
  );
}

// 교사 — 이벤트 현황(응모 · 응모 안 함 · 아직 — 수만) + '응모 접수'.
// 접수하면 고른 학생들(응모하기 · 응모하지 않기)의 선택과 내놓은 과일이 최종
// 제출되고 '멋진 순간' 자리표의 초록 점이 꺼집니다. 그 학생은 그 뒤로 아무것도
// 못 바꿉니다. 접수 뒤에 새로 고른 학생은 다시 점이 켜지므로 한 번 더 누르면 됩니다.
function TeacherPanel({ classId, sum }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  // 아직 안 고른 학생의 이름은 적지 않습니다(선생님 요청 — 자리표의 초록 점이
  // 그 일을 합니다: 점이 꺼진 자리가 곧 안 고른 학생).
  const pending = sum.pendingUids.length;
  const fruit = sum.pendingFruit;

  async function receive() {
    if (busy || !pending) return;
    setBusy(true);
    setMsg(null);
    try {
      const n = await receiveFruitEvent(classId, sum.pendingUids);
      setMsg({ ok: true, text: `${n}명 · 과일 ${fruit}개를 접수했어요. 학생들의 과일이 최종 제출됐어요.` });
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
      ) : null}
      <button
        type="button"
        className="btn-primary fb-enter-btn fb-receive"
        onClick={receive}
        disabled={busy || !pending}
        title={pending ? "고른 학생들의 선택과 내놓은 과일을 최종 제출로 받습니다 — 자리표의 초록 점이 꺼지고, 그 뒤로는 바꿀 수 없어요" : "새로 고른 학생이 없어요"}
      >
        {busy ? "접수하는 중…" : pending ? `응모 접수 (${pending}명 · 과일 ${fruit}개)` : "응모 접수"}
      </button>
      <p className="fb-help">
        {pending
          ? "자리표의 초록 점은 응모하기나 응모하지 않기를 골랐지만 아직 접수하지 않은 학생이에요. 점이 꺼진 자리는 아직 고르지 않은 학생이에요."
          : "학생이 응모하기나 응모하지 않기를 고르면 자리표에 초록 점이 켜져요."}
      </p>
      {msg && <p className={`fb-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
    </section>
  );
}

// 저장 실패 문구 — 우리가 던진 우리말 오류는 그대로, Firebase 오류는 까닭별로.
function fruitErrorText(e, fallback) {
  const code = String(e?.code ?? "");
  if (code.endsWith("permission-denied")) {
    return "권한이 없어 저장하지 못했어요. 페이지를 새로고침한 뒤 다시 해 보고, 계속되면 선생님께 알려 주세요.";
  }
  if (code.endsWith("unavailable") || code.endsWith("deadline-exceeded")) {
    return "연결이 불안정해 저장하지 못했어요. 잠시 뒤 다시 해 주세요.";
  }
  if (code) return fallback; // 그 밖의 Firebase 오류 — 영어 문구 대신
  return e?.message || fallback;
}

// 학생 — 내 과일(내놓기 · 거두기) + 이벤트(응모하기 · 응모하지 않기)
// 입력칸 하나에 단추 둘 — 적은 개수만큼 내놓거나 거둡니다. 이벤트는 따로 한
// 칸: 응모하기(과일 1개 이상 — 반 바구니 합계와 무관) · 응모하지 않기(내놓은 과일을
// 모두 되돌려 받음). 두 단추는 고른 뒤에도 그대로 서서, 선생님이 접수하기
// 전까지 바꾸거나(다른 단추) 거둘 수 있습니다(고른 단추를 다시 누름).
// 응모한 동안은 과일을 거둘 수 없습니다(응모를 취소하면 다시 거둘 수 있음).
function StudentPanel({ classId, uid, myFruit, mine }) {
  // 개수 — −/＋ 단추로 고치고, 칸에 직접 적어도 됨. **0에서 시작합니다**
  // (선생님 요청) — 창을 열자마자 1이 들어 있으면 '내놓기'를 한 번 누르는 것만으로
  // 과일이 나갑니다. 0이면 두 단추가 꺼져 있다가 ＋를 눌러야 켜집니다.
  const [raw, setRaw] = useState("0");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);       // 과일 칸 { ok, text }
  const [eventMsg, setEventMsg] = useState(null); // 이벤트 칸 { ok, text }
  const giveAmt = donationAmount(raw, myFruit);
  const takeAmt = withdrawAmount(raw, mine.donated, myFruit, mine.entered);
  const canTake = !mine.entered && mine.donated > 0;
  const canEnter = canEnterEvent(mine);
  // −/＋ 단추의 범위 — 0부터, 내놓을 수 있는 수(가진 과일)와 거둘 수 있는 수
  // (내놓은 과일) 가운데 큰 쪽까지. 한 칸이 두 단추에 함께 쓰이기 때문입니다.
  const stepMax = Math.max(0, myFruit, canTake ? mine.donated : 0);
  const stepNow = Math.max(0, Math.floor(Number(raw)) || 0);
  const noFruitAtAll = mine.received || (myFruit <= 0 && !canTake);
  const step = (d) => {
    const next = Math.min(stepMax, Math.max(0, stepNow + d));
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
      if (setOut === setMsg) setRaw("0");
    } catch (e) {
      // 규칙 거부는 Firebase의 영어 문구('Missing or insufficient
      // permissions.')가 그대로 올라와 학생이 읽을 수 없었습니다. 우리말로
      // 바꾸고, 원인을 좁힐 단서(code)는 콘솔에 남깁니다.
      console.error("[fruitBasket] 실패:", e?.code ?? "", e?.message ?? e);
      setOut({ ok: false, text: fruitErrorText(e, failText) });
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

  // 적은 개수가 어느 쪽에도 안 맞으면 까닭을 적습니다(0은 '아직 안 정함').
  const typed = stepNow > 0;
  let hint = null;
  if (typed && !giveAmt && !takeAmt) {
    hint = canTake
      ? `내놓기는 가진 과일(${myFruit}개), 거두기는 내놓은 과일(${mine.donated}개) 안에서 적어 주세요.`
      : `가진 과일(${myFruit}개) 안에서 1개 이상 적어 주세요.`;
  }
  // 응모하기가 꺼진 까닭 — 아직 고르지 않았을 때만 적습니다.
  let enterWhy = null;
  if (!mine.choice && !canEnter && !mine.received) {
    enterWhy = "과일을 1개 이상 내놓으면 응모할 수 있어요.";
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
              disabled={busy || noFruitAtAll || stepNow <= 0}
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
              data-esc-ignore=""
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
          <button type="submit" className="btn-primary" disabled={busy || mine.received || !giveAmt}>
            과일 내놓기
          </button>
          <button
            type="button"
            className="btn-primary fb-take"
            onClick={take}
            disabled={busy || mine.received || !takeAmt}
            title={
              mine.received ? "선생님이 접수해서 과일이 최종 제출됐어요"
                : mine.entered ? "응모한 동안은 과일을 거둘 수 없어요 — 응모하기를 다시 눌러 취소하면 거둘 수 있어요"
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
            {mine.received
              ? "선생님이 응모를 접수해서 내놓은 과일이 최종 제출됐어요."
              : mine.entered
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
