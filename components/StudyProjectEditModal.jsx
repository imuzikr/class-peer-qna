"use client";

// =============================================================
// 프로젝트 편집 — 제목 · 활동 안내 (교사 전용)
// -------------------------------------------------------------
// 대시보드의 프로젝트 카드에 달린 '편집'이 엽니다.
//
// [왜 필요했나]
// 제목을 고치는 길이 **프로젝트 상세에서 제목을 더블 클릭**하는 것뿐이었고
// (`StudyProjectView`의 `startEditTitle`), 화면 어디에도 그 사실이 적혀
// 있지 않아 '제목은 못 고치는 것'으로 보였습니다(실제 신고). 활동 안내도
// 설정(⚙) 패널을 펼쳐야 나오는 자리라, 목록에서 카드를 보다가 고치려면
// 프로젝트를 열고 패널을 펴는 두 단계를 지나야 했습니다.
//
// [고치는 것은 둘뿐입니다 — 제목과 활동 안내]
// 카드에 글자로 적히는 것이 그 둘이고, 둘 다 교사가 쓰는 설명입니다.
// **활동 목록은 여기서 안 고칩니다** — 활동을 바꾸는 일은 '학생이 이미 쓴
// 내용이 있는가'를 따져야 하고(`LessonMode`의 `saveBoardActs`), 잠금 배열
// (`activityLocks`)과 자리를 맞춰야 합니다. 그 자리는 프로젝트 상세의 활동
// 패널과 수업 모드에 이미 있습니다. 유형(개별/모둠)과 공개 범위도 두지
// 않습니다 — 유형은 이미 만든 카드의 모양을 바꾸는 일이고, 공개 범위는
// 설정 패널의 토글이 그 자리에서 곧바로 저장합니다.
//
// [삭제도 여기서] 프로젝트를 지우려면 프로젝트를 열어 설정(⚙)을 펴야
// 했습니다. 카드의 '편집'이 '이 프로젝트를 손보는 자리'이므로 삭제도 함께
// 둡니다. 곧바로 지우지 않고 **휴지통으로 보냅니다**(`deleteStudyBoard` —
// 상세 화면의 '프로젝트 삭제'와 같은 함수). 원본이 있는 프로젝트라도 원본은
// 그대로 남아, 수업 관리의 프로젝트 탭에서 다시 시작할 수 있습니다.
//
// [규칙을 안 건드립니다] `studyBoards`의 update가
// `ownsClassEditable(classId)`만 보고 필드 목록을 못 박아 두지 않아,
// 제목·안내를 고치는 데 규칙이 그대로 통과합니다(확인함).
// =============================================================
import { useState } from "react";
import { updateStudyBoard, deleteStudyBoard } from "@/lib/store";
import { backdropClose } from "@/lib/modal";
import ConfirmModal from "./ConfirmModal";
import { IconTrash } from "./StatusIcons";

// 제목 길이는 상세 화면의 인라인 수정(`.study-title-inline`)과 **같은 40자**
// 입니다 — 두 자리가 다르면 한쪽에서 쓴 제목이 다른 쪽에서 잘립니다.
const TITLE_MAX = 40;
const DESC_MAX = 500;

export default function StudyProjectEditModal({ board, onClose, onSaved, onDeleted }) {
  const [title, setTitle] = useState(board?.title ?? "");
  const [description, setDescription] = useState(board?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  const trimmed = title.trim();
  // 제목이 비면 카드에 이름이 없어져 목록에서 무엇인지 알 수 없습니다.
  const blocked = trimmed.length === 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (blocked || saving) return;
    setSaving(true);
    setError("");
    try {
      await updateStudyBoard(board.id, {
        title: trimmed,
        description: description.trim(),
      });
      onSaved?.();
      onClose?.();
    } catch (err) {
      // 실패하면 창을 닫지 않습니다 — 쓴 글을 잃지 않게.
      setError(`저장하지 못했어요: ${err?.message ?? "알 수 없는 오류"}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setConfirmDel(false);
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await deleteStudyBoard(board.id);
      onDeleted?.(board);
      onClose?.();
    } catch (err) {
      setError(`삭제하지 못했어요: ${err?.message ?? "알 수 없는 오류"}`);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>✏️ 프로젝트 편집</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          {/* 고치러 온 창이라 칸이 이미 차 있습니다 — placeholder만으로는
              무슨 칸인지 안 보여 이름표를 답니다(만들기 창과 다른 점). */}
          <div className="study-edit-field">
            <label className="study-edit-label" htmlFor="study-edit-title">제목</label>
            <input
              id="study-edit-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              placeholder="프로젝트 제목 (예: 이온 결합 모형 탐구)"
              autoFocus
            />
          </div>

          <div className="study-edit-field">
            <label className="study-edit-label" htmlFor="study-edit-desc">
              활동 안내 <small>카드 목록과 프로젝트 화면에 그대로 보여요. (선택)</small>
            </label>
            <textarea
              id="study-edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESC_MAX}
              rows={4}
              placeholder="이 프로젝트에서 무엇을 하는지 적어 주세요."
            />
          </div>

          {/* 활동을 여기서 안 고친다는 것을 적어 둡니다 — 안 적으면 '편집'인데
              활동이 없는 것이 빠뜨린 자리로 보입니다. */}
          <p className="study-edit-note">
            활동 목록과 잠금은 프로젝트를 열어 왼쪽 ‘활동’ 패널에서 고칩니다.
          </p>

          {error && <p className="form-error">{error}</p>}

          {/* 삭제 — 저장·취소와 갈라 선 아래 왼쪽에 둡니다. 나란히 두면 '저장'을
              누르려던 손이 미끄러집니다. 누르면 한 번 더 묻습니다. */}
          <div className="study-edit-danger">
            <button
              type="button"
              className="study-trash-btn danger"
              onClick={() => setConfirmDel(true)}
              disabled={saving}
            >
              <IconTrash size={14} /> 프로젝트 삭제
            </button>
            <span>휴지통으로 보내요 — 대시보드 아래 ‘🗑 휴지통’에서 되돌릴 수 있어요.</span>
          </div>

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

      {confirmDel && (
        <ConfirmModal
          title="프로젝트 삭제"
          preview={board?.title ?? ""}
          description={
            "이 반의 프로젝트를 휴지통으로 보냅니다. 학생 카드도 함께 들어갑니다.\n" +
            "대시보드 아래 ‘🗑 휴지통’에서 되돌릴 수 있어요." +
            (board?.templateId
              ? "\n원본은 그대로 남아 ‘수업 관리’의 프로젝트 탭에서 다시 시작할 수 있어요."
              : "")
          }
          confirmLabel="휴지통으로 보내기"
          danger
          onConfirm={handleDelete}
          onClose={() => setConfirmDel(false)}
        />
      )}
    </div>
  );
}
