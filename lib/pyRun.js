// =============================================================
// 파이썬 실행 — Pyodide 워커 한 벌
// -------------------------------------------------------------
// 실행기(PythonRunner)와 수업 노트 서랍의 활동 칸(LessonTaskPanel)이
// **이 한 곳을 나눠 씁니다.**
//
// [왜 한 곳인가]
// 워커를 만드는 코드가 실행기 안에 있던 것을 여기로 옮겼습니다. 그대로
// 복사해 서랍에도 두면 **Pyodide가 두 벌 뜹니다** — 하나가 100MB 남짓이라
// 학생 노트북에서 그대로 티가 납니다. 두 화면은 나란히 열릴 수 있으므로
// (실행기 옆에 서랍) 한 벌을 나눠 쓰고, 동시에 두 곳에서 돌리지는 않습니다
// (`"busy"`).
//
// [불러오는 값이 큽니다 — 부를 때만 만듭니다]
// Pyodide는 CDN에서 10MB 남짓을 받습니다(처음 한 번, 그 뒤로는 브라우저
// 캐시). **화면을 여는 것만으로 만들지 마세요** — 코딩이 아닌 수업에서도 반
// 전체가 그만큼 받습니다. 워커는 `runPython`을 처음 부를 때 비로소 생기고,
// 그때 `"fresh"`를 돌려주어 부르는 쪽이 '불러오는 중' 안내를 달게 합니다.
//
// [시간제한]
// 15초를 넘기면 워커를 **강제 종료**합니다(무한 루프를 멈출 다른 길이
// 없습니다). 다음 실행 때 새로 만들어지는데, 받아 온 것은 브라우저 캐시에
// 있어 다시 내려받지는 않습니다.
// =============================================================

export const PY_TIMEOUT_MS = 15000;
const PYODIDE_VERSION = "0.26.4";

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

let worker = null;
let handlers = null; // 지금 돌고 있는 실행의 콜백 묶음 (없으면 노는 중)
let timer = null;

// 워커를 만듭니다. 이번에 새로 만들었으면 true — 그때가 인터프리터를
// 받아 오는 순간이라, 부르는 쪽이 안내를 답니다.
function ensureWorker() {
  if (worker) return false;
  const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
  worker = new Worker(URL.createObjectURL(blob));
  worker.onmessage = (e) => {
    const msg = e.data;
    const h = handlers;
    if (!h) return; // 중단한 뒤 늦게 온 말 — 버립니다
    if (msg.type === "stdout") h.onLine?.("out", msg.text);
    else if (msg.type === "stderr") h.onLine?.("err", msg.text);
    else if (msg.type === "done") {
      clearTimeout(timer);
      handlers = null;
      h.onDone?.(msg.result ?? "");
    } else if (msg.type === "error") {
      clearTimeout(timer);
      handlers = null;
      h.onError?.(String(msg.error ?? ""));
    }
  };
  return true;
}

// 지금 어디선가 돌고 있는지 — 두 화면이 동시에 누르는 일을 가릅니다.
export function pyRunning() {
  return handlers !== null;
}

// 코드를 돌립니다.
//   "fresh" — 워커를 이번에 만들었습니다(= 인터프리터를 받아 오는 중)
//   "ready" — 이미 떠 있는 워커로 바로 돌립니다
//   "busy"  — 다른 곳에서 돌고 있어 아무 일도 하지 않았습니다
export function runPython({ code, stdin = "", onLine, onDone, onError, onTimeout }) {
  if (handlers) return "busy";
  const fresh = ensureWorker();
  handlers = { onLine, onDone, onError };
  worker.postMessage({ code, stdin });
  timer = setTimeout(() => {
    stopPython();
    onTimeout?.(PY_TIMEOUT_MS);
  }, PY_TIMEOUT_MS);
  return fresh ? "fresh" : "ready";
}

// 중단 — 워커를 통째로 끕니다(파이썬을 도중에 멈출 다른 길이 없습니다).
// 시간 초과도 이 길로 옵니다.
export function stopPython() {
  clearTimeout(timer);
  timer = null;
  handlers = null;
  worker?.terminate();
  worker = null;
}
