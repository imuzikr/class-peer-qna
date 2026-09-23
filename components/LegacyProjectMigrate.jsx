"use client";

// =============================================================
// 옛 프로젝트를 원본으로 묶기 — 프로젝트 탭 맨 위 한 줄 + 미리보기 창
// -------------------------------------------------------------
// 원본이 생기기 전에 만든 프로젝트(반마다 따로 선 문서)를 이름이 같은
// 것끼리 원본 하나에 잇습니다. 셈과 쓰기는 lib/projectNames.js
// (`groupLegacyProjects` · `migrateLegacyGroup`) 한 곳입니다.
//
// · 줄은 **묶을 것이 있을 때만** 섭니다. 다 묶고 나면 저절로 사라집니다.
// · 목록 칸(.lesson-list) **안의 첫 줄**로 둡니다 — 칸 바깥에 두면 프로젝트
//   탭만 그만큼 창이 길어져, 탭을 바꿀 때 창이 늘었다 줄었다 합니다.
// · 창은 묶음마다 체크를 둡니다. 이름만 같고 내용이 다른 프로젝트일 수 있어,
//   반마다 활동이 다른 묶음은 그 사실을 적어 선생님이 보고 고르게 합니다.
// · 지우는 것은 없습니다 — 각 반 프로젝트에 원본 표시 한 칸만 붙습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";

export default function LegacyProjectMigrate({ groups = [], classNameOf, onMigrate, onDone }) {
  const [open, setOpen] = useState(false);
  if (groups.length === 0) return null;
  const boardCount = groups.reduce((n, g) => n + g.boards.length, 0);
  return (
    <>
      <div className="tpl-legacy">
        <span className="tpl-legacy-text">
          원본 없이 만든 옛 프로젝트가 <strong>{boardCount}개</strong> 있어요.
          이름이 같은 것끼리 원본 하나로 묶으면 이 목록에서 함께 관리할 수 있습니다.
        </span>
        <button type="button" className="btn-primary tpl-legacy-btn" onClick={() => setOpen(true)}>
          원본으로 묶기
        </button>
      </div>
      {open && (
        <LegacyMigrateModal
          groups={groups}
          classNameOf={classNameOf}
          onMigrate={onMigrate}
          onClose={() => setOpen(false)}
          onDone={onDone}
        />
      )}
    </>
  );
}

function LegacyMigrateModal({ groups, classNameOf, onMigrate, onClose, onDone }) {
  // 처음엔 전부 고름 — 대개는 같은 프로젝트를 반마다 복제해 쓴 것입니다.
  const [picked, setPicked] = useState(() => new Set(groups.map((g) => g.key)));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // 묶는 동안 구독으로 목록이 줄어들어도(묶인 것은 빠짐) 창의 줄은 그대로
  // 둡니다 — 처음 연 순간의 묶음을 붙들어 씁니다.
  const [list] = useState(groups);
  const chosen = useMemo(() => list.filter((g) => picked.has(g.key)), [list, picked]);

  // Esc는 이 창만 닫습니다 — 캡처 단계에서 받아 멈춰, 뒤의 '수업 관리'
  // 창까지 함께 닫히지 않게 합니다.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (!busy) onClose();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  function toggle(key) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function run() {
    if (busy || chosen.length === 0) return;
    setBusy(true);
    setError("");
    setProgress(0);
    let done = 0;
    try {
      // 한 묶음씩 차례로 — 중간에 멈춰도 앞의 것은 묶인 채로 남고, 다시
      // 누르면 남은 것만 목록에 섭니다.
      for (const g of chosen) {
        await onMigrate(g);
        done += 1;
        setProgress(done);
      }
      onClose();
      onDone?.(done);
    } catch (e) {
      setError(
        `${done}개까지 묶고 멈췄어요: ${e?.message ?? "알 수 없는 오류"}. 다시 누르면 남은 것만 묶습니다.`
      );
      setBusy(false);
    }
  }

  if (!mounted) return null;
  return createPortal(
    <div className="modal-backdrop confirm-backdrop" {...backdropClose(() => !busy && onClose())}>
      <div
        className="modal legacy-migrate-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legacy-migrate-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="legacy-migrate-title">옛 프로젝트를 원본으로 묶기</h3>
          <button className="btn-close" onClick={() => !busy && onClose()} aria-label="닫기">
            ×
          </button>
        </div>
        <p className="legacy-migrate-lead">
          이름이 같은 프로젝트끼리 원본 하나에 연결합니다. 지우거나 옮기는 것은 없고,
          학생 카드와 반마다의 활동 목록은 그대로입니다. 이름만 같고 다른
          프로젝트라면 체크를 빼 주세요 — 뺀 것은 목록 위 알림에 남아 있어,
          한쪽 이름을 바꾼 뒤 다시 묶을 수 있습니다.
        </p>
        <ul className="legacy-migrate-list">
          {list.map((g) => {
            const on = picked.has(g.key);
            const acts = (g.best.activities ?? []).filter(Boolean).length;
            const names = g.boards.map((b) => classNameOf?.(b.classId) ?? "알 수 없는 반");
            return (
              <li key={g.key} className={`legacy-migrate-row${on ? " on" : ""}`}>
                <label>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(g.key)}
                    disabled={busy}
                  />
                  <span className="legacy-migrate-main">
                    <strong>{g.title}</strong>
                    <span className="legacy-migrate-meta">
                      {names.join(" · ")} · {acts > 0 ? `활동 ${acts}개` : "활동 없음"}
                    </span>
                    {g.existing && (
                      <span className="legacy-migrate-note">
                        같은 이름의 원본이 이미 있어 그 원본에 연결합니다.
                      </span>
                    )}
                    {g.diverge && (
                      <span className="legacy-migrate-warn">
                        반마다 활동 목록이 달라요 — {classNameOf?.(g.best.classId) ?? "한 반"}의
                        목록(활동 {acts}개)을 원본으로 씁니다. 각 반의 활동은 그대로 둡니다.
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={() => onClose()} disabled={busy}>
            취소
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={run}
            disabled={busy || chosen.length === 0}
          >
            {busy ? `묶는 중… ${progress}/${chosen.length}` : `${chosen.length}개 묶기`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
