# 개요 · 개발 규칙

스택 · 실행 · 핵심 파일 · 역할 · 두루 걸리는 개발 규칙의 원문입니다.
루트 `CLAUDE.md`의 '두루 걸리는 규칙'은 이 문서의 요약입니다.

## 먼저 지킬 것

- 날짜 셈은 `lib/dates.js` 한 곳에서 가져옵니다(날짜 열쇠가 곧 문서 ID).
- 데이터 함수는 `lib/data/*.js`에 두고 `lib/store.js`에는 다시 내보내기 한 줄만 더합니다. Mock과 Firebase 두 분기를 함께 씁니다.
- mock 문서는 `replaceDoc`로 갈아 끼웁니다 — 제자리에서 고치면 React가 다시 그리지 않습니다.
- 구독 결과의 빈 배열은 '아직 안 왔다'일 수 있습니다. 화면을 통째로 갈아 끼우는 자리라면 '첫 답이 왔는가'를 따로 듭니다.
- 반 명단은 `useClassRoster`, 교사 안내 카드 판정은 `isTeacherAuthoredCard` 한 곳을 씁니다.
- `user` 객체를 통째로 의존하지 말고 `user?.uid`를 꺼내 의존합니다. 까닭 없는 eslint 끄기 주석을 달지 않습니다.
- pdf.js는 `legacy` 빌드만 씁니다. `firestore.rules`를 고치면 규칙 시험을 돌린 뒤 배포합니다.

> 이 문서의 「원문」 절은 예전 `CLAUDE.md`에서 글자 그대로 옮겨 온 것입니다.
> 그 안의 「위 · 아래 절」은 옮기기 전의 자리를 가리킬 수 있습니다 — 다른 문서에 있으면
> [README.md](README.md)의 지도에서 찾으세요. 경위(「한때 …」)와 실측 수치도 그대로 두었습니다.

---

## 원문

# class-peer-qna — 프로젝트 컨텍스트

수업 중 학생 질문·답변을 실시간으로 공유하는 교실용 Q&A 웹앱.

## 기술 스택

- **프레임워크**: Next.js 15.5 App Router, React 18 (Client Components)
- **DB**: Firebase Firestore (실서비스) / 브라우저 인메모리 Mock (데모 모드)
- **스타일**: 단일 CSS 파일 `app/globals.css` (CSS Variables + Flexbox)
  > 지금은 `app/globals.css`가 `app/styles/`의 파일 60개를 차례대로 불러오는 입구입니다([ui.md](ui.md) 'CSS 파일 구조').
- **배포**: Vercel

## 실행

```bash
npm run dev        # 개발 서버 (http://localhost:3000)
npm run build      # 프로덕션 빌드
npm run test:rules # Firestore 보안 규칙 테스트 (에뮬레이터, Java 필요)
npm run test:unit  # lib/ 순수 함수 시험 (설치 없음 — node --test)
npm run lint       # ESLint 훅 규칙 (보고만, 최초 1회 npm ci --prefix tools/lint)
```

규칙 테스트는 `tests/rules/`에 있고 최초 1회 `cd tests/rules && npm install`이
필요합니다. 루트와 분리한 이유·작성 시 주의점은 `tests/rules/README.md` 참고.
**`firestore.rules`를 고치면 반드시 이 테스트를 돌리고 배포하세요.**

**단위 시험**(`tests/unit/`)은 앱 코드를 **그대로 import**합니다 —
`tests/unit/resolve.mjs`가 `@/` 별칭과 확장자 없는 import를 풀어 줍니다.
시험 도구를 설치하지 않은 것은 규칙 시험을 떼어 둔 것과 같은 까닭입니다.
**JSX는 못 읽으니** 컴포넌트 안의 셈을 시험하려면 lib/의 함수로 빼내세요
(`RewardTiming` → `lib/lessonSessions.js`의 `rewardTimingStat`).
Firebase를 import하는 `lib/store.js`·`lib/data/*`도 못 읽습니다 — 순수 함수를
거기 새로 두지 말고 제 파일에 두세요(날짜는 `lib/dates.js`, store.js가 같은
이름으로 다시 내보냅니다). `tests/ui/`의 둘(popover · 과일 축포)은 React
훅을 가짜로 바꿔 끼우는 시험이라 소스를 잘라 쓰는 방식을 일부러 둡니다.

