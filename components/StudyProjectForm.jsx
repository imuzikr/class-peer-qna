"use client";

// =============================================================
// 공부방 프로젝트 만들기 모달 (교사 전용)
// -------------------------------------------------------------
// 프로젝트 하나가 곧 학생 개인 카드 한 벌입니다. 여기서 정한 활동이
// 학생 카드 안의 입력 칸이 되므로, 제목·설명과 함께 '활동'을 이 폼에서
// 같이 받습니다. (만든 뒤에도 프로젝트 화면의 '활동 설정'에서 고칠 수
// 있지만, 학생이 이미 쓴 내용이 있으면 바꿀 수 없어 처음에 정해 두는
// 편이 낫습니다.)
//
// · 활동 유형: 개별(학생 1인 1카드) / 모둠(모둠당 1카드)
// · '연계하기' 칸 — 두 누름 단추가 한 줄에 반씩 섭니다
//   (ProjectLinkOptions — 편집 창과 같은 조각).
//     - 키워드와 연계하기: 켜면 질문방 키워드 칩을 복수로 선택
//     - 파이썬 실행기와 연계하기: 학생 카드 활동 칸에 '파이썬 실행기' 단추
//
// [여기서 만드는 것은 **원본**입니다] 반에는 아직 아무것도 안 생깁니다.
// 프로젝트는 선생님의 것이고, 반에서 쓸 때 '수업 관리' 창 프로젝트 탭의 '우리 반에
// 가져오기'가 그 반에 복사본을 하나 만듭니다(lib/store.js의 studyTemplates
// 절). 그래서 안내 카드도 여기서 깔지 않습니다 — 카드는 반에 붙는 것이라
// 복사본이 생길 때 함께 깔립니다(startStudyTemplateInClass).
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useRef, useState } from "react";
import { addStudyTemplate } from "@/lib/store";
import { getCurrentUser } from "@/lib/user";
import { IconIndividual, IconGroup } from "./StatusIcons";
import { findSameNameProject } from "@/lib/projectNames";
import ProjectNameDupModal from "./ProjectNameDupModal";
import ProjectLinkOptions from "./ProjectLinkOptions";

