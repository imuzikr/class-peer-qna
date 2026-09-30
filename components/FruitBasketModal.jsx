"use client";

// =============================================================
// 과일 바구니 — 공부방 제목 줄 맨 끝의 '과일 바구니'가 여는 창 (교사·학생)
// -------------------------------------------------------------
// 커다란 바구니에 과일이 수북하게 담긴 그림 한 장입니다(선생님 요청).
// 그림은 **파일이 아니라 SVG로 여기서 그립니다** — 그림 파일을 두면
// public/에 자산이 하나 늘고, 창 크기마다 흐려지지 않게 여러 크기를 둬야
// 합니다. SVG는 창 폭에 맞춰 늘고 줄어도 선이 그대로입니다.
//
// [그리는 차례] 뒤에서 앞으로 — 손잡이 → 바구니 뒷테두리 → 과일(뒷줄 →
// 가운데 줄 → 앞줄) → 바구니 몸통·앞테두리 → 테두리에 걸친 체리 · 바닥에
// 굴러 나온 사과. 앞줄 과일의 아랫부분을 몸통이 덮어 '담겨 있는' 모양이
// 됩니다.
//
// [과일 기부] 학생은 제 과일을 몇 개 **내놓아**(과일 기부하기) 반의 바구니를
// 채웁니다 — 내놓은 만큼 제 과일이 줄고, 몇 번이든 더 내놓을 수 있습니다.
// 바구니가 100개에 닿으면 학생마다 '이벤트 응모'를 누르고, 교사 화면은 합계와
// 응모 현황(모두 응모하면 그 사실)을 봅니다. 셈은 lib/fruitBasket.js, 저장은
// lib/data/rewards.js(donateFruits · enterFruitEvent), 규칙은 firestore.rules의
// fruitBasket 절. 읽는 문서는 그 반의 바구니 문서들(학생 수만큼)뿐입니다 —
// 내 과일 수는 페이지가 이미 받아 둔 rewards에서 넘겨받습니다.
// 닫기는 다른 창과 같은 backdropClose(Esc·배경).
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { subscribeFruitBasket, donateFruits, enterFruitEvent } from "@/lib/store";
import { basketSummary, donationAmount, myBasketEntry } from "@/lib/fruitBasket";

// 과일 한 알씩 — 그라디언트 id는 이 창 안에서만 쓰므로 접두사 fb-
function Apple({ x, y, r, tone = "red" }) {
  const fill = tone === "green" ? "url(#fb-green)" : "url(#fb-red)";
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={fill} />
      <path
        d={`M${x - r * 0.28} ${y - r * 0.82} Q${x} ${y - r * 0.62} ${x + r * 0.28} ${y - r * 0.82}`}
        fill="none"
        stroke="rgba(0,0,0,0.18)"
        strokeWidth={r * 0.08}
        strokeLinecap="round"
      />
      <path
        d={`M${x} ${y - r * 0.72} q${r * 0.05} ${-r * 0.3} ${r * 0.2} ${-r * 0.42}`}
        stroke="#6b4423"
        strokeWidth={r * 0.1}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={`M${x + r * 0.12} ${y - r * 0.95} q${r * 0.35} ${-r * 0.3} ${r * 0.6} ${-r * 0.08} q${-r * 0.3} ${r * 0.28} ${-r * 0.6} ${r * 0.08}z`}
        fill="#5fa54a"
      />
      <ellipse
        cx={x - r * 0.38}
        cy={y - r * 0.3}
        rx={r * 0.16}
        ry={r * 0.26}
        fill="rgba(255,255,255,0.55)"
        transform={`rotate(-25 ${x - r * 0.38} ${y - r * 0.3})`}
      />
    </g>
  );
}

function Orange({ x, y, r }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="url(#fb-orange)" />
      {[[-0.3, -0.1], [0.2, 0.25], [0.35, -0.2], [-0.15, 0.4], [0.05, -0.45]].map(([dx, dy], i) => (
        <circle key={i} cx={x + r * dx} cy={y + r * dy} r={r * 0.035} fill="rgba(160,70,0,0.35)" />
      ))}
      <circle cx={x + r * 0.05} cy={y - r * 0.9} r={r * 0.09} fill="#7a8f2e" />
      <path
        d={`M${x + r * 0.05} ${y - r * 0.92} q${r * 0.4} ${-r * 0.35} ${r * 0.72} ${-r * 0.12} q${-r * 0.36} ${r * 0.24} ${-r * 0.72} ${r * 0.12}z`}
        fill="#4f9a45"
      />
      <ellipse
        cx={x - r * 0.4}
        cy={y - r * 0.35}
        rx={r * 0.14}
        ry={r * 0.24}
        fill="rgba(255,255,255,0.5)"
        transform={`rotate(-30 ${x - r * 0.4} ${y - r * 0.35})`}
      />
    </g>
  );
}

