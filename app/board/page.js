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
import KeywordSidebar from "@/components/KeywordSidebar";
import QuestionCard from "@/components/QuestionCard";
import QuestionModal from "@/components/QuestionModal";
import NewQuestionForm from "@/components/NewQuestionForm";
import NoticePanel from "@/components/NoticePanel";
import PythonRunner from "@/components/PythonRunner";
import UserProfile from "@/components/UserProfile";
import FilterMenu, { applyFilter } from "@/components/FilterMenu";
import RoleSwitcher from "@/components/RoleSwitcher";
import { getCurrentUser } from "@/lib/user";

export default function BoardPage() {
  const router = useRouter();

  const [questions, setQuestions] = useState([]);
  const [notices, setNotices] = useState([]);
  const [keywordDocs, setKeywordDocs] = useState([]); // {id, name, order}
  const [keyword, setKeyword] = useState("전체");
  const [filter, setFilter] = useState("all"); // 피드 필터 (FilterMenu)
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

  // [개발용] 관리자/학생 보기 전환 시 화면 전체를 새 역할로 다시 그림
  const [, setRoleTick] = useState(0);
  useEffect(() => {
    const onRoleChange = () => setRoleTick((t) => t + 1);
    window.addEventListener("role-change", onRoleChange);
    return () => window.removeEventListener("role-change", onRoleChange);
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

  // 선택된 키워드로 필터링 → 그 위에 피드 필터(미해결/내 글 등) 적용
  const byKeyword =
    keyword === "전체"
      ? questions
      : questions.filter((q) => q.keyword === keyword);
  const filtered = applyFilter(byKeyword, filter, getCurrentUser().uid);

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
        {/* 왼쪽: 로고 + 접속 사용자 프로필 (익명 닉네임) */}
        <div className="topbar-left">
          <span className="logo">📚 배움나눔</span>
          <span className="topbar-divider" aria-hidden="true" />
          <UserProfile />
        </div>
        <div className="user-area">
          {/* 개발용 — 관리자/학생 화면 전환 */}
          <RoleSwitcher />
          <button
            className={`btn-ghost ${pyOpen ? "py-btn-active" : ""}`}
            onClick={() => setPyOpen(!pyOpen)}
          >
            🐍 파이썬 실행기
          </button>
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
            <div className="feed-actions">
              <FilterMenu value={filter} onChange={setFilter} />
              <button className="btn-primary" onClick={() => setWriting(true)}>
                ✏️ 질문하기
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="empty-note">
              {filter === "all"
                ? "아직 질문이 없어요. 첫 번째 질문을 올려 보세요!"
                : "이 필터에 해당하는 질문이 없어요."}
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
          keywords={keywordNames}
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