**날짜 셈은 `lib/dates.js` 한 곳입니다** — `dateKeyOf`(Date → `2026-09-25`) ·
`todayDateKey` · `dateKeyFromParts`(달력 칸) · `shiftDateKey`(± 며칠) ·
`dateKeyLabel`(`9월 25일 (금)`) · `dateKeyDots`(`2026.09.25`). 같은 셈이
열 파일에 열다섯 벌 흩어져 있던 것을 모았습니다(`ymd` · `toYMD` · `getToday`
· `toDateKey` · `shiftDate` · `fmtDate` · `formatDateLabel` …). 날짜 열쇠가
곧 문서 ID(`uid_날짜`)라 한 글자만 달라져도 지난 기록을 못 찾으므로,
**컴포넌트에 새로 짜지 말고 여기서 가져오세요.** 옛 구현을 그대로 옮겨 적은
참조본과 두 해치 날짜를 견주는 시험이 `tests/unit/dates.test.mjs`에 있습니다.

**린트**는 설치물만 `tools/lint/`에, 설정은 루트 `eslint.config.mjs`에
있습니다(ESLint는 설정 파일 폴더 바깥을 무시합니다). `next build`는
린트를 건너뜁니다(`eslint.ignoreDuringBuilds`). **보고만** 하지만 **지금은 경고
0개**입니다 — 하나라도 뜨면 새로 생긴 것이니 그때그때 보세요.

- 28개를 한 번에 정리했습니다. 가린 방법은 셋입니다.
  - **진짜로 고친 것**: 의존성 추가 · 필요 없는 의존성 빼기 · 렌더마다 새 `[]`를
    모듈 상수로 · 컴포넌트 안 상수를 밖으로.
  - **`user?.uid` 의존**: `user?.uid`를 의존하던 구독은 `const myUid = user?.uid`
    (리포트는 `uid`)로 꺼내 그 값을 의존합니다 — 뜻은 같고 경고만 사라집니다.
    **`user` 객체를 통째로 의존하게 바꾸지 마세요** — 프로필 칸 하나만 바뀌어도
    리스너가 끊겼다 다시 걸립니다.
  - **일부러 뺀 것**: `eslint-disable-next-line` 바로 위에 **까닭을 적어** 둡니다
    (노트를 '옮길 때만' 되돌리기 · 자리표 문서의 id·updatedAt만 보기 · 렌더마다
    다시 재는 효과 등).
- **까닭 없는 끄기 주석은 달지 마세요.** 경고를 끄는 것은 '이건 일부러다'를
  적어 두는 일이라, 까닭이 없으면 실수와 구분되지 않습니다.

