"use client";

// =============================================================
// 수업 화면 — 지금 학생들에게 띄우고 있는 것 (곁텍스트 · RAFT · KWLS 공용)
// -------------------------------------------------------------
// 발표 모드로 수업할 때 교사 화면에 있던 것은 '누구의 무엇을 띄우는 중'이라는
// 막대 한 줄뿐이었습니다. 그래서 (ㄱ) **지금 칠판에 무엇이 떠 있는지**를
// 교사가 볼 수 없었고, (ㄴ) **다음 학생의 같은 항목**으로 넘길 길이 아예
// 없었습니다 — 학생을 바꾸려면 왼쪽 목록에서 고른 뒤 그 단계의 '수업 시작'을
// 다시 눌러야 했습니다(실제 신고).
//
// 그래서 이 창은 축이 **둘**입니다.
//  · **학생 축**(주인공) — 같은 단계를 학생별로. 창 아래 큰 단추 둘과 ← →.
//  · **단계 축**(딸림) — 같은 학생의 다른 단계. 머리말 막대가 하던 그것을
//    창이 그것을 덮으므로 여기에도 작게 둡니다.
//
// **넘기면 학생 화면도 함께 바뀝니다.** 이 창이 보여 주는 것이 곧 '지금
// 띄우는 것'이라, 창에서만 넘어가면 창이 거짓말을 하게 됩니다. 미리 보고
// 나서 보낼 수 있게 하려면 '미리보기'라는 다른 개념이 필요한데, 그러면
// 지금 뜬 것과 고른 것이 갈려 수업 중에 둘을 함께 머리에 둬야 합니다.
//
// **닫기(×·Esc·배경)는 수업을 끝내지 않습니다** — 창만 걷고 방송은 그대로
// 둡니다. 끝내는 길은 '수업 종료' 하나뿐이라 둘을 선으로 갈라 둡니다.
// =============================================================
import { useEffect, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { addStudentReward, subscribeMyClassRewardCount, REWARD_MAX } from "@/lib/store";
import { nextFruit } from "./RewardFruits";

export default function CastStageModal({
  // 지금 방송 중인 꾸러미 — 학생 화면(PresentationOverlay)이 받는 그것입니다
  payload,
  // 지금 띄우는 학생 { uid, name, studentId, emoji }
  student,
  // 학생 축 — 몇 번째인가와 넘기는 길(끝이면 null)
  studentIndex = 0,
  studentTotal = 0,
  prevStudent = null,
  nextStudent = null,
  onStudent = null,
  // 단계 축 — 머리말 막대가 하던 그것
  onPrevSection = null,
  onNextSection = null,
  // 과일 주기
  classId = null,
  user = null,
  onStop,
  onClose,
  // 본문을 따로 그리는 활동 — 여섯 개의 해시태그는 영역이 아니라 **학생 한 명의
  // 슬라이드 한 장**이라 fields 목록으로 담을 수 없습니다. 주면 아래 본문 자리에
  // 이것을 그리고, 영역 줄(단계 축)은 꾸러미에 label이 없으면 안 그립니다.
  body = null,
  // 학생 축 단추의 툴팁('홍길동의 같은 영역으로') · 안내 줄
  stepTo = "같은 영역으로",
  hint = "같은 영역을 학생별로 넘깁니다 · 키보드 ← →",
}) {
  const [rewardCount, setRewardCount] = useState(0);
  const [awarding, setAwarding] = useState(false);

  // 과일 개수는 **그 학생 문서 한 건**만 봅니다(`subscribeMyClassRewardCount`
  // — 이름이 `My…`지만 uid를 받는 함수라 교사가 남의 것을 보는 데도 그대로
  // 씁니다). 반 전체 `rewards`를 구독하면 학생을 넘길 때마다 스물몇 건이
  // 따라옵니다. 학생이 바뀌면 그 학생 것으로 다시 겁니다.
  useEffect(() => {
    if (!classId || !student?.uid) { setRewardCount(0); return; }
    return subscribeMyClassRewardCount(classId, student.uid, setRewardCount);
  }, [classId, student?.uid]);

  const rewardMaxed = rewardCount >= REWARD_MAX;
  const canAward = !!(classId && user && student?.uid);

  async function award() {
    if (!canAward || awarding || rewardMaxed) return;
    setAwarding(true);
    try {
      // **델타로 줍니다**(절대값 아님) — 빨리 두 번 누를 때 두 번째가
      // 묻히지 않게. 자세한 것은 CLAUDE.md의 '과일 지급 이력' 절.
      await addStudentReward(classId, student.uid, +1, {
        name: student.name,
        emoji: student.emoji,
      });
    } catch {
      /* 실패해도 수업은 이어져야 합니다 — 개수는 구독이 다시 맞춰 줍니다 */
    }
    setAwarding(false);
  }

  // ← →는 **학생 축**입니다(이 창의 주인공). 단계 축에는 키를 걸지
  // 않습니다 — 한 번 눌러 둘이 함께 움직이면 어느 쪽을 넘긴 것인지 알 수
  // 없습니다(수업 화면의 슬라이드 넘기기에서 겪은 그 문제).
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowLeft" && prevStudent) { e.preventDefault(); onStudent?.(prevStudent); }
      if (e.key === "ArrowRight" && nextStudent) { e.preventDefault(); onStudent?.(nextStudent); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStudent, prevStudent, nextStudent]);

  const fields = payload?.fields ?? [];

  return (
    <div className="modal-backdrop cast-stage-backdrop" {...backdropClose(onClose)}>
      <div className="modal modal-cast-stage" role="dialog" aria-modal="true" aria-label="수업 화면">
        <div className="cast-stage-head">
          <span className="broadcast-live-dot" aria-hidden="true" />
          <h3>수업 화면</h3>
          <span className="cast-stage-who">
            {student?.name}
            {student?.studentId && <em>{student.studentId}</em>}
          </span>
          {studentTotal > 1 && (
            <span className="cast-stage-count">
              {studentIndex + 1} / {studentTotal}
            </span>
          )}
          {/* 오른쪽 끝 두 단추는 **한 묶음**입니다 — 따로 두고 저마다
              `margin-left: auto`를 주면 남는 폭을 둘이 나눠 가져 과일과
              닫기 사이가 벌어집니다. */}
          <span className="cast-stage-tools">
          {/* 과일 단추 — 발표를 듣고 그 자리에서 격려합니다. 값도 길도 카드
              격자·수업 노트의 단추와 같습니다(`nextFruit(개수)` · 델타). */}
          {canAward && (
            <button
              type="button"
              className="study-card-award-btn cast-stage-award"
              onClick={award}
              disabled={awarding || rewardMaxed}
              title={
                rewardMaxed
                  ? "이미 최대 개수예요"
                  : `${student?.name || "이 학생"}에게 과일 주기 (현재 ${rewardCount}개)`
              }
              aria-label="과일 주기"
            >
              {nextFruit(rewardCount)}
            </button>
          )}
          {/* 닫기는 방송을 안 끕니다 — 창만 걷습니다 */}
          <button type="button" className="modal-x" onClick={onClose} title="창만 닫기 (수업은 계속됩니다)">
            ×
          </button>
          </span>
        </div>

        {/* 단계 줄 — 무엇을 띄우는 중인지와, 같은 학생 안에서 단계 넘기기.
            창이 머리말 막대를 덮으므로 그 축도 여기 있어야 합니다. */}
        {payload?.label && (
        <div className="cast-stage-section">
          {payload?.letter && (
            <span className="paratext-letter" aria-hidden="true">{payload.letter}</span>
          )}
          <span className="paratext-card-title">
            <strong>{payload?.label}</strong>
            {payload?.labelEn && <em>{payload.labelEn}</em>}
          </span>
          {typeof payload?.index === "number" && payload?.total > 1 && (
            <span className="paratext-step">{payload.index + 1} / {payload.total}</span>
          )}
          {(onPrevSection || onNextSection) && (
            <span className="cast-stage-secnav">
              <button type="button" className="btn-ghost" onClick={onPrevSection} disabled={!onPrevSection}>
                ← 이전 영역
              </button>
              <button type="button" className="btn-ghost" onClick={onNextSection} disabled={!onNextSection}>
                다음 영역 →
              </button>
            </span>
          )}
        </div>
        )}

        {/* 본문 — **학생 화면과 같은 것**을 씁니다(`.entry-cast-body`).
            교사가 보는 것이 곧 칠판에 뜬 것이어야 하므로 글자 크기도 그쪽
            것을 그대로 물려받습니다. 칸을 가르는 가로줄도 따라옵니다. */}
        <div className="cast-stage-body">
          {body ?? (<>
          {payload?.prompt && <p className="entry-cast-prompt">{payload.prompt}</p>}
          {/* RAFT는 낱말 하나만 뜨면 무슨 말인지 몰라 문장을 함께 보여 줍니다 */}
          {payload?.note && <p className="raft-sentence done">{payload.note}</p>}
          <div className="entry-cast-body">
            {fields.length === 0 ? (
              <p className="paratext-read-text empty">아직 쓰지 않았어요</p>
            ) : (
              fields.map((f, i) => (
                <div key={i} className="paratext-read-field">
                  {f.label && <span className="paratext-read-label">{f.label}</span>}
                  <p className={`paratext-read-text${f.text ? "" : " empty"}`}>
                    {f.text || "아직 쓰지 않았어요"}
                  </p>
                </div>
              ))
            )}
          </div>
          </>)}
        </div>

        {/* 학생 축 — 이 창의 주인공이라 아래를 통째로 씁니다.
            툴팁이 **갈 학생을 미리** 적습니다(KWLS 크게 보기의 화살표와 같은
            방식) — 누르기 전에 누구로 넘어가는지 알 수 있어야 합니다. */}
        <div className="cast-stage-foot">
          <button
            type="button"
            className="btn-ghost cast-stage-step"
            onClick={() => onStudent?.(prevStudent)}
            disabled={!prevStudent}
            title={prevStudent ? `${prevStudent.name}의 ${stepTo}` : "앞에 학생이 없어요"}
          >
            ← 이전 학생
          </button>
          <span className="cast-stage-hint">{hint}</span>
          <button
            type="button"
            className="btn-ghost cast-stage-step"
            onClick={() => onStudent?.(nextStudent)}
            disabled={!nextStudent}
            title={nextStudent ? `${nextStudent.name}의 ${stepTo}` : "뒤에 학생이 없어요"}
          >
            다음 학생 →
          </button>
          <button type="button" className="btn-primary cast-stage-stop" onClick={onStop}>
            수업 종료
          </button>
        </div>
      </div>
    </div>
  );
}
