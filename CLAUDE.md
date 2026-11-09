# class-peer-qna (배움나눔) — 핵심 규칙과 길 안내

수업 중 학생의 질문·답변과 학습 기록을 실시간으로 나누는 교실용 웹앱입니다.
질문방 · 공부방 · 책방(독서 활동) · 수업 모드 · 학습 리포트로 이루어집니다.

**이 문서는 매 세션 처음에 읽히는 핵심 규칙과 안내만 둡니다(300줄 천장).**
기능마다의 자세한 약속 · 경위 · 실측은 `docs/`의 주제 문서에 있습니다.
**어떤 영역을 고치기 전에는 아래 '문서 지도'에서 그 문서를 열어 맨 위
'먼저 지킬 것' 절부터 읽으세요.** 여기 적힌 규칙과 주제 문서가 어긋나면
코드를 확인하고, 틀린 쪽을 고쳐 둡니다.

**선생님께 드리는 말은 늘 한국어로** 씁니다 — 답변 · 중간 안내 · 요약 · 질문까지
모두(선생님 요청). 커밋 메시지 · 코드 주석도 지금처럼 한국어입니다.

## 기술 스택

- **프레임워크**: Next.js 15.5 App Router, React 18 (Client Components)
- **DB**: Firebase Firestore(실서비스) / 브라우저 인메모리 Mock(데모 모드 —
  `lib/firebase.js`의 `isFirebaseConfigured`가 거짓이면 저절로, 새로고침하면 초기화)
- **파일**: Cloud Storage — 게이트웨이 함수를 거치는 보호된 첨부([docs/attachments.md](docs/attachments.md))
- **서버**: Cloud Functions(`functions/`, 서울 리전, `maxInstances: 10`)
- **스타일**: `app/globals.css`(입구) → `app/styles/NN-*.css` 61개를 **차례대로** `@import` (CSS 변수는 `01-base.css`)
- **배포**: 앱은 `main` 푸시 때 Vercel이 자동 배포 · 규칙과 함수는 `npm run deploy`

## 실행 · 시험

```bash
npm run dev        # 개발 서버 (http://localhost:3000)
npm run build      # 프로덕션 빌드 (린트는 건너뜀)
npm run test:unit  # tests/unit · tests/ui — 설치 없이 node --test
npm run test:rules # Firestore·Storage 규칙 시험 (에뮬레이터, Java 필요, 최초 1회 cd tests/rules && npm install)
npm run lint       # ESLint (보고만, 최초 1회 npm ci --prefix tools/lint) — 지금 경고 0개
npm run test:attachments:pilot  # 보호된 첨부 에뮬레이터 검증 (demo- 프로젝트만)
```

- **CI**(`.github/workflows/ci.yml`)가 main · `claude/**` 푸시와 PR에서 위 셋과 빌드를
  돌립니다. 배포를 막지는 않으므로 **main에 올리기 전에 작업 브랜치의 결과를 보세요.**
- 단위 시험은 앱 코드를 그대로 import합니다(`tests/unit/resolve.mjs`가 `@/`와 확장자를 풂).
  **JSX와 Firebase를 import하는 파일(`lib/store.js` · `lib/data/*`)은 못 읽습니다** —
  시험할 셈은 `lib/`의 제 파일로 빼냅니다.
- 린트 경고가 하나라도 뜨면 새로 생긴 것입니다. 끄는 주석에는 **바로 위에 까닭**을 적습니다.

## 배포 원칙 — 순서가 곧 안전입니다

1. **색인 → 규칙 → 함수 → 앱.** main 푸시가 곧 Vercel 배포이므로, 새 규칙·색인·함수에
   기대는 코드는 그것들을 **먼저** 배포한 뒤에 main에 올립니다. 순서가 뒤집히면 저장이
   권한 오류로 실패하거나(규칙), 질의가 `FAILED_PRECONDITION`으로 실패하거나(색인),
   첨부 업로드가 통째로 실패합니다(함수).
