# class-peer-qna — 프로젝트 컨텍스트

수업 중 학생 질문·답변을 실시간으로 공유하는 교실용 Q&A 웹앱.

## 기술 스택

- **프레임워크**: Next.js 15.5 App Router, React 18 (Client Components)
- **DB**: Firebase Firestore (실서비스) / 브라우저 인메모리 Mock (데모 모드)
- **스타일**: 단일 CSS 파일 `app/globals.css` (CSS Variables + Flexbox)
- **배포**: Vercel

## 실행

```bash
npm run dev        # 개발 서버 (http://localhost:3000)
npm run build      # 프로덕션 빌드
npm run test:rules # Firestore 보안 규칙 테스트 (에뮬레이터, Java 필요)
```

규칙 테스트는 `tests/rules/`에 있고 최초 1회 `cd tests/rules && npm install`이
필요합니다. 루트와 분리한 이유·작성 시 주의점은 `tests/rules/README.md` 참고.
**`firestore.rules`를 고치면 반드시 이 테스트를 돌리고 배포하세요.**

## 배포 (Firestore 규칙 · Cloud Functions)

```bash
npx firebase-tools login   # 최초 1회, 브라우저로 Google 계정 로그인
npm run deploy             # 규칙 테스트 → firestore:rules + functions 배포
```

`npm run deploy -- --rules-only` / `--functions-only` / `--skip-tests` 옵션으로
범위를 좁힐 수 있습니다 (`scripts/deploy.sh` 참고). `firebase-tools`는 npx로
그때그때 받아 쓰고 루트 devDependency로는 넣지 않았습니다 — Vercel 빌드가
이 패키지를 전혀 쓰지 않는데 설치 시간만 늘기 때문입니다(`tests/rules/`,
`functions/`를 별도 워크스페이스로 분리한 것과 같은 이유). 앱 코드(Next.js)는
`main` 푸시 시 Vercel이 자동 배포하며, 이 스크립트와는 무관합니다.

Firebase 미설정 시 자동으로 **데모 모드**로 동작 (새로고침 시 데이터 초기화).
실서비스 전환: `lib/firebase.js`의 `firebaseConfig`에 Firebase 콘솔 값 입력.

## 주요 페이지

| 경로 | 설명 |
|------|------|
| `/` | 랜딩 — 수업 코드 입력 |
| `/board` | 질문 게시판 (3단 레이아웃: 키워드·피드·공지) |
| `/study` | 공부방 (프로젝트 대시보드 → 프로젝트 → 개인 카드 + KWL 패널) |
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
| `components/ActivityHeatmap.jsx` | 52주 잔디 히트맵 + ActivityOverview 통합 패널 |
| `components/ActivityOverview.jsx` | 오각형 레이더 차트 + 막대 요약 (학습 균형) |
| `components/PythonRunner.jsx` | Python 코드 실행기 (코드 복사 버튼 포함) |
| `components/StudyProjectDashboard.jsx` | 공부방 첫 화면 — 프로젝트 카드 그리드 (교사·학생 공통) |
| `components/StudyProjectView.jsx` | 프로젝트 상세 — 개인 카드 그리드 + 교사 도구 |
| `components/StudyProjectForm.jsx` | 프로젝트 만들기 모달 (제목·안내·활동 목록) |
| `components/ClassNotesTools.jsx` | 누가기록 관리·수업 메모 버튼 + 모달 묶음 (교사 전용) |

책방(`/books`)은 **활동 목록 → 활동** 두 단계입니다(URL은 `?activity=`).
예전에는 '활동 종류 그리드 → 그 종류의 목록 → 활동' 세 단계였는데, 가운데
화면이 하는 일이 종류를 고르는 것뿐이라 만들기 창의 종류 고르기와 겹쳤습니다.
지금은 반의 활동을 종류 섞어 한 목록에 최신순으로 늘어놓고 카드마다 종류를
적습니다. 옛 주소의 `?kind=`는 무시됩니다.