export default function StudyProjectForm({
  keywords = [],
  className = "",
  // 같은 이름 찾기에 쓰는 것 — 페이지가 이미 구독해 둔 값(lib/projectNames.js)
  classId = null,
  boards = [],
  templates = [],
  onClose,
  onCreated,
  onLoadExisting, // (hit) => Promise — 같은 이름의 이전 프로젝트 불러오기
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [activityType, setActivityType] = useState("individual"); // 개별 | 모둠
  // '연계하기' 두 단추 — 키워드 · 파이썬 실행기(저마다 켜고 끕니다)
  const [linkKeyword, setLinkKeyword] = useState(false);
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [pyLinked, setPyLinked] = useState(false);
  // 활동 — 빈 칸 하나로 시작해, 교사가 바로 첫 활동을 적을 수 있게 합니다.
  const [activities, setActivities] = useState([""]);
  const [saving, setSaving] = useState(false);
  // 같은 이름이 있을 때 — { name, hit }
  const [dup, setDup] = useState(null);
  const titleRef = useRef(null);

  function setActivityAt(i, value) {
    setActivities((prev) => prev.map((a, j) => (j === i ? value : a)));
  }
  function removeActivityAt(i) {
    setActivities((prev) => (prev.length === 1 ? [""] : prev.filter((_, j) => j !== i)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    // 프로젝트 이름은 서로 달라야 합니다 — 있으면 만들지 않고 되묻습니다.
    const hit = findSameNameProject(title, { classId, boards, templates });
    if (hit) {
      setDup({ name: title.trim(), hit });
      return;
    }
    setSaving(true);
    try {
      const me = getCurrentUser();
      const acts = activities.map((a) => a.trim()).filter(Boolean);
      const newId = await addStudyTemplate(me, {
        title: title.trim(),
        description: description.trim(),
        keywords: linkKeyword ? selectedKeywords : [],
        activityType,
        activities: acts,
        // 모둠 프로젝트에는 아직 안 씁니다(ProjectLinkOptions 머리 주석)
        pyLinked: pyLinked && activityType !== "group",
      });
      onCreated?.(newId);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal modal-study-board" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>➕ 새 프로젝트 만들기</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          {/* 활동 유형 — 개별(학생 1인 1카드) / 모둠(모둠 구성 후 모둠당 1카드) */}
          <div className="board-acttype-row" role="radiogroup" aria-label="활동 유형">
            <button
              type="button"
              className={`board-acttype-btn${activityType === "individual" ? " active" : ""}`}
              onClick={() => setActivityType("individual")}
            >
              <span className="board-acttype-label"><IconIndividual size={16} /> 개별 활동</span>
              <small>학생마다 카드 1장</small>
            </button>
            <button
              type="button"
              className={`board-acttype-btn${activityType === "group" ? " active" : ""}`}
              onClick={() => setActivityType("group")}
            >
              <span className="board-acttype-label"><IconGroup size={16} /> 모둠 활동</span>
              <small>모둠 구성 후 모둠당 카드 1장</small>
            </button>
          </div>

          <input
            ref={titleRef}
            type="text"
            placeholder="프로젝트 제목 (예: 이온 결합 모형 탐구)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <textarea
            className="study-board-desc-input"
            placeholder="프로젝트 안내를 적어 주세요. (선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {/* 연계하기 — 두 단추(키워드 · 파이썬 실행기), 편집 창과 같은 조각 */}
          <div className="project-form-acts project-form-links">
            <div className="project-form-acts-head">
              <span>연계하기</span>
              <small>필요한 것만 눌러 켜세요. (선택)</small>
            </div>
            <ProjectLinkOptions
              keywords={keywords}
              kwOn={linkKeyword}
              onKwOn={setLinkKeyword}
              selected={selectedKeywords}
              onSelected={setSelectedKeywords}
              pyOn={pyLinked}
              onPyOn={setPyLinked}
              isGroup={activityType === "group"}
            />
          </div>

          {/* 활동 — 학생 개인 카드에 그대로 입력 칸으로 만들어집니다 */}
          <div className="project-form-acts">
            <div className="project-form-acts-head">
              <span>활동</span>
              <small>학생 개인 카드에 이 순서대로 입력 칸이 만들어져요. (선택)</small>
            </div>
            <div className="study-activity-list">
              {activities.map((act, i) => (
                <div key={i} className="study-activity-item">
                  <span className="study-activity-label">활동 {i + 1}</span>
                  <input
                    className="study-activity-input"
                    value={act}
                    onChange={(e) => setActivityAt(i, e.target.value)}
                    placeholder={`활동 ${i + 1} 내용을 입력하세요`}
                  />
                  <button
                    type="button"
                    className="study-activity-del"
                    onClick={() => removeActivityAt(i)}
                    aria-label={`활동 ${i + 1} 삭제`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="study-activity-add"
              onClick={() => setActivities((prev) => [...prev, ""])}
            >
              + 활동 추가
            </button>
          </div>

          {/* 누르기 전에 무엇이 생기는지 말해 둡니다 — 예전에는 누르면 곧장
              이 반에 열렸으므로, 말없이 바꾸면 '만들었는데 반에 없다'로 읽힙니다. */}
          <p className="project-form-where">
            원본으로 만들어져요. 반에는 아직 아무것도 안 생기고, 이어서 뜨는
            ‘수업 관리’의 프로젝트 탭에서 <strong>우리 반에 가져오기</strong>를
            누르면 {className ? `‘${className}’ ` : ""}학생 화면에 열립니다.
          </p>

          <button type="submit" className="btn-primary" disabled={saving || !title.trim()}>
            {saving ? "만드는 중..." : "프로젝트 만들기"}
          </button>
        </form>

        {dup && (
          <ProjectNameDupModal
            name={dup.name}
            hit={dup.hit}
            // 취소 — 이름 칸으로 돌아가 고쳐 쓰게 합니다(적어 둔 활동은 그대로).
            onCancel={() => {
              setDup(null);
              requestAnimationFrame(() => {
                titleRef.current?.focus();
                titleRef.current?.select();
              });
            }}
            onLoad={async () => {
              await onLoadExisting?.(dup.hit);
              onClose();
            }}
          />
        )}
      </div>
    </div>
  );
}
