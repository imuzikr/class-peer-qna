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
| `components/ClassNotesTools.jsx` | 기록 관리·수업 메모 버튼 + 모달 묶음 (교사 전용) |
| `components/CornellNoteDrawer.jsx` | 수업 노트 서랍 (학생 전용) — 오른쪽 손잡이 → 코넬 세 칸 |
| `components/CornellNoteSheet.jsx` | 수업 노트 한 장 — **읽기 전용 코넬 2단**(리포트·교사 열람 공용) |
| `components/CornellNoteViewerModal.jsx` | 내 노트 크게 보기 (학생) — 연속 넘기기 |
| `components/CornellNotesPanel.jsx` | '기록 관리'의 수업 노트 탭 — 날짜 하나로 반 전체 |
| `components/CornellNoteReadModal.jsx` | 한 학생의 지난 노트 넘겨 보기 + 피드백 (교사 전용) |

책방(`/books`)은 **활동 목록 → 활동** 두 단계입니다(URL은 `?activity=`).
예전에는 '활동 종류 그리드 → 그 종류의 목록 → 활동' 세 단계였는데, 가운데
화면이 하는 일이 종류를 고르는 것뿐이라 만들기 창의 종류 고르기와 겹쳤습니다.
지금은 반의 활동을 종류 섞어 한 목록에 **만든 차례**(오래된 것이 앞)로
늘어놓고 카드마다 종류를 적습니다. 옛 주소의 `?kind=`는 무시됩니다.
한때 최신순이었는데, 활동을 하나 만들 때마다 목록이 통째로 한 칸씩 밀려
어제 열던 활동이 매번 다른 자리에 있었습니다. 그래서 '가장 최근 활동'이
필요한 곳(`BookActivityStats`의 기본 선택)은 목록의 **끝**을 봅니다.

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

