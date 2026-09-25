"use client";

// =============================================================
// 파이썬 코드 실행 패널 (Pyodide + CodeMirror)
// -------------------------------------------------------------
// - 코드 에디터: CodeMirror — 줄 번호, 문법 강조, 괄호 자동 닫기,
//   자동 완성(Tab 또는 Enter로 채택), 파이썬 자동 들여쓰기
// - 실행 단축키: Ctrl+Enter (Mac: Cmd+Enter)
// - 패널 왼쪽 가장자리를 드래그하면 너비 조절
// - ⛶ '프로젝트 연계'로 2단을 엽니다 (서랍이 프로젝트 칸만큼 더 벌어짐)
// - 실행 엔진: `lib/pyRun.js` — Pyodide(WebAssembly)를 Web Worker에서,
//   15초 제한. **수업 노트 서랍의 활동 칸과 그 한 벌을 나눠 씁니다.**
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
import PyLineText from "./PyLineText";
import { runPython, stopPython } from "@/lib/pyRun";

const MIN_WIDTH = 340;
// 2단이 열릴 때 서랍이 더 벌어지는 폭 — 프로젝트 칸 300px + 사이 여백 16px.
// `.py-project`의 flex-basis와 `.py-main`의 gap을 고치면 이 값도 함께 고치세요.
const LINK_W = 316;
// 서랍이 여닫히는 시간 — `.py-panel`의 transition과 **같아야** 합니다.
// 닫을 때 프로젝트 칸을 이만큼 더 남겨 두는 데 씁니다.
const SLIDE_MS = 250;

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
//  2단 — '프로젝트 연계'를 누르면 서랍이 **프로젝트 칸만큼만 더 벌어지고**
//        오른쪽에 그 칸이 섭니다. 교사가 수업 중에 코드를 받을 활동을 고르고
//        (잠겨 있으면 열림) 프로젝트·활동을 그 자리에서 만듭니다. **화면을
//        덮지 않습니다** — 2단은 서랍이 한 칸 더 열리는 것이지 전체 화면이
//        아닙니다.
// **2단은 교사에게만 있습니다.** 학생은 카드의 활동 칸에서 '파이썬 실행기'를
// 누르면 이 실행기가 아니라 **수업 노트 서랍**에 그 활동 칸이 열려, 거기서
// 곧바로 쓰고 돌리고 저장합니다(CornellNoteDrawer의 '프로젝트 활동'). 학생의
// 실행기는 1단 연습장입니다 — 길게 짜 보고, 복사해 서랍의 코드 블록에 붙입니다.
// 넓히기만 하던 예전 '전체 화면'은 없앴습니다 — 넓어지는 것은 프로젝트 칸을
// 놓느라 따라오는 일이지 그 자체가 모드일 이유가 없었습니다. 그래서 연계할
// 프로젝트가 없는 화면(질문방)에는 이 단추가 아예 없습니다.
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
  templates = [], // 내 프로젝트 원본 — 새 프로젝트 이름이 겹치는지 보는 데만
  pyTarget = null,
  user = null,
  isTeacher = false,
}) {
  const [stdinText, setStdinText] = useState("홍길동");
  const [lines, setLines] = useState([]); // 출력 줄 목록 {type, text}
  const [status, setStatus] = useState("idle"); // idle | loading | running
  const [copied, setCopied] = useState(false);
  const [width, setWidth] = useState(440); // 패널 너비 (드래그로 조절)
  const [linked, setLinked] = useState(false); // 2단(프로젝트 연계)이 열려 있나
  const [dragging, setDragging] = useState(false);
  const editorHostRef = useRef(null);
  const viewRef = useRef(null);
  const runRef = useRef(() => {});
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

  // 언마운트에서 워커를 끄지 않습니다 — 이제 수업 노트 서랍과 **한 벌을
  // 나눠 쓰므로**, 실행기를 닫았다고 남의 실행까지 끊으면 안 됩니다.
  // 워커는 중단·시간 초과 때만 꺼집니다(lib/pyRun.js).

  // ── 왼쪽 가장자리 드래그로 너비 조절 ──
  function startResize(e) {
    e.preventDefault();
    setDragging(true);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    function onMove(ev) {
      // 끌어서 정하는 것은 **패널 전체 폭**이지만 state에 담는 것은
      // 에디터·입출력 칸의 폭이라, 2단이면 프로젝트 칸만큼 빼고 담습니다.
      const total = window.innerWidth - ev.clientX;
      const extra = linkedOpen ? LINK_W : 0;
      const w = Math.min(
        Math.max(total - extra, MIN_WIDTH),
        Math.round(window.innerWidth * 0.95) - extra
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

  // parts — input()이 찍은 '입력한 값' 조각이 섞인 줄일 때만(lib/pyRun.js의 splitEcho)
  function appendLine(type, text, parts) {
    setLines((prev) => [...prev, { type, text, parts }]);
  }

  function run() {
    if (status === "running") return;
    const code = viewRef.current?.state.doc.toString() ?? "";
    if (!code.trim()) return;
    setLines([]);

    const how = runPython({
      code,
      stdin: stdinText,
      onLine: appendLine,
      onDone: (result) => {
        if (result) appendLine("result", result);
        appendLine("info", "── 실행 완료 ──");
        setStatus("idle");
      },
      onError: (err) => {
        appendLine("err", err);
        setStatus("idle");
      },
      onTimeout: (ms) => {
        appendLine(
          "err",
          `⏱ ${ms / 1000}초 시간제한을 초과해 중단했습니다. (무한 루프인지 확인해 보세요)`
        );
        setStatus("idle");
      },
    });

    // 서랍의 활동 칸과 워커 한 벌을 나눠 쓰므로, 거기서 돌고 있으면 비켜 줍니다.
    if (how === "busy") {
      appendLine("info", "다른 칸에서 파이썬이 돌고 있어요 — 끝나면 다시 눌러 주세요.");
      return;
    }
    if (how === "fresh") {
      appendLine("info", "파이썬 인터프리터를 불러오는 중... (처음 한 번만)");
    }
    setStatus("running");
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
    stopPython();
    appendLine("info", "⏹ 실행을 중단했습니다.");
    setStatus("idle");
  }

  // 2단을 달 수 있는 화면인가 — **교사**이고, 프로젝트 목록과 반이 함께
  // 있어야 합니다(학생은 1단뿐 — 위 머리 주석).
  // 아니면 단추 자체가 없습니다. 예전에는 이 자리가 '전체 화면'이라 연계할
  // 것이 없어도 넓히기는 했는데, 넓히기만 하는 모드는 따로 둘 이유가
  // 없어졌습니다(넓어지는 것은 프로젝트 칸을 놓느라 따라오는 일입니다).
  const canLink = !!(isTeacher && boards && classId && user);
  // 모달이 열려 있으면 2단을 접습니다 — 화면을 다 덮으면 모달이 안 보입니다.
  const linkedOpen = linked && canLink && !hasModalOpen;

  // [닫을 때도 부드럽게] 칸을 곧바로 걷어 내면 내용이 먼저 사라지고 폭이
  // 뒤늦게 줄어, 닫히는 것이 아니라 '사라졌다가 줄어드는' 두 동작으로
  // 보입니다. 폭이 다 줄 때까지 그려 두었다가 그 뒤에 걷어 냅니다.
  //
  // **`.linked` 클래스도 이 값을 따릅니다**(`linkedOpen`이 아니라). 클래스가
  // 먼저 빠지면 에디터 칸을 붙들던 `min-width`가 함께 풀려, 닫히는 내내
  // 코드 칸이 403 → 90px로 짜부라집니다(실측). 폭만 `linkedOpen`을 봅니다 —
  // 그래야 좁은 쪽으로 굴러갑니다.
  const [linkRendered, setLinkRendered] = useState(false);
  useEffect(() => {
    if (linkedOpen) {
      setLinkRendered(true);
      return;
    }
    const t = setTimeout(() => setLinkRendered(false), SLIDE_MS);
    return () => clearTimeout(t);
  }, [linkedOpen]);

  return (
    <aside
      ref={panelRef}
      className={`py-panel ${open ? "open" : ""} ${linkRendered ? "linked" : ""} ${
        dragging ? "dragging" : ""
      }`}
      style={{
        width: linkedOpen ? width + LINK_W : width,
        // 전환 중에 에디터 칸이 짜부라지지 않게 1단에서의 제 폭을 알려 줍니다.
        // 37 = 좌우 여백 18+18 + 왼쪽 테두리 1(`.py-panel`은 border-box라
        // 셋을 다 뺀 것이 속 폭입니다 — 실측 440 → 403).
        "--py-body-w": `${width - 37}px`,
      }}
    >
      {/* 왼쪽 가장자리 크기 조절 핸들 — 모달 위에 떠 있을 때만 숨김 */}
      {!hasModalOpen && (
        <div className="py-resizer" onMouseDown={startResize} />
      )}

      <div className="py-head">
        <h3><IconPythonRunner size={26} /> 파이썬 실행기</h3>
        <div className="py-head-actions">
          {/* 지우개 — 복사하기 왼쪽. 둘 다 '지금 쓴 코드'에 대한 일이라
              나란히 두고, 화면을 여닫는 단추(프로젝트 연계·닫기)와는 갈라 둡니다. */}
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
          {/* 2단을 여닫는 단추. 연계할 프로젝트가 없는 화면(질문방)에는
              아예 없습니다 — 열어 봐야 빈 칸이 서는 자리입니다. */}
          {canLink && (
            <button
              className="btn-ghost"
              style={{ visibility: hasModalOpen ? "hidden" : "visible" }}
              onClick={() => setLinked((v) => !v)}
              title={
                linked
                  ? "실행기만 보기 — 프로젝트 칸을 접습니다"
                  : "프로젝트 연계 — 코드를 받을 활동을 고르고(잠겨 있으면 열림) 그 자리에서 만듭니다"
              }
              tabIndex={hasModalOpen ? -1 : 0}
            >
              {linked ? "🗗 실행기만" : "⛶ 프로젝트 연계"}
            </button>
          )}
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
      </div>

      {/* 1단은 이 안이 세로로 쌓이고(에디터 위, 입출력 아래), 2단이면 그
          묶음 오른쪽에 프로젝트 칸이 한 칸 더 섭니다. 본문 배치는 두 단이
          같습니다 — 2단도 화면을 덮지 않는 서랍이라 좌우로 가를 폭이 없습니다. */}
      <div className="py-main">
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
              {status === "running" ? (
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
                  <PyLineText line={l} />
                </span>
              ))
            )}
          </div>
        </div>
      </div>

        {/* 2단 — 프로젝트 연계 칸. 열려 있을 때만 그립니다(접힌 동안 프로젝트
            목록을 훑거나 반 문서를 들여다볼 이유가 없습니다). */}
        {linkRendered && (
          <PyProjectPanel
            classId={classId}
            className={className}
            boards={boards}
            templates={templates}
            pyTarget={pyTarget}
            user={user}
          />
        )}
      </div>
    </aside>
  );
}
