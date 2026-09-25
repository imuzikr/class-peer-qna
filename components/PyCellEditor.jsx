"use client";

// =============================================================
// 파이썬 연계 활동의 셀 편집기 — 글 셀 · 코드 셀 (코랩과 같은 생각)
// -------------------------------------------------------------
// 수업 노트 서랍의 활동 칸(LessonTaskPanel)이 **파이썬 실행기와 연계한
// 프로젝트**(`board.pyLinked`)일 때 서식 에디터 한 칸 대신 이것을 씁니다.
// 학생이 셀의 종류를 **직접 고릅니다** — '＋ 글'은 설명을 쓰는 서식 칸,
// '＋ 코드'는 코드를 짜고 ▶로 돌리는 칸입니다.
//
// [왜 셀인가] 예전에는 글과 코드 블록이 한 에디터 안에 섞여 있어, ▶ 실행이
// 돌릴 블록을 추측했고(커서가 든 블록 · 마지막 블록 · 결과 블록 건너뛰기)
// '결과 붙이기'는 결과를 **덧붙이기만** 해서 같은 결과가 두 번 붙곤 했습니다.
// 코드 셀은 코드와 **그 코드가 낸 결과**를 한 덩이로 들고 있어 그 추측이
// 없어집니다(자료 모양은 lib/pyCells.js).
//
// [셀마다 따로 돕니다] ▶는 **그 셀의 코드만** 새 이름 공간에서 돌립니다
// (lib/pyRun.js의 '실행은 늘 새 공간에서'). 앞 셀에서 만든 변수는 다음 셀에
// 없습니다 — 코랩과 다른 점이고, 선생님이 고른 것입니다. 셀 하나가 그것만으로
// 도는 코드라 붙은 결과가 늘 그 코드의 것입니다.
//
// [결과는 저절로 붙고, 코드를 고치면 걷힙니다]
//   · 실행이 끝나면 출력이 그 셀의 결과가 되어 **곧바로 저장**됩니다 —
//     '결과 붙이기' 단추가 없습니다(두 번 붙을 일도 없습니다).
//   · 코드를 한 글자라도 고치면 결과를 걷습니다 — 바뀐 코드에 지난 결과가
//     남으면 두 달 뒤 복습할 때 짝이 안 맞습니다.
//   · 돌리는 사이에 코드를 고쳤으면 끝나도 결과를 안 붙입니다(같은 까닭).
//
// [저장] 셀 목록을 HTML로 적어(serializeCells) `onChange(html)`로 올립니다 —
// 저장 경로는 활동 칸 그대로입니다(카드의 그 활동 자리). **적은 모양이
// 달라질 때만** 올립니다: 빈 셀을 더하거나 옛 카드를 열기만 한 것으로는 쓰기가
// 안 나갑니다(열었다고 옛 카드가 새 모양으로 바뀌어 저장되면 안 됩니다 —
// 옛 카드는 고칠 때 비로소 새 모양이 됩니다). 결과가 붙을 때만
// `{ flush: true }`로 곧바로 저장을 부탁합니다.
//
// [입력값] 코드에 `input(`이 보이면 그 셀 아래에 입력값 칸이 섭니다. 값은
// 셀마다 따로이고 **저장하지 않습니다**(돌릴 때만 씁니다) — 대신 input()이
// 찍은 값이 결과에 그대로 남아 '무엇을 넣어 나온 결과인지'가 보입니다.
// =============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { acceptCompletion } from "@codemirror/autocomplete";
import { Prec } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import RichTextEditor from "./RichTextEditor";
import PyLineText from "./PyLineText";
import { parseCells, serializeCells, dedent, codeUsesInput } from "@/lib/pyCells";
import { sanitizeHtml } from "@/lib/html";
import { runPython, stopPython } from "@/lib/pyRun";
import { outputTextOf } from "@/lib/pyShare";