**'KWLS 차트' 패널**도 두 화면이 같습니다 — 머리말의 단추로 왼쪽 끝에서 폭을
벌리며 열리고(`.study-kwl-slot`), 교사는 `TeacherKwlPanel`('반이 어디까지
썼나'), 학생은 `KwlPanel`('내가 쓰는 곳')입니다. 책방 KWLS 활동도 공부방과
같은 `kwl` 컬렉션에 쌓이므로, 오늘 현황을 보러 화면을 옮길 이유가 없습니다.
책방에서는 **활동 목록 화면에서만** 답니다 — 활동을 열면 그 화면이 가로를 다
쓰는 데다 여는 단추(머리말)가 사라져 닫을 길이 없어집니다(연 상태는 기억).

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
- `bookActivities/{id}.deleted` · `.deletedAt` · `.deletedBy` — **휴지통**
  활동 삭제는 곧바로 지우지 않고 이 표시만 찍습니다(`deleteBookActivity`).
  목록·학생 화면·통계에서 사라지지만 자료는 그대로라 `restoreBookActivity`로
  돌아옵니다. 진짜로 없애는 것은 `purgeBookActivity` — 휴지통 안에서 한 번 더
  확인하고 부릅니다.
  - 예전에는 여기서 낱말·모둠·기록을 곧바로 지웠는데, 손이 미끄러져 한 반의
    활동이 통째로 날아간 일이 있었습니다. 앱 안에 되돌릴 길이 없어 Firestore
    시점 복구까지 갔지만 PITR이 꺼져 있어 보존 창이 1시간뿐이었고, 그 사이에
    지난 뒤라 못 살렸습니다. (그 뒤 PITR을 켜 두어 지금은 7일입니다.
    급할 때 쓰는 도구: `npm run books:rescue` — `functions/scripts/rescue-activity.mjs`)
  - **판정은 `deleted`(참·거짓)로 하세요.** `deletedAt`은 '언제'만 적어 둔
    것입니다 — `serverTimestamp()`는 서버가 답하기 전까지 화면에 null로 와서,
    그것만 보고 거르면 지운 활동이 한 박자 되살아났다가 사라집니다.
  - 거르는 자리는 화면입니다(질의에 조건을 붙이면 복합 색인이 필요).
    `app/books/page.js`와 `components/BookActivityStats.jsx` 두 곳.
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
  - **한 학생만 보기는 판 위의 모둠원 칩**(`ConsonantCanvas`의 범례)으로
    고릅니다. 누르면 그 학생 낱말만 남고('내 판'의 거르기와 같은 방식),
    위의 '모둠 전체 보기'로 돌아옵니다. 한 사람만 보는 중에는 **칩 줄을 통째로
    감춥니다** — 무엇을 보는 중인지는 위 한 줄이 말합니다.
    한때 왼쪽 모둠 카드 안에도 이름 단추를 뒀는데, 모둠을 고르는 것인지 학생을
    고르는 것인지 구분이 어려웠습니다. 이름표가 이미 판 위에 색과 함께 있으니
    그것을 그대로 단추로 씁니다(교사 화면에서만 — 학생에게는 이름표 그대로).
    고름은 캔버스 안 state이고, 부모에는 `onFocusChange`로만 알립니다
    (오른쪽 진행 패널이 그 학생 줄을 함께 짚는 데 씁니다).
  - **'모둠원별 진행'의 14칸은 진하기를 쓰지 않습니다** — 채웠으면 사람 색,
    안 채웠으면 회색 하나뿐입니다. 낱말 수를 진하기로 나타내면 한 개 넣은
    칸이 옅어 안 채운 칸과 헷갈립니다. 14칸을 다 채우면 마지막 칸에 붉은
    점(`.dash-heat-cell.is-done`) — 손들기 표시(`.question-signal-dot`)와 같은
    색·크기라 '여기 봐 달라'는 신호가 화면이 달라도 하나로 읽힙니다.
    **모둠별 진행 대시보드(`ConsonantDashboard`)는 그대로 진하기를 씁니다** —
    거기서는 '어디에 얼마나 모였나'가 그 패널의 주제라 뜻이 다릅니다.
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
  - **'전체 보기'는 격자 / 낱말 구름 두 얼굴**입니다(`.dash-view-tabs`).
    격자는 첫 글자로 나뉜 자리라 '어떤 낱말이 많이 나왔나'를 보려면 칸을
    하나씩 짚어야 합니다. 구름은 칸을 지우고 낱말만 남겨 그것을 한 화면에
    보여 줍니다. **이미 만든 `merged`를 다시 펴는 것뿐이라 읽는 문서가 하나도
    안 늡니다.**
    - 자리 잡기는 `lib/wordCloud.js`(순수 계산) — 큰 낱말부터 가운데에 놓고
      나선으로 밀려 나가며 빈틈을 찾습니다. 라이브러리를 쓰지 않습니다.
      판 넓이에 맞춰 글자 크기를 통째로 정하고, 하나라도 자리를 못 찾으면
      조금 줄여 다시 합니다 — 그래서 **판이 넓을수록 글자가 커집니다**.
    - **크기는 나온 횟수로만** 정합니다(넓이가 횟수에 비례하도록 제곱근).
      순위로 정하면 다 한 번씩 나온 낱말 사이에도 크기 차이가 생겨, 없는
      차이를 있는 것처럼 보여 줍니다. 다 같이 한 번씩이면 다 같은 크기가
      맞습니다.
    - **상위 70개**(`CLOUD_TOP_N`). 500개를 다 그리면 대부분이 읽을 수 없는
      점이 됩니다. 고르는 순서는 격자와 **같아야 합니다** — 다르면 격자에
      큰 낱말이 구름에 없는 일이 생깁니다.
    - **색은 위 다섯에만**(`accentCount`), 나머지는 먹빛으로 크기에 따라
      짙기를 줍니다(`restGray`). 낱말마다 모둠 색을 입혀 봤더니 일흔 개가
      저마다 다른 색이라 '어느 색이 많은가'를 눈이 먼저 세게 되어, 정작
      '무엇이 많이 나왔나'가 묻혔습니다. 모둠은 격자와 크게 보기가 색으로
      말해 줍니다. 다섯을 그냥 앞에서 세지 않고 **6위보다 확실히 많이 나온
      낱말에만** 칠합니다 — 다 한 번씩 나온 판에서 아무 낱말 다섯에 색이
      붙으면 없는 사실을 말하게 됩니다(다 같으면 하나도 안 칠함).
    - 글자 굵기는 `WordCloud.jsx`의 `WEIGHT`와 `.cloud-word`의 `font-weight`가
      **반드시 같아야** 합니다 — 폭을 재는 canvas와 실제 글자가 어긋나면
      낱말끼리 겹칩니다(`letter-spacing`은 음수만 — 좁아지는 쪽은 안전).
    - 중계할 때는 **고른 70개를 그대로 실어 보냅니다**(`cloud`·`cloudRest`).
      학생 쪽에서 다시 고르게 하면, 정렬에 쓰는 `firstAt`이 방송 문서에 없어
      다른 70개가 뽑힙니다. `view`로 격자/구름을 함께 바꿉니다.
    - 낱말이 들어올 때마다 다시 짜면 화면이 쉬지 않고 뒤척입니다 — 처음
      한 번은 곧바로, 그 뒤로는 0.9초 모았다가 한 번만(자리 이동은 CSS
      transition으로 미끄러지게).
- `bookActivities/{id}.grouped` — **곁텍스트·RAFT를 모둠으로 진행**
  - 닿소리만 모둠 활동이던 것을 곁텍스트 읽기·RAFT 글쓰기로 넓혔습니다.
    **글은 모둠으로 묶여도 학생마다 한 장 그대로**(`entries/{uid}`)이고,
    모둠이 정하는 것은 '누구와 함께 보는가' — 화면의 흐름과 동료 평가의
    범위입니다. 그래서 저장 위치도 규칙(entries)도 안 건드립니다.
  - **판정은 `grouped === true`로**(`lib/bookGroups.js`의 `isGroupedActivity`).
    `groupMode`로 판정하면 예전에 만든 개인 활동이 전부 모둠 활동으로
    둔갑합니다 — 그때도 방식과 상관없이 'teacher'가 적혀 있었습니다.
    닿소리는 원래 모둠 활동이라 이 표시를 안 씁니다(`groupMode !== 'solo'`).
  - 교사 화면은 `GroupFilterRow`(한 줄)로 카드를 모둠으로 좁힙니다. 닿소리처럼
    왼쪽 세로 목록을 두지 않은 이유는, 이 화면들은 카드 격자가 주인공이라
    왼쪽에 판을 두면 카드가 좁아져 학생 이름이 잘리기 때문입니다.
  - 학생 화면은 `GroupMatesRow`(우리 모둠 명단 칩) — 자기가 쓰는 칸 바로 위.
    '자유 구성'인데 아직 모둠이 없으면 `GroupJoinRow`가 대신 뜹니다(고르기
    전에도 글은 쓸 수 있습니다 — 어차피 각자 한 장이라서).
  - **만들기 창은 모둠을 세 번에 나눠 묻습니다**(`BookActivityForm`).
    한 줄에 다섯 갈래를 늘어놓았더니 '기본 모둠'과 '활동 모둠'이 나란히 있어
    무엇이 무엇인지 알기 어려웠습니다. 이제 묻는 차례대로 갈라 둡니다.
    ① 진행 방식 — 모둠 활동 / 개별 활동
    ② 모둠 구성 — 기본 모둠 그대로 / 이 활동만의 모둠
    ③ 모둠 짜는 방법 — 교사 배정 / 무작위 / 학생이 고르기 (②가 '이 활동만'일 때)
    저장되는 `groupMode`는 지금까지와 같은 다섯(solo·base·teacher·random·free)
    이라 **자료도 규칙도 그대로**입니다 — 묻는 방법만 바뀝니다.
  - **만들기 창은 가로로 넓은 두 칸**입니다(`.book-form-cols`, 900px).
    왼쪽은 '무엇을 할까'(활동 종류 다섯을 세로로), 오른쪽은 '어떻게 할까'
    (이름·주제어·주소·모둠). 480px 한 줄에 전부 쌓았더니 세로로 길어져
    안쪽에 스크롤 막대가 생겼고, 내리면 위에서 고른 활동 종류가 화면 밖으로
    나가 무엇을 만드는 중인지 안 보였습니다. 오른쪽은 물음을 짝지어 한 줄에
    둘씩 놓습니다(진행 방식 ｜ 모둠 구성 · 모둠 짜는 방법 ｜ 모둠 수).
    **한 줄에 셋을 넣지 마세요** — 버튼 줄이 두 줄로 접힙니다(‘모둠당 최대’를
    ‘모둠 짜는 방법’ 줄에 끼웠다가 그렇게 됐고, 지금은 ‘모둠 이름’ 옆입니다).
    768px 이하에서는 두 칸이 위아래로 풀리고 짝짓기도 한 줄에 하나씩 됩니다.
  - **고르는 도중에 창 크기가 변하지 않습니다.** 모둠 설정의 아랫부분
    (`.book-group-detail`)은 고른 갈래에 따라 내용이 통째로 바뀌는데
    ('이 활동만의 모둠'은 줄 둘 + 안내, 나머지는 안내문 한 덩이), 가장 큰
    갈래에 맞춰 `min-height: 166px`로 자리를 미리 잡아 둡니다. 166인 것은
    '학생이 고르기'의 고르개가 글자 칸보다 1.3px 높아서입니다 — 164로 두면
    그 갈래에서만 창이 자랍니다. 여기에 안내문을 더 길게 쓰면 그 갈래만
    커지므로, 고칠 때는 네 갈래의 높이를 함께 재 보세요. 768px 이하에서는
    이 자리 잡기를 풉니다(줄이 세로로 풀려 어차피 넘고, 짧은 갈래에는 빈
    자리만 크게 남습니다).
  - **기본값은 셋 다 '모둠 활동 + 기본 모둠'**입니다(닿소리·곁텍스트·RAFT).
    수업이 대체로 늘 같은 모둠으로 돌아가는데 활동마다 다시 짜면 같은 일을
    되풀이하게 됩니다. 반에 기본 모둠이 없으면 만들기를 막고 그 자리에서
    안내합니다(빈 모둠만 생겨 '이 활동만의 모둠'과 같아지므로).
  - **'이 활동에 판이 있는가'는 종류로 판정하지 마세요.** 곁텍스트·RAFT가
    모둠이 될 수 있게 되면서, 종류만 보는 곳은 전부 어긋납니다(활동 카드가
    모둠 RAFT를 '개인 활동'으로 적던 실제 버그). 판정은
    `type === 'consonant' || isGroupedActivity(activity)` — 닿소리는 늘 판이
    있고(개별 활동이면 1인 판), 곁텍스트·RAFT는 `grouped`일 때만입니다.
    `BookActivityStats`(닿소리 통계)처럼 **낱말을 세는 화면은 종류로 직접**
    거릅니다(`type === 'consonant'`) — '모둠이 있는 활동'으로 거르면 낱말이
    없는 모둠 RAFT까지 들어와 빈 격자가 뜹니다.
- `bookActivities/{id}/peerReviews/{받는사람_쓴사람}` — **동료 평가**
  (activityId, groupId, toUid, toName, fromUid, fromName, html, updatedAt)
  - 모둠 친구의 발표를 들으며 남기는 한 마디(감상·질문·평가). 문서 ID가
    `받는사람_쓴사람`이라 **한 친구에게 한 장**이고 그 장을 고쳐 씁니다 —
    여러 장이 쌓이면 무엇이 마지막 생각인지 알 수 없습니다.
  - **읽기는 받은 학생·쓴 학생·담당 교사뿐.** 반 전체가 서로 다 보게 하면
    먼저 쓴 코멘트를 보고 따라 씁니다. 대신 쓴 사람 이름은 남깁니다 —
    익명이면 함부로 씁니다.
  - **쓰기는 같은 모둠에만.** 규칙은 모둠을 뒤져 찾을 수 없어서 문서에 적힌
    `groupId` 한 번의 get으로 판정합니다 — 그 모둠 명단에 **쓴 사람과 받는
    사람이 둘 다** 있어야 통과하므로, 남의 모둠 id를 적어도 소용없습니다.
  - **잠금은 `peerReviewLocked` — 활동 전체 잠금(`locked`)과 별개.**
    '이제 그만 쓰고 이야기하자'로 닫는 자리라 글쓰기까지 함께 잠기면 안 됩니다.
  - **표시가 없으면 잠김입니다**(기본 잠김). 활동을 만들자마자 열려 있으면
    아직 아무도 발표하지 않았는데 코멘트가 쌓입니다 — 동료 평가는 '발표를
    듣는 시간'에만 여는 것이라, 교사가 머리말 단추로 한 번 열어야
    (`peerReviewLocked: false`) 시작합니다. 판정은 `lib/bookGroups.js`의
    `isPeerReviewOpen` 한 곳과 규칙의 `peerReviewOpen()` **둘이 같아야**
    합니다 — 한쪽만 고치면 화면은 쓸 수 있다고 하는데 저장이 거부됩니다.
  - 받은 한 마디를 보는 자리는 **둘**입니다: 학생은 자기 RAFT 글 아래
    (`PeerReviewList`, 앵커 `#peer-received` — 모둠 줄의 '💬 받은 한 마디'가
    거기로 데려다 줍니다), 교사는 학생 카드를 열었을 때 그 학생의 글 아래.
  - 학생 쪽 질의는 `where('fromUid','==',나)`와 `where('toUid','==',나)` 둘로
    나눕니다. 조건 없이 통째로 받으면 남의 평가까지 읽는 일이라 규칙이 막습니다
    (그 사실을 `tests/rules/peerReviews.test.mjs`에 시험으로 박아 두었습니다).
- `classes/{classId}/cornellNotes/{uid}_{날짜}` — **학생 수업 노트(코넬)**
  (classId, uid, date, lessonTitle, cue, notes, summary, feedback)
  - 학생이 수업 중에 오른쪽 서랍(`CornellNoteDrawer`)에서 적는 필기입니다.
    같은 부모의 `lessonMemos`는 **교사의** 수업 메모라 주인이 반대입니다 —
    이름을 `lessonNotes`로 지으면 반드시 헷갈려서 `cornellNotes`로 뒀습니다.
  - 칸은 코넬 노트 그대로: `lessonTitle`(제목) · `cue`(단서·핵심 질문) ·
    `notes`(필기, 서식 HTML) · `summary`(내 말로 요약). 하루 한 장 —
    복습 단위가 차시라서입니다.
  - **수업 모드에서는 제목이 프로젝트 이름으로, 자료가 함께 걸립니다.**
    `LessonMode`가 방송에 `boardId`·`boardTitle`을 함께 싣고(자료 목록 자체는
    안 싣습니다 — 방송은 슬라이드를 넘길 때마다 덮어써져 매번 실어 나르면
    쓰기가 커집니다), 서랍이 `fetchBoardHandouts(boardId)`로 그 프로젝트의
    학습 자료를 **문서 1건** 읽어 노트의 `materials`에 이름+링크로 걸어 둡니다.
    - `studyBoards` 읽기는 로그인 사용자에게 열려 있어 **규칙을 안 건드립니다**
      (자료는 원래도 학생 활동 화면에 보였습니다 — 여기서 얻는 것은 권한이
      아니라 '두 달 뒤 그 노트에서 바로 닿는다'입니다). 규칙 시험으로 확인.
    - **파일을 복제하지 않습니다.** 학생 수만큼 같은 파일이 쌓입니다. 대신
      이름을 남겨, 교사가 나중에 그 파일을 지워 링크가 깨져도 '무엇이었는지'는
      압니다.
    - 이미 저장된 노트에 자료가 있으면 그것을 그대로 둡니다 — 교사가 프로젝트
      자료를 바꿔도 그날 노트에 걸린 것은 흔들리지 않습니다.
  - **`lessonTitle`은 학생이 적는 제목입니다.** 원래 방송 문서의 수업 제목을
    받아 적어 두던 자리인데, 코넬 노트에 제목 줄이 없으니 나중에 펴 봤을 때
    단서·필기만 있어 무슨 수업인지 알 수 없었습니다. 지금은 **방송 제목을
    기본값으로만** 채우고(아직 아무것도 안 적었을 때만), 학생이 한 번이라도
    손대면 다시 건드리지 않습니다 — 제목의 주인은 학생입니다. 새 필드를
    늘리지 않아 규칙도 그대로입니다.
  - **읽기는 본인과 담당 교사. 본문 쓰기는 학생 본인만.** 남의 필기를 고칠 수
    있으면 그건 그 학생의 기록이 아닙니다. 교사는 `feedback` 한 칸만 씁니다
    (`changedOnly(['feedback','feedbackAt','feedbackBy'])`).
  - 학생이 이어서 저장해도 피드백이 지워지지 않게, update 규칙이 feedback이
    그대로일 것을 요구합니다(앱은 merge로 써서 자연히 남습니다).
  - 서랍은 `TopNav`에서 **발표 오버레이와 형제로, 방송 조건 바깥에** 그립니다.
    오버레이 안에 넣으면 (ㄱ) 슬라이드를 넘길 때마다 다시 그려져 입력이
    끊기고, (ㄴ) `LessonMode`가 **일시정지에도** 방송 문서를 지우므로 한
    차시에 몇 번씩 서랍이 사라집니다. 서랍이 열리면
    `.broadcast-overlay--noted`로 발표 화면이 그만큼 좁아집니다(덮지 않음).
  - **손잡이는 열려 있을 때도 남습니다** — 서랍 왼쪽 가장자리
    (`.cornell-handle.open { right: var(--cornell-w) }`)로 옮겨 붙어 그대로
    '닫기'가 됩니다. 여닫는 자리가 늘 같은 곳이라야 손이 기억합니다(예전에는
    열리는 순간 사라져 닫는 길이 머리말 ×와 Esc뿐이었습니다). 바깥을 눌러
    닫지는 **않습니다** — 수업 중 슬라이드를 한 번 볼 때마다 닫혀 쓰던 흐름이
    끊깁니다(글은 자동 저장이라 날아가진 않지만). 손잡이가 세로쓰기라 그 안의
    숫자 배지·화살표는 `writing-mode: horizontal-tb`로 되돌립니다.
  - 서랍은 폭이 380px라 세 칸을 **세로로** 쌓습니다. 진짜 코넬 2단(왼쪽 좁은
    단서 · 오른쪽 넓은 필기 · 아래 요약)은 `CornellNoteSheet` 한 곳에만 있고,
    학생 리포트와 교사 열람이 그것을 같이 씁니다 — 한쪽만 고치면 같은 노트가
    두 얼굴이 됩니다.
  - **읽는 자리는 넷**입니다: 서랍(오늘 것 쓰기 + 아래에 최근 14일 목록) ·
    서랍의 '노트 전체 보기'가 여는 `CornellNoteViewerModal`(한가운데 큰 코넬
    2단, ‹ › 와 ← → 로 연속 넘기기) · `/report`의 '📓 수업 노트'(앵커
    `#cornell-notes`) · '기록 관리' 모달의 수업 노트 탭(교사).
    - 크게 보기는 **화면을 옮기지 않습니다.** 예전에는 `/report`로 밀어냈는데,
      수업 중에는 방송이 떠 있고 쓰던 노트도 두고 가야 해서 부담이 큽니다.
    - 그 창의 배경은 `z-index: 3010` — 보통 모달 배경(100)으로 두면 서랍
      (3001) 밑에 깔려 아무것도 안 보입니다. 서랍 **안이 아니라 형제로**
      그려, 서랍이 다시 그려져도 창이 흔들리지 않습니다.
    - Esc가 겹칩니다: 같은 `window`에 걸린 리스너끼리는 `stopPropagation`이
      안 통해, 창이 떠 있는 동안 서랍의 Esc 처리를 아예 비켜 줍니다
      (`if (!open || viewerOpen) return`). 안 그러면 한 번에 둘 다 닫힙니다.
  - **교사 화면은 날짜 하나로 좁혀 읽습니다**(`subscribeClassCornellNotesOn`).
    반 전체를 기간 제한 없이 받으면 학생 수 × 수업 일수(한 학기면 수천 건)라,
    '오늘 누가 썼나'를 학생 수만큼으로 줄입니다. 한 학생의 흐름은 카드를 눌러
    들어갔을 때만 그 학생 것을 받습니다(`subscribeStudentCornellNotes`).
    학생 리포트는 자기 반마다 리스너 하나(`subscribeMyCornellNotes`) —
    `collectionGroup`을 안 쓰는 이유는 규칙에 그룹 문을 새로 열지 않으려고요.
    셋 다 `where` 하나만 걸고 정렬은 화면에서 합니다(복합 색인 회피).
  - **선생님 한 마디 도착 알림** — 서랍이 뜰 때 `fetchMyRecentCornellNotes`로
    **최근 14일치**를 훑어 안 읽은 것을 셉니다(손잡이 숫자 배지 + 서랍 맨 위
    목록). 선생님은 수업이 끝난 뒤에 쓰므로 오늘 노트만 보면 어제 것에 달린
    한 마디를 영영 못 봅니다.
    - 읽는 방법은 **날짜마다 한 건씩 `getDoc`**입니다(문서 ID가 `uid_날짜`).
      질의로 좁히려면 uid 등호 + 날짜 범위라 복합 색인이 필요하고, 등호만
      걸면 그 반의 내 노트가 전부 옵니다(한 학기 쉰 장). 이 방식은 노트가
      쌓여도 **늘 14건 고정**입니다. 화면을 옮길 때마다 다시 읽지 않게
      **5분 캐시**를 둡니다(`invalidateMyRecentCornellNotes`).
    - **`documentId() in [...]` 한 방 질의는 규칙이 거부합니다**(실측).
      ID 앞부분이 uid라는 건 우리 약속일 뿐이라 규칙이 알 수 없습니다.
      실측 기록이 `tests/rules/cornellNotes.test.mjs`에 있으니 지우지 마세요.
    - 읽음 표시는 노트 문서의 `feedbackSeenAt`입니다(`markCornellFeedbackSeen`).
      localStorage로 하면 폰에서 읽은 것을 노트북이 몰라 배지가 되살아납니다.
      학생 update 규칙이 변경 키 화이트리스트가 아니라 '본인 것 + 칸 길이 +
      피드백 불변'만 보므로 **규칙을 고치지 않고** 이 필드가 통과합니다.
    - 판정은 `isCornellFeedbackUnread` 한 곳에서. `feedbackAt`이 없는 옛
      기록은 '봤다'로 봅니다 — 안 그러면 배지가 영영 안 꺼집니다.
  - **읽기 규칙은 `get`/`list`로 나눠 두었습니다.** 문서가 없으면 `resource`가
    비어 `resource.data.uid == uid()`가 오류로 끝나 **본인조차 거부**됩니다
    (아직 안 쓴 날짜를 열어 보는 경우 — 새 날 첫 접속이 여기 걸립니다).
    그래서 `get`에는 `nId.split('_')[0] == uid()` 갈래를 함께 뒀습니다. 쓰기
    규칙이 ID를 `uid_날짜`로 못 박고 있어 권한이 넓어지지 않습니다.
    `list`는 문서가 반드시 있으므로 지금까지대로 `resource.data.uid`로 봅니다.
  - 탈퇴 정리는 `purgeStudentData`의 `collectionGroup("cornellNotes")` 한 줄.
    반 아래라 반 삭제는 `purgeClass`가 알아서 정리합니다.
- `classes/{classId}/rewardEvents` — **과일 지급 이력** (uid, delta, count, byUid, at)
  - `rewards`는 누적 총계뿐이라 '언제 몇 개 받았나'가 없습니다. 참여의 변화를
    보려면 시계열이 필요해 지급할 때마다 한 건 적습니다(`setStudentReward`가
    총계와 **한 트랜잭션**으로 씁니다 — 동시 지급 유실도 이때 함께 막힙니다).
  - 이력이라 수정·삭제 불가. 반 삭제 시 `purgeClass`의 recursiveDelete가 정리.
  - **＋1·−1 단추는 반드시 `addStudentReward`(델타)로.** `setStudentReward`는
    '몇 개로 맞춰라'는 절대값이라, 화면에 보이는 개수로 `count + 1`을 만들어
    보내면 **빨리 두 번 누를 때 두 번째가 묻힙니다** — 첫 번째 결과가 구독으로
    돌아오기 전이라 두 번 다 같은 값을 보내고, 서버는 `before === safe`로 보아
    아무 일도 안 합니다(이력도 안 남습니다). 실제로 이 증상이 있었습니다.
    지금은 누르는 자리가 `onAward(uid, 개수, delta)`로 델타를 함께 넘기고,
    페이지의 `awardReward`가 델타가 오면 `addStudentReward`로 보냅니다
    (트랜잭션 안에서 읽은 값에 더하므로 한 번도 안 묻힙니다).
    절대값 경로는 '개수를 직접 맞추는' 자리에만 남겨 둡니다.
- `users` — 사용자 프로필 (uid, email, displayName(익명), realName, studentId, role)
  - **식별 정보(실명·이메일·학번)는 여기에만** 저장. 게시물·카드엔 익명 정보만 넣음.
  - 읽기 규칙: 본인+교사. 교사 화면은 `subscribeUserDirectory`로 uid→실명/학번 조회.
- `users/{uid}/notifications` — 개인 알림함 (답변 알림 · 반 공지)
  - 규칙은 **본인에게만** 열려 있습니다(`userId == uid()`). 교사도 못 읽고 못
    지웁니다 — 반 공지 알림에 교사 실명과 공지 본문이 들어 있어서, 여기를
    넓히면 교사가 학생 알림을 들여다볼 수 있게 됩니다.
  - 그래서 **탈퇴 처리 때 이 알림함은 서버 함수만 지울 수 있습니다**
    (`purgeStudentData`의 `recursiveDelete`, admin SDK라 규칙 우회).
    `lib/store.js`의 폴백 경로는 규칙에 막혀 지우지 못합니다.
  - Firestore는 문서를 지워도 하위 컬렉션을 함께 지우지 않습니다. 한때
    `purgeStudentData`에 알림함이 빠져 있어, 프로필만 사라지고 알림이 남은
    계정이 생겼습니다(콘솔에 기울임꼴 '존재하지 않는 문서'로 보입니다).
    원인은 막았고, 남은 것은 `npm run books:purge-orphans`로 훑어 지웁니다
    (`--apply` 없이는 찾아만 봅니다).

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

### ActivityHeatmap 잔디 — '건수'가 아니라 '몇 갈래로 참여했나'
- 예전에는 질문·답변 **건수**를 그대로 셌습니다. 활동이 늘면서 이 방식이
  무너집니다 — 한 번에 여러 건이 나오는 활동을 한 날이 성실히 참여한 여러
  날보다 진해집니다(활동마다 '한 건'의 무게가 다름).
- 지금의 하루 점수: 질문 1건 = 1(**하루 최대 2**) · 답변 1건 = 1(최대 2) ·
  KWLS 읽기 전(K·W) 1 + 읽은 뒤(L·S) 1 · 수업 노트 한 장 1.
  **끝까지 마친 것에만 +1**(KWLS 네 칸 · 노트 세 칸) — 개수를 더 세는 대신
  마무리에 색을 주면 '많이 쓴 사람'이 아니라 '끝낸 사람'이 짙어집니다.
  단계는 그대로 0 / 1 / 2 / 3~4 / 5+.
- 그래서 **범례가 '적음–많음'이 아니라 '한 가지–여러 가지'**이고, 칸 툴팁에
  그날 한 갈래를 적습니다(`9/3 · 질문 2 · KWLS 완성`). 색만으로는 왜 진한지
  알 수 없습니다.
- **책방 활동(닿소리·곁텍스트·RAFT)은 넣지 않습니다.** 가짓수는 많지만 수시로
  되풀이하는 활동이 아니라, 넣으면 그 활동을 한 날만 도드라지고 나머지 날의
  차이가 묻힙니다. 읽기 비용도 그렇습니다 — 여기 드는 넷은 `/report`가 **이미
  받아 둔 것**이라 새로 읽는 문서가 하나도 없습니다(책방은 새 구독·복합 색인).
- `/admin`은 고른 학생의 질문·답변·KWLS만 넘깁니다(수업 노트는 그 화면이 안
  받습니다). 그만큼 옅게 나오는데, 없는 것을 있는 척하는 것보다 낫습니다.

### ActivityOverview 값 계산
- **관리자**: 클래스 내 최대값 기준으로 정규화 (`Math.min(value / classMax, 1)`)
- **학생 리포트**: 고정 기준 (질문·답변 10개=100%, 공감 15개=100%)

### 자리표 '선생님 보기' (SeatPickGrid의 `flipped`)
- '멋진 순간' 패널 머리말의 **🙋 학생 보기 / 🧑‍🏫 선생님 보기** 토글. 기본은
  학생 보기(학생이 앉아 칠판을 보는 방향), 누르면 교탁에서 본 방향입니다.
- **배열을 뒤집지 않고 그림을 180도 돌립니다**
  (`.attend-seatmap-grid--flipped { transform: rotate(180deg) }` + 칸마다 도로
  180도). 자리표는 빈 칸이 섞인 격자라 배열을 뒤집으면 빈 칸이 엉뚱한 곳으로
  가고, 끌어 옮기기가 쓰는 자리 번호(index)도 어긋납니다.
- 패널과 '확대' 창이 **같은 방향**을 씁니다 — 한 자리표가 두 얼굴이면 안 됩니다.
- 고른 방향은 localStorage(`reward_seat_view`)에 기억합니다. 한 선생님은 대개
  늘 같은 쪽에서 봅니다.
- **켜짐 색을 두지 않습니다.** 글자가 '선생님 보기'/'학생 보기'로 바뀌어 지금
  어느 쪽인지 그대로 말합니다. 색까지 얹으면 옆의 손바닥 뱃지처럼 '켜져 있으니
  봐 달라'는 신호로 읽혀 눈길을 뺏습니다.
- 그 왼쪽에 **'출석 21/25'**(`.reward-seat-att`) — **출석을 끝낸 뒤에만**
  띄웁니다(`presentUids`가 있고 `attendanceOpen`이 아닐 때). 받는 중에 띄우면
  아직 오는 중인 학생이 결석 수처럼 읽힙니다. 세는 대상은 **지금 명단에 있는
  학생**뿐입니다 — 반에서 빠진 학생의 옛 기록이 섞이면 분자가 분모를 넘습니다.
  단추가 아니라 알림이라 배경 없이 글자만 둡니다.

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
