"use client";

// =============================================================
// 전광판 (상단바) — 교사가 학생을 칭찬·격려하는 짧은 글
// -------------------------------------------------------------
// '이달의 주니어 개발자 10101 홍길동', '금주의 질문왕 20202 오길동'처럼
// 알리고 싶은 한 줄을 걸어 두는 자리입니다. 상단바는 다섯 화면에 모두
// 떠 있으므로, 학생이 어느 화면에 있든 눈에 들어옵니다.
//
// [배움나눔 전체에 하나입니다 — 반마다 따로가 아닙니다]
// 한때 `classes/{cId}.marquee`에 담아 반마다 달랐는데, (ㄱ) 상단바는 반을
// 고르지 않는 화면(질문방·리포트)에도 떠 있어 거기서는 아무것도 안 걸렸고,
// (ㄴ) 교사가 반을 옮길 때마다 걸린 글이 갈려 '지금 무엇이 걸려 있나'를
// 반마다 따로 기억해야 했습니다. 칭찬은 학교 전체에 알리는 것이라 한 자리에
// 두고 모두가 같은 것을 봅니다. 자리는 `meta/marquee` — 규칙이 이미
// 읽기 `signedIn()` · 쓰기 `isTeacher()`라 **한 줄도 안 건드렸습니다**.
//
// [제 구독을 스스로 겁니다]
// 반이 없으니 위에서 내려 줄 것도 없습니다. 상단바에 한 번만 서므로
// 리스너도 **문서 하나**뿐입니다(`subscribeAppMarquee`).
//
// [여러 개를 돌아가며]
// 흐르는 글씨(marquee)로 하지 않았습니다 — 수업 중 화면 위에서 끊임없이
// 움직이면 눈길을 계속 뺏습니다. 몇 초에 한 번 조용히 바뀝니다. 글이
// 하나뿐이면 아예 안 바꿉니다(바뀔 것이 없는데 타이머만 도는 셈이라서).
// 움직임을 줄여 달라고 한 기기에서는 전환도 없이 글자만 갈립니다.
// =============================================================
import { useEffect, useRef, useState } from "react";
import {
  marqueeOf,
  setAppMarquee,
  subscribeAppMarquee,
  MARQUEE_MAX,
  MARQUEE_TEXT_MAX,
} from "@/lib/store";
import { backdropClose } from "@/lib/modal";
import { IconMyPost } from "./StatusIcons";

const TURN_MS = 7000; // 한 글이 서 있는 시간

export default function AppMarquee({ isTeacher = false }) {
  const [doc, setDoc] = useState(null);
  const [at, setAt] = useState(0);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => subscribeAppMarquee(setDoc), []);

  const items = marqueeOf(doc);

  // 글이 줄거나 늘면 차례가 범위를 벗어날 수 있습니다(교사가 지운 직후).
  const safeAt = items.length ? at % items.length : 0;

  useEffect(() => {
    if (items.length < 2) return undefined;
    const t = setInterval(() => setAt((v) => v + 1), TURN_MS);
    return () => clearInterval(t);
  }, [items.length]);

  // 걸린 글이 없으면 교사에게만 '거는 자리'를 보여 줍니다. 학생 화면에는
  // 아무것도 안 그립니다 — 빈 상자가 상단바에 남아 있을 이유가 없습니다.
  if (items.length === 0 && !isTeacher) return null;

  return (
    <div className="app-marquee">
      {/* 이모지를 안 답니다 — 이 줄에서 읽을 것은 학생 이름 하나뿐이라,
          앞에 그림이 붙으면 그만큼 글자가 밀리고 눈이 먼저 그림을 짚습니다.
          여기가 전광판이라는 것은 알약 바탕이 이미 말합니다. */}
      {items.length > 0 ? (
        <p className="app-marquee-text" key={items[safeAt]?.id ?? safeAt} title={items[safeAt]?.text}>
          {items[safeAt]?.text}
        </p>
      ) : (
        <p className="app-marquee-text app-marquee-text--empty">
          전광판이 비어 있어요
        </p>
      )}
      {/* 여러 개일 때만 몇 번째인지 점으로 — 하나뿐이면 셀 것이 없습니다 */}
      {items.length > 1 && (
        <span className="app-marquee-dots" aria-hidden="true">
          {items.map((m, i) => (
            <i key={m.id} className={i === safeAt ? "on" : ""} />
          ))}
        </span>
      )}
      {isTeacher && (
        <button
          type="button"
          className="app-marquee-edit"
          onClick={() => setEditOpen(true)}
          title="전광판에 걸 글 고치기"
          aria-label="전광판 고치기"
        >
          ✎
        </button>
      )}
      {editOpen && (
        <MarqueeEditModal items={items} onClose={() => setEditOpen(false)} />
      )}
    </div>
  );
}

// ── 교사용 편집 창 ────────────────────────────────────────────
// 글을 적어 더하고, 줄마다 지웁니다. **저장을 눌러야 반영됩니다** — 상단바에
// 바로 걸리는 글이라, 적는 도중의 반쪽짜리 문장이 학생 화면에 뜨면 안 됩니다.
function MarqueeEditModal({ items, onClose }) {
  const [list, setList] = useState(items);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const full = list.length >= MARQUEE_MAX;

  function add() {
    const text = draft.trim();
    if (!text || full) return;
    setList((v) => [
      ...v,
      { id: `mq${Date.now()}${Math.random().toString(36).slice(2, 6)}`, text, at: Date.now() },
    ]);
    setDraft("");
    inputRef.current?.focus();
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await setAppMarquee(list);
      onClose();
    } catch (e) {
      setError(`저장하지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal modal-marquee"
        role="dialog"
        aria-modal="true"
        aria-label="전광판"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 className="head-icon">
            <IconMyPost size={20} /> 전광판
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <p className="mq-hint">
          <strong>배움나눔 전체</strong>의 상단바에 돌아가며 섭니다(반마다
          따로가 아닙니다). 칭찬하고 싶은 일을 한 줄로 적어 주세요.
        </p>

        <div className="mq-add">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="이달의 주니어 개발자 10101 홍길동"
            maxLength={MARQUEE_TEXT_MAX}
            disabled={full}
          />
          <button type="button" className="btn-ghost" onClick={add} disabled={!draft.trim() || full}>
            추가
          </button>
        </div>
        <span className="mq-count">
          {full
            ? `전광판에는 ${MARQUEE_MAX}개까지 걸 수 있어요`
            : `${draft.length} / ${MARQUEE_TEXT_MAX}자 · ${list.length}개 걸림`}
        </span>

        {list.length === 0 ? (
          <p className="empty-note">아직 걸어 둔 글이 없어요.</p>
        ) : (
          <ul className="mq-list">
            {list.map((m) => (
              <li key={m.id} className="mq-item">
                <span className="mq-item-text">{m.text}</span>
                <button
                  type="button"
                  className="memo-mini-btn danger"
                  onClick={() => setList((v) => v.filter((x) => x.id !== m.id))}
                >
                  내리기
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button type="button" className="btn-primary" onClick={save} disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