// 글 셀의 서식 — 활동 칸의 것에서 **코드 블록만 뺍니다**. 코드는 코드 셀에
// 쓰는 것이라, 글 셀에 코드 블록이 있으면 무엇으로 코드를 쓰는지가 다시
// 둘이 됩니다(' ``` ' 단축키도 이 목록을 따라 함께 꺼집니다).
const TEXT_TOOLS = ["bold", "underline", "insertUnorderedList", "insertOrderedList"];

// 지운 셀을 되돌릴 수 있는 시간
const UNDO_MS = 6000;

let seq = 0;
const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

function initCells(html) {
  return parseCells(html).map((c) =>
    c.type === "code"
      ? { id: newId(), type: "code", code: c.code, output: c.output ?? null }
      : { id: newId(), type: "text", html: sanitizeHtml(c.html) }
  );
}

const isEmptyCell = (c) =>
  c.type === "code" ? !String(c.code ?? "").trim() : !serializeCells([c]);

export default function PyCellEditor({ initialHtml = "", onChange, codeAtEnd = 0 }) {
  // 셀 목록 — 처음에는 저장된 글을 풀어서. 빈 칸이면 글 셀 하나로 시작합니다
  // (빈 셀은 저장되지 않으므로 아무것도 안 쓰면 아무 일도 없습니다).
  const [cells, setCells] = useState(() => {
    const got = initCells(initialHtml);
    return got.length ? got : [{ id: newId(), type: "text", html: "" }];
  });
  const cellsRef = useRef(cells);
  // 마지막으로 올린(또는 처음 받은) 모양 — 이것과 같으면 올리지 않습니다.
  const lastHtmlRef = useRef(serializeCells(cells));
  const aliveRef = useRef(true);
  // 켜는 것도 효과 안에서 — 개발 모드(StrictMode)는 마운트 직후 정리를 한 번
  // 돌려 보므로, 끄기만 두면 처음부터 '사라진 셀 편집기'가 되어 아무것도 안 올립니다.
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const [activeId, setActiveId] = useState(null); // 지금 고른 셀(테두리)
  const [focus, setFocus] = useState(null); // { id, n } — 초점을 줄 코드 셀
  const [undo, setUndo] = useState(null); // { cell, index }
  const undoTimer = useRef(null);
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  // ── 실행 상태 ── (셀 id마다)
  const [runningId, setRunningId] = useState(null);
  const [live, setLive] = useState({}); // id → 이번에 돌린 줄들(안내 줄 포함)
  const liveRef = useRef({});
  const ranCodeRef = useRef({}); // id → 돌릴 때의 코드
  const [stdins, setStdins] = useState({});

  // 셀 목록을 바꾸고, 적은 모양이 달라졌으면 올립니다.
  const commit = useCallback(
    (next, opts) => {
      cellsRef.current = next;
      setCells(next);
      const html = serializeCells(next);
      if (html === lastHtmlRef.current || !aliveRef.current) return;
      lastHtmlRef.current = html;
      onChange?.(html, opts);
    },
    [onChange]
  );

  const patch = useCallback(
    (id, fields, opts) => {
      const next = cellsRef.current.map((c) => (c.id === id ? { ...c, ...fields } : c));
      commit(next, opts);
    },
    [commit]
  );

  function setLiveLines(id, lines) {
    liveRef.current = { ...liveRef.current, [id]: lines };
    setLive(liveRef.current);
  }
  function addLine(id, type, text, parts) {
    setLiveLines(id, [...(liveRef.current[id] ?? []), { type, text, parts }]);
  }

  // ── 셀 더하기 · 옮기기 · 지우기 ──
  // 더하는 자리는 **고른 셀 바로 아래**, 고른 것이 없으면 맨 끝(코랩과 같음).
  function addCell(type) {
    const cell =
      type === "code"
        ? { id: newId(), type: "code", code: "", output: null }
        : { id: newId(), type: "text", html: "" };
    const list = cellsRef.current;
    const at = list.findIndex((c) => c.id === activeId);
    const next = at < 0 ? [...list, cell] : [...list.slice(0, at + 1), cell, ...list.slice(at + 1)];
    commit(next);
    setActiveId(cell.id);
    setFocus({ id: cell.id, n: Date.now() });
  }

  function moveCell(id, dir) {
    const list = [...cellsRef.current];
    const i = list.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    commit(list);
  }

  function removeCell(id) {
    const list = cellsRef.current;
    const index = list.findIndex((c) => c.id === id);
    if (index < 0) return;
    const cell = list[index];
    if (runningId === id) { stopPython(); setRunningId(null); }
    const next = list.filter((c) => c.id !== id);
    // 마지막 셀까지 지우면 빈 글 셀 하나를 남깁니다 — 아무것도 없으면 어디에
    // 쓰는지 알 수 없습니다.
    commit(next.length ? next : [{ id: newId(), type: "text", html: "" }]);
    if (activeId === id) setActiveId(null);
    // 빈 셀은 되돌릴 것이 없습니다. 글이 든 셀만 잠깐 '되돌리기'를 띄웁니다 —
    // 되묻는 창보다 빠르고, 잘못 눌렀을 때 살릴 길이 있습니다.
    clearTimeout(undoTimer.current);
    if (isEmptyCell(cell)) { setUndo(null); return; }
    setUndo({ cell, index });
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  }

  function undoRemove() {
    if (!undo) return;
    const list = cellsRef.current.filter((c) => !(isEmptyCell(c) && cellsRef.current.length === 1));
    const at = Math.min(undo.index, list.length);
    commit([...list.slice(0, at), undo.cell, ...list.slice(at)]);
    clearTimeout(undoTimer.current);
    setUndo(null);
  }

  // ── 카드의 '파이썬 실행기' 단추 → 맨 끝 빈 코드 셀에 커서 ──
  // 맨 끝이 이미 빈 코드 셀이면 새로 안 만듭니다(누를 때마다 늘면 안 됩니다).
  // **마운트 때 받은 번호는 건너뜁니다** — 밖에서 칸이 바뀌어 다시 마운트될
  // 때 같은 번호로 또 돌면 빈 셀이 또 생깁니다(RichTextEditor의 codeAtEnd와 같음).
  const codeSeenRef = useRef(codeAtEnd);
  useEffect(() => {
    if (!codeAtEnd || codeAtEnd === codeSeenRef.current) return;
    codeSeenRef.current = codeAtEnd;
    const list = cellsRef.current;
    const last = list[list.length - 1];
    let target = last;
    if (!(last?.type === "code" && !last.code.trim())) {
      // 빈 글 셀 하나뿐이면 그것을 코드 셀로 바꿔 씁니다(빈 글 셀 + 빈 코드 셀이
      // 나란히 서면 첫 칸이 쓸모없이 남습니다).
      const lone = list.length === 1 && list[0].type === "text" && isEmptyCell(list[0]);
      target = { id: newId(), type: "code", code: "", output: null };
      commit(lone ? [target] : [...list, target]);
    }
    setActiveId(target.id);
    setFocus({ id: target.id, n: Date.now() });
  }, [codeAtEnd, commit]);

  // ── 실행 ──
  function finish(id, { keepPartial = true } = {}) {
    setRunningId(null);
    if (!aliveRef.current) return;
    const lines = liveRef.current[id] ?? [];
    const out = keepPartial ? outputTextOf(lines) : "";
    const cell = cellsRef.current.find((c) => c.id === id);
    // 돌리는 사이에 코드를 고쳤으면 붙이지 않습니다 — 그 결과는 지금 코드의 것이
    // 아닙니다.
    if (!cell || cell.code !== ranCodeRef.current[id]) {
      addLine(id, "info", "코드가 바뀌어 이 결과는 남기지 않았어요 — 다시 실행해 주세요.");
      return;
    }
    if (!out) addLine(id, "info", "✓ 출력 없이 끝났어요.");
    patch(id, { output: out || null }, { flush: true });
  }

  function run(id) {
    const cell = cellsRef.current.find((c) => c.id === id);
    if (!cell || cell.type !== "code") return;
    if (runningId) return;
    const code = dedent(cell.code).replace(/\s+$/, "");
    if (!code.trim()) {
      setLiveLines(id, [{ type: "info", text: "돌릴 코드가 없어요 — 먼저 코드를 적어 주세요." }]);
      return;
    }
    setLiveLines(id, []);
    ranCodeRef.current[id] = cell.code;
    const how = runPython({
      code,
      stdin: stdins[id] ?? "",
      onLine: (type, text, parts) => addLine(id, type, text, parts),
      onDone: (result) => {
        if (result) addLine(id, "result", result);
        finish(id);
      },
      onError: (err) => { addLine(id, "err", err); finish(id); },
      onTimeout: (ms) => {
        addLine(id, "err", `⏱ ${ms / 1000}초를 넘겨 멈췄어요. (무한 루프인지 확인해 보세요)`);
        finish(id);
      },
    });
    if (how === "busy") {
      setLiveLines(id, [{ type: "info", text: "다른 곳에서 파이썬이 돌고 있어요 — 끝나면 다시 눌러 주세요." }]);
      return;
    }
    if (how === "fresh") addLine(id, "info", "파이썬을 불러오는 중이에요… (처음 한 번만, 조금 걸려요)");
    setRunningId(id);
  }

  function stop(id) {
    stopPython();
    addLine(id, "info", "⏹ 멈췄어요.");
    finish(id);
  }

  // 코드를 고치면 결과를 걷습니다(머리 주석).
  function onCode(id, code) {
    const cell = cellsRef.current.find((c) => c.id === id);
    if (!cell || cell.code === code) return;
    if (liveRef.current[id]?.length && runningId !== id) setLiveLines(id, []);
    patch(id, { code, output: null });
  }

  return (
    <div className="pycells">
      {cells.map((c, n) => (
        <div
          key={c.id}
          className={`pycell pycell--${c.type}${activeId === c.id ? " active" : ""}`}
          onFocusCapture={() => setActiveId(c.id)}
          onMouseDown={() => setActiveId(c.id)}
        >
          <div className="pycell-head">
            <span className="pycell-kind">{c.type === "code" ? "코드" : "글"}</span>
            {c.type === "code" && (
              <>
                <button
                  type="button"
                  className="ltask-run-btn pycell-run"
                  onClick={() => run(c.id)}
                  disabled={!!runningId}
                  title="이 셀의 코드만 돌립니다 — Ctrl+Enter (Mac: Cmd+Enter)"
                >
                  {runningId === c.id ? "실행 중…" : "▶ 실행"}
                </button>
                {runningId === c.id && (
                  <button type="button" className="ltask-run-stop pycell-run" onClick={() => stop(c.id)}>
                    ⏹ 중단
                  </button>
                )}
              </>
            )}
            <span className="pycell-tools">
              <button
                type="button"
                className="pycell-tool"
                onClick={() => moveCell(c.id, -1)}
                disabled={n === 0}
                aria-label="위로 옮기기"
                title="위로 옮기기"
              >
                ↑
              </button>
              <button
                type="button"
                className="pycell-tool"
                onClick={() => moveCell(c.id, 1)}
                disabled={n === cells.length - 1}
                aria-label="아래로 옮기기"
                title="아래로 옮기기"
              >
                ↓
              </button>
              <button
                type="button"
                className="pycell-tool pycell-tool--del"
                onClick={() => removeCell(c.id)}
                aria-label="셀 지우기"
                title="셀 지우기"
              >
                ✕
              </button>
            </span>
          </div>

          {c.type === "code" ? (
            <>
              <CodeCell
                code={c.code}
                onCode={(v) => onCode(c.id, v)}
                onRun={() => run(c.id)}
                focusN={focus?.id === c.id ? focus.n : 0}
              />
              {codeUsesInput(c.code) && (
                <label className="ltask-stdin">
                  <span>입력값 <em>한 줄에 하나씩 — 실행 전에 미리</em></span>
                  <textarea
                    rows={2}
                    value={stdins[c.id] ?? ""}
                    onChange={(e) => setStdins((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    placeholder={"홍길동\n7"}
                  />
                </label>
              )}
              <CellOutput lines={live[c.id]} output={c.output} />
            </>
          ) : (
            <RichTextEditor
              className="pycell-text"
              tools={TEXT_TOOLS}
              initialHtml={c.html}
              // 마운트 때 한 번 처음 글로 불리는데, 같은 값이라 commit이 걸러 냅니다.
              onChange={(html) => {
                const cur = cellsRef.current.find((x) => x.id === c.id);
                if (cur && cur.html !== html) patch(c.id, { html });
              }}
              placeholder="설명을 써 주세요."
              // '＋ 글'로 막 넣은 셀에 곧바로 커서를 둡니다(새 셀이라 마운트 때 한 번이면 됩니다)
              autoFocus={focus?.id === c.id}
            />
          )}
        </div>
      ))}

      {undo && (
        <div className="pycell-undo" role="status">
          셀을 지웠어요.
          <button type="button" onClick={undoRemove}>되돌리기</button>
        </div>
      )}

      <div className="pycell-add">
        <button type="button" onClick={() => addCell("text")} title="고른 셀 아래에 글 셀을 넣어요">
          ＋ 글
        </button>
        <button type="button" onClick={() => addCell("code")} title="고른 셀 아래에 코드 셀을 넣어요">
          ＋ 코드
        </button>
      </div>
    </div>
  );
}

// 코드 셀 — CodeMirror(실행기와 같은 설정: 문법 강조 · 자동 완성 · 들여쓰기).
// 비제어입니다: 처음 코드로 한 번 만들고, 고친 것은 onCode로 올리기만 합니다.
function CodeCell({ code, onCode, onRun, focusN }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onCodeRef = useRef(onCode);
  const onRunRef = useRef(onRun);
  onCodeRef.current = onCode;
  onRunRef.current = onRun;

  useEffect(() => {
    if (!hostRef.current) return undefined;
    const view = new EditorView({
      doc: code,
      parent: hostRef.current,
      extensions: [
        Prec.highest(
          keymap.of([
            { key: "Ctrl-Enter", mac: "Cmd-Enter", run: () => { onRunRef.current(); return true; } },
            { key: "Tab", run: acceptCompletion },
          ])
        ),
        basicSetup,
        keymap.of([indentWithTab]),
        python(),
        cmPlaceholder("코드를 적고 Ctrl+Enter로 실행해 보세요"),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onCodeRef.current(u.state.doc.toString());
        }),
      ],
    });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
    // 처음 한 번만 — 비제어(머리 주석)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!focusN || !viewRef.current) return;
    viewRef.current.focus();
    viewRef.current.dom.scrollIntoView({ block: "nearest" });
  }, [focusN]);

  return <div className="pycell-code" ref={hostRef} />;
}

// 결과 — 방금 돌린 것이 있으면 그 줄들(입력한 값은 옅게), 없으면 저장된 결과.
function CellOutput({ lines, output }) {
  if (lines?.length) {
    return (
      <div className="ltask-out pycell-out" aria-live="polite">
        {lines.map((l, n) => (
          <span key={n} className={`ltask-out-line ltask-out-line--${l.type}`}>
            <PyLineText line={l} />
          </span>
        ))}
      </div>
    );
  }
  if (!output) return null;
  return <div className="ltask-out pycell-out">{output}</div>;
}
