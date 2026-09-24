"use client";

// =============================================================
// 프로젝트 연계 두 단추 — 키워드 · 파이썬 실행기
// -------------------------------------------------------------
// 만들기 창(StudyProjectForm)과 편집 창(StudyProjectEditModal)이 **같은 조각**을
// 씁니다. 두 창의 모양이 다르면 만들 때 본 것을 고칠 때 다시 찾아야 합니다.
// '연계하기'라는 이름표는 부르는 쪽이 답니다(두 창의 머리 모양이 달라서).
//
// [모양] 두 선택지가 **한 줄에 반씩 선 누름 단추**입니다(`aria-pressed`).
// 꺼져 있으면 연한 살구색, 누르면 살구색으로 채워지며 켜집니다. 한때 '연계하기'
// 토글을 먼저 켜야 그 아래 체크 상자 두 줄이 나타났는데, 켜는 스위치가 두
// 겹이라 '연계하기를 켰는데 왜 아무것도 안 되지'가 되었습니다 — 지금은 단추
// 하나가 곧 그 기능 하나입니다.
//
// · 키워드와 연계하기 — 켜면 두 단추 아래에 질문방 키워드 칩이 펼쳐지고, 고른
//   키워드로 학생 카드 아래에 '질문하기 · 관련 질문'이 섭니다.
// · 파이썬 실행기와 연계하기 — 켜면 학생 카드의 활동 칸 오른쪽 위와 '크게
//   쓰기' 창의 서식 줄 끝에 '파이썬 실행기' 단추가 섭니다. 누르면 그 활동을
//   보낼 곳으로 잡은 실행기 서랍이 열립니다(`StudyMyActivityCard`).
//   **모둠 프로젝트에는 아직 안 씁니다** — 실행기의 '활동으로 보내기'가
//   모둠 카드에는 못 보내므로(규칙이 학생의 카드 생성을 막습니다) 단추만 서고
//   보내기가 막히면 고장으로 보입니다. 그래서 여기서 꺼 두고 까닭을 적습니다.
// =============================================================
import { useState } from "react";
import { addKeyword } from "@/lib/store";
import { IconPythonRunner } from "./StatusIcons";

export default function ProjectLinkOptions({
  keywords = [], // 질문방의 키워드 목록 전체
  kwOn,
  onKwOn,
  selected = [],
  onSelected,
  pyOn,
  onPyOn,
  isGroup = false,
}) {
  const [addingKw, setAddingKw] = useState(false);
  const [newKw, setNewKw] = useState("");

  function toggleKeyword(kw) {
    onSelected(selected.includes(kw) ? selected.filter((k) => k !== kw) : [...selected, kw]);
  }

  // 새 키워드 — 전역 키워드 목록에 만들고(이미 있으면 생략) 곧바로 고릅니다.
  async function handleAddKeyword() {
    const name = newKw.trim().replace(/^#\s*/, "");
    if (!name) return;
    if (!keywords.includes(name)) await addKeyword(name);
    onSelected(selected.includes(name) ? selected : [...selected, name]);
    setNewKw("");
    setAddingKw(false);
  }

  // 고른 키워드 중 목록에 없는 것(지워진 키워드)도 칩으로 남겨, 빼는 길을 둡니다.
  const chips = [...keywords, ...selected.filter((k) => !keywords.includes(k))];
  const pyActive = pyOn && !isGroup;

  return (
    <div className="project-links">
      <div className="project-link-grid">
        <button
          type="button"
          className={`project-link-btn${kwOn ? " on" : ""}`}
          aria-pressed={kwOn}
          onClick={() => onKwOn(!kwOn)}
        >
          <strong># 키워드와 연계하기</strong>
          <small>학생 카드 아래에 ‘질문하기 · 관련 질문’이 생겨요</small>
        </button>
        <button
          type="button"
          className={`project-link-btn${pyActive ? " on" : ""}`}
          aria-pressed={pyActive}
          disabled={isGroup}
          onClick={() => onPyOn(!pyOn)}
        >
          <strong>
            <IconPythonRunner size={16} /> 파이썬 실행기와 연계하기
          </strong>
          <small>
            {isGroup
              ? "모둠 프로젝트에는 아직 쓸 수 없어요"
              : "학생 카드의 활동 칸에 ‘파이썬 실행기’ 단추가 생겨요"}
          </small>
        </button>
      </div>

      {kwOn && (
        <div className="study-keyword-chips project-link-chips">
          {chips.map((kw) => (
            <button
              key={kw}
              type="button"
              className={`study-keyword-chip${selected.includes(kw) ? " selected" : ""}`}
              onClick={() => toggleKeyword(kw)}
            >
              # {kw}
            </button>
          ))}
          {addingKw ? (
            <span className="study-keyword-add-inline">
              <input
                type="text"
                value={newKw}
                onChange={(e) => setNewKw(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleAddKeyword(); }
                  if (e.key === "Escape") { e.stopPropagation(); setAddingKw(false); setNewKw(""); }
                }}
                placeholder="새 키워드"
                autoFocus
              />
              <button type="button" onClick={handleAddKeyword}>추가</button>
            </span>
          ) : (
            <button
              type="button"
              className="study-keyword-chip study-keyword-add"
              onClick={() => setAddingKw(true)}
              title="키워드 추가"
            >
              +
            </button>
          )}
        </div>
      )}
    </div>
  );
}