`ClassNotesTools`는 공부방 제목 줄, 책방 목록 머리말(반 고르는 줄 오른쪽),
책방 모아보기 화면들의 제목 끝에 같은 것을 끼워 씁니다. 책방 쪽은
`app/books/page.js`에서 **한 번 만들어** `classTools` prop으로 각 보드에
내려 줍니다 — 보드마다 명단·반 정보를 따로 구독하지 않으려고요.

왼쪽 **'📌 오늘' 패널**(오늘 이 반의 출석·카드·성찰·과일)도 공부방과 책방이
같은 컴포넌트를 씁니다 — `StudyActivityPanel`에 `board={null}`을 주면 그
모습이 됩니다. 책방은 `.books-body`(가로 flex)로 감싸 왼쪽에 놓았고,
`studyBoards`·출석은 책방 페이지에서 따로 구독합니다. 첫 줄 안내는
`todayNote`로 바꿉니다(책방에서는 이 자리가 활동 관리로 바뀌지 않으므로).
접힘 상태는 두 화면이 같은 localStorage 키를 공유합니다.

## 모바일 레이아웃 핵심 패턴

### QuestionModal (모바일)
- `modal-wide`: `height: 100dvh`, `overflow: hidden`, flex-column
- `qa-grid`: 단일 스크롤 컨테이너 (`overflow-y: auto`)
- `qa-mobile-header`: `position: sticky; top: 0; z-index: 2` — 스크롤해도 제목 탭 고정
- `qa-right`: `display: contents` → 자식(chat-head/chat-scroll/chat-compose)이 qa-grid 플렉스 아이템으로 편입
- `chat-scroll`: `flex: none; overflow-y: visible; min-height: 50vh` — 독립 스크롤 없음
- 자동 스크롤: `scrollRef`(qa-grid, 모바일) + `chatScrollRef`(chat-scroll, 데스크톱) 이중 처리

### 공부방
- 프로젝트 그리드(`study-project-grid`)·개인 카드 그리드(`study-project-cards`)는
  `repeat(auto-fill, minmax(…, 1fr))` → 768px 이하에서 `1fr`(한 줄에 한 장)
- KWL 모바일: FAB 버튼(`kwl-fab`) → `kwl-panel--open` 클래스로 오버레이 패널

## 역할 구분

- **교사(isTeacher)**: 프로젝트 만들기, 공지 작성, 전체 학생 카드 열람, 프로젝트 설정, 정렬
- **학생**: 질문 1개 작성, 프로젝트당 개인 카드 1개 작성, KWL 작성
- **관리자(isAdmin)**: 실명 확인, 답변 이해 표시, 회고 현황 확인

역할 전환 (개발용): `RoleSwitcher` 컴포넌트 (`role-switch` CSS 클래스, 모바일에서 숨김)

## 데이터 모델 (Firestore 컬렉션)

- `questions` — 질문 (keyword, authorId, resolved, meTooIds[], reflection) — 익명 닉네임만(authorName/authorEmoji)
- `answers` — 답변 (questionId, authorId, understood)
- `studyBoards` — 공부방 **프로젝트** (classId, type, viewMode, editMode, keywords[],
  activityType, activities[], activityLocks[]) — 화면 용어는 '프로젝트',
  컬렉션 이름은 예전 그대로(기존 데이터 유지)
  - `type: 'notice'` 하나는 반마다 자동 생성되는 '수업 자료'(선생님 보드)
- `studyBoards/{boardId}/cards` — 학생 **개인 카드** 서브컬렉션 (boardId, authorId, authorName, authorEmoji)
  - 문서 ID = 작성자 uid → 프로젝트당 카드 1개 보장. 전체 조회는 `collectionGroup("cards")` 사용
  - 카드 문서는 **학생이 처음 저장할 때** 생깁니다(규칙이 `authorId == 본인`을
    요구해 교사가 대신 못 만듦). 화면에서는 명단 기준으로 '빈 자리'를 미리
    깔아 두어(`StudyProjectView`의 seats) 카드가 이미 있는 것처럼 보입니다.
  - (데모 모드 mock은 평면 배열 `mock.studyCards`로 흉내 — Firebase는 서브컬렉션)