function Lemon({ x, y, rx, ry, rot = 0 }) {
  return (
    <g transform={`rotate(${rot} ${x} ${y})`}>
      <path
        d={`M${x - rx - 8} ${y} Q${x - rx} ${y - ry * 1.05} ${x} ${y - ry} Q${x + rx} ${y - ry * 1.05} ${x + rx + 8} ${y} Q${x + rx} ${y + ry * 1.05} ${x} ${y + ry} Q${x - rx} ${y + ry * 1.05} ${x - rx - 8} ${y}z`}
        fill="url(#fb-yellow)"
      />
      <ellipse cx={x - rx * 0.35} cy={y - ry * 0.4} rx={rx * 0.28} ry={ry * 0.18} fill="rgba(255,255,255,0.55)" />
    </g>
  );
}

function Pear({ x, y, s }) {
  return (
    <g>
      <path
        d={`M${x} ${y - 58 * s} C${x + 16 * s} ${y - 58 * s} ${x + 18 * s} ${y - 30 * s} ${x + 26 * s} ${y - 12 * s} C${x + 44 * s} ${y + 10 * s} ${x + 42 * s} ${y + 44 * s} ${x} ${y + 46 * s} C${x - 42 * s} ${y + 44 * s} ${x - 44 * s} ${y + 10 * s} ${x - 26 * s} ${y - 12 * s} C${x - 18 * s} ${y - 30 * s} ${x - 16 * s} ${y - 58 * s} ${x} ${y - 58 * s}z`}
        fill="url(#fb-pear)"
      />
      <path d={`M${x} ${y - 56 * s} q${3 * s} ${-12 * s} ${10 * s} ${-18 * s}`} stroke="#6b4423" strokeWidth={4 * s} strokeLinecap="round" fill="none" />
      <ellipse cx={x - 14 * s} cy={y + 2 * s} rx={7 * s} ry={14 * s} fill="rgba(255,255,255,0.45)" transform={`rotate(-15 ${x - 14 * s} ${y + 2 * s})`} />
    </g>
  );
}

function Grapes({ x, y, s = 1 }) {
  const beads = [
    [0, 0], [22, 0], [-22, 0], [11, 19], [-11, 19], [33, -19], [11, -19], [-11, -19], [-33, -19],
    [0, 38], [22, 38], [-22, 38], [11, 57], [-11, 57], [0, 76],
  ];
  return (
    <g>
      <path d={`M${x} ${y - 30 * s} q${4 * s} ${-18 * s} ${-6 * s} ${-30 * s}`} stroke="#6b4423" strokeWidth={4 * s} fill="none" strokeLinecap="round" />
      <path d={`M${x - 2 * s} ${y - 40 * s} q${-30 * s} ${-14 * s} ${-44 * s} ${4 * s} q${24 * s} ${6 * s} ${44 * s} ${-4 * s}z`} fill="#5fa54a" />
      {beads.map(([dx, dy], i) => (
        <g key={i}>
          <circle cx={x + dx * s} cy={y + dy * s} r={13 * s} fill="url(#fb-grape)" />
          <circle cx={x + dx * s - 4 * s} cy={y + dy * s - 4 * s} r={3.5 * s} fill="rgba(255,255,255,0.45)" />
        </g>
      ))}
    </g>
  );
}

function Bananas({ x, y, s = 1 }) {
  // 세 개가 부채처럼 — 오른쪽 위로 휘어 올라갑니다
  const one = (dx, dy, rot) => (
    <g transform={`rotate(${rot} ${x} ${y})`}>
      <path
        d={`M${x + dx} ${y + dy} C${x + dx + 30 * s} ${y + dy + 18 * s} ${x + dx + 100 * s} ${y + dy + 6 * s} ${x + dx + 140 * s} ${y + dy - 52 * s} C${x + dx + 104 * s} ${y + dy - 18 * s} ${x + dx + 40 * s} ${y + dy - 10 * s} ${x + dx} ${y + dy - 16 * s}z`}
        fill="url(#fb-banana)"
        stroke="#c99a1c"
        strokeWidth={1.5 * s}
      />
      <path d={`M${x + dx + 136 * s} ${y + dy - 50 * s} l${8 * s} ${-6 * s}`} stroke="#5a4015" strokeWidth={5 * s} strokeLinecap="round" />
    </g>
  );
  return (
    <g>
      {one(0, 0, -8)}
      {one(0, 0, 6)}
      {one(0, 0, 20)}
      <rect x={x - 12 * s} y={y - 16 * s} width={16 * s} height={16 * s} rx={3 * s} fill="#7a5a1c" />
    </g>
  );
}