2. 명령: `npm run deploy`(규칙 시험 → 규칙 + 함수) · `-- --rules-only` · `--functions-only` ·
   `--indexes-only` · `--skip-tests`. `firebase-tools`는 npx로 씁니다(devDependency 아님).
   Claude 세션(Firebase 로그인 없음)에서는 GitHub Actions 'Firestore 규칙 배포'(`.github/workflows/deploy-rules.yml`, 손으로만 — [docs/deploy.md](docs/deploy.md)).
3. **Storage 규칙은 `npm run deploy`가 저절로 올리지 않습니다** — 첨부 전환 절차의 별도 명령
   (`--attachments-storage-transition` · `--attachments-storage-final`)으로만.
4. `firestore.rules`를 고치면 `npm run test:rules`를 돌리고 배포합니다.
5. 구글 로그인 프록시(`authDomain`)를 건드릴 때는 [docs/deploy.md](docs/deploy.md)의 절차를
   따릅니다(먼저 `?authproxy=1`로 한 기기에서 시험).
6. 함수 요금: `maxInstances`는 천장, `minInstances`는 켜지 않습니다. 요금이 먼저 문제가 될
   곳은 Firestore 읽기입니다([docs/board.md](docs/board.md) '질문 읽기 범위').

## 두루 걸리는 규칙

여러 화면에 걸쳐 실제로 고장을 냈던 것들입니다. 원문은 [docs/overview.md](docs/overview.md)와
각 주제 문서에 있습니다.

### 데이터 계층

- **데이터 함수는 `lib/data/*.js`(영역별)에 두고, 화면에 보일 이름만 `lib/store.js`에서
  다시 내보냅니다.** 화면은 `@/lib/store`에서 가져갑니다.
- **Mock과 Firebase 두 분기를 늘 함께 씁니다.** 영역 파일끼리 서로 가져올 때는 최상위에서
  곧바로 쓰지 않습니다(함수 안에서만). 데모 id의 일련번호는 `nextMockSeq()`.
- **mock 문서는 `replaceDoc(목록, 문서, 고칠 값)`으로 갈아 끼웁니다**(`lib/mockDocs.js`).
  제자리에서 고치면 구독하는 쪽이 같은 참조를 받아 React가 다시 그리지 않습니다.
- **첨부가 든 문서는 `lib/data/attachmentWrites.js`의 `addDoc` · `setDoc` · `updateDoc` ·
  `writeBatch`로 씁니다** — 저장 뒤 파일 연결을 등록해야 다른 사람이 그 첨부를 볼 수
  있습니다. 첨부를 붙일 새 컬렉션은 게이트웨이의 `PARENT_PATTERNS`에 경로를 더합니다.
- **날짜 셈은 `lib/dates.js` 한 곳**(`dateKeyOf` · `todayDateKey` · `shiftDateKey` ·
  `dateKeyLabel` · `formatClockMs` …). 날짜 열쇠가 곧 문서 ID라 한 글자만 달라도 지난
  기록을 못 찾습니다. 컴포넌트에 새로 짜지 않습니다.
- **반 명단은 `useClassRoster`**(셈은 `lib/roster.js`, 학번순). 소속 uid만이면
  `useClassMembers`. 디렉터리·과일은 페이지가 이미 구독한 것을 받아 씁니다.
- **교사 안내 카드 판정은 `isTeacherAuthoredCard` 한 곳**(`lib/activities.js`). uid 접두만
  보면 실서비스에서 샙니다. 같은 식을 다른 파일에 베껴 쓰지 않습니다.
- `saveKwl`·`subscribeMyKwl`은 없습니다 — `addKwl` · `subscribeMyTodayKwl`을 씁니다.

### Firestore 함정

- **구독의 빈 배열은 '없다'가 아니라 '아직 안 왔다'일 수 있습니다.** 빈 값으로 화면을
  통째로 갈아 끼우는 자리라면 '첫 답이 왔는가'(`…Loaded`)를 따로 듭니다. 첫 화면의 입장
  코드 깜빡임 · 상단바 `activeClassId`가 이 함정이었습니다([docs/overview.md](docs/overview.md)).