- `kwl` — **KWLS 기록** (classId, userId, date, answers{know,want,learned,still}
  + 옛 K/W/L/S 필드) — 문서 ID 고정 upsert (append 아님)
  - 공부방 하루 성찰: ID = `uid_classId_date`
  - 책방 KWLS 활동: ID = `uid_classId_act_활동id` + `activityId`·`topic`.
    책방 원본은 `bookActivities/{id}/entries/{uid}` 에 그대로 두고 여기에도
    적습니다 — 관찰 화면(히트맵·리포트·교사 패널)이 전부 이 컬렉션을 보므로
    이것만으로 두 곳의 KWLS가 한 흐름이 됩니다. 과거분은
    `npm run kwls:backfill` 로 옮깁니다(기본은 미리보기, `--apply` 로 실제 쓰기)
- `bookActivities/{id}.sectionLocks` — **곁텍스트 읽기의 단계별 열기**
  `{ [단계 key]: true }`(true = 잠김). 교사가 수업 진도에 맞춰 한 단계씩
  열어 줍니다 — 공부방의 `activityLocks`와 같은 생각입니다. 공부방은 활동
  이름이 바뀌고 순서가 움직여 배열이지만, 여기 여덟 단계는 `lib/paratext.js`에
  못 박혀 있어 key 맵입니다(답도 key로 저장하므로 나중에 단계를 끼워 넣어도
  어긋나지 않습니다).
  - **키가 없으면 잠김.** 만들 때 1단계만 열어 둡니다(`initialSectionLocks`).
  - **규칙에는 넣지 않습니다.** 여덟 단계의 답이 `entries/{uid}` 한 문서 한
    맵에 다 들어 있어, 규칙이 단계별로 판정하려면 필드 이름 15개를 규칙
    파일에 베껴 두고 손으로 맞춰야 합니다. 화면에서만 막습니다(공부방도
    같습니다). 활동 전체를 잠그는 `locked`는 그대로 규칙이 막습니다 —
    '수업 끝, 이제 아무도 못 고침'은 여전히 규칙이 보장합니다.
  - 헬퍼는 전부 `lib/paratext.js`에 있습니다(`isSectionLocked` ·
    `sectionLocksWith` · `sectionLocksUpTo` · `firstLockedIndex`).
