"use client";

// =============================================================
// 수업 준비 — 자료 목록 · 새로 만들기 (교사 전용)
// -------------------------------------------------------------
// PDF를 올리면 브라우저가 장마다 이미지로 바꿔 Storage에 저장합니다.
// 구글 슬라이드·캔바·PPT 모두 'PDF로 내보내기'가 있으므로 어떤 도구로
// 만들었든 여기로 들어옵니다. 이미지로 두는 덕분에 수업 중 교사가 넘긴
// 장 번호만 보내면 학생 화면이 정확히 같은 장을 띄울 수 있습니다.
//
// 자료는 만든 선생님에게 귀속됩니다 — 같은 자료로 여러 반에서 수업 가능.
//
// 화면 두 가지
//  · 목록 — 탭이 둘입니다(`tab`).
//    - 수업: 만들어 둔 자료마다 '편집하기'(주제·해설·활동 안내 다듬기)와
//      '수업 시작하기'(그 자료로 바로 수업 페이지에 들어가기) 버튼.
//    - 프로젝트: 내 프로젝트 원본(`projectsPane` — 페이지가 그려 넘깁니다).
//    - 자리 배치: 이 반의 자리표 · 기본 모둠(`seatsPane` — 역시 페이지가
//      그립니다. 반 관리하기의 '자리 배정 · 모둠 설정' 창과 같은 몸통).
//      한때 수업 탭 맨 위의 '자리 배정하기' 단추였는데, 누르면 이 창이 닫히고
//      다른 창이 떴습니다 — 수업을 준비하며 오가는 자리라 탭으로 올렸습니다.
//      수업 자료와 프로젝트 원본은 **둘 다 반이 아니라 선생님에게 붙은
//      설계도**라 한 창에 나란히 둡니다. 공부방 머리줄의 '＋ 프로젝트
//      만들기'가 원본을 만들면 이 탭이 그 줄을 짚은 채로 열립니다.
//  · 창 크기는 세 탭이 같습니다(자리 배치가 요구하는 1180px). 넓어진 만큼
//    두 목록 탭은 오른쪽에 **반별 현황**(ClassUsagePanel)을 둡니다 — 수업은
//    '어느 반에서 언제 했나'(lessons.taughtDays), 프로젝트는 '반마다 열어 둔
//    프로젝트'. 두 탭의 두 칸은 같은 격자라 탭을 바꿔도 경계가 제자리입니다.
//  · 새 수업 만들기 — 주제 입력 + PDF 업로드. 올리기가 끝나면 바로 편집
//    화면(LessonMode mode="edit")으로 넘어가 해설·활동 안내까지 이어 씁니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { subscribeMyLessons, addLesson, deleteLesson } from "@/lib/store";
import { convertPdfSlides } from "@/lib/pdfSlides";
import { createUploadPool } from "@/lib/uploadPool";
import { uploadImageBlob } from "@/lib/storageUpload";
import { getCurrentUser } from "@/lib/user";
import { lessonUsageByClass, projectUsageByClass } from "@/lib/classUsage";
import ConfirmModal from "./ConfirmModal";
import ClassUsagePanel from "./ClassUsagePanel";
import { IconTrash } from "./StatusIcons";

const MAX_SLIDES = 60;
// 동시에 올릴 장수 — 교실 회선을 다 잡아먹지 않으면서 왕복 대기를 줄이는 선
const UPLOAD_CONCURRENCY = 4;