- **`serverTimestamp()`는 서버가 답하기 전까지 화면에 null로 옵니다.** 판정에 쓰지 말고
  (`deleted` 같은 참·거짓 칸으로), 정렬에서는 null을 '지금'으로 봅니다.
- **list 규칙은 결과가 아니라 질의로 판정합니다.** 규칙이 보는 칸(`toUid`·`fromUid`·`uid`)을
  질의의 `where`가 증명해야 통과합니다 — 보낸 것 · 받은 것을 둘로 나눠 구독하는 까닭.
- **`collectionGroup(...).where(...)`를 새로 쓰면 `firestore.indexes.json`에 색인을 함께
  적고 코드보다 먼저 배포합니다.** 단일 필드 예외는 자동 색인을 통째로 갈아 끼우므로
  컬렉션 범위 색인도 함께 적습니다.
- 복합 색인을 피하려 `where`만 걸고 정렬은 화면에서 하는 방식은 **결과가 수백 건 이하일
  때만** 씁니다.
- 동시에 여럿이 누르는 값(과일 등)은 **절대값이 아니라 델타**로 트랜잭션 안에서 더합니다.
- Firestore 쓰기를 기다리는 저장 단추는 `withAckTimeout`(`lib/ackTimeout.js`)으로 감싸
  '저장 중…'에 멈추지 않게 합니다.

### React · 린트

- 구독 효과는 `user` 객체가 아니라 `const myUid = user?.uid`를 의존합니다.
- StrictMode가 갱신 함수를 두 번 부르므로, `setState(fn)` 안에서 부수 효과(인용 붙이기 등)를
  하지 않습니다.
- 개발 모드에서 '마운트 직후 정리'가 한 번 돕니다 — `aliveRef` 같은 표시는 효과 안에서 켭니다.

### 화면 공통

- **모달**: 배경에 `{...backdropClose(onClose)}`를 달면 Esc가 맨 위 모달만 닫습니다.
  Esc를 스스로 다루는 곳은 `e.preventDefault()`를 부릅니다. 글이 든 칸이 있으면 안 닫힙니다.
- **팝오버**: `lib/popover.js`의 `usePopoverAnchor` · `usePopoverDismiss`. 바깥 클릭 판정에는
  `if (!e.target.isConnected) return;`을 둡니다(누르는 순간 사라진 것은 바깥이 아님).
- 이어 놓인 단추 · 탭은 **같은 크기**(격자 `repeat(n, minmax(0, 1fr))`), 모달 아래 두 단추는
  **균등 두 칸**(`.modal-actions`).
- 잠김/열림은 `IconLockState`, 개별/모둠은 `IconIndividual`/`IconGroup`(`StatusIcons.jsx`) —
  이모지로 대신하지 않고, 색만으로 상태를 가르지 않습니다.
- 안내·예시 글자는 `--text-faint`. 책방·공부방 교사 화면 안의 배치는 미디어 쿼리가 아니라
  **컨테이너 질의**(`@container`)로 접습니다(양옆 패널 때문에 창 폭으로는 모름).
- 저장된 서식 글이 뿌려지는 자리를 새로 만들면 코드 블록 · 목록 서식 규칙에 그 선택자를
  더합니다([docs/ui.md](docs/ui.md)).
- 첨부 그림은 `SecureImage` · `SecureHtml`로 그립니다(식별자를 `<img src>`에 곧바로 넣지 않음).
- 독서 활동 화면의 머리말 · 저장 표시 · 잠김 안내 · 도서 정보는 `components/BookHeadParts.jsx`의 조각으로 그립니다 —
  새 활동도 그대로 씁니다([docs/books.md](docs/books.md) '독서 활동 공통 조각').
