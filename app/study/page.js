"use client";

// =============================================================
// 공부방 — 수업의 연장. 반(클래스)별 Trello/Padlet 스타일 보드.
//   · 질문 게시판은 전체 공유 공간, 공부방은 "반별" 공간입니다.
//   · 학생: 입장 코드로 반에 들어와 그 반의 보드만 봅니다.
//   · 교사: 상단 드롭다운으로 반을 고르고, 반을 새로 만들 수 있습니다.
// 키워드를 연계한 보드에서는 카드에서 바로 질문하고(질문하기),
// 관련 질문을 모아 볼 수 있습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import {
  subscribeStudyBoards,
  subscribeQuestions,
  subscribeKeywords,
  subscribeClasses,
  addClass,
} from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { isAdmin, getCurrentUser } from "@/lib/user";
import { getSelectedClassId, setSelectedClassId } from "@/lib/classroom";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { codeBlockHtml } from "@/lib/html";
import TopNav from "@/components/TopNav";
import StudyBoardColumn from "@/components/StudyBoardColumn";
import StudyBoardForm from "@/components/StudyBoardForm";
import NewQuestionForm from "@/components/NewQuestionForm";
import PythonRunner from "@/components/PythonRunner";
import ClassEntry from "@/components/ClassEntry";
import Toast from "@/components/Toast";
import KwlPanel from "@/components/KwlPanel";

export default function StudyPage() {
  const user = useCurrentUser();
  const [classes, setClasses] = useState([]);
  const [boards, setBoards] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [keywordDocs, setKeywordDocs] = useState([]);
  // 학생이 입장한 반(세션 기준)과 교사가 보고 있는 반(화면 상태)은 별개입니다.
  // 그래야 같은 탭에서 역할을 바꿔 봐도 서로 간섭하지 않습니다.
  const [studentClassId, setStudentClassId] = useState(null);
  const [teacherClassId, setTeacherClassId] = useState(null);
  const [addingBoard, setAddingBoard] = useState(false);
  const [creatingClass, setCreatingClass] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [showCode, setShowCode] = useState(false); // 입장 코드 표시 토글
  const [askKeyword, setAskKeyword] = useState(null); // "질문하기"로 새 질문 작성
  const [askCode, setAskCode] = useState(null);     // 파이썬 실행기에서 넘어온 코드
  const [askKwlW, setAskKwlW] = useState(null);    // KWL W칸에서 넘어온 텍스트
  const [pyOpen, setPyOpen] = useState(false);      // 파이썬 실행 패널
  const [cardModalOpen, setCardModalOpen] = useState(false); // StudyBoardColumn 모달
  const [toast, setToast] = useState("");

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

  // 학생이 세션에 입장해 둔 반을 읽고, 반/역할이 바뀌면 다시 평가합니다
  useEffect(() => {
    const sync = () => setStudentClassId(getSelectedClassId());
    sync();
    window.addEventListener("class-change", sync);
    window.addEventListener("role-change", sync);
    return () => {
      window.removeEventListener("class-change", sync);
      window.removeEventListener("role-change", sync);
    };
  }, []);

  const admin = user ? isAdmin(user) : false;
  const keywordNames = useMemo(
    () => keywordDocs.map((k) => k.name),
    [keywordDocs]
  );

  // 교사는 반을 고르지 않았으면 첫 번째 반을 기본 선택합니다(화면 상태만 사용)
  useEffect(() => {
    if (!admin || classes.length === 0) return;
    const valid = teacherClassId && classes.some((c) => c.id === teacherClassId);
    if (!valid) setTeacherClassId(classes[0].id);
  }, [admin, classes, teacherClassId]);

  const classId = admin ? teacherClassId : studentClassId;
  const currentClass = classes.find((c) => c.id === classId) ?? null;
  const classBoards = useMemo(
    () => boards.filter((b) => b.classId === classId),
    [boards, classId]
  );

  async function handleCreateClass(e) {
    e.preventDefault();
    if (!newClassName.trim()) return;
    const created = await addClass(getCurrentUser(), newClassName);
    setNewClassName("");
    setCreatingClass(false);
    setTeacherClassId(created.id); // 새로 만든 반으로 전환(교사 화면)
  }

  // 학생이 아직 반에 입장하지 않았으면 입장 화면을 보여줍니다
  const showEntry = user && !admin && !classId;

  return (
    <div className="board-shell study-shell">
      {!isFirebaseConfigured && (
        <div className="demo-banner">
          ⚠️ 데모 모드 — Firebase 설정 전이라 데이터가 브라우저에만 임시
          저장됩니다 (새로고침 시 초기화). <code>lib/firebase.js</code>에
          설정값을 입력하면 Firestore에 저장됩니다.
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
          <div className="study-head">
            <div className="study-head-main">
              {/* 교사: 제목 오른쪽에 반 선택 · 코드 · 반 만들기 */}
              <div className="study-title-row">
                <h1>🧩 공부방</h1>
                {admin && classes.length > 0 && (
                  <select
                    className="study-class-select"
                    value={classId ?? ""}
                    onChange={(e) => {
                      setTeacherClassId(e.target.value);
                      setShowCode(false); // 반 바뀌면 코드 다시 숨김
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
                    onClick={() => setShowCode((v) => !v)}
                    title="학생에게 알려 줄 입장 코드"
                  >
                    🔑 {showCode ? currentClass.joinCode : "입장 코드"}
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

            {/* 학생: 다른 반으로 전환 (입장 코드 다시 입력) */}
            {!admin && currentClass && (
              <button
                className="btn-ghost"
                onClick={() => setSelectedClassId(null)}
              >
                🚪 반 나가기
              </button>
            )}
          </div>

          {/* 본문 — KWL 사이드 패널 + 보드 컬럼 */}
          <div className="study-body">
            <KwlPanel
              classId={classId}
              user={user}
              isTeacher={admin}
              onAsk={(text) => setAskKwlW(text)}
            />
            <div className="study-cols-wrap">
              {admin && classes.length === 0 ? (
                <p className="empty-note">
                  아직 만든 반이 없어요. ‘반 만들기’로 첫 반을 추가하고 학생에게
                  입장 코드를 알려 주세요.
                </p>
              ) : !admin && classBoards.length === 0 ? (
                <p className="empty-note">아직 열린 수업 보드가 없어요.</p>
              ) : (
                <div className="study-columns">
                  {classBoards.map((board) => (
                    <StudyBoardColumn
                      key={board.id}
                      board={board}
                      user={user}
                      isTeacher={admin}
                      questions={questions}
                      onAsk={(kw) => setAskKeyword(kw)}
                      onModalChange={setCardModalOpen}
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
          </div>
        </main>
      )}

      {/* 반 만들기 모달 */}
      {creatingClass && (
        <div className="modal-backdrop" onClick={() => setCreatingClass(false)}>
          <div className="modal modal-form" onClick={(e) => e.stopPropagation()}>
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
