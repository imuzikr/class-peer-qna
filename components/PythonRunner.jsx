"use client";

// =============================================================
// 파이썬 코드 실행 패널 (Pyodide + CodeMirror)
// -------------------------------------------------------------
// - 코드 에디터: CodeMirror — 줄 번호, 문법 강조, 괄호 자동 닫기,
//   자동 완성(Tab 또는 Enter로 채택), 파이썬 자동 들여쓰기
// - 실행 단축키: Ctrl+Enter (Mac: Cmd+Enter)
// - 패널 왼쪽 가장자리를 드래그하면 너비 조절, ⛶ 버튼으로 전체 화면
//   (전체 화면에서는 에디터 | 입력·출력이 좌우로 나뉩니다)
// - 실행 엔진: Pyodide(WebAssembly)를 Web Worker에서 실행, 15초 제한
// =============================================================
import { useEffect, useRef, useState } from "react";
import { IconPythonRunner, IconKeyboard, IconAnswer } from "@/components/StatusIcons";
import { EditorView, basicSetup } from "codemirror";
import { keymap, placeholder } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { acceptCompletion } from "@codemirror/autocomplete";
import { Prec } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import PyProjectPanel from "./PyProjectPanel";

const PYODIDE_VERSION = "0.26.4";
const TIMEOUT_MS = 15000;
const MIN_WIDTH = 340;

// Web Worker 안에서 실행될 코드 (문자열로 만들어 Blob으로 생성)
const WORKER_SOURCE = `
importScripts("https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js");
const pyodideReady = loadPyodide({
  indexURL: "https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/",
});
pyodideReady.then(() => self.postMessage({ type: "ready" }));

// input()을 '미리 받아 둔 입력값을 한 줄씩 돌려주는 함수'로 교체
const INPUT_SHIM = [
  "import builtins",
  "def _make_input(text):",
  "    lines = iter(text.splitlines())",
  "    def _input(prompt=''):",
  "        if prompt:",
  "            print(prompt, end='')",
  "        try:",
  "            v = next(lines)",
  "        except StopIteration:",
  "            raise EOFError('input() 호출 횟수보다 입력값이 부족합니다. 입력값 칸을 확인하세요.')",
  "        print(v)",
  "        return v",
  "    return _input",
  "builtins.input = _make_input(___stdin_text)",
].join("\\n");

self.onmessage = async (e) => {
  try {
    const pyodide = await pyodideReady;
    pyodide.setStdout({ batched: (s) => self.postMessage({ type: "stdout", text: s }) });
    pyodide.setStderr({ batched: (s) => self.postMessage({ type: "stderr", text: s }) });
    pyodide.globals.set("___stdin_text", e.data.stdin || "");
    await pyodide.runPythonAsync(INPUT_SHIM);
    const result = await pyodide.runPythonAsync(e.data.code);
    self.postMessage({
      type: "done",
      result: result !== undefined && result !== null ? String(result) : "",
    });
  } catch (err) {
    self.postMessage({ type: "error", error: String(err) });
  }
};
`;

// 빈 칸에 옅게 뜨는 **예시**입니다 — 실제 내용이 아니라 안내라, 학생이
// 한 글자만 쳐도 저절로 사라집니다. 예전에는 이것이 진짜 코드로 채워져
// 있어서, 자기 코드를 적으면 예시 줄이 아래에 남아 뒤섞였습니다(지우려면
// 여섯 줄을 손으로 지워야 했습니다).
const SAMPLE_CODE = `# 파이썬 코드를 입력하고 Ctrl+Enter로 실행해 보세요!
name = input("이름을 입력하세요: ")
print(f"안녕하세요, {name}님!")

for i in range(1, 6):
    print(f"{i}단계: {'★' * i}")`;

