"use client";

// =============================================================
// 가로세로 — 판에 직접 적기 (모둠 판 · 개별 판 공용)
// -------------------------------------------------------------
// 칸을 누르고 그대로 치면 글자가 그 칸부터 낱말 방향으로 들어갑니다.
//
// [한글은 칸마다 입력칸을 두면 안 됩니다] '산호'를 칠 때 ㅅ·ㅏ·ㄴ·ㅎ·ㅗ가
//   들어오면 입력기가 ㄴ을 받침으로 들고 있다가 ㅗ가 와서야 '산'+'호'로
//   가릅니다. 칸마다 입력칸이면 그 가름이 칸 경계에서 끊깁니다. 그래서 **숨은
//   입력칸 하나**가 고른 낱말의 글자를 받고, 그 값을 칸에 나눠 그립니다
//   (조합 중인 글자도 칸에 곧바로 보입니다). 입력칸은 지금 칸 위에 투명하게
//   얹혀 있어 입력기 후보 창이 그 자리에 뜹니다.
//
// [Enter와 조합] 한글은 낱말의 마지막 글자가 늘 '조합 중'인 채로 Enter를
//   누르게 됩니다. 그 Enter는 keydown에서 isComposing으로 오므로 걸러 내면
//   **첫 Enter가 아무 일도 안 합니다**(예전 입력칸이 그래서 '넣어도 판에 안
//   들어간다'로 보였습니다). 조합 중의 Enter는 표시만 해 두고
//   compositionend에서 넣고 다음 낱말로 갑니다.
//
// [언제 저장하나] 낱말 칸을 다 채우면 · Enter/Tab · 다른 칸·낱말을 누르면 ·
//   입력이 1.2초 멈추면 · 입력칸을 벗어나면(onWrite). 조합 중에는 저장하지
//   않습니다(입력칸 값을 비우면 조합이 깨집니다).
//
// [잠긴 칸] lockedKeys(열쇠 칸 · 이미 맞힌 낱말의 칸)는 건너뜁니다 — 교차하는
//   칸의 글자는 이미 맞으므로 고칠 까닭이 없고, 실수로 지우면 맞힌 낱말이
//   깨집니다.
// =============================================================
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { entryCellKeys, nextOpenEntry } from "@/lib/crossword";
import CrosswordGrid from "./CrosswordGrid";

const IDLE_SAVE_MS = 1200;