- 과일 그림은 `RewardFruits.jsx`의 `nextFruit`·`lastFruit`, 이름표 자리는 🍊. 축포는 `TopNav`에 하나.
- 채팅 입력은 Enter가 줄바꿈, Ctrl/⌘+Enter가 전송.
- **CSS는 `app/styles/`의 기능별 파일**이고 `app/globals.css`가 차례대로 `@import`합니다.
  **@import 차례를 바꾸지 마세요** — 같은 선택자가 여러 파일에 나뉜 곳이 있어 차례가 곧
  우선순위입니다. 새 규칙은 그 기능의 파일에 적습니다([docs/ui.md](docs/ui.md) 'CSS 파일 구조').
- 반응형 `@media` 블록은 한곳에 모여 있지 않고 각 파일에 흩어져 있습니다. 760px 블록이 768px 블록과 따로 있습니다. 새 클래스 이름은 `grep`으로 먼저
  겹치는지 봅니다(`.memo-*` · `.paratext-progress` · `.book-progress` 충돌을 실제로 겪음).
- pdf.js는 **`legacy` 빌드만**(`pdfjs-dist/legacy/build/…`), 워커는 `public/`에 복사해 씁니다.

### 선생님과 정한 것

- 문서에 **'되살리지 마세요' · '다시 걷지 마세요'**로 적힌 것은 선생님이 결정한 것입니다.
  되돌리려면 선생님께 먼저 여쭙니다. 각 주제 문서의 '먼저 지킬 것' 절에 모여 있습니다.
- 화면의 말은 문서에 적힌 낱말을 따릅니다(예: '성장 기록' · '수업 노트' · '오늘의 활동' ·
  '프로젝트 가져오기'). 같은 것을 두 이름으로 부르지 않습니다.

## 데모 모드로 화면 확인하기

- 실서비스 설정이 들어 있어도, 확인하는 동안만 `lib/firebase.js`의
  `isFirebaseConfigured`를 거짓으로 두면 데모 모드로 돕니다(**확인 뒤 반드시 되돌림**).
- 데모 반에는 학생 · 과일이 없어 상단바 서랍 등이 안 뜨는 자리가 있습니다. 그때는 임시
  페이지(`app/tmpXX/page.js`)에 꾸러미를 넣어 확인하고 지웁니다.
- Playwright는 미리 설치된 것을 씁니다. `npm run build`는 `.next`를 덮어 떠 있는 개발
  서버를 깨뜨리므로, 그 뒤에는 개발 서버를 다시 띄웁니다.
- 이 컨테이너의 한글 글꼴은 실제 화면보다 넓게 잡힙니다 — 폭이 걸린 판단은 실제 화면으로.

## 주요 페이지

| 경로 | 설명 |
|------|------|
| `/` | 랜딩 — 수업 코드 입력 |
| `/board` | 질문방 (키워드 · 피드 · 공지 3단) |
| `/study` | 공부방 (프로젝트 대시보드 → 프로젝트 → 개인 카드) · 많은 창이 `?open=` · `?panel=`로 열림 |
| `/books` | 책방 (활동 목록 → 활동, `?activity=`) |
| `/admin` | 교사 대시보드 (학생 분석) |
| `/report` | 학생 학습 리포트 |

역할: **교사**(`isTeacher` — 반 · 프로젝트 · 활동을 만들고 학생 기록을 봄) · **학생** ·
**관리자**(`isAdmin`). 식별 정보(실명 · 이메일 · 학번)는 `users`에만 두고 게시물에는
익명 정보만 넣습니다.

## 핵심 파일 (입구만 — 전체 목록은 docs/overview.md)