function Strawberry({ x, y, s = 1, rot = 0 }) {
  const seeds = [[-10, -6], [0, -9], [10, -6], [-6, 4], [6, 4], [-12, 6], [12, 6], [0, 14], [-5, 20], [5, 20]];
  return (
    <g transform={`rotate(${rot} ${x} ${y})`}>
      <path
        d={`M${x} ${y + 34 * s} C${x - 30 * s} ${y + 10 * s} ${x - 30 * s} ${y - 16 * s} ${x - 18 * s} ${y - 20 * s} C${x - 8 * s} ${y - 24 * s} ${x + 8 * s} ${y - 24 * s} ${x + 18 * s} ${y - 20 * s} C${x + 30 * s} ${y - 16 * s} ${x + 30 * s} ${y + 10 * s} ${x} ${y + 34 * s}z`}
        fill="url(#fb-berry)"
      />
      {seeds.map(([dx, dy], i) => (
        <ellipse key={i} cx={x + dx * s} cy={y + dy * s} rx={1.6 * s} ry={2.4 * s} fill="#ffe08a" />
      ))}
      <path
        d={`M${x - 20 * s} ${y - 20 * s} l${10 * s} ${-2 * s} l${2 * s} ${-12 * s} l${8 * s} ${10 * s} l${8 * s} ${-10 * s} l${2 * s} ${12 * s} l${10 * s} ${2 * s} l${-14 * s} ${6 * s} l${-6 * s} ${-2 * s} l${-6 * s} ${2 * s}z`}
        fill="#4f9a45"
      />
    </g>
  );
}

function Cherries({ x, y, s = 1 }) {
  return (
    <g>
      <path d={`M${x - 14 * s} ${y} Q${x - 10 * s} ${y - 40 * s} ${x + 6 * s} ${y - 54 * s}`} stroke="#5d7a2a" strokeWidth={3 * s} fill="none" strokeLinecap="round" />
      <path d={`M${x + 16 * s} ${y + 4 * s} Q${x + 14 * s} ${y - 34 * s} ${x + 6 * s} ${y - 54 * s}`} stroke="#5d7a2a" strokeWidth={3 * s} fill="none" strokeLinecap="round" />
      <path d={`M${x + 6 * s} ${y - 54 * s} q${16 * s} ${-12 * s} ${30 * s} ${-2 * s} q${-16 * s} ${8 * s} ${-30 * s} ${2 * s}z`} fill="#5fa54a" />
      <circle cx={x - 14 * s} cy={y + 8 * s} r={13 * s} fill="url(#fb-cherry)" />
      <circle cx={x + 16 * s} cy={y + 12 * s} r={13 * s} fill="url(#fb-cherry)" />
      <circle cx={x - 18 * s} cy={y + 4 * s} r={3.5 * s} fill="rgba(255,255,255,0.55)" />
      <circle cx={x + 12 * s} cy={y + 8 * s} r={3.5 * s} fill="rgba(255,255,255,0.55)" />
    </g>
  );
}

function Kiwi({ x, y, r }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#8a6a3c" />
      <circle cx={x} cy={y} r={r * 0.86} fill="#8cc63f" />
      <circle cx={x} cy={y} r={r * 0.3} fill="#f3f7d9" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <ellipse
            key={i}
            cx={x + Math.cos(a) * r * 0.46}
            cy={y + Math.sin(a) * r * 0.46}
            rx={r * 0.05}
            ry={r * 0.09}
            fill="#2b2a1a"
            transform={`rotate(${(a * 180) / Math.PI + 90} ${x + Math.cos(a) * r * 0.46} ${y + Math.sin(a) * r * 0.46})`}
          />
        );
      })}
    </g>
  );
}