- `bookActivities/{id}/groups/{gId}/words` — 책방 닿소리 낱말
  - `groupMode: 'solo'`(개별 활동)는 **구성원이 한 명뿐인 판**을 학생마다 하나씩
    둡니다. 새 컬렉션을 만들지 않아 학생 화면·교사 전체 보기·낱말 권한
    (`isMyBookGroup`)이 그대로 쓰입니다.
  - 이미 모둠으로 진행한 활동을 개별로 바꾸려면 `npm run books:to-solo`
    (인자 없이 실행하면 활동 목록, `<활동id>`로 미리보기, `--apply`로 실제).
    낱말 생성 규칙이 `authorId == 본인`이라 교사가 남의 낱말을 옮겨 적을 수
    없어서, 앱이 아니라 admin SDK 스크립트로 처리합니다.
  - 개별 활동은 **주제어를 판(group)마다 따로** 둡니다(`groups/{gId}.topic`).
    읽는 책이 저마다 다를 수 있어 교사는 활동의 `topic`을 비워 두고, 학생이
    자기 판 한가운데를 두 번 눌러 적습니다. 화면은 `group.topic || activity.topic`
    순으로 씁니다. 규칙은 개별 활동에 한해 그 판의 구성원에게 `topic` **한
    필드만** 허용합니다(`changedOnly(['topic'])` · 40자 · 잠기면 불가).
  - 개별 활동의 판은 한 사람짜리라 '모둠 안 자리'로 색을 매기면 모두 첫 색
    하나가 됩니다. 그래서 낱말에는 사람 색을 입히지 않고(범례도 없음),
    '학생별 진행' 패널만 줄 번호로 색을 줍니다(`lib/bookColors.js`의
    `ROW_COLORS` 10색 되풀이 — 붙어 있는 줄끼리만 다르면 충분).
  - 학생이 채우는 판(`.canvas-main:not(.dash-root)` / `.canvas-embed` 안의
    `.consonant-*`)은 연한 초록. 전체 보기 집계(ConsonantDashboard)도 뿌리가
    `.canvas-main`이라 `:not(.dash-root)`로 빼 둡니다 — 거기는 낱말마다 '넣은
    사람 색'이 붙는 화면이고, 끼워 넣은 형태(`.dash-embed`)와 색이 갈리면 같은
    화면이 두 얼굴이 됩니다. 중계 화면(`.cast-grid`)도 그대로. 판 색을 건드릴
    땐 **반드시 이 두 뿌리 아래로 한정**할 것.
  - **'전체 보기' 격자는 칸마다 낱말 다섯 개만** 보여 줍니다(`TopWords`).
    예전에는 모든 낱말을 나온 횟수만큼 반복해 늘어놓아 '줄 길이 = 언급 횟수'로
    읽혔는데, 낱말이 500개가 되자 폭 62px 고정 때문에 글자가 잘리고 칸마다
    안쪽 스크롤이 생겨 대부분이 안 보였습니다(칠판에서는 굴릴 수도 없습니다).
    지금은 반복 대신 `×3` 배지를 쓰고, 순서는 **많이 나온 순 → 같으면 먼저
    채운 순**입니다(가나다순은 수업 흐름과 무관해 씁니다). 나머지는 '+29개'로
    접고, 칸을 누르면 뜨는 크게 보기에 모둠 색과 함께 전부 있습니다.
    중계 화면(`PresentationOverlay`의 `CastTopWords`)도 같은 모습으로 맞춥니다 —
    한쪽만 바꾸면 교사 화면과 학생 화면이 달라집니다.
- `classes/{classId}/rewardEvents` — **과일 지급 이력** (uid, delta, count, byUid, at)
  - `rewards`는 누적 총계뿐이라 '언제 몇 개 받았나'가 없습니다. 참여의 변화를
    보려면 시계열이 필요해 지급할 때마다 한 건 적습니다(`setStudentReward`가
    총계와 **한 트랜잭션**으로 씁니다 — 동시 지급 유실도 이때 함께 막힙니다).
  - 이력이라 수정·삭제 불가. 반 삭제 시 `purgeClass`의 recursiveDelete가 정리.
- `users` — 사용자 프로필 (uid, email, displayName(익명), realName, studentId, role)
  - **식별 정보(실명·이메일·학번)는 여기에만** 저장. 게시물·카드엔 익명 정보만 넣음.
  - 읽기 규칙: 본인+교사. 교사 화면은 `subscribeUserDirectory`로 uid→실명/학번 조회.

## 시각화 컴포넌트 구조 (admin/report 공통)

### 차트 레이아웃 (2행)
- **1행**: `.admin-charts { display: grid; grid-template-columns: repeat(4, 1fr) }` — 도넛/막대 차트 4개
- **2행**: `<ActivityHeatmap>` — 52주 히트맵 + 레이더 오버뷰 풀 폭