**CI**(`.github/workflows/ci.yml`)가 main과 `claude/**` 푸시, PR에서 위
셋과 빌드를 돌립니다. 배포를 막지는 않으니(Vercel은 따로 배포합니다)
**main에 올리기 전에** 작업 브랜치의 결과를 보세요.

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
| `lib/store.js` | 데이터 함수의 **입구** — `lib/data/*`의 공개 이름을 다시 내보내기만 함 |
| `lib/data/*.js` | Firestore CRUD + Mock + 구독 — 영역별(questions · classes · study · books · kwl · cornell …) |
| `lib/data/shared.js` | 데모 모드 자료(`mock`) · 구독자 목록 · `nextMockSeq` · 영역끼리 나눠 쓰는 도우미 |
| `lib/roster.js` · `lib/useClassRoster.js` | 교사 화면의 반 명단(소속 × 실명 × 과일 누적, **학번순**) — 셈과 구독 훅 |
| `lib/user.js` | `getCurrentUser()`, `isAdmin()` — 세션 기반 사용자 |
| `lib/firebase.js` | Firebase 초기화. `isFirebaseConfigured` 플래그로 모드 분기 |
| `app/globals.css` | 전체 스타일. 모바일 반응형은 파일 하단 `@media (max-width: 768px)` (→ 지금은 입구 파일, 아래 안내) |
| `components/QuestionModal.jsx` | 질문 상세 모달 (2열 데스크톱 / 단일스크롤 모바일) |
| `components/RichTextEditor.jsx` | 서식 입력 에디터 (variant: full/chat) |
| `components/KwlPanel.jsx` | KWL 사이드 패널 (오늘 탭 + 기록 탭) |
| `components/ActivityHeatmap.jsx` | 52주 잔디 히트맵 + ActivityOverview 통합 패널 |
| `components/ActivityOverview.jsx` | 오각형 레이더 차트 + 막대 요약 (학습 균형) |
| `components/PythonRunner.jsx` | Python 코드 실행기 (코드 복사 버튼 포함) |
| `lib/pyRun.js` | Pyodide 워커 한 벌 — 실행기와 파이썬 연계 활동의 코드 셀이 나눠 씀 |
| `lib/pyCells.js` | 파이썬 연계 활동의 **셀**(글 셀 · 코드 셀+결과) ↔ 카드 HTML 풀기·적기 — 옛 카드도 읽음 |
| `components/PyCellEditor.jsx` | 파이썬 연계 프로젝트의 활동 칸 — 글 셀 · 코드 셀(▶는 그 셀만 · 결과는 저절로 붙고 코드를 고치면 걷힘) |
| `components/PyCellModal.jsx` | 위 셀 편집기를 담는 **큰 창** — 공부방 카드의 칸 · 서랍 오늘의 활동의 '크게 열어 쓰기'가 엶 · 선생님 예시 코드가 있으면 두 열 |
| `components/ActivityExamples.jsx` · `lib/activityExamples.js` | 만들기 · 원본 편집 창의 활동 목록 칸 + **예시 코드** 창(오른쪽에서 나옴) — 활동 이름 → 코드 맵 |
| `components/StudyProjectDashboard.jsx` | 공부방 첫 화면 — 프로젝트 카드 그리드 (교사·학생 공통) |
| `components/StudyProjectView.jsx` | 프로젝트 상세 — 개인 카드 그리드 + 교사 도구 |
| `components/StudyMyActivityCard.jsx` | 개인 카드 상세 — 활동 칸 + 누구의 카드인지 칩 · 옆 학생 넘기기 |
| `components/StudyProjectForm.jsx` | 프로젝트 만들기 모달 (제목·안내·활동 목록) — **원본**을 만듭니다 |
| `components/StudyTemplateList.jsx` | 프로젝트 원본 목록 (교사) — '수업 관리' 창의 프로젝트 탭 · 우리 반에 가져오기 · 편집 · 삭제 |
| `components/ClassUsagePanel.jsx` | '수업 관리' 창 오른쪽 열 — **반별 현황**(수업: 어느 반에서 언제 했나 · 프로젝트: 반마다 열어 둔 것), 셈은 `lib/classUsage.js` |
| `components/StudyProjectImportModal.jsx` | 프로젝트 가져오기 (교사) — 공부방 머리줄, 원본 골라 이 반에 열기 · 아래 '＋ 프로젝트 만들기'(만들면 곧바로 이 반에) |
| `components/StudyTemplateEditModal.jsx` | 프로젝트 원본 편집 모달 — 제목·안내·활동·연계 (교사), 다음에 가져오는 반부터 적용 |
| `components/StudyProjectEditModal.jsx` | 프로젝트 편집 모달 — 제목·활동 안내만 (교사) |
| `components/ClassNotesTools.jsx` | 기록 관리·수업 메모 버튼 + 모달 묶음 (교사 전용) — 화면 이름은 **'성장 기록'**(한때 '공부 기록', 선생님 요청으로 바꿈). 이 문서의 '기록 관리'가 그 창입니다 |
| `components/CornellNoteDrawer.jsx` | 수업 노트 서랍 (학생 전용) — 오른쪽 손잡이 → 코넬 세 칸 · 오늘의 활동과 날개로 나란히 |
| `components/LessonAnswerPanel.jsx` | 활동보기 — 수업 중 자리표의 첫 탭, 내보낸 활동의 학생 답을 한 명씩 |
| `components/CornellNoteSheet.jsx` | 수업 노트 한 장 — **읽기 전용 코넬 2단**(리포트·교사 열람 공용) |
| `components/CornellNoteViewerModal.jsx` | 내 노트 크게 보기 (학생) — 수업 노트 · KWLS 두 탭, **지난 노트를 고치는 유일한 자리** |
| `components/CornellNoteEditSheet.jsx` | 수업 노트 한 장 — **고치는** 코넬 2단 (위 창에서만) |
| `components/MyKwlsNotes.jsx` | 위 창의 'KWLS 노트' 탭 — 내 KWLS 넘겨 보기 |
| `components/KwlsNoteSheet.jsx` | KWLS 한 장 — 읽기 전용 K·W·L·S 2×2 |
| `components/KwlDateCalendar.jsx` | KWLS 날짜 달력 (교사 전체 화면 · 학생 KWLS 탭 공용) |
| `components/CornellNotesPanel.jsx` | '기록 관리'의 수업 노트 탭 — 날짜 하나로 반 전체 |
| `components/CornellNoteReadModal.jsx` | 한 학생의 지난 노트 넘겨 보기 + 피드백 (교사 전용) |
| `components/OpinionBoard.jsx` | 책방 '내 생각은요...' — 영역 위 파스텔 메모판 (교사·학생 공용) + 크게 보기 창, 셈은 `lib/opinion.js` |
| `components/HashtagForm.jsx` · `HashtagBoard.jsx` | 책방 '여섯 개의 해시태그' — 학생 폼(태그 칩 → 태그별 생각)+친구 해시태그 / 교사 두 칸('수업 시작'으로 방송), 셈은 `lib/hashtag.js` |
| `components/HashtagSlide.jsx` | 해시태그 슬라이드 한 장(학생 한 명의 것) — 학급 방송 · 수업 화면 창 · 교사 가운데 공용 |
| `components/HashtagInfographic.jsx` | 해시태그 인포그래픽 장표 한 장 — 공개 뒤 친구 해시태그 보기 (슬라이드와 같은 자료) |
| `components/QmarkForm.jsx` · `QmarkBoard.jsx` | 책방 '물음표로 책 읽기' — 학생 두 열(나의 물음표 ｜ 다섯 물음 중 2개 이상 골라 생각) / 교사 세 칸 + 칸별 방송, 셈은 `lib/qmark.js` |
| `components/FloatingHub.jsx` · `MessengerWindow.jsx` | 오른쪽 아래 **떠 있는 동그라미** — 큰 원(행성 궤도)으로 펼쳐 메신저 · 돌발 퀴즈 · 투표 · 수업 노트 · 출석 · 리포트 · 과일 바구니 / **간편 메신저**(선생님 ↔ 학생 1:1 · 기본 모둠), 셈은 `lib/messenger.js` |
| `components/PollCenter.jsx` · `PollTeacherModal.jsx` · `PollStudentModal.jsx` · `PollParts.jsx` | **투표**(하나만 고르기 · 여러 개 고르기) — 동그라미의 '투표'가 여는 창 · 학생 불 · 교사의 결과 따라 적기, 셈은 `lib/poll.js` |
| `components/CrosswordGroupStudent.jsx` · `CrosswordGroupBoard.jsx` · `CrosswordGrid.jsx` · `CrosswordTyping.jsx` | 독서 활동 '가로세로 낱말 퀴즈'(`type: 'crossword'` — 고른 닿소리 채우기의 낱말로, **모둠 · 개별 활동 공용** — 개별은 한 사람에 낱말 하나 · 왼쪽에 가장 많이 채운 친구의 미니맵) — 학생 세 칸(우리 모둠 낱말·힌트 쓰기 ｜ 함께 채우는 판 ｜ 힌트 목록) / 교사 두 칸(힌트 제출 · 모둠별 미니맵 ｜ 판) + 떠 있는 '낱말 힌트' 패널(`FloatingPanel`) / 판 그리기 공용 / **판에 직접 적기**(모둠 · 개별 공용, 한글 조합 처리) |
| `components/BrainWriteForm.jsx` · `BrainWriteBoard.jsx` | 독서 활동 '브레인 라이팅'(`type: 'brainwrite'` — 늘 모둠) — 학생 두 칸(우리 모둠 칸 목록 ｜ 고른 컬럼에 이어 쓰기) / 교사 세 칸(모둠 카드 ｜ 고른 학생의 컬럼 ｜ 학생별 조각 바), 셈은 `lib/brainwrite.js` |

