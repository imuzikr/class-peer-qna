"use client";

// =============================================================
// 역할 관리 (관리자 전용)
// -------------------------------------------------------------
// · 선생님 가입 신청 승인/거절 (상단 대기 목록)
// · 사용자를 검색·선택해 역할(학생/교사/관리자) 부여
// 실제 권한 변경은 Cloud Functions(setUserRole)가 서버에서 커스텀
// 클레임으로 부여합니다. (대상 계정은 재로그인해야 반영)
// =============================================================
import { useMemo, useState } from "react";
import {
  assignUserRole,
  approveTeacherRequest,
  dismissTeacherRequest,
} from "@/lib/store";

const ROLE_LABELS = { student: "학생", teacher: "교사", admin: "관리자" };

function errorText(err) {
  const code = err?.code ?? "";
  if (code === "functions/permission-denied")
    return "역할을 부여할 권한이 없습니다. (실제 관리자 계정으로 로그인했는지 확인해 주세요)";
  if (code === "functions/not-found")
    return "setUserRole 함수를 찾을 수 없어요. Cloud Functions가 배포되지 않은 것 같습니다.";
  if (code === "functions/unauthenticated")
    return "로그인 상태가 아닙니다. 다시 로그인한 뒤 시도해 주세요.";
  return `처리에 실패했어요. (${code || err?.message || "알 수 없는 오류"})`;
}

function userLabel(u) {
  return u.realName || u.displayName || u.email || u.uid;
}

export default function RoleManagerModal({ directory, onClose }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null); // 선택된 사용자 객체
  const [listOpen, setListOpen] = useState(false);
  const [role, setRole] = useState("teacher");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null); // { type, text }

  // 선생님 승인 대기 목록
  const pending = useMemo(
    () =>
      directory.filter(
        (u) => u.requestedRole === "teacher" && u.role !== "teacher" && u.role !== "admin"
      ),
    [directory]
  );

  // 검색 필터 — 실명/닉네임/이메일/UID 부분일치
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...directory].sort((a, b) =>
      userLabel(a).localeCompare(userLabel(b), "ko")
    );
    const filtered = q
      ? base.filter((u) =>
          [u.realName, u.displayName, u.email, u.uid]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(q))
        )
      : base;
    return filtered.slice(0, 8);
  }, [query, directory]);

  function pickUser(u) {
    setSelected(u);
    setQuery(userLabel(u));
    setListOpen(false);
    setMessage(null);
  }

  async function handleAssign() {
    if (!selected || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await assignUserRole(selected.uid, role);
      setMessage({
        type: "success",
        text: `${userLabel(selected)} 님을 '${ROLE_LABELS[role]}'(으)로 지정했어요. (본인이 재로그인해야 반영됩니다)`,
      });
    } catch (err) {
      setMessage({ type: "error", text: errorText(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(u) {
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await approveTeacherRequest(u.uid);
      setMessage({
        type: "success",
        text: `${userLabel(u)} 님을 선생님으로 승인했어요. (본인이 재로그인해야 반영됩니다)`,
      });
    } catch (err) {
      setMessage({ type: "error", text: errorText(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject(u) {
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await dismissTeacherRequest(u.uid);
      setMessage({ type: "success", text: `${userLabel(u)} 님의 선생님 신청을 거절했어요.` });
    } catch (err) {
      setMessage({ type: "error", text: errorText(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal role-manager-modal" onClick={(e) => e.stopPropagation()}>
        <button className="btn-close modal-close-float" onClick={onClose} aria-label="닫기">
          ×
        </button>

        <h2 className="student-edit-title">역할 관리</h2>

        {/* 선생님 승인 대기 */}
        {pending.length > 0 && (
          <div className="role-pending">
            <p className="role-pending-title">🧑‍🏫 선생님 승인 대기 ({pending.length})</p>
            <ul className="role-pending-list">
              {pending.map((u) => (
                <li key={u.uid} className="role-pending-item">
                  <span className="role-pending-user">
                    {u.emoji ?? "🙂"} <strong>{userLabel(u)}</strong>
                    {u.email && <small>{u.email}</small>}
                  </span>
                  <span className="role-pending-actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => handleReject(u)}
                      disabled={submitting}
                    >
                      거절
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleApprove(u)}
                      disabled={submitting}
                    >
                      승인
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="role-manager-hint">
          사용자를 검색해 선택한 뒤 역할을 부여합니다. 대상은 먼저 앱에
          로그인(회원가입)해 있어야 합니다.
        </p>

        {/* 사용자 검색·선택 (콤보박스) */}
        <div className="student-edit-field role-manager-field">
          <span>사용자 선택</span>
          <div className="role-combo">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
                setListOpen(true);
                setMessage(null);
              }}
              onFocus={() => setListOpen(true)}
              placeholder="실명·닉네임·이메일로 검색"
              autoFocus
            />
            {listOpen && matches.length > 0 && (
              <ul className="role-combo-list">
                {matches.map((u) => (
                  <li key={u.uid}>
                    <button type="button" onClick={() => pickUser(u)}>
                      <span className="role-combo-name">
                        {u.emoji ?? "🙂"} {userLabel(u)}
                      </span>
                      <span className="role-combo-meta">
                        {u.email ? `${u.email} · ` : ""}
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {selected && (
          <div className="role-manager-match found">
            {selected.emoji ?? "🙂"} <strong>{userLabel(selected)}</strong>
            <span className="role-manager-current"> · 현재 {ROLE_LABELS[selected.role] ?? selected.role}</span>
          </div>
        )}

        <div className="student-edit-field role-manager-field">
          <span>부여할 역할</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="student">학생</option>
            <option value="teacher">교사</option>
            <option value="admin">관리자</option>
          </select>
        </div>

        {message && (
          <p className={`role-manager-message ${message.type}`}>{message.text}</p>
        )}

        <div className="student-edit-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleAssign}
            disabled={!selected || submitting}
          >
            {submitting ? "적용 중…" : "역할 부여"}
          </button>
        </div>
      </div>
    </div>
  );
}
