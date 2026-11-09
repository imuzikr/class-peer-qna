# 배포 · 로그인 프록시 · 함수 요금

Firestore 규칙 · 색인 · Cloud Functions 배포, 구글 로그인 프록시(`authDomain`),
함수 요금의 원문입니다. 첨부파일 전환은 [attachments.md](attachments.md).

## 먼저 지킬 것

- 배포 차례는 **색인 → 규칙 → 함수 → 앱(main 푸시 = Vercel 자동 배포)**입니다.
- Claude 세션처럼 Firebase 로그인이 없는 곳에서는 GitHub Actions **'Firestore 규칙 배포'**(`.github/workflows/deploy-rules.yml`)로 규칙만 올립니다 — 규칙을 바꾼 작업 브랜치로, main에 머지하기 **전에**. 키는 환경 `firebase-rules`의 Secret에만 둡니다(채팅 · 환경 변수에 넣지 않음).
- `authDomain` 프록시 설정을 바꿀 때는 `AUTH_PROXY_FOR_ALL`을 false로 두고 `?authproxy=1`로 한 기기에서 먼저 시험합니다.
- `/__/` 아래에는 우리 보안 헤더를 붙이지 않습니다(로그인 iframe이 막힘).
- `maxInstances`는 사고를 막는 천장입니다. `minInstances`는 켜기 전에 콘솔의 실제 실행 시간부터 봅니다.

> 이 문서의 「원문」 절은 예전 `CLAUDE.md`에서 글자 그대로 옮겨 온 것입니다.
> 그 안의 「위 · 아래 절」은 옮기기 전의 자리를 가리킬 수 있습니다 — 다른 문서에 있으면
> [README.md](README.md)의 지도에서 찾으세요. 경위(「한때 …」)와 실측 수치도 그대로 두었습니다.

---

## 원문

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

### GitHub Actions로 규칙 배포 (Claude 세션에서)

Claude의 클라우드 세션(작업 VM)에는 Firebase 로그인이 없습니다. 거기서 `firebase login`을
하려면 로그인 코드를 채팅에 붙여 넣어야 하고 세션이 끝나면 사라지며, 세션 환경의 '네트워크
비밀'은 고정 키를 머리에 끼우는 방식이라 한 시간마다 새로 받는 구글 토큰과 맞지 않습니다.
그래서 서비스 계정 키를 **GitHub 환경의 Secret**에 맡겨 두고 Actions로 규칙만 올립니다.

- 워크플로 `.github/workflows/deploy-rules.yml` — **손으로만** 돕니다(`workflow_dispatch`).
  Actions 탭 → 'Firestore 규칙 배포' → Run workflow, 또는 Claude 세션이 실행합니다.
  'Use workflow from'에서 고른 브랜치의 `firestore.rules`를 **규칙 시험을 통과한 뒤에만**
  올립니다. Storage 규칙 · 색인 · 함수는 올리지 않습니다.
- 처음 한 번 준비(교사)
  1. Google Cloud 콘솔 → IAM 및 관리자 → 서비스 계정 → 만들기(예: `github-rules-deploy`).
     역할은 둘 — **Firebase 규칙 관리자**(`roles/firebaserules.admin`) · **서비스 사용량
     소비자**(`roles/serviceusage.serviceUsageConsumer` — firebase-tools가 배포 전에
     Firestore API가 켜졌는지 물어 봄, 없으면 403). 그 계정 → 키 → 새 키(JSON).
  2. GitHub 저장소 Settings → Environments → `firebase-rules` 만들기 → Required reviewers에
     교사 계정(배포마다 승인 — 저장소가 공개라 무료 요금제에서도 됨) → 그 환경의 Environment
     secrets에 `FIREBASE_SERVICE_ACCOUNT` = 키 JSON 전체. **저장소 Secret이 아니라 환경
     Secret**에 둡니다 — 승인 전에는 어떤 작업도 키에 닿지 못합니다.
  3. 내려받은 키 파일은 지웁니다. 채팅에 붙여 넣지 않습니다.
- 키 만들기가 조직 정책(`iam.disableServiceAccountKeyCreation`)으로 막혀 있으면 키 없는
  Workload Identity 연동으로 바꿔야 합니다(워크플로의 auth 단계만 달라짐).

### 구글 로그인 창은 우리 주소로 뜹니다 (`authDomain`)

일부 학생에게 구글 로그인 창만 '사이트에 연결할 수 없음'으로 떴습니다. 로그인
창의 주소가 `class-peer-qna.firebaseapp.com`인데, 학교 와이파이 필터·자녀 보호
앱이 그 주소만 막았기 때문입니다(사이트 자체 `vercel.app`은 열림).

