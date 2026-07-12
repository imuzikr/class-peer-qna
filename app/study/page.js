"use client";

// =============================================================
// 공부방 — 수업의 연장. 반(클래스)별 Trello/Padlet 스타일 보드.
//   · 질문 게시판은 전체 공유 공간, 공부방은 "반별" 공간입니다.
//   · 학생: 입장 코드로 반에 들어와 그 반의 보드만 봅니다.
//   · 교사: 상단 드롭다운으로 반을 고르고, 반을 새로 만들 수 있습니다.
// 키워드를 연계한 보드에서는 카드에서 바로 질문하고(질문하기),
// 관련 질문을 모아 볼 수 있습니다.
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  subscribeStudyBoards,
  updateStudyBoard,
  fetchStudyCardsOnce,
  subscribeQuestions,
  subscribeKeywords,
  subscribeClasses,
  subscribeUserDirectory,
  subscribeMyMemberships,
  subscribeJoinCodes,
  subscribeClassMembers,
  subscribeClassRewards,
  setStudentReward,
  leaveClass,
  regenerateJoinCode,
  addClass,
  reorderStudyBoards,
  toDate,
} from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { isAdmin, getCurrentUser } from "@/lib/user";
import { getSelectedClassId, setSelectedClassId } from "@/lib/classroom";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { codeBlockHtml } from "@/lib/html";
import {
  buildStudyRows,
  downloadStudyCsv,
  downloadStudyWorkbook,
  printStudyPdf,
  printStudyPdfSections,
} from "@/lib/exportStudy";
import TopNav from "@/components/TopNav";
import StudyRewardPanel from "@/components/StudyRewardPanel";
import StudyBoardColumn from "@/components/StudyBoardColumn";
import StudyBoardForm from "@/components/StudyBoardForm";
import NewQuestionForm from "@/components/NewQuestionForm";
import ClassEntry from "@/components/ClassEntry";
import Toast from "@/components/Toast";
import KwlPanel from "@/components/KwlPanel";
import { IconKey } from "@/components/StatusIcons";

// 파이썬 실행기(CodeMirror 등)는 무거워 지연 로딩 → 초기 로드/전환 속도 개선
const PythonRunner = dynamic(() => import("@/components/PythonRunner"), {
  ssr: false,
});

