// 실행 결과 한 줄의 글자 — input()이 찍은 '입력한 값'만 옅게(.py-echo).
// 실행기(PythonRunner)와 서랍의 활동 칸(LessonTaskPanel)이 함께 씁니다 —
// 같은 코드를 두 곳에서 돌렸는데 결과가 다르게 보이면 안 됩니다.
// 나누는 셈은 lib/pyRun.js의 splitEcho 한 곳입니다.
export default function PyLineText({ line }) {
  if (!line?.parts) return line?.text ?? "";
  return line.parts.map((p, i) =>
    p.echo ? (
      <span key={i} className="py-echo" title="입력값 칸에서 넣은 값">
        {p.text}
      </span>
    ) : (
      p.text
    )
  );
}