- `next.config.mjs`의 `rewrites`가 `/__/auth/*`·`/__/firebase/*`를 firebaseapp.com으로
  넘겨 주고, `lib/firebase.js`가 **실서비스 주소에서만** `authDomain`을 그 주소
  자신(`class-peer-qna.vercel.app`)으로 둡니다. 학생 기기는 vercel.app 하나에만
  닿으면 됩니다(Firebase 문서의 '인증 요청 프록시' 방식).
- **Google Cloud 콘솔 → API 및 서비스 → 사용자 인증 정보 → OAuth 웹 클라이언트**에
  리디렉션 URI `https://class-peer-qna.vercel.app/__/auth/handler`가 있어야 합니다.
  없으면 로그인이 `redirect_uri_mismatch`로 **모든 학생에게** 실패합니다 —
  **이 URI를 먼저 넣고 main에 올리세요.**
- 처음 켰을 때 URI를 저장한 직후라 구글 쪽 반영이 늦어(5분~몇 시간) 모든 학생이
  '액세스 차단됨'을 봤습니다. 되돌린 뒤 `?authproxy=1`로 한 기기에서 먼저 확인하고
  켰습니다(`AUTH_PROXY_FOR_ALL`). **설정을 바꿔 다시 켤 일이 있으면 false로 두고
  그 표시로 먼저 시험하세요.**
- 미리보기 주소·localhost는 그 URI가 없어 지금까지대로 firebaseapp.com을 씁니다
  (`PROXIED_AUTH_HOSTS`). 사용자 지정 도메인을 붙이면 이 목록과 OAuth URI에 함께
  더하세요.
- **`/__/` 아래에는 우리 보안 헤더를 안 붙입니다**(`headers`의 `source`).
  `frame-ancestors 'none'`·`X-Frame-Options: DENY`가 붙으면 앱이 같은 주소의
  로그인 iframe(`/__/auth/iframe`)을 못 띄웁니다.

Firebase 미설정 시 자동으로 **데모 모드**로 동작 (새로고침 시 데이터 초기화).
실서비스 전환: `lib/firebase.js`의 `firebaseConfig`에 Firebase 콘솔 값 입력.

### 함수 요금 — 천장은 두고 바닥은 두지 않습니다

`functions/index.js`의 `setGlobalOptions`에 **`maxInstances: 10`**이 있습니다.
인스턴스는 함수를 돌리는 일꾼 한 명이고, 이 값은 **평소 쓰는 양을 재는 것이
아니라 사고를 막는 천장**입니다 — 한 반 스물여섯 명이 일제히 눌러도 요청은
1~2초에 걸쳐 줄지어 들어오고 함수 하나가 Firestore에 두어 번 쓰고 끝나므로,
같은 순간에 필요한 일꾼은 두세 명입니다. 천장에 닿아도 요청은 **거부되지 않고
줄을 서서** 처리되고, 여기 함수는 답변 수 집계와 알림이라 학생이 결과를
기다리는 종류가 아닙니다.

**`minInstances`는 일부러 비워 둡니다**(기본 0). 그것은 요청이 없어도 일꾼을
켜 두어 콜드 스타트를 없애는 설정인데, **아무도 안 쓰는 시간에도 요금이
붙습니다.** 하루에 몇 번 도는 이 앱에서는 몇 초를 아끼자고 낼 값이 아닙니다.
누가 '함수가 느리다'고 하면 이 값부터 켜고 싶어지는데, **켜기 전에 콘솔에서
실제 실행 시간을 먼저 보세요.**

함수가 깨어나는 때는 셋뿐입니다 — 답변이 달릴 때 · 답변이 지워질 때 ·
**질문 문서가 고쳐질 때**. 마지막이 `onAnswerUnderstood`인데 걸린 조건이
'질문 문서 업데이트'라, 학생이 '나도 궁금해요'를 누르거나 회고를 써도 한 번
깨어났다가 채택이 아니면 첫 줄에서 돌아 나옵니다. **무한 루프는 없습니다** —
답변 수를 올리는 쓰기가 이 함수를 깨우지만 그 함수는 질문 문서에 다시 쓰지
않아 고리가 닫히지 않습니다. 나머지 다섯(역할 부여 · 계정/반 삭제 · 반 공지)은
교사가 가끔 누르는 것입니다.

이 앱에서 요금이 **먼저** 문제가 될 곳은 함수가 아니라 Firestore 읽기입니다
(맨 아래 '질문 읽기 범위' 절). 금액 자체는 Google Cloud 콘솔의 **예산 알림**으로
지켜보세요 — 코드로 막을 수 있는 것은 천장까지입니다.
