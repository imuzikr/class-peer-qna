"use client";

// =============================================================
// 질문 게시판 — 슬랙/디스코드 스타일 3단 구조
//   [1단] 키워드(과목) 필터  [2단] 질문 카드 게시판  [3단] 공지사항
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  subscribeQuestions,
  subscribeNotices,
  subscribeKeywords,
} from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { codeBlockHtml } from "@/lib/html";
import { getCurrentUser } from "@/lib/user";
import KeywordSidebar from "@/components/KeywordSidebar";
import QuestionCard from "@/components/QuestionCard";
import QuestionModal from "@/components/QuestionModal";
import NewQuestionForm from "@/components/NewQuestionForm";
import NoticePanel from "@/components/NoticePanel";
import PythonRunner from "@/components/PythonRunner";

export default function BoardPage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [questions, setQuestions] = useState([]);
  const [notices, setNotices] = useState([]);
  const [keywordDocs, setKeywordDocs] = useState([]); // {id, name, order}
  const [keyword, setKeyword] = useState("전체");
  const [selectedId, setSelectedId] = useState(null);
  const [writing, setWriting] = useState(false);
  const [pyOpen, setPyOpen] = useState(false); // 파이썬 실행 패널
  const [askCode, setAskCode] = useState(null); // 실행기에서 넘어온 코드

  // 실시간 구독 (컴포넌트가 사라지면 자동 해제)
  useEffect(() => {
    const unsubQ = subscribeQuestions(setQuestions);
    const unsubN = subscribeNotices(setNotices);
    const unsubK = subscribeKeywords(setKeywordDocs);
    return () => {
      unsubQ();
      unsubN();
      unsubK();
    };
  }, []);

  // 키워드 이름 목록 (order 순서대로)
  const keywordNames = useMemo(
    () => keywordDocs.map((k) => k.name),
    [keywordDocs]
  );

  // 키워드별 질문 수
  const counts = useMemo(() => {
    const c = { 전체: questions.length };
    keywordNames.forEach((kw) => {
      c[kw] = questions.filter((q) => q.keyword === kw).length;
    });
    return c;
  }, [questions, keywordNames]);

  // 선택된 키워드로 필터링
  const filtered =
    keyword === "전체"
      ? questions
      : questions.filter((q) => q.keyword === keyword);

  // 모달에 표시할 질문 (목록이 갱신되면 answerCount도 함께 갱신되도록 id로 찾음)
  const selectedQuestion = questions.find((q) => q.id === selectedId) ?? null;

  return (
    <div className="board-shell">
      {!isFirebaseConfigured && (
        <div className="demo-banner">
          ⚠️ 데모 모드 — Firebase 설정 전이라 데이터가 브라우저에만 임시
          저장됩니다 (새로고침 시 초기화). <code>lib/firebase.js</code>에
          설정값을 입력하면 Firestore에 저장됩니다.
        </div>
      )}

      <header className="topbar">
        <span className="logo">📚 배움나눔</span>
        <div className="user-area">
          <button
            className={`btn-ghost ${pyOpen ? "py-btn-active" : ""}`}
            onClick={() => setPyOpen(!pyOpen)}
          >
            🐍 파이썬 실행기
          </button>
          <span className="user-badge">
            {user.displayName} ({user.uid})
          </span>
          <button className="btn-ghost" onClick={() => router.push("/")}>
            로그아웃
          </button>
        </div>
      </header>

      <div className="three-cols">
        {/* 1단: 키워드 */}
        <KeywordSidebar
          keywords={keywordNames}
          selected={keyword}
          onSelect={setKeyword}
          counts={counts}
        />

        {/* 2단: 질문 게시판 */}
        <main className="feed-col">
          <div className="feed-head">
            <h2>
              {keyword === "전체" ? "전체 질문" : `# ${keyword} 질문`}{" "}
              <span style={{ color: "var(--text-sub)", fontSize: 14 }}>
                {filtered.length}개
              </span>
            </h2>
            <button className="btn-primary" onClick={() => setWriting(true)}>
              ✏️ 질문하기
            </button>
          </div>

          {filtered.length === 0 ? (
            <p className="empty-note">
              아직 질문이 없어요. 첫 번째 질문을 올려 보세요!
            </p>
          ) : (
            filtered.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                onClick={() => setSelectedId(q.id)}
              />
            ))
          )}
        </main>

        {/* 3단: 공지사항 */}
        <NoticePanel notices={notices} />
      </div>

      {selectedQuestion && (
        <QuestionModal
          question={selectedQuestion}
          onClose={() => setSelectedId(null)}
        />
      )}
      {writing && (
        <NewQuestionForm
          defaultKeyword={askCode ? "정보" : keyword}
          keywords={keywordNames}
          initialContent={askCode ? codeBlockHtml(askCode) : ""}
          onClose={() => {
            setWriting(false);
            setAskCode(null);
          }}
        />
      )}

      {/* 파이썬 실행 슬라이드 패널 */}
      <PythonRunner
        open={pyOpen}
        onClose={() => setPyOpen(false)}
        onAskQuestion={(code) => {
          // 실행기의 코드를 코드 블록으로 담아 질문 작성 모달 열기
          setAskCode(code);
          setWriting(true);
        }}
      />
    </div>
  );
}