export default function CrosswordTyping({
  puzzle,
  letters,            // { "r,c": 글자 } — 저장된 칸
  fixed = null,       // 열쇠 칸(그리기용)
  lockedKeys = null,  // 못 고치는 칸
  solvedKeys = null,
  wrongKeys = null,
  sel,                // 고른 낱말(entries 차례) 또는 null
  onSelect,           // (i) => void
  canType = () => true, // (i) => 이 낱말에 적을 수 있나
  nextOk = null,      // (i) => Enter로 건너갈 만한 낱말인가(없으면 canType)
  onWrite,            // (set, del) => void — 칸 단위 쓰기
  disabled = false,
  focusTick = 0,      // 올리면 입력칸에 초점(힌트 목록에서 고를 때)
}) {
  const entries = useMemo(() => puzzle?.entries ?? [], [puzzle]);
  const locked = lockedKeys ?? EMPTY;

  const slotsFor = useCallback(
    (i) => (i == null || !entries[i] ? [] : entryCellKeys(entries[i]).filter((k) => !locked.has(k))),
    [entries, locked]
  );

  // 적는 중 — 어느 낱말의 몇째 빈칸부터 무엇을 쳤나. 낱말이 바뀌면 묵은 것을
  // 그 낱말 자리로 저장하고 새로 시작합니다(sel이 바뀐 뒤에도 옛 자리를 알도록
  // 낱말 번호를 함께 듭니다).
  const [typing, setTyping] = useState({ sel: null, start: 0, value: "" });
  const typingRef = useRef(typing);
  typingRef.current = typing;
  const lettersRef = useRef(letters);
  lettersRef.current = letters;
  const composingRef = useRef(false);
  const advanceAfterCompose = useRef(false);
  const idleTimer = useRef(null);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const [inputPos, setInputPos] = useState(null);

  const typeable = sel != null && !disabled && canType(sel);
  const slots = useMemo(() => slotsFor(sel), [slotsFor, sel]);

  // 적은 것을 칸으로 — 돌려주는 값: 다음에 쓸 빈칸 자리
  const flush = useCallback((t = typingRef.current) => {
    clearTimeout(idleTimer.current);
    if (!t.value) return t.start;
    const ss = slotsFor(t.sel);
    const set = {};
    [...t.value].forEach((ch, i) => {
      const k = ss[t.start + i];
      if (k && lettersRef.current?.[k] !== ch) set[k] = ch;
    });
    if (Object.keys(set).length) {
      // 구독이 돌아오기 전에 다음 낱말의 '첫 빈칸'을 셀 때 방금 적은 칸을
      // 빈칸으로 보지 않게 미리 담아 둡니다
      lettersRef.current = { ...lettersRef.current, ...set };
      onWrite(set, []);
    }
    return Math.min(t.start + [...t.value].length, ss.length);
  }, [slotsFor, onWrite]);

  // 첫 빈칸 — 낱말을 고르면 거기서 시작합니다
  const firstEmpty = useCallback((i) => {
    const ss = slotsFor(i);
    const at = ss.findIndex((k) => !lettersRef.current?.[k]);
    return at >= 0 ? at : 0;
  }, [slotsFor]);

  // 칸을 눌러 낱말을 바꿨으면 그 칸에서 시작 — 아래 효과가 받아 씁니다
  const pendingStart = useRef(null);

  // 낱말이 바뀌면 묵은 글자를 저장하고 새로 시작
  useEffect(() => {
    const t = typingRef.current;
    if (t.sel === sel) return;
    if (t.value && t.sel != null) flush(t);
    const p = pendingStart.current;
    pendingStart.current = null;
    const start = p && p.sel === sel ? p.start : sel == null ? 0 : firstEmpty(sel);
    setTyping({ sel, start, value: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  // 힌트 목록에서 낱말을 고르면 곧바로 적을 수 있게 — 부르는 쪽이 focusTick을
  // 올립니다(이미 고른 낱말을 다시 눌러도 초점이 와야 해서 sel만으로는 모자랍니다).
  // 화면을 열 때는 올리지 않습니다 — 휴대폰에서 열자마자 자판이 올라오면 판이
  // 가려집니다.
  useEffect(() => {
    if (focusTick > 0) focusInput();
  }, [focusTick]);

  // 화면을 떠날 때 남은 글자 — 마운트 한 번만(렌더마다 걸면 정리가 돌 때마다
  // 쓰기가 나갑니다)
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => { flushRef.current(); }, []);

  const cur = typing.sel === sel ? typing : { sel, start: 0, value: "" };
  const chars = [...cur.value];
  const overlay = {};
  const typingKeys = new Set();
  chars.forEach((ch, i) => {
    const k = slots[cur.start + i];
    if (k) { overlay[k] = ch; typingKeys.add(k); }
  });
  const shown = { ...letters, ...overlay };
  const cursorIdx = Math.min(cur.start + chars.length, Math.max(slots.length - 1, 0));
  const cursorKey = typeable && slots.length ? slots[cursorIdx] : null;
  const selKeys = useMemo(
    () => new Set(sel != null && entries[sel] ? entryCellKeys(entries[sel]) : []),
    [entries, sel]
  );

  // 숨은 입력칸을 지금 적는 낱말의 시작 칸 위에
  const anchorKey = typeable && slots.length ? slots[Math.min(cur.start, slots.length - 1)] : null;
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !anchorKey) { setInputPos(null); return; }
    const el = wrap.querySelector(`[data-k="${anchorKey}"]`);
    if (!el) return;
    const w = wrap.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setInputPos({ left: r.left - w.left, top: r.top - w.top, width: r.width, height: r.height });
  }, [anchorKey, puzzle]);

  // 누른 칸에서 시작할 빈칸 자리 — 잠긴 칸을 눌렀으면 그 뒤 첫 칸
  function startAt(i, k) {
    const keys = entryCellKeys(entries[i]);
    const pos = keys.indexOf(k);
    const ss = slotsFor(i);
    const at = ss.findIndex((x) => keys.indexOf(x) >= pos);
    return at >= 0 ? at : Math.max(ss.length - 1, 0);
  }

  function focusInput() {
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
  }

  // 조합 중 Enter를 compositionend에서 처리한 직후, 맥 크롬은 같은 Enter를
  // isComposing 없이 한 번 더 보냅니다 — 그것까지 받으면 두 낱말을 건너뜁니다.
  const lastAdvance = useRef(0);

  function goNext(dir = 1) {
    lastAdvance.current = Date.now();
    const ok = nextOk ?? canType;
    const i = nextOpenEntry(entries, sel, (j) => canType(j) && ok(j), dir)
      ?? nextOpenEntry(entries, sel, (j) => canType(j), dir);
    if (i != null && i !== sel) onSelect(i);
  }

  function commitAndMove(dir = 1) {
    flush();
    goNext(dir);
  }

  // 칸 누르기 — 그 칸을 지나는 낱말을 골라 그 칸부터 적습니다. 지금 낱말의
  // 지금 칸을 다시 누르면 가로 ↔ 세로를 바꿉니다.
  function onCellClick(k) {
    if (disabled) return;
    const through = entries.map((e, i) => i).filter((i) => entryCellKeys(entries[i]).includes(k));
    if (!through.length) return;
    const typables = through.filter((i) => canType(i));
    let next;
    if (through.includes(sel) && k === cursorKey && through.length > 1) {
      next = through[(through.indexOf(sel) + 1) % through.length];
    } else if (through.includes(sel)) {
      next = sel;
    } else {
      next = typables[0] ?? through[0];
    }
    const start = startAt(next, k);
    if (next === sel) {
      flush();
      setTyping({ sel, start, value: "" });
    } else {
      flush();
      pendingStart.current = { sel: next, start };
      onSelect(next);
    }
    focusInput();
  }

  function scheduleIdle() {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (composingRef.current) return;
      const t = typingRef.current;
      if (!t.value) return;
      const start = flush(t);
      setTyping({ sel: t.sel, start, value: "" });
    }, IDLE_SAVE_MS);
  }

  function setValue(v) {
    setTyping((t) => ({ ...t, sel, value: v }));
  }

  function afterCommit(v) {
    // 칸을 다 채웠으면 저장하고 다음 낱말로
    const remain = slots.length - cur.start;
    if ([...v].length >= remain && remain > 0) {
      const start = flush({ ...typingRef.current, sel, value: [...v].slice(0, remain).join("") });
      setTyping({ sel, start, value: "" });
      goNext(1);
      return true;
    }
    return false;
  }

  function onChange(e) {
    let v = e.target.value.replace(/\s+/g, "");
    const remain = slots.length - cur.start;
    if (!composingRef.current && [...v].length > remain) v = [...v].slice(0, remain).join("");
    setValue(v);
    if (!composingRef.current && !e.nativeEvent.isComposing) {
      if (afterCommit(v)) return;
    }
    scheduleIdle();
  }

  function onCompositionEnd(e) {
    composingRef.current = false;
    const v = e.target.value.replace(/\s+/g, "");
    setValue(v);
    if (afterCommit(v)) { advanceAfterCompose.current = false; return; }
    if (advanceAfterCompose.current) {
      advanceAfterCompose.current = false;
      const start = flush({ ...typingRef.current, sel, value: v });
      setTyping({ sel, start, value: "" });
      goNext(1);
      return;
    }
    scheduleIdle();
  }

  function onKeyDown(e) {
    const composing = e.nativeEvent.isComposing || composingRef.current;
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (composing) { advanceAfterCompose.current = true; return; }
      if (e.key === "Enter" && Date.now() - lastAdvance.current < 120) return;
      commitAndMove(e.shiftKey ? -1 : 1);
      return;
    }
    if (composing) return;
    const across = entries[sel]?.dir === "across";
    const back = across ? "ArrowLeft" : "ArrowUp";
    const fwd = across ? "ArrowRight" : "ArrowDown";
    if (e.key === "Backspace" && !cur.value) {
      e.preventDefault();
      const idx = cur.start > 0 ? cur.start - 1 : 0;
      const k = slots[idx];
      if (k && letters?.[k]) onWrite({}, [k]);
      setTyping({ sel, start: idx, value: "" });
      return;
    }
    if (e.key === back || e.key === fwd) {
      e.preventDefault();
      const start = flush();
      const idx = Math.max(0, Math.min(slots.length - 1, (cur.value ? start : cur.start) + (e.key === fwd ? 1 : -1)));
      setTyping({ sel, start: idx, value: "" });
    }
  }

  function onBlur() {
    if (composingRef.current) return;
    const t = typingRef.current;
    if (!t.value) return;
    const start = flush(t);
    setTyping({ sel: t.sel, start, value: "" });
  }

  return (
    <div className="xw-typing" ref={wrapRef}>
      <CrosswordGrid
        puzzle={puzzle}
        letters={shown}
        fixed={fixed}
        solvedKeys={solvedKeys}
        wrongKeys={wrongKeys}
        selKeys={selKeys}
        cursorKey={cursorKey}
        typingKeys={typingKeys}
        onCellClick={disabled ? null : onCellClick}
      />
      {typeable && inputPos && (
        <input
          ref={inputRef}
          className="xw-typing-input"
          style={inputPos}
          value={cur.value}
          onChange={onChange}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={onCompositionEnd}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={`${entries[sel]?.dir === "down" ? "세로" : "가로"} ${entries[sel]?.num}번 낱말 적기`}
        />
      )}
    </div>
  );
}

const EMPTY = new Set();
