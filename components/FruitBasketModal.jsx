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
import { subscribeFruitBasket, donateFruits, withdrawFruits, enterFruitEvent } from "@/lib/store";
import { FRUIT_GOAL, basketSummary, donationAmount, withdrawAmount, myBasketEntry } from "@/lib/fruitBasket";

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
              <TeacherPanel sum={sum} roster={roster} />
            ) : (
              <StudentPanel
                classId={classId}
                uid={uid}
                myFruit={myFruit}
                mine={mine}
                goalReached={sum.goalReached}
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

// 교사 — 합계(위) + 응모 현황. 모두 응모하면 그 사실을 크게 알립니다.
function TeacherPanel({ sum, roster }) {
  const nameOf = (u) => {
    const r = (roster ?? []).find((x) => x.uid === u);
    return r ? `${r.studentId ? `${r.studentId} ` : ""}${r.name ?? ""}`.trim() || "이름 없음" : "이름 없음";
  };
  // 목표에 닿기 전이어도 응모한 학생이 있으면 현황을 보입니다 — 응모 뒤에
  // 다른 학생이 기부를 취소해 합계가 100 아래로 내려갈 수 있습니다.
  if (!sum.goalReached && sum.enteredCount === 0) {
    return (
      <p className="fb-note">
        학생이 제 과일을 바구니에 내놓으면 여기 합계가 늘어요. {sum.goal}개가 모이면
        학생들이 이벤트에 응모할 수 있어요.
      </p>
    );
  }
  return (
    <section className="fb-entry">
      <div className="fb-entry-head">
        <span className="fb-label">이벤트 응모</span>
        <strong>{sum.enteredCount} / {sum.memberCount}명</strong>
      </div>
      {sum.allEntered ? (
        <p className="fb-all">✅ 전체 학생이 이벤트에 응모했습니다.</p>
      ) : (
        sum.waitingUids.length > 0 && (
          <p className="fb-note">
            아직 응모하지 않은 학생 {sum.waitingUids.length}명 —{" "}
            {sum.waitingUids.map(nameOf).join(", ")}
          </p>
        )
      )}
    </section>
  );
}

// 학생 — 내 과일 · 내놓기 · 기부 취소 · 응모
// 입력칸 하나에 단추 둘 — 적은 개수만큼 내놓거나(기부하기) 되돌려 받습니다
// (과일 거두기). 취소가 있으니 내놓을 때는 되묻지 않고, 대신 되돌릴 수
// 없는 **응모**에서 한 번 묻습니다(응모하면 취소가 닫힙니다).
function StudentPanel({ classId, uid, myFruit, mine, goalReached }) {
  const [raw, setRaw] = useState("");
  const [confirmEnter, setConfirmEnter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const giveAmt = donationAmount(raw, myFruit);
  const takeAmt = withdrawAmount(raw, mine.donated, myFruit, mine.entered);
  const canTake = !mine.entered && mine.donated > 0;

  async function run(fn, okText, failText) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const left = await fn();
      setMsg({ ok: true, text: okText(left) });
      setRaw("");
    } catch (e) {
      setMsg({ ok: false, text: e?.message || failText });
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

  async function enter() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await enterFruitEvent(classId, uid);
    } catch (e) {
      setMsg({ ok: false, text: e?.message || "응모하지 못했어요. 다시 시도해 주세요." });
    } finally {
      setBusy(false);
      setConfirmEnter(false);
    }
  }

  // 적은 개수가 어느 쪽에도 안 맞으면 까닭을 적습니다.
  const typed = raw.trim() !== "";
  let hint = null;
  if (typed && !giveAmt && !takeAmt) {
    hint = canTake
      ? `내놓기는 가진 과일(${myFruit}개), 거두기는 내놓은 과일(${mine.donated}개) 안에서 적어 주세요.`
      : `가진 과일(${myFruit}개) 안에서 1개 이상 적어 주세요.`;
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
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(1, myFruit, canTake ? mine.donated : 0)}
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setMsg(null); }}
            placeholder="개수"
            disabled={busy || (myFruit <= 0 && !canTake)}
            aria-label="내놓거나 거둘 과일 수"
          />
          <button type="submit" className="btn-primary" disabled={busy || !giveAmt}>
            과일 내놓기
          </button>
          <button
            type="button"
            className="btn-primary fb-take"
            onClick={take}
            disabled={busy || !takeAmt}
            title={
              mine.entered ? "이벤트에 응모한 뒤에는 과일을 거둘 수 없어요"
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
              ? "이벤트에 응모해서 내놓은 과일은 더 거둘 수 없어요. 과일을 더 내놓을 수는 있어요."
              : "개수를 적고 내놓거나 거둬요. 이벤트에 응모하기 전까지는 언제든 거둘 수 있어요."}
          </p>
        )}
        {msg && <p className={`fb-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
      </section>

      {/* 응모 칸은 늘 섭니다 — 100개가 모이기 전에는 꺼진 단추와 조건 한 줄.
          모이기 전에 감춰 두었더니 '응모 단추가 어디 있나'를 찾게 되었습니다. */}
      <section className="fb-enter">
          {mine.entered ? (
            <p className="fb-entered">✓ 이벤트에 응모했어요.</p>
          ) : confirmEnter ? (
            <div className="fb-confirm" role="group" aria-label="응모 확인">
              <p>응모하면 내놓은 과일 <b>{mine.donated}개</b>는 더 거둘 수 없어요. 응모할까요?</p>
              <div className="fb-confirm-btns">
                <button type="button" className="btn-ghost" onClick={() => setConfirmEnter(false)} disabled={busy}>
                  아니요
                </button>
                <button type="button" className="btn-primary" onClick={enter} disabled={busy}>
                  {busy ? "응모하는 중…" : "응모하기"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="btn-primary fb-enter-btn"
                onClick={() => setConfirmEnter(true)}
                disabled={busy || !goalReached}
              >
                이벤트 응모
              </button>
              {!goalReached && (
                <p className="fb-help fb-enter-wait">
                  과일 {FRUIT_GOAL}개가 모이면 응모할 수 있어요.
                </p>
              )}
            </>
          )}
      </section>
    </>
  );
}