| 파일 | 역할 |
|------|------|
| `lib/store.js` · `lib/data/*.js` · `lib/data/shared.js` | 데이터 함수의 입구 · 영역별 구현 · 데모 자료와 나눠 쓰는 도우미 |
| `lib/firebase.js` | Firebase 초기화, `isFirebaseConfigured`, `authDomain` 프록시 |
| `lib/attachments.js` · `lib/storageUpload.js` · `lib/data/attachmentWrites.js` | 보호된 첨부의 업로드 · 열람 · 문서 연결 |
| `functions/index.js` · `functions/attachmentGateway.js` | Cloud Functions · 첨부 게이트웨이 |
| `firestore.rules` · `storage.rules` · `firestore.indexes.json` | 규칙(시험은 `tests/rules/`) · 색인 |
| `lib/dates.js` · `lib/roster.js` · `lib/mockDocs.js` · `lib/modal.js` · `lib/popover.js` | 위 '두루 걸리는 규칙'의 한 곳들 |
| `components/TopNav.jsx` | 상단바 — 수업 노트 서랍 · 축포 · 손들기 · 전광판 · 떠 있는 동그라미를 다는 자리 |
| `components/RichTextEditor.jsx` | 서식 에디터 (variant: full/chat) |
| `app/globals.css` · `app/styles/` | 스타일 입구 · 기능별 CSS 파일(원래 한 파일을 차례 그대로 자른 것) |

## 문서 지도

| 고치려는 것 | 읽을 문서 |
|---|---|
| 스택 · 실행 · 핵심 파일 전체 · 데이터 계층 · 첫 화면 함정 · `users` · 알림함 | [docs/overview.md](docs/overview.md) |
| 배포 · 로그인 프록시 · 함수 요금 | [docs/deploy.md](docs/deploy.md) |
| 첨부 · Storage 규칙 · 옛 토큰 URL 전환 | [docs/attachments.md](docs/attachments.md) · [docs/protected-attachments-rollout.md](docs/protected-attachments-rollout.md) |
| 질문방 · 답변 · 질문 읽기 범위 | [docs/board.md](docs/board.md) |
| 공부방 프로젝트 · 원본 · 개인 카드 | [docs/study.md](docs/study.md) |
| 파이썬 셀 창 · 예시 코드 · 실행 엔진 · 실행기 2단 | [docs/python.md](docs/python.md) |
| 수업 노트 · KWLS 기록 · 기록 관리 · 내보내기와 서랍 · 활동보기 · 수업 메모 | [docs/lesson.md](docs/lesson.md) |
| 책방 공통(교사 세 칸 · 모둠 진행 · 동료 평가 · 수업 화면 창 · 전광판 · 휴지통) | [docs/books.md](docs/books.md) |
| 독서 활동별(닿소리 · RAFT · 마인드맵 · 내 생각은요 · 물음표 · 해시태그 · 가로세로 · 브레인 라이팅 · 낱말 빙고) | [docs/books-activities.md](docs/books-activities.md) |
| 출석 · 자리표 · 반 관리 · 모둠 · 과일 · 과일 바구니 | [docs/classroom.md](docs/classroom.md) |
| 손들기 · 돌발 퀴즈 · 떠 있는 동그라미 · 메신저 · 투표 | [docs/realtime.md](docs/realtime.md) |
| CSS 파일 구조(`app/styles/`) · 상단바 · 서식 에디터 · 모달 · 팝오버 · 아이콘 · CSS 함정 · 시각화 · 엑셀 | [docs/ui.md](docs/ui.md) |

컬렉션별로 어느 문서에 있는지는 [docs/README.md](docs/README.md)의 두 번째 표에 있습니다.

## 문서를 고칠 때

- 기능을 고치면 **그 주제 문서**에 적습니다. 이 문서에는 여러 영역에 두루 걸리는 새 규칙만
  한 줄로 더하고 주제 문서로 잇습니다.
- 새 '하지 말 것'은 그 주제 문서 맨 위 '먼저 지킬 것' 절에도 한 줄 더합니다.
- 경위(「한때 …」)와 실측 수치는 주제 문서에만 둡니다.
- `tests/unit/docs.test.mjs`가 이 문서의 길이(300줄)와 문서 속 파일 경로 · 링크가 실제로
  있는지를 봅니다. 화면이나 파일을 걷어 내면 그 문서의 경로도 함께 고칩니다.
