"use client";

import { backdropClose } from "@/lib/modal";
import { useEffect, useState } from "react";
import {
  updateStudentProfile,
  deleteStudent,
  fetchStudentClassIds,
  addStudentToClass,
  removeStudentFromClass,
} from "@/lib/store";
import ConfirmModal from "./ConfirmModal";
import { IconTrash } from "./StatusIcons";

export const ANIMALS = [
  { name: "달팽이", emoji: "🐌" },
  { name: "돌고래", emoji: "🐬" },
  { name: "판다", emoji: "🐼" },
  { name: "나무늘보", emoji: "🦥" },
  { name: "고슴도치", emoji: "🦔" },
  { name: "수달", emoji: "🦦" },
  { name: "펭귄", emoji: "🐧" },
  { name: "부엉이", emoji: "🦉" },
  { name: "다람쥐", emoji: "🐿️" },
  { name: "고래", emoji: "🐋" },
  { name: "여우", emoji: "🦊" },
  { name: "거북이", emoji: "🐢" },
  { name: "문어", emoji: "🐙" },
  { name: "코알라", emoji: "🐨" },
  { name: "토끼", emoji: "🐰" },
  { name: "햄스터", emoji: "🐹" },
];

export default function StudentEditModal({ student, classes = [], onClose }) {
  const isTeacherTarget = student.role === "teacher" || student.role === "admin";
  const roleWord = isTeacherTarget ? "선생님" : "학생";
  const [editing, setEditing] = useState(false);
  const [emoji, setEmoji] = useState(student.emoji);
  const [name, setName] = useState(student.name);
  const [realName, setRealName] = useState(student.realName ?? "");
  const [studentId, setStudentId] = useState(student.studentId ?? "");
  const [email, setEmail] = useState(student.email ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  // ── 반 편성 ─────────────────────────────────────────────────
  // 프로필 칸들과 달리 **누르는 즉시 저장**합니다. 소속은 users 문서가 아니라
  // memberships라 '저장' 한 번에 함께 담을 수 없고, 담는 척하면 취소를 눌러도
  // 이미 바뀐 것이 되돌아오지 않습니다. 그래서 아예 따로 두고 곧바로 씁니다.
  // null = 아직 안 읽음(빈 배열과 구분 — 소속이 없는 것처럼 보이면 안 됩니다).
  const [myClassIds, setMyClassIds] = useState(null);
  const [classBusy, setClassBusy] = useState(null); // 지금 바꾸는 중인 반 id
  const [classError, setClassError] = useState("");
  const editableClasses = classes.filter((c) => !c.archived);

  useEffect(() => {
    if (isTeacherTarget || classes.length === 0) { setMyClassIds([]); return; }
    let cancelled = false;
    fetchStudentClassIds(student.id, classes.map((c) => c.id)).then((ids) => {
      if (!cancelled) setMyClassIds(ids);
    });
    return () => { cancelled = true; };
    // classes는 부모가 매번 새 배열로 만들 수 있어 id 목록을 열쇠로 씁니다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id, isTeacherTarget, classes.map((c) => c.id).join(",")]);

  async function toggleClass(cls) {
    if (classBusy || myClassIds === null) return;
    const inClass = myClassIds.includes(cls.id);
    setClassBusy(cls.id);
    setClassError("");
    try {
      if (inClass) {
        await removeStudentFromClass(student.id, cls.id);
        setMyClassIds((ids) => ids.filter((id) => id !== cls.id));
      } else {
        await addStudentToClass(student.id, cls.id);
        setMyClassIds((ids) => [...ids, cls.id]);
      }
    } catch (e) {
      setClassError(
        e?.code === "permission-denied"
          ? "내가 개설한 반만 편성을 바꿀 수 있어요."
          : `반 편성을 바꾸지 못했어요: ${e?.message ?? "알 수 없는 오류"}`
      );
    } finally {
      setClassBusy(null);
    }
  }

  function handleStartEdit() {
    setEditing(true);
  }

  function handleCancelEdit() {
    setEmoji(student.emoji);
    setName(student.name);
    setRealName(student.realName ?? "");
    setStudentId(student.studentId ?? "");
    setEmail(student.email ?? "");
    setPickerOpen(false);
    setEditing(false);
  }

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await updateStudentProfile(student.id, {
        name: name.trim(),
        emoji,
        realName: realName.trim(),
        studentId: studentId.trim(),
        email: email.trim(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteStudent(student.id);
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      // 실패를 조용히 넘기면 확인 모달만 그대로 떠 있는 것처럼 보입니다 —
      // 확인 모달은 닫고, 프로필 모달에 원인을 남겨 교사가 읽고 직접
      // 닫게 합니다(바로 onClose하면 메시지도 같이 사라져 버립니다).
      setConfirmDelete(false);
      setDeleteError(
        e?.code === "functions/permission-denied"
          ? "담당하는 반의 학생만 탈퇴 처리할 수 있어요. 관리자에게 요청해 주세요."
          : e?.partial
          ? e.message
          : `탈퇴 처리에 실패했어요: ${e?.message ?? "알 수 없는 오류"}`
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="modal-backdrop" {...backdropClose(onClose)}>
        <div
          className="modal student-edit-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="btn-close modal-close-float"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>

          <h2 className="student-edit-title">
            {editing ? "프로필 편집" : "프로필"}
          </h2>

          <div className="student-edit-emoji-row">
            <div className="student-edit-emoji-wrap">
              {editing ? (
                <button
                  type="button"
                  className="student-edit-emoji-btn"
                  onClick={() => setPickerOpen((v) => !v)}
                  title="이모지 변경"
                >
                  {emoji}
                </button>
              ) : (
                <div className="student-edit-emoji-btn readonly">{emoji}</div>
              )}
              {pickerOpen && editing && (
                <div className="emoji-picker" role="listbox" aria-label="이모지 선택">
                  {ANIMALS.map((a) => (
                    <button
                      key={a.emoji}
                      type="button"
                      role="option"
                      aria-selected={emoji === a.emoji}
                      className={`emoji-pick-btn${emoji === a.emoji ? " active" : ""}`}
                      title={a.name}
                      onClick={() => {
                        setEmoji(a.emoji);
                        setPickerOpen(false);
                      }}
                    >
                      {a.emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {editing && <p className="student-edit-emoji-hint">클릭해서 변경</p>}
          </div>

          <div className="student-edit-fields">
            <div className="student-edit-field">
              <span>닉네임</span>
              {editing ? (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="익명 닉네임"
                  maxLength={30}
                  autoFocus
                />
              ) : (
                <div className="student-edit-value">{name || "—"}</div>
              )}
            </div>
            <div className="student-edit-field">
              <span>실명</span>
              {editing ? (
                <input
                  type="text"
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  placeholder="실명 (선택)"
                  maxLength={30}
                />
              ) : (
                <div className="student-edit-value">{realName || "—"}</div>
              )}
            </div>
            {!isTeacherTarget && (
              <div className="student-edit-field">
                <span>학번</span>
                {editing ? (
                  <input
                    type="text"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="학번 (예: 30105)"
                    maxLength={20}
                  />
                ) : (
                  <div className="student-edit-value">{studentId || "—"}</div>
                )}
              </div>
            )}
            <div className="student-edit-field">
              <span>이메일</span>
              {editing ? (
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="구글 계정 이메일 (선택)"
                  maxLength={100}
                />
              ) : (
                <div className="student-edit-value">{email || "—"}</div>
              )}
            </div>
          </div>

          {/* 반 편성 — 학기 초에 학생이 코드를 잘못 눌러 옆 반에 들어간 것을
              여기서 고칩니다. 위 칸들과 달리 **누르는 즉시** 저장됩니다
              (소속은 다른 문서라 '저장' 한 번에 함께 담을 수 없습니다). */}
          {!isTeacherTarget && editableClasses.length > 0 && (
            <div className="student-edit-classes">
              <span className="student-edit-classes-label">반 편성</span>
              {myClassIds === null ? (
                <p className="student-edit-classes-hint">불러오는 중이에요…</p>
              ) : (
                <>
                  <div className="student-edit-class-row">
                    {editableClasses.map((c) => {
                      const on = myClassIds.includes(c.id);
                      const busy = classBusy === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`student-edit-class${on ? " on" : ""}`}
                          onClick={() => toggleClass(c)}
                          disabled={!!classBusy}
                          aria-pressed={on}
                          title={on ? `${c.name}에서 빼기` : `${c.name}에 넣기`}
                        >
                          {busy ? "…" : c.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="student-edit-classes-hint">
                    누르면 바로 바뀝니다. 반에서 빼도 그 학생이 쓴 글은 지워지지
                    않아요 — 다시 넣으면 그대로 돌아옵니다.
                  </p>
                </>
              )}
              {classError && (
                <p className="form-error" role="alert">{classError}</p>
              )}
            </div>
          )}

          <div className="student-edit-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={editing ? handleCancelEdit : onClose}
            >
              취소
            </button>
            {editing ? (
              <button
                type="button"
                className="btn-primary"
                onClick={handleSave}
                disabled={!name.trim() || saving}
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                onClick={handleStartEdit}
              >
                편집
              </button>
            )}
          </div>

          <div className="student-edit-danger">
            <button
              type="button"
              className="btn-ghost qa-delete"
              onClick={() => {
                setDeleteError("");
                setConfirmDelete(true);
              }}
              disabled={deleting}
            >
              <IconTrash size={15} /> 탈퇴 처리
            </button>
            {deleteError && (
              <p className="form-error" role="alert">
                {deleteError}
              </p>
            )}
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title={`${roleWord} 탈퇴 처리`}
          preview={`${emoji} ${isTeacherTarget ? realName || "선생님" : name}`}
          description={`이 ${roleWord}의 모든 게시물·활동 데이터와 프로필이\n영구 삭제됩니다. 복구할 수 없습니다.`}
          confirmLabel={deleting ? "처리 중…" : "탈퇴 처리"}
          danger
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
