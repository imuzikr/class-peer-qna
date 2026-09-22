"use client";

// =============================================================
// '🍊 다 함께' 결과 창 — 교사 전용
// -------------------------------------------------------------
// 단추를 누르면 되묻지 않고 바로 나가므로(선생님 요청), **끝난 뒤에 무슨
// 일이 있었는지 말해 주는 자리가 여기 하나뿐**입니다. 그래서 '몇 명에게
// 줬다'만이 아니라 **안 간 사람**까지 함께 적습니다.
//
// [안 간 까닭이 둘이라 칸도 둘입니다]
//   · 주지 못함 — 쓰기가 실패한 경우(연결 끊김 등). **다시 줄 수 있습니다.**
//   · 이미 가득 참 — 누적이 천장(REWARD_MAX)에 닿아 더 안 올라갑니다.
//     다시 눌러도 그대로라 **누를 수 있게 두지 않습니다** — 눌리는데 아무
//     일도 안 일어나면 고장으로 보입니다.
//
// [이름이 곧 단추입니다] 실패한 학생 이름을 누르면 그 학생에게만 다시
// 보냅니다. 자리표에서 그 자리를 찾아 누르는 것보다 짧고, 무엇보다 **누구가
// 안 받았는지 보면서** 바로 처리할 수 있습니다. 성공하면 그 자리에서 체크로
// 바뀌고 위 인원수도 함께 올라갑니다(창을 닫았다 다시 열 필요가 없습니다).
//
// [낱개 주기와 같은 길] 다시 주기도 `onRetry` → `onAward(uid, 개수, +1)`,
// 곧 델타입니다. 절대값으로 보내면 구독으로 돌아오기 전의 옛 값을 쓰게 됩니다
// (CLAUDE.md의 '＋1·−1 단추는 반드시 addStudentReward(델타)로').
// =============================================================
import { useState } from "react";
import { backdropClose } from "@/lib/modal";

export default function AwardAllResultModal({
  given = 0,          // 이번에 바로 받은 인원
  failed = [],        // 쓰기가 실패한 학생 [{ uid, name, count }]
  maxed = [],         // 이미 천장에 닿아 그대로인 학생 [{ uid, name }]
  rewardMax = 100,
  onRetry,            // (student) => Promise — 그 학생에게만 다시 하나
  onClose,
}) {
  // uid → 'sending' | 'done' | 'error'. 없으면 아직 안 눌러 본 것입니다.
  const [state, setState] = useState(() => new Map());
  const at = (uid) => state.get(uid) ?? null;
  const put = (uid, v) => setState((m) => new Map(m).set(uid, v));

  const retried = failed.filter((s) => at(s.uid) === "done").length;
  const left = failed.length - retried;

  async function retry(student) {
    const now = at(student.uid);
    if (now === "sending" || now === "done") return;
    put(student.uid, "sending");
    try {
      await onRetry?.(student);
      put(student.uid, "done");
    } catch {
      put(student.uid, "error");
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal award-result-modal"
        role="dialog"
        aria-modal="true"
        aria-label="다 함께 주기 결과"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 className="head-icon">🍊 다 함께 주기</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {/* 인원수는 **다시 준 것까지 합쳐** 셉니다 — 창 안에서 고친 결과가
            위 한 줄에 곧바로 반영되어야 '끝났다'가 눈에 보입니다. */}
        <p className="award-result-sum" role="status">
          {given + retried > 0
            ? <><strong>{given + retried}명</strong>에게 🍊를 하나씩 줬어요.</>
            : "과일이 나간 학생이 없어요."}
        </p>

        {failed.length > 0 && (
          <section className="award-result-sec">
            <h4>
              주지 못한 학생 {left > 0 ? `${left}명` : "없음"}
              {retried > 0 && <em> · 다시 준 {retried}명</em>}
            </h4>
            <p className="award-result-hint">
              이름을 누르면 그 학생에게만 다시 줍니다.
            </p>
            <div className="award-result-names">
              {failed.map((s) => {
                const st = at(s.uid);
                return (
                  <button
                    key={s.uid}
                    type="button"
                    className={`award-result-name${st ? ` is-${st}` : ""}`}
                    onClick={() => retry(s)}
                    disabled={st === "sending" || st === "done"}
                    title={
                      st === "done"
                        ? `${s.name} — 다시 줬어요`
                        : st === "error"
                          ? `${s.name} — 또 실패했어요. 한 번 더 눌러 보세요`
                          : `${s.name}에게 🍊 하나 다시 주기`
                    }
                  >
                    {st === "done" ? "✓ " : st === "sending" ? "… " : ""}
                    {s.name}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {maxed.length > 0 && (
          <section className="award-result-sec">
            <h4>이미 가득 찬 학생 {maxed.length}명</h4>
            {/* **누를 수 없습니다.** 다시 보내도 천장이라 값이 그대로인데,
                눌리는데 아무 일도 안 일어나면 고장으로 보입니다. */}
            <p className="award-result-hint">
              누적 {rewardMax}개를 채워서 더 올라가지 않아요.
            </p>
            <p className="award-result-maxed">
              {maxed.map((s) => s.name).join(", ")}
            </p>
          </section>
        )}

        <div className="award-result-foot">
          <button type="button" className="btn-primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
