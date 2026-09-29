"use client";

// =============================================================
// 프로젝트 원본 편집 (교사) — '수업 관리' 창 프로젝트 탭의 원본 줄 '편집'
// -------------------------------------------------------------
// 원본을 곧바로 고치는 자리가 없었습니다. 활동 목록과 연계는 반 복사본을
// 고치면 원본에 따라 적혔지만(syncTemplateActivities · syncTemplateLinks),
// **제목과 안내는 원본에 닿는 길이 아예 없었고**, 아직 어느 반에도 가져오지
// 않은 원본은 거쳐 갈 복사본이 없어 지우는 것 말고는 손댈 수 없었습니다.
//
// 고치는 것: 제목 · 안내 · 활동 목록 · 연계(키워드 · 파이썬 실행기) ·
// 활동 예시 코드(파이썬 연계일 때 — components/ActivityExamples.jsx).
// 유형(개별/모둠)은 안 둡니다 — 복사본 편집 창과 같은 선입니다.
//
// [이미 가져간 반에는 번지지 않습니다] 학생 카드가 활동을 **자리**로 읽고
// 쓰므로, 원본의 활동 순서가 이미 쓰는 반에 번지면 쓴 글이 엉뚱한 칸으로
// 밀립니다. 그래서 여기서 고친 것은 **다음에 가져오는 반부터** 적용되고,
// 창이 그 사실과 이미 가져간 반 이름을 적어 둡니다.
//
// [예시 코드만은 이미 가져간 반에도 곧바로 닿습니다] 예시는 학생이 쓴 글의
// 자리를 옮기지 않는 **보여 주기용**이고, 활동 **이름**으로 짚으므로(lib/
// activityExamples.js) 그 반의 활동 목록이 달라도 엉뚱한 칸에 붙지 않습니다.
// 번지지 않으면 이미 가져간 반에서 예시를 적었는데 학생 카드에 안 떠 고장으로
// 보입니다. 원본 저장이 끝난 뒤 복사본마다 따로 쓰고(`copies`), 늦거나
// 실패해도(보관된 반 등) 창을 붙잡지 않습니다.
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
import { updateStudyTemplate, updateStudyBoard } from "@/lib/store";
import { backdropClose } from "@/lib/modal";
import { projectNameKey } from "@/lib/projectNames";
import { withAckTimeout, saveErrorMessage } from "@/lib/ackTimeout";
import ProjectLinkOptions from "./ProjectLinkOptions";
import { examplesToMap, examplesFromMap, examplesFor } from "@/lib/activityExamples";
import { ActivityListField, ExampleCodePanel } from "./ActivityExamples";

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
  copies = [],      // 이 원본의 복사본(내가 맡은 보관 안 된 반) — 예시 코드를 함께 적습니다
  onClose,
  onSaved,
}) {
  const [title, setTitle] = useState(template?.title ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [activities, setActivities] = useState(() =>
    template?.activities?.length ? [...template.activities] : [""]
  );
  // 활동 줄과 나란한 예시 코드(창 안에서만 배열, 저장은 이름 → 코드 맵)
  const [examples, setExamples] = useState(() =>
    template?.activities?.length ? examplesFromMap(template.activities, template.activityExamples) : [""]
  );
  const [exIdx, setExIdx] = useState(null);
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

  const withExamples = pyOn && !isGroup;

  async function handleSubmit(e) {
    e.preventDefault();
    if (blocked || saving) return;
    setSaving(true);
    setError("");
    try {
      const exMap = examplesToMap(activities, examples);
      // 서버 답을 끝없이 기다리지 않습니다 — 답이 안 오면 단추가 '저장 중…'에
      // 멈춘 채 아무 말도 없었습니다(실제 신고, lib/ackTimeout.js).
      await withAckTimeout(
        updateStudyTemplate(template.id, {
          title: trimmed,
          description: description.trim(),
          activities: activities.map((a) => a.trim()).filter(Boolean),
          keywords: kwOn ? selectedKeywords : [],
          pyLinked: pyOn && !isGroup,
          activityExamples: exMap,
        })
      );
      // 예시 코드는 이미 가져간 반에도(머리 주석) — 기다리지 않습니다.
      copies.forEach((b) => {
        const next = examplesFor(b.activities, exMap);
        const cur = examplesFor(b.activities, b.activityExamples);
        if (JSON.stringify(next) === JSON.stringify(cur)) return;
        updateStudyBoard(b.id, { activityExamples: next }).catch((err) =>
          console.warn("[공부방] 복사본 예시 코드:", b.id, err?.code, err?.message)
        );
      });
      onSaved?.();
      onClose?.();
    } catch (err) {
      // 실패하면 창을 닫지 않습니다 — 고친 것을 잃지 않게.
      console.warn("[공부방] 원본 저장:", err?.code, err?.message);
      setError(saveErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop tpl-edit-backdrop" {...backdropClose(onClose)}>
      <div
        className={`act-ex-shell${withExamples && exIdx != null ? " open" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
      <div className="modal modal-study-board">
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
            {usedClasses.length > 0 && withExamples && " 예시 코드만은 이미 가져간 반의 같은 이름 활동에도 곧바로 보여요."}
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
            <ActivityListField
              activities={activities}
              onActivities={setActivities}
              examples={examples}
              onExamples={setExamples}
              withExamples={withExamples}
              exIdx={exIdx}
              onExIdx={setExIdx}
            />
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
      {withExamples && (
        <ExampleCodePanel
          index={exIdx}
          activityName={exIdx != null ? String(activities[exIdx] ?? "").trim() : ""}
          code={exIdx != null ? examples[exIdx] ?? "" : ""}
          onCode={(v) => setExamples((prev) => prev.map((x, j) => (j === exIdx ? v : x)))}
          onClose={() => setExIdx(null)}
        />
      )}
      </div>
    </div>,
    document.body
  );
}