책방(`/books`)은 **활동 목록 → 활동** 두 단계입니다(URL은 `?activity=`).
예전에는 '활동 종류 그리드 → 그 종류의 목록 → 활동' 세 단계였는데, 가운데
화면이 하는 일이 종류를 고르는 것뿐이라 만들기 창의 종류 고르기와 겹쳤습니다.
지금은 반의 활동을 종류 섞어 한 목록에 **만든 차례**(오래된 것이 앞)로
늘어놓고 카드마다 종류를 적습니다. 옛 주소의 `?kind=`는 무시됩니다.
한때 최신순이었는데, 활동을 하나 만들 때마다 목록이 통째로 한 칸씩 밀려
어제 열던 활동이 매번 다른 자리에 있었습니다. 그래서 '가장 최근 활동'이
필요한 곳(`BookActivityStats`의 기본 선택)은 목록의 **끝**을 봅니다.

활동을 연 화면(다섯 보드)의 머리말 둘째 줄에도 **반 고르개**를 답니다
(`classPicker` prop — 페이지에서 **한 번 만들어** 내려 줍니다). 예전에는 반
이름 배지뿐이라 옆 반을 보려면 '← 활동 목록'으로 나갔다 다시 골라야 했습니다.
**반을 바꾸면 그 반의 활동 목록으로 갑니다** — 지금 연 활동은 이 반의 것이라
반만 바꾸고 화면을 두면 남의 반 활동을 보게 됩니다. 고를 반이 하나뿐이면
지금까지처럼 이름 배지입니다. 높이는 옆 배지(27px)에 맞추는데 세로 여백이
4px인 것은 `<select>`가 `line-height`를 듣지 않아서입니다(실측).