// CodeMirror의 placeholder는 문자열을 한 줄로 붙여 버리므로(줄바꿈이 공백이
// 됩니다) 줄마다 <div>로 쌓은 조각을 넘깁니다.
function samplePlaceholder() {
  const wrap = document.createElement("div");
  wrap.className = "py-sample";
  SAMPLE_CODE.split("\n").forEach((line) => {
    const row = document.createElement("div");
    // 빈 줄도 높이를 지키도록
    row.textContent = line || "\u00a0";
    wrap.appendChild(row);
  });
  return wrap;
}

// 2단 서랍입니다.
//  1단 — 실행기만(지금까지의 모습).
//  2단 — '프로젝트 연계'를 누르면 폭이 화면 가득으로 벌어지며 오른쪽에
//        프로젝트 패널이 한 칸 더 열립니다. 짠 코드를 프로젝트의 활동 칸으로
//        곧바로 보낼 수 있고, 교사는 거기서 보낼 곳을 정하거나 프로젝트·활동을
//        새로 만듭니다.
// 2단은 예전 '전체 화면'이 하던 일(에디터 ｜ 입출력 좌우 배치)을 그대로
// 하면서 칸이 하나 더 붙은 것이라, 넓게 쓰던 자리를 잃지 않습니다.
export default function PythonRunner({
  open,
  onClose,
  onAskQuestion,
  hasModalOpen = false,
  // 2단(프로젝트 연계)에 필요한 것들 — 페이지가 **이미 구독해 둔 값**을
  // 그대로 내려 줍니다(이 패널 때문에 새로 읽는 문서가 없습니다).
  classId = null,
  className = "",
  boards = null, // null이면 2단 자체를 안 답니다(연계할 자리가 없는 화면)
  pyTarget = null,
  user = null,
  isTeacher = false,
}) {
  const [stdinText, setStdinText] = useState("홍길동");
  const [lines, setLines] = useState([]); // 출력 줄 목록 {type, text}
  const [status, setStatus] = useState("idle"); // idle | loading | running
  const [copied, setCopied] = useState(false);
  const [width, setWidth] = useState(440); // 패널 너비 (드래그로 조절)
  const [full, setFull] = useState(false); // 전체 화면 여부
  const [dragging, setDragging] = useState(false);
  const editorHostRef = useRef(null);
  const viewRef = useRef(null);
  const runRef = useRef(() => {});
  const workerRef = useRef(null);
  const timerRef = useRef(null);
  const panelRef = useRef(null);

  // 패널 바깥을 클릭하면 실행기를 닫습니다.
  // (모달이 떠 있을 땐 무시, 실행기 토글 버튼[data-py-toggle] 클릭도 무시)
  useEffect(() => {
    if (!open || hasModalOpen) return;
    function onDown(e) {
      // [누른 것이 이미 사라졌으면 닫지 않습니다]
      // 자동 완성 목록이 그렇습니다. 항목을 누르면 CodeMirror가 **이
      // mousedown이 document까지 올라오기 전에** 완성을 넣고 목록을 통째로
      // DOM에서 걷어 냅니다. 그래서 우리 차례가 왔을 때 e.target(그 <li>)은
      // 문서에서 떨어져 나간 상태이고, 떨어진 노드는 어느 것에도 안 담기므로
      // `panel.contains(...)`가 false — '바깥을 눌렀다'로 읽혀 실행기가
      // 닫혔습니다(키보드 Enter로 고르면 mousedown이 없어 멀쩡했습니다).
      // 누르는 순간 사라진 것은 '바깥'이 아니라 **그것을 없앤 쪽의 일**이라,
      // 어디였는지 따질 것 없이 그냥 지나갑니다.
      if (!e.target.isConnected) return;
      if (panelRef.current?.contains(e.target)) return;
      if (e.target.closest?.("[data-py-toggle]")) return;
      // 실행기 바깥이어도 **위에 떠 있는 것**을 누른 것이면 닫지 않습니다.
      //  · 수업 노트 서랍·손잡이 — 실행기와 나란히 쓰는 옆 패널입니다.
      //    이게 없으면 서랍의 ×를 누르는 순간 실행기까지 함께 닫혔습니다.
      //  · 모달 — 그 안(또는 그 배경)을 누른 것이지 실행기를 떠난 게 아닙니다.
      //    hasModalOpen이 아직 모르는 새 모달까지 여기서 함께 막힙니다.
      if (e.target.closest?.(".cornell-drawer, .cornell-handle, .modal-backdrop")) return;
      onClose?.();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, hasModalOpen, onClose]);

  // ── CodeMirror 에디터 생성 (한 번만) ──
  useEffect(() => {
    if (!editorHostRef.current || viewRef.current) return;
    const view = new EditorView({
      doc: "",
      parent: editorHostRef.current,
      extensions: [
        // Ctrl+Enter 실행 + Tab으로 자동 완성 채택 (최우선 등록)
        Prec.highest(
          keymap.of([
            {
              key: "Ctrl-Enter",
              mac: "Cmd-Enter",
              run: () => {
                runRef.current();
                return true;
              },
            },
            // 자동 완성 목록이 열려 있으면 Tab으로 채택,
            // 아니면 false를 반환해 아래의 indentWithTab으로 넘어감
            { key: "Tab", run: acceptCompletion },
          ])
        ),
        basicSetup, // 줄 번호, 문법 강조, 괄호 자동 닫기, 자동 완성 등
        keymap.of([indentWithTab]), // (완성 목록이 없을 때) Tab 들여쓰기
        python(), // 파이썬 문법 강조 + 키워드/변수 자동 완성
        placeholder(samplePlaceholder()),
      ],
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // 워커·타이머 정리
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      clearTimeout(timerRef.current);
    };
  }, []);

  // ── 왼쪽 가장자리 드래그로 너비 조절 ──
  function startResize(e) {
    e.preventDefault();
    setDragging(true);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    function onMove(ev) {
      const w = Math.min(
        Math.max(window.innerWidth - ev.clientX, MIN_WIDTH),
        Math.round(window.innerWidth * 0.95)
      );
      setWidth(w);
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDragging(false);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function appendLine(type, text) {
    setLines((prev) => [...prev, { type, text }]);
  }

  function createWorker() {
    const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
    const worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "stdout") appendLine("out", msg.text);
      if (msg.type === "stderr") appendLine("err", msg.text);
      if (msg.type === "done") {
        clearTimeout(timerRef.current);
        if (msg.result) appendLine("result", msg.result);
        appendLine("info", "── 실행 완료 ──");
        setStatus("idle");
      }
      if (msg.type === "error") {
        clearTimeout(timerRef.current);
        appendLine("err", msg.error);
        setStatus("idle");
      }
    };
    return worker;
  }

  function run() {
    if (status === "running" || status === "loading") return;
    const code = viewRef.current?.state.doc.toString() ?? "";
    if (!code.trim()) return;
    setLines([]);

    if (!workerRef.current) {
      setStatus("loading");
      appendLine("info", "파이썬 인터프리터를 불러오는 중... (처음 한 번만)");
      workerRef.current = createWorker();
    }

    setStatus("running");
    workerRef.current.postMessage({ code, stdin: stdinText });

    // 시간제한: 초과하면 워커를 강제 종료하고 새로 만들 준비
    timerRef.current = setTimeout(() => {
      workerRef.current?.terminate();
      workerRef.current = null;
      appendLine(
        "err",
        `⏱ ${TIMEOUT_MS / 1000}초 시간제한을 초과해 중단했습니다. (무한 루프인지 확인해 보세요)`
      );
      setStatus("idle");
    }, TIMEOUT_MS);
  }

  // 단축키 핸들러가 항상 최신 상태의 run을 부르도록 갱신
  runRef.current = run;

  function copyCode() {
    const code = viewRef.current?.state.doc.toString() ?? "";
    if (!code.trim()) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // 지우개 — 쓴 코드를 통째로 비웁니다. 비면 예시(placeholder)가 다시
  // 옅게 떠서 '여기에 이렇게 쓴다'는 안내가 돌아옵니다.
  // 되묻지 않습니다 — 실행기의 코드는 저장되는 글이 아니고, 실수로 눌러도
  // Ctrl+Z(CodeMirror의 되돌리기)로 곧바로 되살아납니다.
  function clearCode() {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "" },
    });
    view.focus();
  }

  function stop() {
    workerRef.current?.terminate();
    workerRef.current = null;
    clearTimeout(timerRef.current);
    appendLine("info", "⏹ 실행을 중단했습니다.");
    setStatus("idle");
  }

  // 2단을 달 수 있는 화면인가 — 프로젝트 목록과 반이 함께 있어야 합니다.
  const canLink = !!(boards && classId && user);
  // 모달이 열려 있으면 2단을 강제로 접습니다(모달 위로 화면을 다 덮으면
  // 모달이 안 보입니다 — 지금까지 전체 화면이 그랬던 것과 같습니다).
  const effectiveFull = full && !hasModalOpen;

  return (
    <aside
      ref={panelRef}
      className={`py-panel ${open ? "open" : ""} ${effectiveFull ? "full" : ""} ${
        dragging ? "dragging" : ""
      }`}
      style={effectiveFull ? undefined : { width }}
    >
      {/* 왼쪽 가장자리 크기 조절 핸들 — 전체 화면이나 모달 위에 떠 있을 때는 숨김 */}
      {!effectiveFull && !hasModalOpen && (
        <div className="py-resizer" onMouseDown={startResize} />
      )}

      <div className="py-head">
        <h3><IconPythonRunner size={26} /> 파이썬 실행기</h3>
        <div className="py-head-actions">
          {/* 지우개 — 복사하기 왼쪽. 둘 다 '지금 쓴 코드'에 대한 일이라
              나란히 두고, 화면을 여닫는 단추(전체 화면·닫기)와는 갈라 둡니다. */}
          <button
            className="py-copy-btn py-clear-btn"
            onClick={clearCode}
            title="코드 모두 지우기"
            aria-label="코드 모두 지우기"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              {/* 지우개 — 기울어진 몸통과 바닥 줄 */}
              <path
                d="M9.4 19.2 4.6 14.4a1.4 1.4 0 0 1 0-2l7-7a1.4 1.4 0 0 1 2 0l4.8 4.8a1.4 1.4 0 0 1 0 2l-7.2 7.2H9.4Z"
                fill="#FFF7ED"
                stroke="#3A312E"
                strokeWidth="1.55"
                strokeLinejoin="round"
              />
              <path d="m8.6 8.2 6.8 6.8" stroke="#8A6258" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M5 20.4h14" stroke="#3A312E" strokeWidth="1.55" strokeLinecap="round" />
            </svg>
          </button>
          <button
            className="py-copy-btn"
            onClick={copyCode}
            title={copied ? "복사됨!" : "코드 복사"}
            aria-label="코드 복사"
          >
            {copied ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M5 13l4 4L19 7" stroke="#5c9e68" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="copy-simple-title">
                <title id="copy-simple-title">Copy</title>
                <path d="M9.35 4.25h7.85c.9 0 1.65.74 1.65 1.65v9.85" stroke="#8A6258" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6.95 7.25h7.7c.9 0 1.65.74 1.65 1.65v8.2c0 .9-.74 1.65-1.65 1.65h-7.7c-.9 0-1.65-.74-1.65-1.65V8.9c0-.9.74-1.65 1.65-1.65Z" fill="#FFF7ED" stroke="#3A312E" strokeWidth="1.55" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
          {/* 2단을 여닫는 단추. 예전의 '전체 화면'이 이 자리인데, 넓히는 것이
              목적이 아니라 **프로젝트에 연계하는 것**이 목적이라 이름이 그것을
              말합니다(넓어지는 것은 그러느라 따라오는 일입니다). */}
          {/* 연계할 프로젝트가 없는 화면(질문방)에서는 지금까지대로 '전체
              화면'입니다 — 이름만 갈릴 뿐 넓어지는 것은 같습니다. 여기서
              단추를 아예 빼면 그 화면이 넓게 쓰던 길을 잃습니다. */}
          <button
            className="btn-ghost"
            style={{ visibility: hasModalOpen ? "hidden" : "visible" }}
            onClick={() => setFull(!full)}
            title={
              !canLink
                ? full ? "원래 크기로" : "전체 화면"
                : full
                  ? "실행기만 보기 — 프로젝트 칸을 접습니다"
                  : "프로젝트 연계 — 짠 코드를 프로젝트 활동으로 보낼 수 있습니다"
            }
            tabIndex={hasModalOpen ? -1 : 0}
          >
            {full
              ? canLink ? "🗗 실행기만" : "🗗 축소"
              : canLink ? "⛶ 프로젝트 연계" : "⛶ 전체 화면"}
          </button>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
      </div>

      {/* 본문: 보통은 세로 배치, 전체 화면에서는 좌(에디터)/우(입출력) */}
      <div className="py-body">
        <div className="py-left">
          <div className="py-editor" ref={editorHostRef} />
        </div>

        <div className="py-right">
          <label className="py-label">
            <IconKeyboard size={26} /> 입력값 — input()이 읽어 갈 내용 (한 줄에 하나씩)
          </label>
          <textarea
            className="py-code py-stdin"
            spellCheck={false}
            value={stdinText}
            onChange={(e) => setStdinText(e.target.value)}
            placeholder={"예) input()을 두 번 쓰면\n첫 번째 입력\n두 번째 입력"}
          />

          <div className="py-actions">
            <button
              className="btn-primary"
              onClick={run}
              disabled={status !== "idle"}
              title="Ctrl+Enter (Mac: Cmd+Enter)"
            >
              {status === "loading" ? (
                "인터프리터 로딩..."
              ) : status === "running" ? (
                "실행 중..."
              ) : (
                <>▶ 실행 <span className="py-run-hint">Ctrl+Enter</span></>
              )}
            </button>
            {status === "running" && (
              <button className="btn-ghost" onClick={stop}>
                ⏹ 중단
              </button>
            )}
            {/* 지금 에디터의 코드를 코드 블록으로 담아 질문 모달 열기 */}
            {onAskQuestion && (
              <button
                className="btn-ghost"
                onClick={() => {
                  const code = viewRef.current?.state.doc.toString() ?? "";
                  if (code.trim()) onAskQuestion(code);
                }}
              >
                <IconAnswer size={17} /> 질문 만들기
              </button>
            )}
            <button className="btn-ghost" onClick={() => setLines([])}>
              출력 지우기
            </button>
          </div>

          <div className="py-output">
            {lines.length === 0 ? (
              <span className="py-line info">
                실행 결과가 여기에 표시됩니다.
              </span>
            ) : (
              lines.map((l, i) => (
                <span key={i} className={`py-line ${l.type}`}>
                  {l.text}
                </span>
              ))
            )}
          </div>
        </div>

        {/* 2단 — 프로젝트 연계 칸. 열려 있을 때만 그립니다(접힌 동안 프로젝트
            목록을 훑거나 반 문서를 들여다볼 이유가 없습니다). */}
        {effectiveFull && (
          <PyProjectPanel
            classId={classId}
            className={className}
            boards={boards}
            pyTarget={pyTarget}
            user={user}
            isTeacher={isTeacher}
            getCode={() => viewRef.current?.state.doc.toString() ?? ""}
            getLines={() => lines}
          />
        )}
      </div>
    </aside>
  );
}
