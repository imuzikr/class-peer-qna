"use client";

// =============================================================
// 공부방 — 수업의 연장. Trello/Padlet 스타일 가로 컬럼 보드.
//   [수업 안내] (교사 전용 게시) + [수업 보드…] (학생 결과물)
// 키워드를 연계한 보드에서는 카드에서 바로 질문하고(질문하기),
// 관련 질문을 모아 볼 수 있습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeStudyBoards, subscribeQuestions, subscribeKeywords } from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { isAdmin } from "@/lib/user";
import { useCurrentUser } from "@/lib/useCurrentUser";
import TopNav from "@/components/TopNav";
import StudyBoardColumn from "@/components/StudyBoardColumn";
import StudyBoardForm from "@/components/StudyBoardForm";
import NewQuestionForm from "@/components/NewQuestionForm";
import Toast from "@/components/Toast";

export default function StudyPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [boards, setBoards] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [keywordDocs, setKeywordDocs] = useState([]);
  const [addingBoard, setAddingBoard] = useState(false);
  const [askKeyword, setAskKeyword] = useState(null); // "질문하기"로 새 질문 작성
  const [toast, setToast] = useState("");

  useEffect(() => {
    const unsubB = subscribeStudyBoards(setBoards);
    const unsubQ = subscribeQuestions(setQuestions);
    const unsubK = subscribeKeywords(setKeywordDocs);
    return () => {
      unsubB();
      unsubQ();
      unsubK();
    };
  }, []);

  const admin = user ? isAdmin(user) : false;
  const keywordNames = useMemo(
    () => keywordDocs.map((k) => k.name),
    [keywordDocs]
  );

  // 카드에서 관련 질문 클릭 → 게시판에서 해당 질문 모달 열기
  function openQuestion(id) {
    router.push(`/board?open=${id}`);
  }

  return (
    <div className="board-shell study-shell">
      {!isFirebaseConfigured && (
        <div className="demo-banner">
          ⚠️ 데모 모드 — Firebase 설정 전이라 데이터가 브라우저에만 임시
          저장됩니다 (새로고침 시 초기화). <code>lib/firebase.js</code>에
          설정값을 입력하면 Firestore에 저장됩니다.
        </div>
      )}

      <TopNav active="study" />

      <main className="study-main">
        <div className="study-head">
          <div>
            <h1>🧩 공부방</h1>
            <p>수업 자료를 확인하고, 활동 결과물을 카드로 남겨 보세요.</p>
          </div>
          {admin && (
            <button className="btn-primary" onClick={() => setAddingBoard(true)}>
              ➕ 수업 보드 추가
            </button>
          )}
        </div>

        {boards.length === 0 ? (
          <p className="empty-note">
            {admin
              ? "아직 보드가 없어요. ‘수업 보드 추가’로 첫 활동을 만들어 보세요."
              : "아직 열린 수업 보드가 없어요."}
          </p>
        ) : (
          <div className="study-columns">
            {boards.map((board) => (
              <StudyBoardColumn
                key={board.id}
                board={board}
                user={user}
                isTeacher={admin}
                questions={questions}
                onAsk={(kw) => setAskKeyword(kw)}
                onOpenQuestion={openQuestion}
              />
            ))}
          </div>
        )}
      </main>

      {addingBoard && (
        <StudyBoardForm
          keywords={keywordNames}
          onClose={() => setAddingBoard(false)}
        />
      )}

      {askKeyword && (
        <NewQuestionForm
          defaultKeyword={askKeyword}
          keywords={keywordNames}
          onClose={(submitted) => {
            setAskKeyword(null);
            // 공부방에 머무르며 토스트로 알림 (게시판으로 이동하지 않음)
            if (submitted === true) {
              setToast("질문이 게시판에 등록됐어요. 공부방에서 계속 활동하세요!");
            }
          }}
        />
      )}

      <Toast message={toast} onDone={() => setToast("")} />
    </div>
  );
}