### ActivityHeatmap 레이아웃 패턴 (중요)
- `.heatmap-outer`: flex row, `gap: 0` — 히트맵 영역 + ActivityOverview 나란히
- `.heatmap-body`: `flex: 1; overflow-x: auto` — 히트맵 전체 폭 차지
- `.heatmap-day-col`: 요일 레이블 컬럼 (고정 폭)
- `.heatmap-right`: `flex: 1; min-width: 0; display: flex; flex-direction: column` — 내부 column flex
- `.heatmap-week`: **`flex: 1; min-width: 13px`** — 주 컬럼이 가용 폭을 균등 분할 (고정 폭 아님)
- `.heatmap-cell`: **width 없음** — 부모 week 폭에 맞게 자동 확장 (고정 폭이면 그리드가 패널 폭을 못 채움)
- `.heatmap-legend-swatch`: 범례 스와치는 **별도 클래스**, `width: 15px` 고정 (heatmap-cell과 혼용 금지)
- `.activity-overview`: `flex-shrink: 0; width: 350px; border-left; margin-left: 20px; padding-left: 20px` — 구분선 양쪽 20px 대칭

### ActivityOverview 값 계산
- **관리자**: 클래스 내 최대값 기준으로 정규화 (`Math.min(value / classMax, 1)`)
- **학생 리포트**: 고정 기준 (질문·답변 10개=100%, 공감 15개=100%)

### PythonRunner 복사 버튼
- `.py-copy-btn` — `py-head-actions` 안, '전체 화면' 버튼 왼쪽에 위치
- 복사 후 2초간 초록 체크 아이콘으로 교체 (`copied` state)

## 주의 사항

- `store.js`의 Mock 구현과 Firebase 구현을 **항상 동기화**할 것
  (함수 추가 시 두 분기 모두 작성)
- `saveKwl` (upsert)은 제거됨 — `addKwl` (append)만 사용
- `subscribeMyKwl` (단일 반환)은 제거됨 — `subscribeMyTodayKwl` (배열 반환)만 사용
- CSS `@media (max-width: 760px)` 블록이 별도 존재함 — 768px 블록에서 필요 시 덮어쓸 것
- 채팅 입력: Enter 단독은 줄바꿈, **Ctrl/⌘+Enter는 전송** (전송 버튼도 유지)
- **pdf.js는 반드시 `legacy` 빌드**를 쓸 것 (`pdfjs-dist/legacy/build/…`).
  기본 빌드는 `Map.prototype.getOrInsertComputed` 등 최신 문법을 써서
  Chromium 141에서도 `render()`가 실패함(실측). `lib/pdfSlides.js`의 import와
  `scripts/copy-pdf-worker.mjs`가 복사하는 워커는 **항상 같은 빌드로** 맞출 것
- pdf.js 워커는 CSP(`worker-src 'self'`) 때문에 CDN 불가 — `public/`에 복사해
  같은 출처에서 서빙 (prebuild·predev에서 자동 실행, 생성물이라 git 제외)

## 질문 읽기 범위 — 진행 중인 정리

`questions`는 학교 전체가 함께 쓰는 컬렉션이라 2월까지 4~5천 건이 예상됩니다
(두 반 · 학생 50명). 화면마다 전체를 받으면 그 수에 비례해 느려지고,
Firestore 무료 할당(하루 읽기 5만 건)도 질문 300~400개 언저리에서 넘습니다.
그래서 **화면이 필요한 만큼만 받도록** 옮기는 중입니다.

**끝난 것** — 공부방·학습 리포트

| 화면 | 지금 읽는 범위 |
|------|----------------|
| `/report` | `subscribeMyQuestions` + `subscribeMyAnswerEvents` (내 것만, 리스너 2개) |
| 공부방 관련 질문 | `subscribeQuestionsByKeywords` (그 프로젝트 키워드) |
| 참여 전광판 질문 수 | `subscribeQuestionsByAuthors` (반 명단, 열었을 때만) |

`/report`는 예전에 **질문마다 답변 리스너를 하나씩** 걸었습니다(질문 5,000개면
리스너 5,000개). 지금은 방향을 뒤집어 내 답변을 먼저 찾고 그 답변이 달린 질문만
읽습니다 — 질문만 내 것으로 좁히면 **남의 질문에 단 내 답변이 통계에서
빠지므로**, 이 순서를 바꾸지 마세요.

