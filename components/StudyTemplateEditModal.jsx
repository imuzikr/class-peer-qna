"use client";

// =============================================================
// 프로젝트 원본 편집 (교사) — '수업 관리' 창 프로젝트 탭의 원본 줄 '편집'
// -------------------------------------------------------------
// 원본을 곧바로 고치는 자리가 없었습니다. 활동 목록과 연계는 반 복사본을
// 고치면 원본에 따라 적혔지만(syncTemplateActivities · syncTemplateLinks),
// **제목과 안내는 원본에 닿는 길이 아예 없었고**, 아직 어느 반에도 가져오지
// 않은 원본은 거쳐 갈 복사본이 없어 지우는 것 말고는 손댈 수 없었습니다.
//
// 고치는 것: 제목 · 안내 · 활동 목록 · 연계(키워드 · 파이썬 실행기).
// 유형(개별/모둠)은 안 둡니다 — 복사본 편집 창과 같은 선입니다.
//
// [이미 가져간 반에는 번지지 않습니다] 학생 카드가 활동을 **자리**로 읽고
// 쓰므로, 원본의 활동 순서가 이미 쓰는 반에 번지면 쓴 글이 엉뚱한 칸으로
// 밀립니다. 그래서 여기서 고친 것은 **다음에 가져오는 반부터** 적용되고,
// 창이 그 사실과 이미 가져간 반 이름을 적어 둡니다.
//
// [이름은 원본끼리 달라야 합니다] 만드는 세 자리가 같은 이름을 막는 것과
// 같은 까닭입니다 — 같은 이름의 원본이 둘이면 가져오기 목록에서 가를 수
// 없습니다. 견주는 기준도 같습니다(projectNameKey).
//
// [body에 포털로 띄웁니다] '수업 관리' 창 안에서 열리는데, 그 창과 같은
// 배경 클래스라 DOM 차례가 뒤여야 위에 섭니다.
//
// [규칙을 안 건드립니다] `studyTemplates`는 만든 교사가 고칠 수 있고
// `ownerId`만 못 바꿉니다. 여기서 보내는 칸에 `ownerId`가 없습니다.
// =============================================================
import { useState } from "react";
import { createPortal } from "react-dom";
import { updateStudyTemplate } from "@/lib/store";
import { backdropClose } from "@/lib/modal";
import { projectNameKey } from "@/lib/projectNames";
import ProjectLinkOptions from "./ProjectLinkOptions";

// 복사본 편집 창(StudyProjectEditModal)과 같은 길이 — 두 자리가 다르면 한쪽에서
// 쓴 제목이 다른 쪽에서 잘립니다.
const TITLE_MAX = 40;
const DESC_MAX = 500;

function keywordsOf(t) {
  if (Array.isArray(t?.keywords)) return t.keywords;
  return t?.keyword ? [t.keyword] : [];
}

export default function StudyTemplateEditModal({
  template,
  templates = [],   // 이름이 겹치는지 보는 데
  keywords = [],    // 질문방 키워드 목록 전체
  usedClasses = [], // 이미 가져간 반 이름들
  onClose,
  onSaved,
}) {
  const [title, setTitle] = useState(template?.title ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [activities, setActivities] = useState(() =>
    template?.activities?.length ? [...template.activities] : [""]
  );
  const [selectedKeywords, setSelectedKeywords] = useState(() => keywordsOf(template));
  const [kwOn, setKwOn] = useState(() => keywordsOf(template).length > 0);
  const [pyOn, setPyOn] = useState(!!template?.pyLinked);
  const isGroup = template?.activityType === "group";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const trimmed = title.trim();
  const dupName =
    trimmed &&
    templates.some(
      (t) => t.id !== template?.id && projectNameKey(t.title) === projectNameKey(trimmed)
    );
  const blocked = !trimmed || dupName;

  function setActivityAt(i, value) {
    setActivities((prev) => prev.map((a, j) => (j === i ? value : a)));
  }
  function removeActivityAt(i) {
    setActivities((prev) => (prev.length === 1 ? [""] : prev.filter((_, j) => j !== i)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (blocked || saving) return;
    setSaving(true);
    setError("");
    try {
      await updateStudyTemplate(template.id, {
        title: trimmed,
        description: description.trim(),
        activities: activities.map((a) => a.trim()).filter(Boolean),
        keywords: kwOn ? selectedKeywords : [],
        pyLinked: pyOn && !isGroup,
      });
      onSaved?.();
      onClose?.();
    } catch (err) {
      // 실패하면 창을 닫지 않습니다 — 고친 것을 잃지 않게.
      setError(`저장하지 못했어요: ${err?.message ?? "알 수 없는 오류"}`);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop tpl-edit-backdrop" {...backdropClose(onClose)}>
      <div className="modal modal-study-board" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>✏️ 프로젝트 원본 편집</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <p className="tpl-edit-scope">
            {usedClasses.length > 0
              ? `이미 가져간 반(${usedClasses.join(", ")})은 그대로 두고, 다음에 가져오는 반부터 고친 대로 열려요.`
              : "다음에 가져오는 반부터 고친 대로 열려요."}
          </p>

          <div className="study-edit-field">
            <label className="study-edit-label" htmlFor="tpl-edit-title">제목</label>
            <input
              id="tpl-edit-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              placeholder="프로젝트 제목 (예: 이온 결합 모형 탐구)"
              autoFocus
            />
            {dupName && <p className="form-error">같은 이름의 원본이 이미 있어요.</p>}
          </div>

          <div className="study-edit-field">
            <label className="study-edit-label" htmlFor="tpl-edit-desc">
              안내 <small>(선택)</small>
            </label>
            <textarea
              id="tpl-edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESC_MAX}
              rows={3}
              placeholder="이 프로젝트에서 무엇을 하는지 적어 주세요."
            />
          </div>

          {/* 활동 — 만들기 창과 같은 모양(같은 클래스) */}
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

          <div className="project-form-acts project-form-links">
            <div className="project-form-acts-head">
              <span>연계하기</span>
              <small>필요한 것만 눌러 켜세요. (선택)</small>
            </div>
            <ProjectLinkOptions
              keywords={keywords}
              kwOn={kwOn}
              onKwOn={setKwOn}
              selected={selectedKeywords}
              onSelected={setSelectedKeywords}
              pyOn={pyOn}
              onPyOn={setPyOn}
              isGroup={isGroup}
            />
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn-primary" disabled={blocked || saving}>
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