export default function StudyPage() {
  const user = useCurrentUser();
  useRequireAuth();
  const [classes, setClasses] = useState([]);
  const [boards, setBoards] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [keywordDocs, setKeywordDocs] = useState([]);
  // 학생이 입장한 반(세션 선택 + 서버 소속)과 교사가 보고 있는 반(화면 상태)은 별개입니다.
  const [localSelectedId, setLocalSelectedId] = useState(null); // 세션에서 고른 반
  const [memberships, setMemberships] = useState([]); // 서버 소속(기기 무관)
  const [teacherClassId, setTeacherClassId] = useState(null);
  const [joinCodesMap, setJoinCodesMap] = useState({}); // 교사: classId→{code,expiresAt}
  const [regenerating, setRegenerating] = useState(false);
  const [addingBoard, setAddingBoard] = useState(false);
  const [creatingClass, setCreatingClass] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [showCode, setShowCode] = useState(false); // 입장 코드 표시 토글
  const [askKeyword, setAskKeyword] = useState(null); // "질문하기"로 새 질문 작성
  const [askCode, setAskCode] = useState(null);     // 파이썬 실행기에서 넘어온 코드
  const [askKwlW, setAskKwlW] = useState(null);    // KWL W칸에서 넘어온 텍스트
  const [pyOpen, setPyOpen] = useState(false);      // 파이썬 실행 패널
  const [cardModalOpen, setCardModalOpen] = useState(false); // StudyBoardColumn 모달
  const [kwlMobileOpen, setKwlMobileOpen] = useState(false); // 모바일 KWL 패널
  const [draggingBoardId, setDraggingBoardId] = useState(null); // 보드 순서 변경 DnD
  const [toast, setToast] = useState("");
  const [directory, setDirectory] = useState([]);   // 교사: uid→실명 등 프로필
  const [memberUids, setMemberUids] = useState([]);  // 현재 반 소속 학생 uid
  const [rewards, setRewards] = useState([]);        // 현재 반 보상(과일) 목록
  // 보드 접힘 상태는 보드 문서(board.collapsed)에 저장 — 교사가 접으면
  // 학생 화면에도 동일하게 반영됩니다(공유 상태). 쓰기는 교사만(규칙에서 강제).
  function toggleBoardCollapse(board) {
    updateStudyBoard(board.id, { collapsed: !board.collapsed });
  }
  function expandAllBoards() {
    // 첫 보드를 제외한 접힌 보드를 모두 펼침
    classBoards.forEach((b, bi) => {
      if (bi !== 0 && b.collapsed) updateStudyBoard(b.id, { collapsed: false });
    });
  }
  function collapseAllBoards() {
    // 교사 보드(첫 번째)와 가장 최근 보드(마지막)만 남기고 모두 접기
    const last = classBoards.length - 1;
    classBoards.forEach((b, bi) => {
      if (bi !== 0 && bi !== last && !b.collapsed) updateStudyBoard(b.id, { collapsed: true });
    });
  }

  // 공부방 활동 자료 내보내기 (교사) — 상세 선택은 모달에서
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // 한 반의 보드 카드를 모아 행으로 구성
  async function rowsForBoards(boardList, className) {
    const lists = await Promise.all(boardList.map((b) => fetchStudyCardsOnce(b.id)));
    const cardsByBoard = {};
    boardList.forEach((b, i) => { cardsByBoard[b.id] = lists[i]; });
    const dirMap = new Map(directory.map((d) => [d.uid, d]));
    return buildStudyRows({
      className,
      boards: boardList.map((b) => ({ id: b.id, title: b.title })),
      cardsByBoard,
      dirMap,
    });
  }
  // scope: "class"(현재 반) | "all"(전체 반), kind: "csv"|"pdf"|"excel"
  async function handleExport(scope, kind) {
    if (exporting) return;
    setExporting(true);
    try {
      if (scope === "class") {
        const rows = await rowsForBoards(classBoards, currentClass?.name || "");
        if (rows.length === 0) { setToast("내보낼 학생 활동 카드가 아직 없어요."); return; }
        const base = `${currentClass?.name || "공부방"}_활동자료`;
        if (kind === "csv") downloadStudyCsv(rows, `${base}.csv`);
        else printStudyPdf(rows, currentClass?.name || "공부방");
      } else {
        // 전체 반 — 반별로 시트(엑셀)/구역(PDF) 분리
        const sections = await Promise.all(
          classes.map(async (c) => ({
            name: c.name,
            className: c.name,
            rows: await rowsForBoards(
              boards.filter((b) => b.classId === c.id),
              c.name
            ),
          }))
        );
        const withRows = sections.filter((s) => s.rows.length > 0);
        if (withRows.length === 0) { setToast("내보낼 학생 활동 카드가 아직 없어요."); return; }
        if (kind === "excel") {
          downloadStudyWorkbook(withRows, "공부방_활동자료_전체.xls");
        } else {
          printStudyPdfSections(withRows, "전체 반");
        }
      }
      setExportOpen(false);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    const unsubC = subscribeClasses(setClasses);
    const unsubB = subscribeStudyBoards(setBoards);
    const unsubQ = subscribeQuestions(setQuestions);
    const unsubK = subscribeKeywords(setKeywordDocs);
    return () => {
      unsubC();
      unsubB();
      unsubQ();
      unsubK();
    };
  }, []);

  // 세션에서 고른 반을 읽고, 반/역할이 바뀌면 다시 평가합니다
  useEffect(() => {
    const sync = () => setLocalSelectedId(getSelectedClassId());
    sync();
    window.addEventListener("class-change", sync);
    window.addEventListener("role-change", sync);
    return () => {
      window.removeEventListener("class-change", sync);
      window.removeEventListener("role-change", sync);
    };
  }, []);

  const admin = user ? isAdmin(user) : false;

  // 학생: 서버 소속 구독 — 기기·캐시가 바뀌어도 로그인하면 소속이 따라옵니다.
  useEffect(() => {
    if (!user || admin) {
      setMemberships([]);
      return;
    }
    return subscribeMyMemberships(user.uid, setMemberships);
  }, [user?.uid, admin]);

  // 교사/관리자만 사용자 디렉터리(실명) + 입장 코드 구독.
  // 학생은 보안 규칙상 users·joinCodes 목록을 읽을 수 없으므로 구독하지 않습니다.
  useEffect(() => {
    if (!admin) {
      setDirectory([]);
      return;
    }
    const unsubDir = subscribeUserDirectory(setDirectory);
    const unsubCodes = subscribeJoinCodes(setJoinCodesMap);
    return () => {
      unsubDir();
      unsubCodes();
    };
  }, [admin]);

  // 학생이 보고 있는 반: 세션 선택이 내 소속에 있으면 그것, 아니면 첫 소속
  const membershipIds = useMemo(() => memberships.map((m) => m.classId), [memberships]);
  const studentClassId =
    localSelectedId && membershipIds.includes(localSelectedId)
      ? localSelectedId
      : membershipIds[0] ?? null;

  const keywordNames = useMemo(
    () => keywordDocs.map((k) => k.name),
    [keywordDocs]
  );

  // 교사가 고른 반은 세션에 저장돼 있어(localSelectedId), 새로고침해도 그 반을
  // 이어서 보여줍니다. 저장된 값이 없거나 더 이상 존재하지 않는 반이면
  // 첫 번째 반으로 폴백합니다.
  useEffect(() => {
    if (!admin || classes.length === 0) return;
    const valid = teacherClassId && classes.some((c) => c.id === teacherClassId);
    if (valid) return;
    const remembered =
      localSelectedId && classes.some((c) => c.id === localSelectedId)
        ? localSelectedId
        : classes[0].id;
    setTeacherClassId(remembered);
  }, [admin, classes, teacherClassId, localSelectedId]);

  const classId = admin ? teacherClassId : studentClassId;
  const currentClass = classes.find((c) => c.id === classId) ?? null;
  const currentCode = joinCodesMap[classId] ?? null; // { code, expiresAt } | null
  const classBoards = useMemo(
    () => boards.filter((b) => b.classId === classId),
    [boards, classId]
  );

  // 현재 반의 보상(과일) 구독 — 교사·학생 공통 (학생은 규칙상 자기 반만 읽기 가능)
  useEffect(() => {
    if (!classId) {
      setRewards([]);
      return;
    }
    return subscribeClassRewards(classId, setRewards);
  }, [classId]);

  // 교사: 현재 반의 소속 학생 구독 (반이 바뀌면 재구독)
  useEffect(() => {
    if (!admin || !classId) {
      setMemberUids([]);
      return;
    }
    return subscribeClassMembers(classId, setMemberUids);
  }, [admin, classId]);

  // 보상 명단
  //  · 교사: 소속 학생 전체를 디렉터리(실명)·과일 수와 합쳐 학번순 정렬
  //  · 학생: 보상 문서만으로 구성(익명 닉네임) — 과일 받은 친구만 보임
  const roster = useMemo(() => {
    if (!admin) {
      return rewards
        .filter((r) => (r.count ?? 0) > 0)
        .map((r) => ({
          uid: r.uid,
          name: r.name || "익명 친구",
          emoji: r.emoji || "🙂",
          count: r.count ?? 0,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
    }
    const dir = new Map(directory.map((d) => [d.uid, d]));
    const countByUid = {};
    rewards.forEach((r) => { countByUid[r.uid] = r.count ?? 0; });
    return memberUids
      .map((uid) => {
        const d = dir.get(uid) || {};
        return {
          uid,
          name: d.realName || d.studentId || "이름 미설정",
          studentId: d.studentId || null,
          emoji: d.emoji || "🙂",
          count: countByUid[uid] ?? 0,
        };
      })
      .sort((a, b) =>
        (a.studentId || a.name).localeCompare(b.studentId || b.name, "ko")
      );
  }, [admin, memberUids, directory, rewards]);

  // 과일 부여 시 익명 닉네임을 문서에 함께 저장(학생 화면 이름표용, 실명 아님)
  function awardReward(uid, count) {
    const d = directory.find((x) => x.uid === uid);
    setStudentReward(
      classId,
      uid,
      count,
      d ? { name: d.displayName || "", emoji: d.emoji || "🙂" } : null
    );
  }

  async function handleCreateClass(e) {
    e.preventDefault();
    if (!newClassName.trim()) return;
    const created = await addClass(getCurrentUser(), newClassName);
    setNewClassName("");
    setCreatingClass(false);
    setTeacherClassId(created.id); // 새로 만든 반으로 전환(교사 화면)
  }

  // 입장 코드 만료 여부 + 표시용 포맷
  const codeExpired = currentCode?.expiresAt
    ? toDate(currentCode.expiresAt) < new Date()
    : false;
  function formatExpiry(ts) {
    return toDate(ts).toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
    });
  }
  async function handleRegenerate() {
    if (!classId) return;
    setRegenerating(true);
    try {
      await regenerateJoinCode(classId, getCurrentUser());
    } finally {
      setRegenerating(false);
    }
  }

  // 보드 순서 변경 — 헤더를 드래그해 다른 보드 위에 놓으면 그 자리로 이동
  async function handleBoardDrop(targetId) {
    const dragId = draggingBoardId;
    setDraggingBoardId(null);
    if (!dragId || dragId === targetId) return;
    const ids = classBoards.map((b) => b.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    await reorderStudyBoards(ids);
  }

  // 학생이 아직 반에 입장하지 않았으면 입장 화면을 보여줍니다
  const showEntry = user && !admin && !classId;

  return (
    <div className="board-shell study-shell">
      {!isFirebaseConfigured && (
        <div className="demo-banner">
          <span className="demo-banner-full">⚠️ 데모 모드 — Firebase 설정 전이라 데이터가 브라우저에만 임시 저장됩니다 (새로고침 시 초기화). <code>lib/firebase.js</code>에 설정값을 입력하면 Firestore에 저장됩니다.</span>
          <span className="demo-banner-short">⚠️ 데모 모드 — 새로고침 시 초기화됩니다</span>
        </div>
      )}

      <TopNav
        active="study"
        onPython={() => setPyOpen((v) => !v)}
        pyActive={pyOpen}
      />

      {showEntry ? (
        <ClassEntry />
      ) : (
        <main className="study-main">
          {/* 본문 — KWL 사이드 패널 + 보드 컬럼 (사이드바와 동일 높이) */}
          <div className="study-body">
            <KwlPanel
              classId={classId}
              user={user}
              isTeacher={admin}
              onAsk={(text) => setAskKwlW(text)}
              mobileOpen={kwlMobileOpen}
              onMobileClose={() => setKwlMobileOpen(false)}
            />
            <div className="study-cols-wrap">
              {/* 제목 영역 — cols-wrap 안에 위치해 보드 컬럼과 정렬됨 */}
              <div className="study-head">
                <div className="study-head-main">
                  <div className="study-title-row">
                    <h1>🧩 공부방</h1>
                    {admin && classes.length > 0 && (
                      <select
                        className="study-class-select"
                        value={classId ?? ""}
                        onChange={(e) => {
                          setTeacherClassId(e.target.value);
                          setSelectedClassId(e.target.value); // 새로고침해도 이 반 유지
                          setShowCode(false);
                        }}
                        aria-label="반 선택"
                      >
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {admin && currentClass && (
                      <button
                        className="study-code-btn"
                        onClick={() => setShowCode(true)}
                        title="학생에게 알려 줄 입장 코드 크게 보기"
                      >
                        <IconKey size={17} /> 입장 코드
                      </button>
                    )}
                    {admin && (
                      <button
                        className="btn-ghost"
                        onClick={() => setCreatingClass(true)}
                      >
                        ➕ 반 만들기
                      </button>
                    )}
                    {admin && currentClass && classBoards.length > 0 && (
                      <button
                        className="btn-ghost"
                        onClick={() => setExportOpen(true)}
                        title="활동 자료 다운로드 (CSV·Excel·PDF)"
                      >
                        ⬇ 다운로드
                      </button>
                    )}
                  </div>

                  {admin ? (
                    <p>수업 자료를 확인하고, 활동 결과물을 카드로 남겨 보세요.</p>
                  ) : currentClass ? (
                    <p>
                      <strong className="study-class-name">
                        {currentClass.name}
                      </strong>{" "}
                      — 수업 자료를 확인하고, 활동 결과물을 카드로 남겨 보세요.
                    </p>
                  ) : (
                    <p>수업 자료를 확인하고, 활동 결과물을 카드로 남겨 보세요.</p>
                  )}
                </div>

                {!admin && currentClass && (
                  <button
                    className="btn-ghost"
                    onClick={async () => {
                      if (user) await leaveClass(user.uid, classId);
                      setSelectedClassId(null);
                    }}
                  >
                    🚪 반 나가기
                  </button>
                )}
              </div>
              {admin && classes.length === 0 ? (
                <p className="empty-note">
                  아직 만든 반이 없어요. ‘반 만들기’로 첫 반을 추가하고 학생에게
                  입장 코드를 알려 주세요.
                </p>
              ) : !admin && classBoards.length === 0 ? (
                <p className="empty-note">아직 열린 수업 보드가 없어요.</p>
              ) : (
                <div className="study-columns">
                  {classBoards.map((board, i) => (
                    <StudyBoardColumn
                      key={board.id}
                      board={board}
                      user={user}
                      isTeacher={admin}
                      isFirst={i === 0}
                      collapsed={i !== 0 && !!board.collapsed}
                      onToggleCollapse={() => toggleBoardCollapse(board)}
                      onExpandAll={expandAllBoards}
                      hasCollapsed={classBoards.some(
                        (b, bi) => bi !== 0 && !!b.collapsed
                      )}
                      onCollapseAll={collapseAllBoards}
                      canCollapseAll={classBoards.some(
                        (b, bi) =>
                          bi !== 0 && bi !== classBoards.length - 1 && !b.collapsed
                      )}
                      questions={questions}
                      classes={classes}
                      onAsk={(kw) => setAskKeyword(kw)}
                      onModalChange={setCardModalOpen}
                      onDuplicated={(className) =>
                        setToast(`'${board.title}' 보드를 '${className}' 반으로 복제했어요.`)
                      }
                      isDragging={draggingBoardId === board.id}
                      onBoardDragStart={() => setDraggingBoardId(board.id)}
                      onBoardDragEnd={() => setDraggingBoardId(null)}
                      onBoardDrop={() => handleBoardDrop(board.id)}
                    />
                  ))}
                  {admin && currentClass && (
                    <button
                      className="study-add-board-col"
                      onClick={() => setAddingBoard(true)}
                    >
                      <span className="study-add-board-plus">＋</span>
                      수업 보드 추가
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 오른쪽: 멋진 순간 패널 — 교사는 관리, 학생은 뱃지 조회만 */}
            {currentClass && (
              <StudyRewardPanel
                roster={roster}
                classId={classId}
                readOnly={!admin}
                onAward={admin ? awardReward : undefined}
              />
            )}
          </div>
        </main>
      )}

      {/* 모바일 KWL 열기 버튼 (FAB) */}
      {classId && user && !kwlMobileOpen && (
        <button
          className="kwl-fab"
          onClick={() => setKwlMobileOpen(true)}
          aria-label="KWL 패널 열기"
        >
          📝 KWL
        </button>
      )}

      {/* KWL 패널 열릴 때 배경 오버레이 */}
      {kwlMobileOpen && (
        <div
          className="kwl-mobile-backdrop"
          onClick={() => setKwlMobileOpen(false)}
        />
      )}

      {/* 입장 코드 크게 보기 모달 — 학생들이 멀리서도 볼 수 있게 */}
      {showCode && currentClass && (
        <div className="modal-backdrop" {...backdropClose(() => setShowCode(false))}>
          <div
            className="modal modal-joincode"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="btn-close joincode-close"
              onClick={() => setShowCode(false)}
              aria-label="닫기"
            >
              ×
            </button>
            <p className="joincode-class">{currentClass.name}</p>
            <p className="joincode-label">입장 코드</p>
            <p className="joincode-value">{currentCode?.code ?? "—"}</p>
            <p className="joincode-hint">
              공부방 입장 화면에서 이 코드를 입력하세요
            </p>
            {currentCode?.expiresAt && (
              <p className={`joincode-expiry${codeExpired ? " expired" : ""}`}>
                {codeExpired
                  ? "⚠️ 만료된 코드예요 — 재발급해 주세요"
                  : `${formatExpiry(currentCode.expiresAt)}까지 유효`}
              </p>
            )}
            <button
              className="joincode-regen"
              onClick={handleRegenerate}
              disabled={regenerating}
            >
              {regenerating ? "재발급 중…" : "🔄 코드 재발급"}
            </button>
          </div>
        </div>
      )}

      {/* 반 만들기 모달 */}
      {/* 활동 자료 다운로드 모달 — 범위·형식은 여기서 선택 */}
      {exportOpen && (
        <div className="modal-backdrop" {...backdropClose(() => setExportOpen(false))}>
          <div className="modal modal-export" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>⬇ 활동 자료 다운로드</h3>
              <button
                className="btn-close"
                onClick={() => setExportOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <p className="export-desc">
              클래스·주제·학번·이름·작성시각·제목·내용 순으로 정리해 내려받아요.
            </p>

            <div className="export-group">
              <div className="export-group-title">
                이 반 — {currentClass?.name}
              </div>
              <div className="export-actions">
                <button
                  className="study-export-btn"
                  onClick={() => handleExport("class", "csv")}
                  disabled={exporting}
                >
                  CSV
                </button>
                <button
                  className="study-export-btn"
                  onClick={() => handleExport("class", "pdf")}
                  disabled={exporting}
                >
                  PDF
                </button>
              </div>
            </div>

            {classes.length > 1 && (
              <div className="export-group">
                <div className="export-group-title">전체 반 — 반별로 나눠서</div>
                <div className="export-actions">
                  <button
                    className="study-export-btn"
                    onClick={() => handleExport("all", "excel")}
                    disabled={exporting}
                    title="반별 시트로 나눈 엑셀(.xls)"
                  >
                    Excel (반별 시트)
                  </button>
                  <button
                    className="study-export-btn"
                    onClick={() => handleExport("all", "pdf")}
                    disabled={exporting}
                    title="반별 페이지로 나눈 PDF"
                  >
                    PDF (반별 페이지)
                  </button>
                </div>
              </div>
            )}

            <p className="export-hint">
              PDF는 인쇄 창이 열리면 대상에서 ‘PDF로 저장’을 선택하세요.
            </p>
          </div>
        </div>
      )}

      {creatingClass && (
        <div className="modal-backdrop" {...backdropClose(() => setCreatingClass(false))}>
          <div className="modal modal-class-create" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>➕ 새 반 만들기</h3>
              <button
                className="btn-close"
                onClick={() => setCreatingClass(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <form className="form-grid" onSubmit={handleCreateClass}>
              <input
                type="text"
                placeholder="반 이름 (예: 3학년 3반, 수요일 코딩반)"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                autoFocus
              />
              <p className="study-link-hint">
                반을 만들면 입장 코드가 자동으로 생성됩니다. 학생에게 그 코드를
                알려 주면 해당 반 공부방에 입장할 수 있어요.
              </p>
              <button type="submit" className="btn-primary">
                반 만들기
              </button>
            </form>
          </div>
        </div>
      )}

      {addingBoard && currentClass && (
        <StudyBoardForm
          keywords={keywordNames}
          classId={currentClass.id}
          onClose={() => setAddingBoard(false)}
        />
      )}

      {(askKeyword !== null || askCode !== null || askKwlW !== null) && (
        <NewQuestionForm
          defaultKeyword={askKeyword ?? ""}
          keywords={keywordNames}
          initialContent={
            askCode ? codeBlockHtml(askCode) :
            askKwlW ? `<p>${askKwlW}</p>` :
            ""
          }
          onClose={(submitted) => {
            setAskKeyword(null);
            setAskCode(null);
            setAskKwlW(null);
            if (submitted === true) {
              setToast("질문이 게시판에 등록됐어요. 공부방에서 계속 활동하세요!");
            }
          }}
        />
      )}

      <PythonRunner
        open={pyOpen}
        onClose={() => setPyOpen(false)}
        onAskQuestion={(code) => {
          setAskCode(code);
          setAskKeyword(null);
        }}
        hasModalOpen={cardModalOpen || creatingClass || addingBoard || (askKeyword !== null || askCode !== null)}
      />

      <Toast message={toast} onDone={() => setToast("")} />
    </div>
  );
}
