"use client";

// =============================================================
// 프로젝트 가져오기 (교사) — 공부방 머리줄 '＋ 프로젝트 가져오기'가 엽니다
// -------------------------------------------------------------
// 프로젝트는 선생님의 원본이고 반에서는 그 복사본을 씁니다(lib/store.js의
// studyTemplates 절). 한때 이 자리의 단추가 '＋ 프로젝트 만들기'였는데, 반
// 화면에서 눌렀는데 반에는 아무것도 안 생기고(원본만 생김) 수업 관리 창이
// 떠서 '만들었는데 왜 없지?'가 되었습니다. 이제 반 화면의 단추는 **이 반에
// 꺼내 오는 일**만 합니다.
//
// [이 창은 고르기만 합니다] 편집·삭제는 없습니다 — 그 일은 '수업 관리' 창의
// 프로젝트 탭(StudyTemplateList)에서 합니다. 같은 목록이 두 곳에 보여도
// 한쪽은 꺼내 쓰는 곳, 다른 쪽은 관리하는 곳이라 할 일이 갈립니다.
//
// 줄마다: 이 반에 이미 복사본이 있으면 '연결된 프로젝트' + [열기](프로젝트
// 탭과 같은 표시 — 같은 원본을 한 반에 두 번 열지 않게), 없으면
// [우리 반에 가져오기]. 줄 모양은 수업 줄(.lesson-row)을 그대로 씁니다.
//
// [＋ 프로젝트 만들기는 늘 아래에] 목록에 없는 새 프로젝트를 만들 수 있게
// 원본이 있든 없든 섭니다. 이 길로 만들면 원본을 보관하고 **곧바로 이 반에
// 엽니다**(StudyProjectForm의 openInClass) — 새로 만들어 이 반에서 쓰는 일이
// 누름 한 번입니다. 원본이 하나도 없으면 안내와 함께 가운데에 크게 섭니다.
//
// 읽는 문서가 늘지 않습니다 — 원본 목록과 이 반의 보드는 페이지가 이미
// 구독해 둔 것입니다. 규칙도 그대로입니다.
// =============================================================
import { useState } from "react";
import { backdropClose } from "@/lib/modal";
import { IconIndividual, IconGroup } from "./StatusIcons";

export default function StudyProjectImportModal({
  templates = [],
  classBoards = [],   // 지금 이 반의 프로젝트 — 복사본이 이미 있는지 봅니다
  className = "",
  readOnly = false,   // 보관된 반 — 가져올 수 없습니다
  onImport,           // (template) => Promise
  onOpenBoard,        // (boardId) => void
  onCreate,           // () => void — 만들기 창을 엽니다
  onClose,
}) {
  const [busyId, setBusyId] = useState(null);

  // 원본 id → 이 반의 복사본(휴지통에 든 것은 구독에서 빠져 있습니다)
  const instanceOf = new Map();
  classBoards.forEach((b) => {
    if (b.templateId && !instanceOf.has(b.templateId)) instanceOf.set(b.templateId, b);
  });

  async function handleImport(t) {
    if (busyId) return;
    setBusyId(t.id);
    try {
      await onImport?.(t);
    } finally {
      setBusyId(null);
    }
  }

  const empty = templates.length === 0;
  const where = className ? `‘${className}’` : "이 반";

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal tpl-import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>📥 프로젝트 가져오기</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <p className="tpl-import-hint">
          내가 만든 프로젝트 원본이에요. 가져오면 {where}에 복사본이 열려요 —
          원본의 편집·삭제는 ‘수업 관리’의 프로젝트 탭에서 해요.
        </p>

        {empty ? (
          <div className="tpl-import-empty">
            <p>아직 만든 프로젝트가 없어요. 새로 만들면 원본으로 보관되고 {where}에 곧바로 열려요.</p>
            <button
              type="button"
              className="lesson-create-btn"
              onClick={onCreate}
              disabled={readOnly}
            >
              ＋ 프로젝트 만들기
            </button>
          </div>
        ) : (
          <>
            <div className="lesson-list tpl-import-list">
              {templates.map((t) => {
                const inst = instanceOf.get(t.id);
                const isGroup = t.activityType === "group";
                const acts = t.activities?.length ?? 0;
                return (
                  <div key={t.id} className="lesson-row tpl-row">
                    <div className="lesson-row-main">
                      <strong title={t.title}>{t.title}</strong>
                      <span className="tpl-meta">
                        {isGroup ? <IconGroup size={13} /> : <IconIndividual size={13} />}
                        {isGroup ? "모둠" : "개별"} · {acts > 0 ? `활동 ${acts}개` : "활동 없음"}
                      </span>
                    </div>
                    <div className="lesson-row-actions">
                      {inst ? (
                        <>
                          <span className="tpl-here">연결된 프로젝트</span>
                          <button
                            type="button"
                            className="btn-ghost lesson-edit-btn"
                            onClick={() => onOpenBoard?.(inst.id)}
                          >
                            열기
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => handleImport(t)}
                          disabled={readOnly || !!busyId}
                          title={
                            readOnly
                              ? "보관된 반에는 가져올 수 없어요"
                              : `${where}에 복사본을 하나 열어요`
                          }
                        >
                          {busyId === t.id ? "가져오는 중…" : "우리 반에 가져오기"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              // 수업 관리 탭의 '＋ 새 프로젝트 만들기'와 같은 모양(점선 살구)
              className="lesson-create-btn tpl-import-create"
              onClick={onCreate}
              disabled={readOnly || !!busyId}
              title="목록에 없는 새 프로젝트를 만들어 이 반에 곧바로 열어요"
            >
              ＋ 프로젝트 만들기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
