# 문서 지도

루트 `CLAUDE.md`는 매 세션 처음에 읽히는 **핵심 규칙과 길 안내**만 둡니다(300줄 천장).
기능마다의 자세한 약속 · 경위 · 실측은 아래 주제 문서에 있습니다. **그 영역을 고치기 전에
해당 문서의 '먼저 지킬 것' 절부터 읽으세요.**

| 고치려는 것 | 읽을 문서 |
|---|---|
| 스택 · 실행 · 핵심 파일 · 역할 · 데이터 계층(`lib/data`) · 두루 걸리는 규칙의 원문 | [overview.md](overview.md) |
| 배포 · 구글 로그인 프록시(`authDomain`) · 함수 요금 | [deploy.md](deploy.md) |
| 이미지·파일 첨부, Storage 규칙, 옛 토큰 URL | [attachments.md](attachments.md) · [protected-attachments-rollout.md](protected-attachments-rollout.md) |
| 질문방 · 답변 · 해결 표시 · 질문 읽기 범위 | [board.md](board.md) |
| 공부방 프로젝트 · 원본(`studyTemplates`) · 개인 카드 · 활동 열기 | [study.md](study.md) |
| 파이썬 셀 창 · 예시 코드 · 실행 엔진 · 실행기 2단 | [python.md](python.md) |
| 수업 노트(코넬) · KWLS 기록 · 기록 관리 · 수업 중 내보내기와 서랍 · 활동보기 · 수업 메모 | [lesson.md](lesson.md) |
| 책방 공통(교사 세 칸 화면 · 모둠 진행 · 동료 평가 · 한 눈에 보기 · 수업 화면 창 · 전광판 · 휴지통) | [books.md](books.md) |
| 독서 활동 하나하나(닿소리 · RAFT · 마인드맵 · 내 생각은요 · 물음표 · 해시태그 · 가로세로 · 브레인 라이팅 · 낱말 빙고) | [books-activities.md](books-activities.md) |
| 출석 · 자리표 · 반 관리 · 모둠 · 과일 · 과일 바구니 | [classroom.md](classroom.md) |
| 손들기 · 돌발 퀴즈 · 떠 있는 동그라미 · 메신저 · 투표 | [realtime.md](realtime.md) |
| CSS 파일 구조(`app/styles/`) · 상단바 · 서식 에디터 · 모달 · 팝오버 · 아이콘 · 단추 크기 · CSS 함정 · 시각화 · 엑셀 | [ui.md](ui.md) |

## 데이터(컬렉션)가 있는 문서

| 컬렉션 | 문서 |
|---|---|
| `questions` · `answers` | [board.md](board.md) |
| `studyBoards` · `studyTemplates` · `studyBoards/{id}/cards` | [study.md](study.md) |
| `kwl` · `classes/{cId}/cornellNotes` · `lessonMemos` · `classes/{cId}.task` | [lesson.md](lesson.md) |
| `bookActivities` (휴지통 · `grouped` · `peerReviews` · `entries`) | [books.md](books.md) |
| `bookActivities/{id}/groups/{gId}/words` · `opinionNotes` · `hashtagPosts` · `hashtagComments` · `xwHints` · `xwBoard` · `xwProgress` · `xwSolves` · `bwNotes` · `bingoBoards` · `entries/{uid}/raftFeedback` | [books-activities.md](books-activities.md) |
| `rewards` · `rewardEvents` · `fruitBasket` · `fruitEvents` · `seatLayouts` · `groupAssignments` · `groupMemos` · `attendanceRecords` · `memberships` | [classroom.md](classroom.md) |
| `questionSignals` · `signalMessages` · `popQuizzes` · `chatMessages` · `chatReads` · `chatRoomReads` · `classNotices` · `polls` | [realtime.md](realtime.md) |
| `classes/{cId}.pyTarget` | [python.md](python.md) |
| `meta/marquee` | [ui.md](ui.md) |
| `users` · `users/{uid}/notifications` | [overview.md](overview.md) |
| `_attachments` (서버 전용) | [attachments.md](attachments.md) |

## 문서를 고칠 때

- 기능을 고치면 **그 주제 문서**에 적습니다. 루트에는 여러 영역에 두루 걸리는 새 규칙만 한 줄로 더하고 이 문서로 잇습니다.
- 새 '하지 말 것'은 그 문서 맨 위 '먼저 지킬 것' 절에도 한 줄 더합니다(본문 깊이 묻히지 않게).
- 경위(「한때 …」)와 실측 수치는 주제 문서에만 둡니다.
- 문서가 가리키는 파일 경로가 실제로 있는지, 루트가 300줄을 넘지 않는지는 `tests/unit/docs.test.mjs`가 봅니다.
