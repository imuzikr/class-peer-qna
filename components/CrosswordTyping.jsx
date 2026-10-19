"use client";

// =============================================================
// 가로세로 — 판에 직접 적기 (모둠 판 · 개별 판 공용)
// -------------------------------------------------------------
// 칸을 누르고 그대로 치면 글자가 그 칸부터 낱말 방향으로 들어갑니다.
//
// [네모 칸(.cur)은 '방금 적은 글자'에 섭니다] 처음에는 '다음 글자가 들어갈
//   칸'에 섰는데, 한 글자 치면 네모가 곧바로 옆 빈칸으로 뛰어 지금 무엇을
//   적었는지 눈으로 좇기 어려웠습니다(선생님 지적). 지금은
//   - 칸을 누르면 그 칸,
//   - 치는 동안에는 지금 치는(조합 중인) 글자의 칸,
//   - Enter · 다 채움 · 1.2초 쉼으로 넣은 뒤에도 **마지막 글자의 칸**에 그대로.
//   다음 글자는 그 뒤 칸에 들어갑니다(글자 칸의 커서가 글자 뒤에 서는 것과 같음).
//
// [Enter는 '넣기'만 합니다 — 다른 낱말로 안 갑니다] 예전에는 Enter와 '칸을 다
//   채움'이 넣고 곧바로 다음 낱말로 건너가, 네모가 판의 엉뚱한 곳으로
//   사라졌습니다. 다른 낱말로는 칸 · 힌트를 누르거나 Tab(Shift+Tab)으로 갑니다.
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
//   들어간다'로 보였습니다). 조합 중의 Enter · Tab은 표시만 해 두고
//   compositionend에서 처리합니다.
//
// [언제 저장하나 — 낱말을 끝까지 채웠을 때만] 적은 글자는 먼저 이 기기의
//   **초안**(drafts — 낱말마다)에 담기고, 낱말의 칸이 판 글자와 합쳐 모두
//   찼을 때 그 낱말의 칸을 **통째로 한 번에** 올립니다(xwWordSave). 모둠원
//   둘이 같은 낱말을 동시에 적으면 나중에 다 채운 사람의 낱말이 칸 전체를
//   덮어, 칸마다 저장 시점이 엇갈려 글자가 섞이던 일이 없어집니다(선생님 제안).
//   - 초안에 담는 때: 낱말 칸을 다 채우면 · Enter/Tab · 다른 칸·낱말을 누르면 ·
//     입력이 1.2초 멈추면 · 입력칸을 벗어나면. 조합 중에는 담지 않습니다
//     (입력칸 값을 비우면 조합이 깨집니다).
//   - 쓰다 만 글자는 판에 안 올라가 모둠원에게 안 보입니다. 다른 낱말로 갔다
//     와도 이 화면 안에서는 초안이 남아 있고, 새로고침하면 사라집니다.
//   - 초안 칸은 '적는 중' 모양(typingKeys)으로 그려 아직 안 올린 글자임을 보입니다.
//
// [Backspace · Delete] Backspace는 네모 칸에 글자가 있으면 그것을, 비어 있으면
//   앞 칸을 지우고 네모도 그리로 물러납니다. Delete는 네모 칸의 글자만 지우고
//   네모는 제자리입니다(문서 편집기의 두 키와 같은 나눔 — 선생님 요청).
//   **지운 것도 초안**입니다(판에 바로 올리지 않음) — 지우고 다시 끝까지 적으면
//   그 낱말이 통째로 올라가 틀린 글자를 덮습니다.
//
// [아이패드 · 아이폰 — 초점은 누르는 그 순간에, 입력칸은 늘 둡니다] iOS
//   Safari는 사용자가 누른 그 처리기 안에서 곧바로 focus()를 부를 때만 자판을
//   올립니다. 예전에는 (ㄱ) setTimeout 뒤에 초점을 주고, (ㄴ) 낱말을 고르기
//   전에는 입력칸이 아예 없어 처음 누를 때 초점을 줄 대상이 없었고, (ㄷ) 힌트
//   목록은 효과(focusTick)로 초점을 줘 — 셋 다 누른 순간을 벗어나 **태블릿에서
//   눌러도 자판이 안 올라와 아무것도 안 적혔습니다.** 지금은 입력칸을 늘 그려
//   두고(고른 낱말이 없으면 판 왼쪽 위에서 쉼) 칸 누르기 · 판 누르기 · 힌트
//   누르기가 모두 **그 처리기 안에서 곧바로** 초점을 줍니다. 힌트 목록은 부르는
//   쪽이 focusRef로 받은 함수를 클릭 처리기 안에서 부릅니다. 데스크톱에서는
//   예전과 똑같이 움직입니다.
//
// [잠긴 칸] lockedKeys(열쇠 칸 · 이미 맞힌 낱말의 칸)는 건너뜁니다 — 교차하는
//   칸의 글자는 이미 맞으므로 고칠 까닭이 없고, 실수로 지우면 맞힌 낱말이
//   깨집니다.
// =============================================================
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { crosswordCells, entryCellKeys, entryForCell, nextOpenEntry, stepCell, xwWordSave } from "@/lib/crossword";
import CrosswordGrid from "./CrosswordGrid";

