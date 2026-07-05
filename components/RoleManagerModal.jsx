"use client";

// =============================================================
// 역할 관리 (관리자 전용) — 이메일/UID로 사용자를 찾아 역할을 부여합니다.
// -------------------------------------------------------------
// 실제 권한 변경은 Cloud Functions(setUserRole)가 서버에서 커스텀
// 클레임으로 부여합니다. 이 화면은 그 함수를 호출하는 얇은 UI입니다.
// (역할을 바꾼 계정은 재로그인하거나 토큰을 새로고침해야 반영됩니다)
// =============================================================
import { useMemo, useState } from "react";
import { assignUserRole } from "@/lib/store";

const ROLE_LABELS = { student: "학생", teacher: "교사", admin: "관리자" };

export default function RoleManagerModal({ directory, onClose }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("teacher");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text }

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return (
      directory.find((u) => u.email?.toLowerCase() === q) ??
      directory.find((u) => u.uid === query.trim()) ??
      null
    );
  }, [query, directory]);

  async function handleSubmit() {
    if (!matched || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await assignUserRole(matched.uid, role);
      setMessage({
        type: "success",
        text: `${matched.displayName || matched.email} 님을 '${ROLE_LABELS[role]}'(으)로 지정했어요. (본인이 재로그인해야 반영됩니다)`,
      });
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err?.code === "functions/permission-denied"
            ? "역할을 부여할 권한이 없습니다. (실제 관리자 계정으로 로그인했는지 확인해 주세요)"
            : "역할 부여에 실패했어요. Cloud Functions가 배포돼 있는지 확인해 주세요.",
      });
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
        <p className="role-manager-hint">
          이메일 또는 UID로 사용자를 찾아 교사·관리자 권한을 부여합니다.
          대상은 먼저 앱에 로그인(회원가입)해 있어야 합니다.
        </p>

        <div className="student-edit-field role-manager-field">
          <span>이메일 또는 UID</span>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setMessage(null);
            }}
            placeholder="st1@hansung.in"
            autoFocus
          />
        </div>

        {query.trim() && (
          <div className={`role-manager-match ${matched ? "found" : "not-found"}`}>
            {matched ? (
              <>
                {matched.emoji ?? "🙂"} <strong>{matched.displayName || "익명"}</strong>
                {matched.realName && <span> ({matched.realName})</span>}
                <span className="role-manager-current"> · 현재 {ROLE_LABELS[matched.role] ?? matched.role}</span>
              </>
            ) : (
              "일치하는 사용자를 찾을 수 없어요. 먼저 회원가입이 필요합니다."
            )}
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
            onClick={handleSubmit}
            disabled={!matched || submitting}
          >
            {submitting ? "적용 중…" : "역할 부여"}
          </button>
        </div>
      </div>
    </div>
  );
}