'＋ 독서 활동 만들기'는 제목 줄이 아니라 **활동 목록의 오른쪽, 첫 카드와 같은
높이**에 둡니다(`.book-activity-top` — `minmax(0,1fr) auto` 격자, 단추는
`.book-activity-make`) — 공부방의 '＋ 프로젝트 가져오기'(`.study-project-dash-top`)와
같은 자리·같은 모양입니다. 제목 줄에 함께 두었을 때는 반 고르개·KWLS 차트·기록
관리 사이에 섞여 '보는 단추'와 '새로 만드는 단추'가 구분되지 않았고, 한때 제목 줄
아래 제 줄(`.books-head-make`, 걷음)에 두었을 때는 그 줄만큼 카드가 내려앉았습니다
(선생님 요청). 단추가 머리말 밖이라 38px 크기 규칙을 `.book-activity-make`에 따로
줍니다. 768px 아래에서는 목록 위 오른쪽으로 올라갑니다.
실측(데모 1440px): 첫 카드 · 단추 top 모두 155 · 빈 목록 안내도 같은 높이 ·
700px 가로 넘침 0 · 학생 화면은 단추 없이 격자가 가로를 다 씀.

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

## 첫 화면 — '아직 모름'과 '없음'을 가릅니다

로그인 직후 공부방·책방은 학생에게 **입장 코드 화면이 번쩍 스쳤습니다.**
`memberships`가 `[]`로 시작하는데 그 값만으로 '소속 없음'을 판정했기 때문입니다
— 서버 답이 오기까지 몇백 밀리초 동안은 '소속이 없는' 것이 아니라 '아직
모르는' 것입니다. 공부방을 첫 화면으로 두면 학생이 접속할 때마다 겪습니다.

두 페이지 모두 `membershipsLoaded`(첫 답이 왔는가)를 따로 들고,
**그 전에는 입장 화면도 본문도 그리지 않고** AuthGate와 같은 모습의 스피너
(`.auth-gate.auth-gate--inline`)를 둡니다. 학생 눈에는 로그인 스피너가
이어지다 제 화면이 뜨는 것으로 보입니다. 교사·비로그인은 물어볼 것이 없어
곧바로 `true`로 둡니다.

`--inline`이 따로 있는 이유: `.auth-gate`는 `min-height: 100vh`라 상단바
아래에 놓으면 56px만큼 넘쳐 스크롤 막대가 생깁니다.

**같은 함정을 조심하세요** — 구독 결과의 빈 배열은 '없다'가 아니라 '아직
안 왔다'일 수 있습니다. 빈 값으로 화면을 통째로 갈아 끼우는 자리라면
'답이 왔는가'를 따로 들어야 합니다.

**상단바의 `activeClassId`도 같은 함정입니다**(`TopNav`). 이 값은 학생
소속(`memberships`)에서 나오는데, 그 배열은 `[]`로 시작하고 **구독을 다시 걸
때도 잠깐 빕니다**. 그때 `null`로 떨어뜨리면 이 값에 걸린 것들이 함께 빠지고,
특히 **수업 노트 서랍이 언마운트되어** 학생이 쓰던 화면이 없어졌다 다시 나타나며
자동 저장(2초) 전의 글자가 날아갑니다.

- 그래서 **마지막으로 알던 반을 ref에 붙들어 둡니다**. 답을 기다리는 동안은
  그것을 씁니다.
- **놓는 조건은 '이번 구독의 첫 답이 왔는데도 비어 있을 때'**입니다
  (`membershipsLoaded` — 구독을 다시 걸 때마다 거짓으로 되돌립니다).
  붙들기만 하면 교사가 반 편성에서 뺀 학생이 없는 반을 계속 가리켜, 규칙에
  막힌 읽기가 조용히 실패합니다.
