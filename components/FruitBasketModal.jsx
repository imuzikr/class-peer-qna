"use client";

// =============================================================
// 과일 바구니 — 공부방 제목 줄 맨 끝의 '과일 바구니'가 여는 창 (교사·학생)
// -------------------------------------------------------------
// 커다란 바구니에 과일이 수북하게 담긴 그림 한 장입니다(선생님 요청).
// 그림은 선생님이 주신 색연필 그림(public/fruit-basket.webp)입니다 — 처음에는
// SVG로 여기서 그렸는데, 주신 그림으로 바꿨습니다. 종이 바탕이 흰 창과
// 어긋나지 않게 CSS에서 multiply로 섞습니다(.fruit-basket-art).
//
// [과일 담기 · 이벤트] 학생은 −/＋로 담을 과일 수를 정하고 **응모하기**를
// 누르면 그만큼 제 과일이 반의 바구니에 담깁니다. **응모하지 않기**를 고르면
// 담아 둔 과일을 모두 돌려받습니다 — '내놓기 · 거두기' 단추는 걷었습니다
// (선생님 요청). 응모는 반 바구니 100개와는 별개입니다. 교사 화면은 합계와 응모
// 현황을 봅니다. 셈은 lib/fruitBasket.js, 저장은
// lib/data/rewards.js(enterFruitEvent · declineFruitEvent), 규칙은 firestore.rules의
// fruitBasket 절. 읽는 문서는 그 반의 바구니 문서들(학생 수만큼)뿐입니다 —
// 내 과일 수는 페이지가 이미 받아 둔 rewards에서 넘겨받습니다.
// 닫기는 다른 창과 같은 backdropClose(Esc·배경).
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import {
  subscribeFruitBasket, enterFruitEvent, declineFruitEvent, receiveFruitEvent,
  cancelFruitEvent,
} from "@/lib/store";
import {
  basketSummary, entryAmount, entryMax, myBasketEntry, canEnterEvent,
} from "@/lib/fruitBasket";
import { flyFruits } from "@/components/fruitFly";
import ConfirmModal from "@/components/ConfirmModal";