export default function LessonManagerModal({
  onStart,
  onEdit,
  onClose,
  // 프로젝트 탭 — 탭은 주소(?tab=projects)로 들고 있어 '뒤로 가기'와 맞습니다.
  // `projectsPane`이 없으면 탭 줄을 아예 안 그립니다.
  tab = "lessons",
  onTabChange,
  projectsPane = null,
  seatsPane = null,
  onCreateProject,
  // 반별 현황(오른쪽 열) — 페이지가 이미 구독해 둔 반·프로젝트·원본을 받습니다.
  // 수업 자료는 이 창이 스스로 구독하는 목록을 그대로 씁니다(읽기 0).
  usage = null,
}) {
  const [lessons, setLessons] = useState([]);
  const [creating, setCreating] = useState(false); // '새 수업 만들기' 화면 표시 여부
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(null); // { phase, pct }
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const me = getCurrentUser();
  useEffect(() => subscribeMyLessons(me?.uid, setLessons), [me?.uid]);

  const lessonGroups = useMemo(
    () => (usage ? lessonUsageByClass(usage.classes, lessons, usage.boards) : []),
    [usage, lessons]
  );
  const projectGroups = useMemo(
    () => (usage ? projectUsageByClass(usage.classes, usage.boards, usage.templates) : []),
    [usage]
  );
  // 반별 현황에서 펼친 반 — 창이 들고 있어 수업 ↔ 프로젝트 ↔ 자리 배치로
  // 탭을 오가도 그대로입니다(null = 아직 안 만짐 → 지금 반만 펼침).
  const [openUsage, setOpenUsage] = useState(null);
  const usageOpenIds = openUsage ?? new Set(usage?.currentClassId ? [usage.currentClassId] : []);
  const toggleUsage = (id) =>
    setOpenUsage(() => {
      const next = new Set(usageOpenIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // 두 목록 탭은 같은 두 칸 — 왼쪽 목록, 오른쪽 반별 현황(.lesson-mgr-body)
  const withUsage = (mode, main) => (
    <div className={`lesson-mgr-body${usage ? "" : " no-usage"}`}>
      <div className="lesson-mgr-main">{main}</div>
      {usage && (
        <ClassUsagePanel
          mode={mode}
          groups={mode === "lessons" ? lessonGroups : projectGroups}
          currentClassId={usage.currentClassId}
          onOpenBoard={usage.onOpenBoard}
          openIds={usageOpenIds}
          onToggle={toggleUsage}
          onSetAll={(ids) => setOpenUsage(new Set(ids))}
        />
      )}
    </div>
  );

  async function handlePdf(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) {
      setError("PDF 파일만 올릴 수 있어요. 구글 슬라이드·캔바·PPT는 ‘PDF로 내보내기’ 후 올려 주세요.");
      return;
    }
    setError("");
    const name = title.trim() || file.name.replace(/\.pdf$/i, "");

    try {
      setBusy({ phase: "PDF를 읽는 중", pct: 0 });

      // 렌더와 업로드를 겹쳐 돌립니다 — 한 장이 그려지는 대로 바로 올리고,
      // 동시 업로드가 상한에 닿으면 렌더가 잠깐 기다립니다(메모리 보호).
      const slides = [];       // 인덱스로 채우므로 완료 순서와 무관하게 차례가 유지됨
      const pool = createUploadPool(UPLOAD_CONCURRENCY);
      let total = 0;
      let done = 0;

      await convertPdfSlides(file, {
        onStart: (numPages) => {
          if (numPages === 0) throw new Error("페이지를 찾지 못했어요.");
          if (numPages > MAX_SLIDES) {
            throw new Error(
              `슬라이드는 최대 ${MAX_SLIDES}장까지 올릴 수 있어요. (지금 ${numPages}장)`
            );
          }
          total = numPages;
          slides.length = numPages;
          setBusy({ phase: `슬라이드 만드는 중 0 / ${total}`, pct: 0 });
        },
        onPage: (index, blob) =>
          pool.submit(async () => {
            const imageUrl = await uploadImageBlob(blob, `slide-${index + 1}.jpg`);
            slides[index] = { imageUrl, note: "" };
            done++;
            setBusy({ phase: `슬라이드 만드는 중 ${done} / ${total}`, pct: done / total });
          }),
      });

      await pool.settle(); // 마지막까지 올라간 뒤에 저장

      // 자료 저장 → 바로 주제·해설·활동 안내를 쓰는 편집 화면으로
      const id = await addLesson(me, { title: name, slides });
      setBusy(null);
      setTitle("");
      setCreating(false);
      onEdit?.({ id, title: name, slides });
    } catch (err) {
      setBusy(null);
      setError(err?.message || "자료를 만들지 못했어요. 다시 시도해 주세요.");
    }
  }

  // 슬라이드 없이 제목만으로 만들기 — 띄울 자료는 없고 프로젝트·독서 활동만
  // 내보내는 수업입니다. 자료 문서는 `slides: []`로 저장되고, 그 뒤는 PDF로
  // 만든 수업과 **완전히 같은 길**을 갑니다(편집 화면 → 수업 시작하기).
  //
  // 수업 화면은 이 경우를 원래 알고 있었습니다 — 슬라이드 칸에 빈 상태가
  // 서고, 넘기기와 '시작'(방송 켜기)이 `total === 0`으로 꺼져 있어 **방송이
  // 아예 시작되지 않습니다.** 그래서 학생 화면은 그대로이고, 교사는 자리표·
  // 활동 내보내기·손들기만 씁니다. 없던 것은 이 자리(만드는 길)뿐이었습니다.
  //
  // **제목이 반드시 있어야 합니다** — PDF 쪽은 비워 두면 파일 이름을 쓰는데
  // 여기는 대신할 이름이 없고, 목록에서 그 수업을 찾는 유일한 값입니다.
  async function handleTitleOnly() {
    const name = title.trim();
    if (!name || busy) return;
    setError("");
    try {
      setBusy({ phase: "수업을 만드는 중", pct: 1 });
      const id = await addLesson(me, { title: name, slides: [] });
      setBusy(null);
      setTitle("");
      setCreating(false);
      onEdit?.({ id, title: name, slides: [] });
    } catch (err) {
      setBusy(null);
      setError(err?.message || "수업을 만들지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function handleDelete() {
    const target = confirmDel;
    setConfirmDel(null);
    await deleteLesson(target.id, target.slides ?? []);
  }

  return (
    <div className="modal-backdrop" {...backdropClose(busy ? () => {} : onClose)}>
      <div className="modal modal-lesson" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          {creating ? (
            <button type="button" className="btn-ghost lesson-back-btn" onClick={() => setCreating(false)} disabled={!!busy}>
              ‹ 목록으로
            </button>
          ) : (
            <h3>📝 수업 관리</h3>
          )}
          {/* 탭 — 이 앱에서 '한 자리에 두 얼굴'을 고르는 알약 줄(.dash-view-tabs)과
              같은 모양입니다(노트 크게 보기 · 닿소리 전체 보기). 제목 바로
              옆에 두어 줄을 하나 더 쓰지 않습니다. */}
          {!creating && (projectsPane || seatsPane) && (
            <div className="dash-view-tabs lesson-mgr-tabs" role="tablist" aria-label="보는 목록">
              {[
                ["lessons", "수업", true],
                ["projects", "프로젝트", !!projectsPane],
                ["seats", "자리 배치", !!seatsPane],
              ]
                .filter(([, , shown]) => shown)
                .map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    className={`dash-view-tab${tab === key ? " on" : ""}`}
                    onClick={() => onTabChange?.(key)}
                  >
                    {label}
                  </button>
                ))}
            </div>
          )}
          {!busy && (
            <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
          )}
        </div>

        {creating ? (
          <>
            {/* 새 수업 만들기 — 주제 입력 + PDF 업로드. 해설·활동 안내는
                업로드가 끝난 뒤 편집 화면에서 이어 씁니다. */}
            <h3 className="lesson-create-title">새 수업 만들기</h3>
            {/* 제목 한 줄 → 만드는 길 두 칸 → 설명. 물음이 '무엇을 만들까'
                하나이므로 제목은 줄을 다 쓰고, 그 아래에서 **길이 갈립니다**. */}
            <div className="lesson-new">
              <input
                type="text"
                className="lesson-new-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="수업 주제 (PDF를 올리면 비워 둬도 파일 이름이 들어갑니다)"
                maxLength={60}
                disabled={!!busy}
                autoFocus
              />
            </div>

            {/* 두 단추는 **균등 두 칸에 같은 크기**입니다(`.modal-actions`와
                같은 셈 — 격자 `1fr 1fr` + 높이 못 박기). flex로 두면 테두리가
                있는 쪽이 2px 넓어지고, 두 클래스의 padding·글자 크기가 달라
                높이도 20px 가까이 벌어집니다. */}
            <div className="lesson-new-ways">
              <label className={`btn-primary lesson-upload-btn${busy ? " disabled" : ""}`}>
                ＋ PDF 올리기
                <input type="file" accept="application/pdf,.pdf" onChange={handlePdf} hidden disabled={!!busy} />
              </label>
              <button
                type="button"
                // 두 길이 같은 무게라 같은 색입니다(둘 다 채운 살구색). 한쪽만
                // 테두리 단추면 그쪽이 '덜 권하는 길'로 읽힙니다.
                className="btn-primary"
                onClick={handleTitleOnly}
                disabled={!!busy || !title.trim()}
                title={
                  title.trim()
                    ? "슬라이드 없이 이 제목으로 수업을 만듭니다"
                    : "위에 수업 주제를 적으면 눌러집니다 — 슬라이드가 없으면 제목이 이 수업을 찾는 유일한 이름이에요"
                }
              >
                슬라이드 없이 만들기
              </button>
            </div>

            {/* 설명은 단추 **아래에** 모읍니다. 나란히 선 두 길이라 어느 쪽
                설명인지 먼저 밝히고(굵은 글씨) 이어 적습니다 — 이름 없이 두
                덩이를 쌓으면 어느 것이 어느 단추의 말인지 알 수 없습니다. */}
            <div className="lesson-hint lesson-new-hints">
              <p>
                <strong>PDF 올리기</strong> — 구글 슬라이드·캔바·PPT 모두 ‘PDF로 내보내기’ 후
                올려 주세요. 장별 이미지로 바꿔 두어야 학생 화면이 선생님과 같은 장으로
                넘어갑니다.
              </p>
              <p>
                <strong>슬라이드 없이 만들기</strong> — 학생 화면에 띄울 자료 없이
                프로젝트·독서 활동만 내보내는 수업이에요. 자리표·활동 내보내기·손들기는
                그대로 쓸 수 있습니다. <em>수업 주제를 적어야 눌러집니다.</em>
              </p>
            </div>

            {busy && (
              <div className="lesson-progress">
                <div className="lesson-progress-bar">
                  <span style={{ width: `${Math.round((busy.pct ?? 0) * 100)}%` }} />
                </div>
                <span className="lesson-progress-text">{busy.phase}…</span>
              </div>
            )}
            {error && <p className="lesson-error">{error}</p>}
          </>
        ) : tab === "projects" && projectsPane ? (
          withUsage("projects", <>
            {/* 수업 탭의 위 줄과 같은 자리·같은 모양 — '새로 만들기'가 늘 맨 위
                왼쪽입니다. 만드는 창은 공부방의 그 창(StudyProjectForm)이라
                이 창을 닫고 엽니다(창 둘이 겹치지 않게). */}
            <div className="lesson-list-toolbar">
              <button type="button" className="lesson-create-btn" onClick={onCreateProject}>
                ＋ 새 프로젝트 만들기
              </button>
            </div>
            {projectsPane}
          </>)
        ) : tab === "seats" && seatsPane ? (
          seatsPane
        ) : (
          withUsage("lessons", <>
            <div className="lesson-list-toolbar">
              <button type="button" className="lesson-create-btn" onClick={() => { setError(""); setCreating(true); }}>
                ＋ 새 수업 만들기
              </button>
            </div>

            {/* 자료 목록 */}
            <div className="lesson-list">
              {lessons.length === 0 ? (
                <p className="empty-note">아직 만든 수업 자료가 없어요. 위에서 새로 만들어 보세요.</p>
              ) : (
                lessons.map((l) => (
                  <div key={l.id} className="lesson-row">
                    <div className="lesson-row-main">
                      <strong>{l.title}</strong>
                      {/* 슬라이드 없이 만든 수업은 '0장'이 아니라 그렇게
                          적습니다 — 0장은 '만들다 만 것'으로 읽힙니다. */}
                      <span>
                        {(l.slides ?? []).length === 0
                          ? "슬라이드 없음 · 활동만"
                          : `슬라이드 ${(l.slides ?? []).length}장`}
                      </span>
                    </div>
                    <div className="lesson-row-actions">
                      <button type="button" className="btn-ghost lesson-edit-btn" onClick={() => onEdit?.(l)}>
                        편집하기
                      </button>
                      <button type="button" className="btn-primary" onClick={() => onStart?.(l)}>
                        수업 시작하기
                      </button>
                      <button
                        type="button"
                        className="btn-ghost qa-delete"
                        onClick={() => setConfirmDel(l)}
                        aria-label="삭제"
                      >
                        <IconTrash size={18} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>)
        )}
      </div>

      {confirmDel && (
        <ConfirmModal
          title="수업 자료 삭제"
          preview={confirmDel.title}
          description={"슬라이드와 메모가 모두 삭제됩니다.\n되돌릴 수 없습니다."}
          confirmLabel="삭제"
          danger
          onConfirm={handleDelete}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}