const IDLE_SAVE_MS = 1200;

// 화살표 → 한 칸 옮기는 방향과 그 방향의 낱말 축
const ARROWS = {
  ArrowLeft: [0, -1, "across"],
  ArrowRight: [0, 1, "across"],
  ArrowUp: [-1, 0, "down"],
  ArrowDown: [1, 0, "down"],
};

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
  nextOk = null,      // (i) => Tab으로 건너갈 만한 낱말인가(없으면 canType)
  onWrite,            // (set, del) => void — 칸 단위 쓰기
  disabled = false,
  focusRef = null,    // 부르는 쪽이 받는 '초점 주기' 함수 — 힌트 목록을 누르는
                      // 그 처리기 안에서 부릅니다(iOS는 그래야 자판을 올림)
}) {
  const entries = useMemo(() => puzzle?.entries ?? [], [puzzle]);
  const cells = useMemo(() => crosswordCells(puzzle), [puzzle]);
  const locked = lockedKeys ?? EMPTY;

  const slotsFor = useCallback(
    (i) => (i == null || !entries[i] ? [] : entryCellKeys(entries[i]).filter((k) => !locked.has(k))),
    [entries, locked]
  );

  // 적는 중 — 어느 낱말의 몇째 빈칸부터 무엇을 쳤나 + 네모 칸(mark — 아무것도
  // 안 치는 동안 네모가 설 칸). 낱말이 바뀌면 묵은 것을 그 낱말 자리로 저장하고
  // 새로 시작합니다(sel이 바뀐 뒤에도 옛 자리를 알도록 낱말 번호를 함께 듭니다).
  const [typing, setTyping] = useState({ sel: null, start: 0, value: "", mark: null });
  const typingRef = useRef(typing);
  typingRef.current = typing;
  const lettersRef = useRef(letters);
  lettersRef.current = letters;
  // 아직 안 올린 초안 — { [낱말 차례]: { 칸: 글자 | "" } } ("" = 지움)
  const [drafts, setDrafts] = useState({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const putDrafts = useCallback((next) => {
    draftsRef.current = next;
    setDrafts(next);
  }, []);
  // 그 낱말 기준으로 지금 칸에 보이는 글자(초안이 판 글자를 가림)
  const effective = useCallback((i, k) => {
    const d = draftsRef.current[i];
    if (d && Object.prototype.hasOwnProperty.call(d, k)) return d[k];
    return lettersRef.current?.[k] || "";
  }, []);
  const composingRef = useRef(false);
  const pendingKey = useRef(null); // 조합 중에 누른 Enter · Tab — compositionend에서
  const idleTimer = useRef(null);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const [inputPos, setInputPos] = useState(null);

  // 고른 낱말이 있으면 입력칸은 늘 둡니다 — 막 맞혀서 더 적을 수 없게 된 낱말
  // (모둠 판)에서도 네모와 초점이 남아 Tab으로 다음 낱말에 갈 수 있게.
  // 글자를 받는 것은 typeable일 때뿐입니다.
  const active = sel != null && !disabled;
  const typeable = active && canType(sel);
  const slots = useMemo(() => slotsFor(sel), [slotsFor, sel]);

  // 낱말 i의 초안을 d로 두고, 끝까지 찼으면 그 낱말을 통째로 올립니다
  const settle = useCallback((i, d) => {
    const ss = slotsFor(i);
    const plan = xwWordSave(ss, lettersRef.current, d);
    const next = { ...draftsRef.current };
    if (!plan) {
      next[i] = d;
      putDrafts(next);
      return;
    }
    delete next[i];
    const keys = Object.keys(plan);
    if (keys.length) {
      // 구독이 돌아오기 전에 '첫 빈칸'을 셀 때 방금 올린 칸을 빈칸으로 보지
      // 않게 미리 담아 둡니다
      lettersRef.current = { ...lettersRef.current, ...plan };
      onWrite(plan, []);
      // 엇갈리는 낱말의 초안에 같은 칸이 있으면 걷습니다 — 방금 올린 글자가 판의 값
      for (const j of Object.keys(next)) {
        if (!keys.some((k) => k in next[j])) continue;
        const rest = { ...next[j] };
        keys.forEach((k) => { delete rest[k]; });
        next[j] = rest;
      }
    }
    putDrafts(next);
  }, [slotsFor, onWrite, putDrafts]);

  // 적은 것을 초안으로(다 찼으면 올림) — 돌려주는 값: 다음에 쓸 빈칸 자리와
  // 네모가 설 칸(마지막 글자)
  const flush = useCallback((t = typingRef.current) => {
    clearTimeout(idleTimer.current);
    if (!t.value || t.sel == null) return { start: t.start, mark: t.mark };
    const ss = slotsFor(t.sel);
    const chars = [...t.value];
    const d = { ...(draftsRef.current[t.sel] || {}) };
    chars.forEach((ch, i) => {
      const k = ss[t.start + i];
      if (k) d[k] = ch;
    });
    settle(t.sel, d);
    const end = Math.min(t.start + chars.length, ss.length);
    return { start: end, mark: ss[Math.max(0, end - 1)] ?? t.mark };
  }, [slotsFor, settle]);

  // 칸 하나를 초안에서 지웁니다(판에는 안 올림)
  const eraseKey = useCallback((i, k) => {
    if (!effective(i, k)) return;
    putDrafts({ ...draftsRef.current, [i]: { ...(draftsRef.current[i] || {}), [k]: "" } });
  }, [effective, putDrafts]);

  // 넣고 그 자리에 머뭅니다(다음 낱말로 안 갑니다)
  const commitNow = useCallback((t = typingRef.current) => {
    const r = flush(t);
    setTyping({ sel: t.sel, start: r.start, value: "", mark: r.mark });
  }, [flush]);

  // 첫 빈칸 — 낱말을 고르면 거기서 시작합니다
  const firstEmpty = useCallback((i) => {
    const ss = slotsFor(i);
    const at = ss.findIndex((k) => !effective(i, k));
    return at >= 0 ? at : 0;
  }, [slotsFor, effective]);

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
    const mark = p && p.sel === sel && p.mark ? p.mark : sel == null ? null : slotsFor(sel)[start] ?? null;
    setTyping({ sel, start, value: "", mark });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  // 힌트 목록에서 낱말을 고르면 곧바로 적을 수 있게 — 부르는 쪽이 클릭 처리기
  // 안에서 이 함수를 부릅니다. 화면을 열 때는 부르지 않습니다 — 휴대폰에서
  // 열자마자 자판이 올라오면 판이 가려집니다.
  if (focusRef) focusRef.current = focusInput;

  // 화면을 떠날 때 남은 글자 — 마운트 한 번만(렌더마다 걸면 정리가 돌 때마다
  // 쓰기가 나갑니다)
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => { flushRef.current(); }, []);

  const cur = typing.sel === sel ? typing : { sel, start: 0, value: "", mark: null };
  const chars = [...cur.value];
  const overlay = {};
  const typingKeys = new Set();
  // 고른 낱말의 초안 — 잠긴 칸(막 맞힌 칸)은 판 글자가 이깁니다
  const curDraft = sel != null ? drafts[sel] : null;
  if (curDraft) {
    for (const k of slots) {
      if (!Object.prototype.hasOwnProperty.call(curDraft, k)) continue;
      overlay[k] = curDraft[k];
      typingKeys.add(k);
    }
  }
  chars.forEach((ch, i) => {
    const k = slots[cur.start + i];
    if (k) { overlay[k] = ch; typingKeys.add(k); }
  });
  const shown = { ...letters, ...overlay };
  const last = Math.max(slots.length - 1, 0);
  const entryKeys = useMemo(
    () => (sel != null && entries[sel] ? entryCellKeys(entries[sel]) : []),
    [entries, sel]
  );
  const selKeys = useMemo(() => new Set(entryKeys), [entryKeys]);
  // 네모 — 치는 중이면 지금 치는 글자, 아니면 mark(누른 칸 · 넣은 마지막 글자).
  // 막 맞혀 칸이 잠겼어도(slots가 빔) mark가 그 낱말 안이면 그 자리에 둡니다.
  const boxKey = chars.length && slots.length
    ? slots[Math.min(cur.start + chars.length - 1, last)]
    : cur.mark && entryKeys.includes(cur.mark)
      ? cur.mark
      : slots.length ? slots[Math.min(cur.start, last)] : entryKeys[entryKeys.length - 1] ?? null;
  const cursorKey = active ? boxKey : null;

  // 숨은 입력칸을 지금 적는 낱말의 시작 칸 위에
  const anchorKey = !active ? null : slots.length ? slots[Math.min(cur.start, last)] : boxKey;
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !anchorKey) { setInputPos(null); return; } // 쉬는 자리(아래 REST_POS)
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

  // 곧바로(누른 처리기 안에서) — setTimeout으로 미루면 iOS가 자판을 안 올립니다
  function focusInput() {
    const el = inputRef.current;
    if (el && document.activeElement !== el) el.focus({ preventScroll: true });
  }

  function goNext(dir = 1) {
    const ok = nextOk ?? canType;
    const i = nextOpenEntry(entries, sel, (j) => canType(j) && ok(j), dir)
      ?? nextOpenEntry(entries, sel, (j) => canType(j), dir);
    if (i != null && i !== sel) onSelect(i);
  }

  // 칸 누르기 — 그 칸을 지나는 낱말을 골라 그 칸부터 적습니다. 지금 낱말의
  // 네모 칸을 다시 누르면 가로 ↔ 세로를 바꿉니다.
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
    flush();
    if (next === sel) {
      setTyping({ sel, start, value: "", mark: slots[start] ?? null });
    } else {
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
      if (t.value) commitNow(t);
    }, IDLE_SAVE_MS);
  }

  function setValue(v) {
    setTyping((t) => ({ ...t, sel, value: v }));
  }

  // 칸을 다 채웠으면 넣습니다 — 네모는 마지막 글자에 그대로(다음 낱말로 안 감)
  function fillCommit(v) {
    const remain = slots.length - cur.start;
    if (remain > 0 && [...v].length >= remain) {
      commitNow({ ...typingRef.current, sel, value: [...v].slice(0, remain).join("") });
      return true;
    }
    return false;
  }

  // 가운데 칸부터 적었는데 나머지 칸이 이미 차 있으면 — 낱말이 다 찼으니 올립니다
  function doneCommit(v) {
    const d = { ...(draftsRef.current[sel] || {}) };
    [...v].forEach((ch, i) => { const k = slots[cur.start + i]; if (k) d[k] = ch; });
    if (!xwWordSave(slots, lettersRef.current, d)) return false;
    commitNow({ ...typingRef.current, sel, value: v });
    return true;
  }

  function onChange(e) {
    if (!typeable) return; // 맞힌 낱말 · 우리 모둠 낱말 — 받지 않음(값은 ""로 돌아감)
    let v = e.target.value.replace(/\s+/g, "");
    const remain = Math.max(slots.length - cur.start, 0);
    if (!composingRef.current && [...v].length > remain) v = [...v].slice(0, remain).join("");
    setValue(v);
    if (!composingRef.current && !e.nativeEvent.isComposing && (fillCommit(v) || doneCommit(v))) return;
    scheduleIdle();
  }

  function onCompositionEnd(e) {
    composingRef.current = false;
    if (!typeable) { pendingKey.current = null; return; }
    const v = e.target.value.replace(/\s+/g, "");
    const pend = pendingKey.current;
    pendingKey.current = null;
    setValue(v);
    const filled = fillCommit(v) || doneCommit(v);
    if (pend) {
      if (!filled) commitNow({ ...typingRef.current, sel, value: v });
      if (pend !== "Enter") goNext(pend === "ShiftTab" ? -1 : 1);
      return;
    }
    if (!filled) scheduleIdle();
  }

  function onKeyDown(e) {
    const composing = e.nativeEvent.isComposing || composingRef.current;
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const what = e.key === "Enter" ? "Enter" : e.shiftKey ? "ShiftTab" : "Tab";
      if (composing) { pendingKey.current = what; return; }
      commitNow();
      if (what !== "Enter") goNext(what === "ShiftTab" ? -1 : 1);
      return;
    }
    if (composing) return;
    if (!active) return;
    // 화살표 — 네모 칸에서 그 방향의 **판에 있는 다음 칸**으로(빈자리는 건너뜀).
    // 방향이 낱말과 달라도 됩니다 — 가로 낱말에서 ↓를 누르면 아래 칸의 세로 낱말로.
    // 맞힌 낱말 · 우리 모둠 낱말에 서 있어도 옮겨 갈 수 있어야 하므로 typeable보다
    // 먼저 봅니다(예전에는 낱말 방향의 두 키만, 낱말 안에서만, 적을 수 있는
    // 낱말에서만 들어 '안 먹을 때'가 잦았습니다).
    const arrow = ARROWS[e.key];
    if (arrow) {
      e.preventDefault();
      const r = flush();
      const from = (cur.value ? r.mark : boxKey) ?? entryKeys[0];
      const [dr, dc, axis] = arrow;
      const to = stepCell(cells, puzzle, from, dr, dc);
      if (!to) {
        // 그 쪽에 칸이 없으면 제자리 — 적던 글자만 넣어 둡니다
        setTyping({ sel, start: r.start, value: "", mark: from });
        return;
      }
      moveTo(to, axis);
      return;
    }
    if (!typeable) return;
    // Delete — 네모 칸의 글자를 지우고 네모는 제자리(Backspace는 앞으로 물러남).
    // 적던 글자가 있으면 먼저 넣고, 그 마지막 글자(=네모 칸)를 지웁니다. 다음
    // 글자는 그 칸에 들어갑니다. 열쇠 칸 · 맞힌 칸은 못 지웁니다.
    if (e.key === "Delete") {
      e.preventDefault();
      const r = flush();
      const k = cur.value ? r.mark : boxKey;
      const at = slots.indexOf(k);
      if (at < 0) {
        setTyping({ sel, start: r.start, value: "", mark: k ?? null });
        return;
      }
      eraseKey(sel, k);
      setTyping({ sel, start: at, value: "", mark: k });
      return;
    }
    // Backspace — 네모 칸에 글자가 있으면 그것을, 비어 있으면 앞 칸을 지웁니다
    if (e.key === "Backspace" && !cur.value) {
      e.preventDefault();
      const at = Math.max(slots.indexOf(boxKey), 0);
      const idx = effective(sel, slots[at]) ? at : Math.max(at - 1, 0);
      const k = slots[idx];
      if (k) eraseKey(sel, k);
      setTyping({ sel, start: idx, value: "", mark: k ?? null });
    }
  }

  // 칸 하나로 옮겨 갑니다 — 그 칸을 지나는 낱말(화살표 방향 우선)을 고르고,
  // 네모는 그 칸에, 다음 글자도 그 칸부터(잠긴 칸이면 그 뒤 첫 빈칸부터).
  function moveTo(k, axis) {
    const next = entryForCell(entries, cells.get(k), axis, sel);
    if (next == null) return;
    const start = startAt(next, k);
    if (next === sel) {
      setTyping({ sel, start, value: "", mark: k });
    } else {
      pendingStart.current = { sel: next, start, mark: k };
      onSelect(next);
    }
  }

  // 판 어디를 눌러도(빈자리 · 칸 사이 틈 포함) 초점이 숨은 입력칸에 남습니다.
  // 빈자리는 버튼이 아니라 그냥 span이라, 누르면 브라우저가 초점을 body로
  // 옮겨 그 뒤의 화살표가 **화면을 굴렸습니다**(네모가 아니라). 칸 버튼은
  // 제 onMouseDown에서 이미 막고 onClick에서 초점을 줍니다.
  function onWrapMouseDown(e) {
    if (!active || e.button !== 0) return;
    if (e.target.closest?.("button[data-k]")) return;
    e.preventDefault();
    focusInput();
  }

  function onBlur() {
    if (composingRef.current) return;
    if (typingRef.current.value) commitNow();
  }

  return (
    <div className="xw-typing" ref={wrapRef} onMouseDown={onWrapMouseDown}>
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
      {!disabled && (
        <input
          ref={inputRef}
          className="xw-typing-input"
          style={active && inputPos ? inputPos : REST_POS}
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
          aria-label={active && entries[sel]
            ? `${entries[sel].dir === "down" ? "세로" : "가로"} ${entries[sel].num}번 낱말 적기`
            : "칸을 눌러 낱말 고르기"}
        />
      )}
    </div>
  );
}

const EMPTY = new Set();
// 고른 낱말이 없을 때 입력칸이 쉬는 자리 — 판 왼쪽 위의 작은 칸(보이지 않음)
const REST_POS = { left: 0, top: 0, width: 1, height: 1 };