function BasketArt() {
  return (
    <svg
      className="fruit-basket-art"
      viewBox="0 70 600 414"
      role="img"
      aria-label="과일이 수북하게 담긴 커다란 과일 바구니"
    >
      <defs>
        <radialGradient id="fb-red" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ff6b5e" />
          <stop offset="0.6" stopColor="#e0302b" />
          <stop offset="1" stopColor="#a8181c" />
        </radialGradient>
        <radialGradient id="fb-green" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#c9ec7a" />
          <stop offset="0.6" stopColor="#8cc63f" />
          <stop offset="1" stopColor="#5b8f22" />
        </radialGradient>
        <radialGradient id="fb-orange" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ffc15a" />
          <stop offset="0.6" stopColor="#ff9416" />
          <stop offset="1" stopColor="#d86a00" />
        </radialGradient>
        <radialGradient id="fb-yellow" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fff7a3" />
          <stop offset="0.6" stopColor="#ffe03a" />
          <stop offset="1" stopColor="#e0b400" />
        </radialGradient>
        <radialGradient id="fb-pear" cx="35%" cy="45%" r="75%">
          <stop offset="0" stopColor="#f3f59a" />
          <stop offset="0.6" stopColor="#cddc4a" />
          <stop offset="1" stopColor="#98a82a" />
        </radialGradient>
        <radialGradient id="fb-grape" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#b98ce0" />
          <stop offset="0.6" stopColor="#7d4bb3" />
          <stop offset="1" stopColor="#4e2a7a" />
        </radialGradient>
        <linearGradient id="fb-banana" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff08a" />
          <stop offset="1" stopColor="#f2c62a" />
        </linearGradient>
        <radialGradient id="fb-berry" cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ff6f6f" />
          <stop offset="0.6" stopColor="#e3263a" />
          <stop offset="1" stopColor="#a8122a" />
        </radialGradient>
        <radialGradient id="fb-cherry" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ff5a6e" />
          <stop offset="0.6" stopColor="#c8102e" />
          <stop offset="1" stopColor="#7d0a1e" />
        </radialGradient>
        {/* 엮은 무늬 — 가로로 눕힌 가닥과 세운 가닥이 번갈아 */}
        <pattern id="fb-weave" width="36" height="24" patternUnits="userSpaceOnUse">
          <rect width="36" height="24" fill="#b3743a" />
          <rect x="1.5" y="1.5" width="15" height="9" rx="4.5" fill="#dca264" />
          <rect x="19.5" y="13.5" width="15" height="9" rx="4.5" fill="#dca264" />
          <rect x="19.5" y="1.5" width="15" height="9" rx="4.5" fill="#c4854a" />
          <rect x="1.5" y="13.5" width="15" height="9" rx="4.5" fill="#c4854a" />
        </pattern>
        <linearGradient id="fb-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(60,30,10,0.35)" />
          <stop offset="0.25" stopColor="rgba(60,30,10,0)" />
          <stop offset="0.75" stopColor="rgba(60,30,10,0)" />
          <stop offset="1" stopColor="rgba(60,30,10,0.35)" />
        </linearGradient>
      </defs>

      {/* 바닥 그림자 */}
      <ellipse cx="300" cy="452" rx="250" ry="24" fill="rgba(60,40,20,0.14)" />

      {/* 손잡이 — 과일보다 먼저 그려 뒤에 섭니다 */}
      <path d="M96 262 C96 40 504 40 504 262" fill="none" stroke="#8a5424" strokeWidth="26" strokeLinecap="round" />
      <path d="M96 262 C96 40 504 40 504 262" fill="none" stroke="#c98a4b" strokeWidth="14" strokeLinecap="round" strokeDasharray="18 10" />

      {/* 바구니 뒷테두리 */}
      <ellipse cx="300" cy="262" rx="226" ry="42" fill="#7a4a1e" />

      {/* 뒷줄 */}
      <Bananas x={226} y={170} s={1} />
      <Grapes x={170} y={170} s={1} />
      <Pear x={420} y={172} s={1} />
      <Orange x={300} y={178} r={44} />

      {/* 가운데 줄 */}
      <Apple x={140} y={236} r={44} />
      <Orange x={226} y={226} r={46} />
      <Apple x={318} y={228} r={50} tone="green" />
      <Lemon x={420} y={232} rx={44} ry={32} rot={-12} />
      <Apple x={482} y={246} r={38} />

      {/* 앞줄 — 아랫부분은 몸통이 덮습니다 */}
      <Orange x={108} y={274} r={34} />
      <Strawberry x={180} y={272} s={1.1} rot={-12} />
      <Kiwi x={250} y={282} r={32} />
      <Apple x={330} y={286} r={36} />
      <Strawberry x={396} y={276} s={1.1} rot={10} />
      <Orange x={470} y={282} r={32} />

      {/* 바구니 몸통 */}
      <path d="M72 266 Q300 322 528 266 L486 414 Q300 450 114 414 Z" fill="url(#fb-weave)" />
      <path d="M72 266 Q300 322 528 266 L486 414 Q300 450 114 414 Z" fill="url(#fb-shade)" />
      {/* 바닥 띠 */}
      <path d="M114 414 Q300 450 486 414" fill="none" stroke="#7a4a1e" strokeWidth="16" strokeLinecap="round" />
      {/* 앞테두리 — 꼰 줄처럼 */}
      <path d="M66 264 Q300 324 534 264" fill="none" stroke="#8a5424" strokeWidth="24" strokeLinecap="round" />
      <path d="M66 264 Q300 324 534 264" fill="none" stroke="#d99a57" strokeWidth="10" strokeLinecap="round" strokeDasharray="14 9" />

      {/* 테두리에 걸친 체리 · 바닥에 굴러 나온 사과 */}
      <Cherries x={262} y={318} s={1} />
      <Apple x={530} y={430} r={30} tone="green" />
      <Strawberry x={78} y={432} s={0.8} rot={-24} />
    </svg>
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
  if (!sum.goalReached) {
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

// 학생 — 내 과일 · 내놓기 · 응모
// 내놓은 과일은 돌아오지 않으므로, 한 번 더 묻고 내놓습니다(창 대신 이 칸 안에서).
function StudentPanel({ classId, uid, myFruit, mine, goalReached }) {
  const [raw, setRaw] = useState("");
  const [confirming, setConfirming] = useState(0); // 내놓을 개수(0 = 묻는 중 아님)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const amount = donationAmount(raw, myFruit);

  async function give() {
    if (!confirming || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const left = await donateFruits(classId, uid, confirming);
      setMsg({ ok: true, text: `과일 ${confirming}개를 내놓았어요. 남은 과일 ${left}개.` });
      setRaw("");
    } catch (e) {
      setMsg({ ok: false, text: e?.message || "내놓지 못했어요. 다시 시도해 주세요." });
    } finally {
      setBusy(false);
      setConfirming(0);
    }
  }

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
    }
  }

  const tooMany = raw.trim() !== "" && amount === 0;
  return (
    <>
      <section className="fb-mine">
        <div className="fb-mine-stats">
          <span>내가 가진 과일 <b>🍊 {myFruit}</b></span>
          <span>내가 내놓은 과일 <b>{mine.donated}</b></span>
        </div>
        {confirming ? (
          <div className="fb-confirm" role="group" aria-label="내놓기 확인">
            <p>과일 <b>{confirming}개</b>를 바구니에 내놓을까요? 내놓은 과일은 돌아오지 않아요.</p>
            <div className="fb-confirm-btns">
              <button type="button" className="btn-ghost" onClick={() => setConfirming(0)} disabled={busy}>
                취소
              </button>
              <button type="button" className="btn-primary" onClick={give} disabled={busy}>
                {busy ? "내놓는 중…" : "내놓기"}
              </button>
            </div>
          </div>
        ) : (
          <form
            className="fb-give"
            onSubmit={(e) => { e.preventDefault(); if (amount) setConfirming(amount); }}
          >
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.max(1, myFruit)}
              value={raw}
              onChange={(e) => { setRaw(e.target.value); setMsg(null); }}
              placeholder={myFruit > 0 ? `1~${myFruit}` : "과일이 없어요"}
              disabled={myFruit <= 0}
              aria-label="내놓을 과일 수"
            />
            <button type="submit" className="btn-primary" disabled={!amount}>
              과일 기부하기
            </button>
          </form>
        )}
        {tooMany && !confirming && (
          <p className="fb-msg err">가진 과일({myFruit}개) 안에서 1개 이상 적어 주세요.</p>
        )}
        {msg && <p className={`fb-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
      </section>

      {goalReached && (
        <section className="fb-enter">
          {mine.entered ? (
            <p className="fb-entered">✓ 이벤트에 응모했어요.</p>
          ) : (
            <button type="button" className="btn-primary fb-enter-btn" onClick={enter} disabled={busy}>
              이벤트 응모
            </button>
          )}
        </section>
      )}
    </>
  );
}