- **`membershipsLoaded` 하나만으로는 못 막습니다** — 중간에 다시 구독할 때는
  그 값이 이미 참입니다. 둘을 함께 봐야 합니다.

## 역할 구분

- **교사(isTeacher)**: 프로젝트 만들기, 공지 작성, 전체 학생 카드 열람, 프로젝트 설정, 정렬
- **학생**: 질문 1개 작성, 프로젝트당 개인 카드 1개 작성, KWL 작성
- **관리자(isAdmin)**: 실명 확인, 답변 이해 표시, 회고 현황 확인

역할 전환 (개발용): `RoleSwitcher` 컴포넌트 (`role-switch` CSS 클래스, 모바일에서 숨김)

## 데이터 모델 (Firestore 컬렉션)

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

## 주의 사항

- `lib/data/*`의 Mock 구현과 Firebase 구현을 **항상 동기화**할 것
  (함수 추가 시 두 분기 모두 작성)
- **반 명단은 `useClassRoster`로 받으세요**(`lib/useClassRoster.js`, 셈은
  `lib/roster.js`의 `buildClassRoster`). 같은 셈이 공부방·책방·손든 학생
  자리 확인 창에 따로 있었는데 **자리 확인 창만 학번순 정렬이 빠져**, 자리표에 없는
  학생을 빈자리에 채울 때(`normalizeSeats`는 명단 차례를 씁니다) 그 창에서만
  다른 자리에 앉았습니다. 소속 uid만 필요하면 `useClassMembers`.
  - 두 곳은 일부러 안 옮겼습니다 — `/admin`의 반 분석(`null` = 아직 모름 ·
    `Set`)과 기록 관리의 옆 반 명단(`null` = 아직 모름). 이 훅은 첫 답 전에도
    빈 배열이라 '없다'와 '아직 모른다'를 못 가릅니다(위 '첫 화면' 절).
  - 디렉터리·과일은 **받아서** 씁니다. 페이지가 이미 다른 데 쓰려고 구독해
    두어, 훅이 또 구독하면 같은 컬렉션에 리스너가 둘입니다.
- **데이터 함수는 영역 파일(`lib/data/*.js`)에 두고, 화면에 보일 것은
  `lib/store.js`의 목록에 한 줄 더합니다.** `store.js`는 7천 줄이 넘던
  한 파일을 영역별로 나눈 뒤 남은 입구라 다시 내보내기만 합니다 — 화면은
  지금까지처럼 `@/lib/store`에서 가져가고, 목록에 안 올리면 화면에서
  안 보입니다. 영역끼리 나눠 쓰는 비공개 도우미(`mock` · `notify…` ·
  `nextMockSeq`)는 일부러 목록에 올리지 않습니다.
  - 데모 문서 id의 일련번호는 `nextMockSeq()`로 올립니다. `mockSeq`는 `let`이라
    다른 파일에서 `++` 할 수 없습니다(ES 모듈의 import는 읽기 전용).
  - **영역 파일끼리 서로 가져올 때 최상위에서 곧바로 쓰지 마세요**(함수 안에서만).
    서로 가져오는 고리가 생기면 먼저 읽힌 쪽에서 아직 정해지지 않은 값을 봅니다.
    `shared.js`는 어느 영역 파일도 가져오지 않습니다 — 그래서 모두가 기댈 수 있습니다.
- **mock 문서는 `replaceDoc(목록, 문서, 고칠 값…)`으로만 고칩니다**
  (`lib/mockDocs.js`). `Object.assign(문서, …)`이나 `문서.필드 = 값`처럼
  제자리에서 고치면 구독하는 쪽이 같은 참조를 받아 React가 다시 그리지
  않습니다 — 반 문서·독서 활동·수업 노트·답변에서 따로 네 번 겪은 그 함정입니다
  (위 절들의 '갈아 끼웁니다'가 모두 이것). 한때 이 모양이 store.js에 34곳
  남아 있어 한꺼번에 옮겼습니다. 인자가 Object.assign과 같아 앞에 목록만
  붙이면 되고, 고칠 값 자리에 함수를 주면 지금 문서를 보고 셉니다
  (`(q) => ({ answerCount: q.answerCount + 1 })`). 새 객체는 **목록의 같은
  자리**에 들어갑니다 — 빼고 뒤에 다시 넣으면 화면 차례가 바뀝니다.
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
