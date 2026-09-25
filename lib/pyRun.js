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
// [실행은 늘 새 공간에서]
// ▶를 누를 때마다 **빈 이름 공간**을 새로 만들어 그 코드만 돌립니다. 예전에는
// Pyodide의 공용 전역 공간에서 돌려 앞 실행에서 만든 변수가 다음 실행에
// 남았습니다 — 같은 코드가 두 번째 실행에서만 도는 일이 생기고, 붙여 둔
// 결과가 '이 코드만으로 나온 것'인지 알 수 없었습니다. 파이썬 연계 활동의
// 셀도, 실행기도 같은 규칙입니다(한 앱 안에서 규칙이 둘이면 헷갈립니다).
//   · `__name__`은 "__main__"으로 넣어 둡니다 — `if __name__ == "__main__":`
//     를 쓰는 코드가 NameError로 멈추지 않게.
//   · 한 번 불러온 모듈(`import random` 따위)은 파이썬이 따로 기억해 두므로
//     다시 받지 않습니다 — 새로 만드는 것은 **변수가 사는 공간**뿐입니다.
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
// 꺼낸 값은 터미널처럼 한 번 찍되, 앞뒤에 표시 글자(chr(1)·chr(2))를 둘러
// 화면이 '입력한 값'을 옅게 가려 그리게 합니다 — 아래 splitEcho.
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
  "        print(chr(1) + v + chr(2))",
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
    // 실행마다 **빈 공간**에서 돌립니다(아래 '실행은 늘 새 공간에서').
    const ns = pyodide.globals.get("dict")();
    ns.set("__name__", "__main__");
    try {
      const result = await pyodide.runPythonAsync(e.data.code, { globals: ns });
      self.postMessage({
        type: "done",
        result: result !== undefined && result !== null ? String(result) : "",
      });
    } finally {
      ns.destroy();
    }
  } catch (err) {
    self.postMessage({ type: "error", error: String(err) });
  }
};
`;

// ── 입력한 값 가려 보이기 ──────────────────────────────────────────
// `print(input())`을 돌리면 결과에 같은 값이 두 줄 섭니다 — 하나는 input()이
// 터미널처럼 찍은 **입력**, 하나는 print가 찍은 **출력**입니다. 찍기를 빼면
// `input("이름: ")`의 안내 뒤에 줄바꿈이 없어 다음 출력과 한 줄로 뭉개지고,
// 붙여 둔 결과에서 '무엇을 넣어 나온 것인지'가 사라집니다. 그래서 찍기는
// 그대로 두고, 화면에서 입력한 값만 옅게 그려 둘이 갈리게 합니다.
//
// 한 줄을 { text, parts }로 나눕니다 — text는 표시 글자를 걷은 그 줄 그대로
// (셀의 결과로 저장하는 글), parts는 표시가 있을 때만
// [{ text, echo }] 조각 목록(그리는 쪽이 echo 조각에 옅은 색을 입힘).
const ECHO_OPEN = "\u0001";
const ECHO_CLOSE = "\u0002";

export function splitEcho(raw) {
  const s = String(raw ?? "");
  if (!s.includes(ECHO_OPEN)) return { text: s, parts: undefined };
  const parts = [];
  let rest = s;
  while (rest) {
    const a = rest.indexOf(ECHO_OPEN);
    if (a < 0) { parts.push({ text: rest, echo: false }); break; }
    if (a > 0) parts.push({ text: rest.slice(0, a), echo: false });
    const b = rest.indexOf(ECHO_CLOSE, a + 1);
    const end = b < 0 ? rest.length : b;
    parts.push({ text: rest.slice(a + 1, end), echo: true });
    rest = b < 0 ? "" : rest.slice(b + 1);
  }
  return { text: parts.map((p) => p.text).join(""), parts };
}

// ── 오류 글 다듬기 ──────────────────────────────────────────────
// Pyodide가 넘기는 오류는 `PythonError: Traceback …`으로 시작하고, 학생 코드
// 앞에 **Pyodide 자신의 줄**(`/lib/python312.zip/_pyodide/_base.py` …)이 두어
// 벌 끼어 있습니다. 학생이 읽을 것은 제 코드(`File "<exec>"`)의 줄과 마지막
// 오류 한 줄뿐이라, 파이썬 설치본(`/lib/python…`) 안의 줄은 걷습니다 —
// 이 글은 셀의 결과로 카드에 **저장되어** 두고두고 보이는 글입니다.
// 걷는 것은 `File "…"` 줄과 그 아래 더 들여 쓴 줄(코드 · `^^^` 표시)입니다.
// 설치본 줄이 없는 오류(문법 오류 따위)는 머리말만 걷고 그대로입니다.
export function tidyTraceback(raw) {
  const s = String(raw ?? "").replace(/^PythonError:\s*/, "");
  const out = [];
  let skipping = false;
  for (const line of s.split("\n")) {
    const file = line.match(/^ {2}File "([^"]*)"/);
    if (file) {
      skipping = file[1].startsWith("/lib/python");
      if (skipping) continue;
    } else if (skipping && /^ {4,}/.test(line)) {
      continue;
    } else {
      skipping = false;
    }
    out.push(line);
  }
  return out.join("\n").replace(/\s+$/, "");
}

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
    if (msg.type === "stdout") {
      const { text, parts } = splitEcho(msg.text);
      h.onLine?.("out", text, parts);
    }
    else if (msg.type === "stderr") h.onLine?.("err", msg.text);
    else if (msg.type === "done") {
      clearTimeout(timer);
      handlers = null;
      h.onDone?.(msg.result ?? "");
    } else if (msg.type === "error") {
      clearTimeout(timer);
      handlers = null;
      h.onError?.(tidyTraceback(msg.error));
    }
  };
  return true;
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
