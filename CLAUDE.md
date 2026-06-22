# class-peer-qna — 프로젝트 컨텍스트

수업 중 학생 질문·답변을 실시간으로 공유하는 교실용 Q&A 웹앱.

## 기술 스택

- **프레임워크**: Next.js 15.5 App Router, React 18 (Client Components)
- **DB**: Firebase Firestore (실서비스) / 브라우저 인메모리 Mock (데모 모드)
- **스타일**: 단일 CSS 파일 `app/globals.css` (CSS Variables + Flexbox)
- **배포**: Vercel

## 실행

```bash
npm run dev   # 개발 서버 (http://localhost:3000)
npm run build # 프로덕션 빌드
```

Firebase 미설정 시 자동으로 **데모 모드**로 동작 (새로고침 시 데이터 초기화).
실서비스 전환: `lib/firebase.js`의 `firebaseConfig`에 Firebase 콘솔 값 입력.

## 주요 페이지

| 경로 | 설명 |
|------|------|
| `/` | 랜딩 — 수업 코드 입력 |
| `/board` | 질문 게시판 (3단 레이아웃: 키워드·피드·공지) |
| `/study` | 공부방 (Trello형 보드 + KWL 패널) |
| `/admin` | 관리자 대시보드 |
| `/report` | 학생 학습 리포트 |

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `lib/store.js` | Firestore CRUD + Mock Store + 구독(subscribe) 함수 전체 |
| `lib/user.js` | `getCurrentUser()`, `isAdmin()` — 세션 기반 사용자 |
| `lib/firebase.js` | Firebase 초기화. `isFirebaseConfigured` 플래그로 모드 분기 |
| `app/globals.css` | 전체 스타일. 모바일 반응형은 파일 하단 `@media (max-width: 768px)` |
| `components/QuestionModal.jsx` | 질문 상세 모달 (2열 데스크톱 / 단일스크롤 모바일) |
| `components/RichTextEditor.jsx` | 서식 입력 에디터 (variant: full/chat) |
| `components/KwlPanel.jsx` | KWL 사이드 패널 (오늘 탭 + 기록 탭) |
| `components/StudyBoardColumn.jsx` | 공부방 보드 컬럼 |

## 모바일 레이아웃 핵심 패턴

### QuestionModal (모바일)
- `modal-wide`: `height: 100dvh`, `overflow: hidden`, flex-column
- `qa-grid`: 단일 스크롤 컨테이너 (`overflow-y: auto`)
- `qa-mobile-header`: `position: sticky; top: 0; z-index: 2` — 스크롤해도 제목 탭 고정
- `qa-right`: `display: contents` → 자식(chat-head/chat-scroll/chat-compose)이 qa-grid 플렉스 아이템으로 편입
- `chat-scroll`: `flex: none; overflow-y: visible; min-height: 50vh` — 독립 스크롤 없음
- 자동 스크롤: `scrollRef`(qa-grid, 모바일) + `chatScrollRef`(chat-scroll, 데스크톱) 이중 처리

### 공부방
- 수평 스냅 스크롤: `scroll-snap-type: x mandatory`
- KWL 모바일: FAB 버튼(`kwl-fab`) → `kwl-panel--open` 클래스로 오버레이 패널

## 역할 구분

- **교사(isTeacher)**: 공지 작성, 전체 학생 카드 열람, 보드 설정, 정렬
- **학생**: 질문 1개 작성, 보드당 카드 1개 작성, KWL 작성
- **관리자(isAdmin)**: 실명 확인, 답변 이해 표시, 회고 현황 확인

역할 전환 (개발용): `RoleSwitcher` 컴포넌트 (`role-switch` CSS 클래스, 모바일에서 숨김)

## 데이터 모델 (Firestore 컬렉션)

- `questions` — 질문 (keyword, authorId, resolved, meTooIds[], reflection)
- `answers` — 답변 (questionId, authorId, understood)
- `studyBoards` — 공부방 보드 (classId, type, viewMode, editMode, keywords[])
- `studyCards` — 공부방 카드 (boardId, authorId, authorStudentId)
- `kwl` — KWL 기록 (classId, userId, date, K, W, L) — append 모델 (저장마다 새 문서)

## 주의 사항

- `store.js`의 Mock 구현과 Firebase 구현을 **항상 동기화**할 것
  (함수 추가 시 두 분기 모두 작성)
- `saveKwl` (upsert)은 제거됨 — `addKwl` (append)만 사용
- `subscribeMyKwl` (단일 반환)은 제거됨 — `subscribeMyTodayKwl` (배열 반환)만 사용
- CSS `@media (max-width: 760px)` 블록이 별도 존재함 — 768px 블록에서 필요 시 덮어쓸 것
- Enter 키는 줄바꿈으로만 동작 (전송 비활성화) — 전송은 전송 버튼만