**남은 것**

- **`/board` 페이지네이션** — 질문 200개쯤 쌓이면 착수. 목록을 자르는 것 자체는
  한 줄이지만, 전체 배열에 기대던 네 가지를 각각 옮겨야 합니다: 키워드 개수
  배지(`getCountFromServer`), 고정 글(`pinned` 별도 구독 후 앞에 붙이기),
  미해결·내 글 필터(서버 쿼리 — 여기만 **복합 색인 필요**, 코드보다 먼저 배포),
  `?open=<id>` 링크(목록에 없으면 `getDoc` 단건).
  200개 전에는 착수하지 말 것 — '고정 글이 첫 페이지 밖으로 밀려난 경우'를
  재현할 수 없어 맞게 짜도 확인이 안 됩니다.
- **`/admin`** — 아직 전체를 받고, 질문마다 답변 리스너를 겁니다(`/report`가
  갖고 있던 그 구조). 반 전체 활동 요약(누가 몇 개 묻고 답했나)을 만드는
  화면이라 '선택한 학생만'으로는 좁힐 수 없어 집계 방식을 다시 설계해야
  합니다. 교사만 가끔 여는 화면이라 `/board` 다음 순서.

**효과 확인** — Firebase 콘솔 → 사용량 → 읽기 수. 단계마다 전후를 비교하세요.

**'14칸을 다 채운 학생 n/N'을 활동 목록 카드에 두지 마세요.** 이 값을 내려면
그 활동의 낱말을 전부 읽어야 하는데(활동 하나에 400건 안팎), 목록은 카드가
계속 쌓이는 곳이라 카드마다 그 계산을 돌리면 활동 수에 정비례합니다 — 활동
20개면 목록을 한 번 열 때 7천여 건에 동시 조회 500여 개입니다. 한때 카드에
뒀다가 이 이유로 뺐습니다.

지금은 **작업 화면과 전체 보기**에만 있습니다. 두 화면은 이미 그 활동의 낱말을
구독하고 있어 읽기가 1건도 안 늡니다. 세는 범위가 화면마다 다른 점에 주의:
전체 보기는 모든 판을 받으므로 반 전체, 작업 화면은 개별 활동이면 반 전체이고
**모둠 활동이면 고른 모둠 하나뿐**입니다(그 화면이 그 모둠만 구독). 모둠
활동에서 반 전체를 보려면 '전체 보기'로 갑니다.

세는 단위는 낱말이 아니라 **칸**입니다(13칸에 낱말 14개면 13칸). 표시를
평균에서 완료 인원으로 바꿔도 읽는 양은 같습니다 — '그 칸을 채웠나'는 낱말
문서에만 있어서, 무엇을 세든 전부 읽어야 합니다. 목록에서도 싸게 보려면
낱말을 넣을 때 집계 문서를 함께 갱신하는 수밖에 없는데(Cloud Function),
활동이 스무 개를 넘겨 목록이 느려질 때까지는 하지 마세요 — 얻는 것 없이
어긋날 수 있는 실패 지점만 늡니다.
그래서 `fetchConsonantProgress`는 **한 번 읽고 세션 동안 캐시**하고, 교사가
그 활동을 열 때만 그 활동의 캐시를 버립니다(`invalidateConsonantProgress`).
활동이 스무 개를 넘어가면 이 방식도 무거워지므로, 그때는 '진행률 보기'를
눌러야 읽도록 바꾸거나 활동 문서에 집계를 적어 두는 쪽을 검토하세요.

새 색인을 늘리지 않으려고 `where`만 쓰고 정렬은 화면에서 합니다(등호 필터와
다른 필드 정렬을 함께 걸면 복합 색인이 필요해집니다). 결과가 수백 건 이하인
질의에서만 통하는 방법이니, 범위가 커지는 곳에는 그대로 쓰지 마세요.