// 바구니 그림 — public/fruit-basket.webp(색연필 그림, 1200×800 · 약 270KB).
// 크기를 적어 두어 그림이 오기 전에도 자리가 잡혀 창이 흔들리지 않습니다.
function BasketArt({ artRef }) {
  return (
    <img
      ref={artRef}
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
  // 바구니 그림 — 학생이 응모하면 과일이 여기로 날아와 담기고, 응모하지 않기를
  // 고르면 여기서 튀어나와 돌아갑니다(components/fruitFly.js).
  const artRef = useRef(null);

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
            <BasketArt artRef={artRef} />
          </div>
          <div className="fruit-basket-side">
            <BasketTotal sum={sum} loading={entries === null} />
            {isTeacher ? (
              <TeacherPanel classId={classId} sum={sum} entryCount={(entries ?? []).length} />
            ) : (
              <StudentPanel
                classId={classId}
                uid={uid}
                myFruit={myFruit}
                mine={mine}
                basketRef={artRef}
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

// 교사 — 이벤트 현황(응모 · 응모 안 함 · 아직 — 수만) + '이벤트 접수' · '이벤트 취소'.
// 접수하면 고른 학생들(응모하기 · 응모하지 않기)의 선택과 담은 과일이 최종
// 제출되고 '멋진 순간' 자리표의 초록 점이 꺼집니다. 그 학생은 그 뒤로 아무것도
// 못 바꿉니다. 접수 뒤에 새로 고른 학생은 다시 점이 켜지므로 한 번 더 누르면 됩니다.
// 취소하면 바구니에 든 과일을 학생마다 모두 돌려주고 바구니를 0개로 비웁니다
// (응모 선택 · 접수 표시도 함께 걷힘 — cancelFruitEvent). 되묻고 합니다.
function TeacherPanel({ classId, sum, entryCount = 0 }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const [asking, setAsking] = useState(false);
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

  async function cancelEvent() {
    if (busy) return;
    setAsking(false);
    setBusy(true);
    setMsg(null);
    try {
      const r = await cancelFruitEvent(classId);
      setMsg({
        ok: true,
        text:
          `이벤트를 취소했어요. ${r.students}명에게 과일 ${r.fruit}개를 돌려주고 바구니를 비웠어요.` +
          (r.capped > 0 ? ` (과일이 100개를 넘는 학생이 있어 ${r.capped}개는 돌려주지 못했어요.)` : ""),
      });
    } catch (e) {
      console.error("[fruitBasket] 이벤트 취소 실패:", e?.code ?? e);
      setMsg({ ok: false, text: "이벤트를 취소하지 못했어요. 다시 시도해 주세요." });
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
        title={pending ? "고른 학생들의 선택과 담은 과일을 최종 제출로 받습니다 — 자리표의 초록 점이 꺼지고, 그 뒤로는 바꿀 수 없어요" : "새로 고른 학생이 없어요"}
      >
        {busy ? "처리하는 중…" : pending ? `이벤트 접수 (${pending}명 · 과일 ${fruit}개)` : "이벤트 접수"}
      </button>
      {/* 이벤트 취소 — 되돌리기 어려운 일이라 접수와 갈라 옅은 단추로 두고 되묻습니다. */}
      <button
        type="button"
        className="btn-ghost fb-enter-btn fb-cancel-event"
        onClick={() => setAsking(true)}
        disabled={busy || entryCount === 0}
        title={entryCount ? "바구니의 과일을 학생마다 모두 돌려주고 바구니를 0개로 비웁니다" : "아직 바구니에 든 것이 없어요"}
      >
        이벤트 취소
      </button>
      <p className="fb-help">
        {pending
          ? "자리표의 초록 점은 응모하기나 응모하지 않기를 골랐지만 아직 접수하지 않은 학생이에요. 점이 꺼진 자리는 아직 고르지 않은 학생이에요."
          : "학생이 응모하기나 응모하지 않기를 고르면 자리표에 초록 점이 켜져요."}
      </p>
      {msg && <p className={`fb-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
      {/* body에 포털 — 창(.modal) 안에 그리면 그 창의 클릭 · 스크롤 칸에 갇힙니다. */}
      {asking && createPortal(
        <ConfirmModal
          icon="🧺"
          title="이벤트 취소"
          preview={`바구니의 과일 ${sum.total}개`}
          description={
            "학생들이 바구니에 담은 과일을 모두 각자에게 돌려주고, 바구니를 0개로 비웁니다.\n" +
            "응모하기 · 응모하지 않기 선택과 접수 표시도 함께 지워집니다.\n" +
            "접수한 학생의 과일도 돌아갑니다."
          }
          confirmLabel="이벤트 취소"
          cancelLabel="닫기"
          danger
          onConfirm={cancelEvent}
          onClose={() => setAsking(false)}
        />,
        document.body
      )}
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

// 학생 — 담을 과일 수(−/＋) + 이벤트(응모하기 · 응모하지 않기)
// '과일 내놓기 · 과일 거두기' 단추는 없습니다(선생님 요청 — −/＋로 정한 개수가
// 곧 담을 과일이고, 담고 돌려받는 것은 두 선택이 합니다).
//  · **응모하기** — 정한 개수만큼 제 과일이 바구니에 담기며 응모합니다
//    (enterFruitEvent). 반 바구니 100개와는 별개입니다.
//  · **응모하지 않기** — 담아 둔 과일을 모두 돌려받습니다(declineFruitEvent).
// **둘 중 하나를 고르는 단추**입니다 — 고른 쪽은 다시 눌러도 아무 일이 없고
// (토글이 아님), 다른 쪽을 누르면 바뀝니다. 응모한 동안은 개수를 못 바꿉니다
// (응모하지 않기로 돌려받은 뒤 다시 응모). 선생님이 접수하면 모두 잠깁니다.
function StudentPanel({ classId, uid, myFruit, mine, basketRef }) {
  // 개수 — **이번에 담을 수**(선생님 요청). −/＋ 단추로 고치고, 칸에 직접
  // 적어도 됨. 0에서 시작하고 응모하기를 누를 때마다(돌려받을 때도) 0으로
  // 돌아갑니다 — 응모한 뒤에 더 담으려면 다시 정해 누르면 됩니다.
  const [raw, setRaw] = useState("0");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  // 내 과일 수 자리 — 날아가는 과일이 여기서 출발하고(응모) 여기로 돌아옵니다.
  const myFruitRef = useRef(null);
  useEffect(() => { setRaw("0"); }, [mine.donated, mine.choice]);

  const entered = mine.choice === "entered";
  const max = entryMax(myFruit);
  const add = entryAmount(raw, myFruit);
  const canEnter = canEnterEvent(mine, add);
  const stepNow = Math.max(0, Math.floor(Number(raw)) || 0);
  // 접수된 뒤 · 가진 과일이 없으면 개수 칸을 잠급니다.
  const locked = busy || mine.received || max <= 0;
  const step = (d) => {
    setRaw(String(Math.min(max, Math.max(0, stepNow + d))));
    setMsg(null);
  };

  // fly(out) → 날릴 { dir, n } — 저장이 **끝난 뒤에** 날립니다(실패했는데
  // 과일이 담기는 그림을 보여 주면 거짓말이 됩니다).
  async function run(fn, okText, failText, fly) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const out = await fn();
      setMsg({ ok: true, text: okText(out) });
      const f = fly?.(out);
      if (f?.n > 0) flyFruits({ from: myFruitRef.current, basket: basketRef?.current, ...f });
    } catch (e) {
      // 규칙 거부는 Firebase의 영어 문구('Missing or insufficient
      // permissions.')가 그대로 올라와 학생이 읽을 수 없었습니다. 우리말로
      // 바꾸고, 원인을 좁힐 단서(code)는 콘솔에 남깁니다.
      console.error("[fruitBasket] 실패:", e?.code ?? "", e?.message ?? e);
      setMsg({ ok: false, text: fruitErrorText(e, failText) });
    } finally {
      setBusy(false);
    }
  }
  // 응모 · 더 담기가 같은 단추입니다(이미 응모했으면 '더 담았어요').
  const enter = () => {
    if (!canEnter) return;
    const again = entered;
    return run(
      () => enterFruitEvent(classId, uid, add),
      (out) => (again
        ? `과일 ${add}개를 더 담았어요. 바구니에 담은 과일 ${out.donated}개, 남은 과일 ${out.left}개.`
        : `응모했어요. 바구니에 담은 과일 ${out.donated}개, 남은 과일 ${out.left}개.`),
      "응모하지 못했어요. 다시 시도해 주세요.",
      () => ({ dir: "in", n: add })
    );
  };
  const decline = () => !mine.received && run(
    () => declineFruitEvent(classId, uid),
    (back) => (back > 0 ? `응모하지 않기로 했어요. 담아 둔 과일 ${back}개를 돌려받았어요.` : "응모하지 않기로 했어요."),
    "고르지 못했어요. 다시 시도해 주세요.",
    (back) => ({ dir: "out", n: back })
  );

  // 적은 개수가 담을 수 없는 값이면 까닭을 적습니다(0은 '아직 안 정함').
  const hint = !locked && stepNow > max ? `가진 과일 ${myFruit}개 안에서 정해 주세요.` : null;
  const help = mine.received
    ? "선생님이 응모를 접수해서 담은 과일이 최종 제출됐어요."
    : max <= 0
      ? entered
        ? `응모해서 과일 ${mine.donated}개가 바구니에 담겼어요.`
        : "가진 과일이 없어요. 선생님께 과일을 받으면 응모할 수 있어요."
      : entered
        ? "더 담으려면 −/＋로 개수를 정하고 응모하기를 다시 누르세요."
        : "−/＋로 담을 과일 수를 정하고 응모하기를 누르면 그만큼 바구니에 담겨요.";
  const eventHelp = mine.received
    ? "선생님이 접수해서 더 바꿀 수 없어요."
    : entered
      ? add > 0
        ? `응모하기를 누르면 과일 ${add}개를 더 담아요(모두 ${mine.donated + add}개).`
        : `응모했어요. 응모하지 않기를 누르면 담은 과일 ${mine.donated}개를 돌려받아요.`
      : !canEnter && max > 0
        ? "담을 과일을 1개 이상 정하면 응모할 수 있어요."
        : mine.choice === "declined"
          ? "응모하지 않기를 골랐어요. 응모하기를 누르면 바뀌어요."
          : mine.donated > 0
            ? `둘 중 하나를 골라 주세요. 응모하지 않기를 고르면 담아 둔 과일 ${mine.donated}개를 돌려받아요.`
            : "둘 중 하나를 골라 주세요.";
  return (
    <>
      <section className="fb-mine">
        <div className="fb-mine-stats">
          <span>내가 가진 과일 <b ref={myFruitRef}>🍊 {myFruit}</b></span>
          <span>바구니에 담은 과일 <b>{mine.donated}</b></span>
        </div>
        {/* 개수 — 가운데 칸 양옆의 −/＋로 하나씩(선생님 요청). 칸에 직접
            적을 수도 있습니다(숫자만 남김). Enter는 응모하기와 같습니다. */}
        <form
          className="fb-give"
          onSubmit={(e) => { e.preventDefault(); enter(); }}
        >
          <div className="fb-stepper" role="group" aria-label="이번에 담을 과일 수">
            <button
              type="button"
              className="fb-step"
              onClick={() => step(-1)}
              disabled={locked || stepNow <= 0}
              aria-label="하나 줄이기"
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={raw}
              onChange={(e) => { setRaw(e.target.value.replace(/[^0-9]/g, "").slice(0, 3)); setMsg(null); }}
              disabled={locked}
              aria-label="이번에 담을 과일 수"
              data-esc-ignore=""
            />
            <button
              type="button"
              className="fb-step"
              onClick={() => step(1)}
              disabled={locked || stepNow >= max}
              aria-label="하나 늘리기"
            >
              ＋
            </button>
          </div>
        </form>
        {hint ? <p className="fb-msg err">{hint}</p> : <p className="fb-help">{help}</p>}
      </section>

      {/* 이벤트 칸은 늘 섭니다 — 조건이 안 되면 꺼진 단추와 까닭 한 줄. */}
      <section className="fb-enter">
        <div className="fb-entry-head">
          <span className="fb-label">이벤트</span>
          {mine.received && <strong className="fb-received">선생님이 접수했어요</strong>}
        </div>
        {/* **둘 중 하나를 고르는 단추** — 고른 쪽은 진한 살구 + ✓, 다른 쪽은
            살구(선생님 요청). 고른 쪽은 다시 눌러도 아무 일이 없고, 다른 쪽을
            누르면 바뀝니다. 선생님이 접수하면 둘 다 잠깁니다.
            응모한 뒤 −/＋로 담을 수를 정하면 응모하기가 다시 살아나 **더 담기**가
            됩니다(`＋n개 더 응모하기` — 살구로 돌아와 누를 수 있음을 보임). */}
        <div className="fb-choice" role="radiogroup" aria-label="이벤트 응모 여부">
          <button
            type="button"
            role="radio"
            className={`btn-primary fb-enter-btn${entered && add === 0 ? " fb-choice-on" : ""}${mine.choice === "declined" ? " fb-choice-off" : ""}`}
            aria-checked={entered}
            onClick={entered && add === 0 ? undefined : enter}
            disabled={busy || mine.received || (!(entered && add === 0) && !canEnter)}
            title={
              entered && add > 0 ? `과일 ${add}개를 바구니에 더 담아요(모두 ${mine.donated + add}개)`
                : entered ? "응모했어요 — 개수를 정하면 더 담을 수 있어요"
                : canEnter ? `과일 ${mine.donated + add}개를 바구니에 담고 응모해요` : undefined
            }
          >
            {entered ? (add > 0 ? `＋${add}개 더 응모하기` : "✓ 응모하기") : "응모하기"}
          </button>
          <button
            type="button"
            role="radio"
            className={`btn-primary fb-enter-btn${mine.choice === "declined" ? " fb-choice-on" : ""}${entered ? " fb-choice-off" : ""}`}
            aria-checked={mine.choice === "declined"}
            onClick={mine.choice === "declined" ? undefined : decline}
            disabled={busy || mine.received}
            title={
              mine.choice === "declined" ? "응모하지 않기를 골랐어요 — 바꾸려면 응모하기를 누르세요"
                : mine.donated > 0 ? `담아 둔 과일 ${mine.donated}개를 돌려받아요`
                : "응모하지 않습니다"
            }
          >
            {mine.choice === "declined" ? "✓ 응모하지 않기" : "응모하지 않기"}
          </button>
        </div>
        <p className="fb-help fb-enter-wait">{eventHelp}</p>
        {msg && <p className={`fb-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
      </section>
    </>
  );
}
