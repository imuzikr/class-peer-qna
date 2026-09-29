"use client";

// =============================================================
// 활동 목록 칸 + 예시 코드 창 — 프로젝트 만들기 창 · 원본 편집 창 공용
// -------------------------------------------------------------
// 두 창의 '활동' 칸이 같은 모양을 따로 적어 두고 있던 것을 한 조각으로
// 모았습니다(ActivityListField). 파이썬 실행기와 연계한 프로젝트면 줄마다
// **'예시 코드'** 단추가 서고, 누르면 창 **오른쪽에서** 예시 코드 칸이
// 미끄러져 나옵니다(ExampleCodePanel). 그 칸에 적은 코드는
//   · 학생 카드의 빈 활동 칸에 희미한 회색 글자로 보이고
//   · 학생이 칸을 눌러 여는 셀 창의 왼쪽 열에 그대로 섭니다.
// 저장 모양은 lib/activityExamples.js(활동 이름 → 코드 맵).
//
// [창 곁에 붙습니다] 창과 예시 칸은 한 줄(`.act-ex-shell`)에 나란히 서고,
// 예시 칸의 폭이 0 → 452px로 벌어지며 둘이 함께 가운데를 다시 잡습니다 —
// 창을 덮지 않아 적고 있는 활동 이름을 보면서 씁니다. 화면이 좁으면
// (1060px 아래) 창 위에 겹쳐 오른쪽에서 나옵니다.
//
// [닫아도 한 번 더 그려 둡니다] 닫자마자 내용을 걷으면 폭이 줄어드는 동안
// 빈 칸이 미끄러져 들어갑니다 — 마지막으로 연 줄을 그대로 들고 있습니다.
//
// [Esc] 예시 칸이 열려 있으면 그것만 닫습니다(뒤의 창은 그대로). 자동 완성
// 목록을 닫는 Esc(CodeMirror가 먼저 씀)는 비켜 줍니다.
// =============================================================
import { useEffect, useState } from "react";
import { PyCodeInput } from "./PyCellEditor";
import { EXAMPLE_MAX } from "@/lib/activityExamples";

export function ActivityListField({
  activities,
  onActivities,
  examples,
  onExamples,
  withExamples = false, // 파이썬 연계(모둠 아님)일 때만 '예시 코드' 단추
  exIdx = null,
  onExIdx,
}) {
  function setAt(i, value) {
    onActivities(activities.map((a, j) => (j === i ? value : a)));
  }
  // 줄을 지우면 그 줄의 예시도 함께 빠집니다 — 두 배열이 늘 나란해야 합니다.
  function removeAt(i) {
    if (activities.length === 1) {
      onActivities([""]);
      onExamples([""]);
    } else {
      onActivities(activities.filter((_, j) => j !== i));
      onExamples(examples.filter((_, j) => j !== i));
    }
    if (exIdx === i) onExIdx?.(null);
    else if (exIdx != null && exIdx > i) onExIdx?.(exIdx - 1);
  }
  function add() {
    onActivities([...activities, ""]);
    onExamples([...examples, ""]);
  }

  return (
    <>
      <div className="study-activity-list">
        {activities.map((act, i) => {
          const has = !!String(examples[i] ?? "").trim();
          const on = exIdx === i;
          return (
            <div key={i} className="study-activity-item">
              <span className="study-activity-label">활동 {i + 1}</span>
              <input
                className="study-activity-input"
                value={act}
                onChange={(e) => setAt(i, e.target.value)}
                placeholder={`활동 ${i + 1} 내용을 입력하세요`}
              />
              {withExamples && (
                <button
                  type="button"
                  className={`act-ex-btn${has ? " has" : ""}${on ? " on" : ""}`}
                  onClick={() => onExIdx?.(on ? null : i)}
                  aria-pressed={on}
                  title={
                    has
                      ? "예시 코드를 고쳐요 — 학생 카드의 빈 칸에 희미하게 보여요"
                      : "이 활동의 예시 코드를 적어요 — 학생 카드의 빈 칸에 희미하게 보여요"
                  }
                >
                  {has && <span className="act-ex-dot" aria-hidden="true" />}
                  예시 코드
                </button>
              )}
              <button
                type="button"
                className="study-activity-del"
                onClick={() => removeAt(i)}
                aria-label={`활동 ${i + 1} 삭제`}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" className="study-activity-add" onClick={add}>
        + 활동 추가
      </button>
    </>
  );
}

// 창 오른쪽에서 나오는 예시 코드 칸. `index`가 null이면 닫힘.
export function ExampleCodePanel({ index, activityName = "", code = "", onCode, onClose }) {
  const open = index != null;
  // 닫는 동안에도 마지막 줄을 그려 둡니다(머리 주석)
  const [shown, setShown] = useState(index);
  useEffect(() => {
    if (index != null) setShown(index);
  }, [index]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault(); // 뒤의 창까지 닫히지 않게(lib/modal.js)
      onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const len = String(code ?? "").length;
  return (
    <aside
      className={`act-ex-panel${open ? " open" : ""}`}
      aria-hidden={!open}
      aria-label="예시 코드"
    >
      {shown != null && (
        <div className="act-ex-inner">
          <div className="act-ex-head">
            <span className="activity-dash-no">활동 {shown + 1}</span>
            <strong title={activityName}>{activityName || "이름 없는 활동"}</strong>
            <button type="button" className="btn-close" onClick={onClose} aria-label="예시 코드 닫기">
              ×
            </button>
          </div>
          <p className="act-ex-hint">
            학생 카드의 빈 활동 칸에 <b>희미한 글자</b>로 보이고, 학생이 칸을 눌러
            크게 열면 <b>왼쪽 열</b>에 그대로 섭니다. 학생이 쓰기 시작하면 카드에서는
            사라져요.
          </p>
          <div className="act-ex-editor">
            {/* 줄을 바꾸면 그 줄의 코드로 갈아 끼웁니다(편집기는 비제어) */}
            <PyCodeInput
              key={shown}
              code={code}
              onCode={(v) => onCode?.(v.slice(0, EXAMPLE_MAX))}
              autoFocus={open}
              placeholder="예시 코드를 적어 주세요"
            />
          </div>
          <div className="act-ex-foot">
            <span className={`act-ex-count${len > EXAMPLE_MAX * 0.9 ? " warn" : ""}`}>
              {len.toLocaleString()} / {EXAMPLE_MAX.toLocaleString()}자
            </span>
            <button type="button" className="btn-primary" onClick={onClose}>
              완료
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
