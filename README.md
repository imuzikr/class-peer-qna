# 배움나눔 — 학생 질문/답변 웹 앱

학생들이 공부하다 이해하기 어려운 내용을 서로 질문하고 답변하는 학습 커뮤니티입니다.
슬랙/디스코드와 비슷한 3단 구조(키워드 → 질문 게시판 → 공지사항)로 구성되어 있습니다.

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000 을 열면 됩니다.

## 현재 상태: 테스트 유저 모드

실제 로그인 기능은 아직 연결되어 있지 않습니다. 랜딩 페이지에서 로그인/회원가입
버튼을 누르면 **테스트 유저(user_01)** 로 자동 입장하며, 모든 질문·답변·공지가
이 유저의 uid(`user_01`)로 저장됩니다. 현재 사용자 정보는 `lib/user.js` 한 곳에서
관리하므로, 나중에 인증을 붙일 때 이 파일의 `getCurrentUser()`만 수정하면 됩니다.

## Firebase 연결 방법

Firebase 설정 전에는 자동으로 **데모 모드**(브라우저 메모리 저장, 새로고침 시
초기화)로 동작하므로 먼저 화면을 확인할 수 있습니다. 실제 저장을 위해서는:

1. https://console.firebase.google.com 에서 새 프로젝트를 만듭니다.
2. 왼쪽 메뉴 **빌드 → Firestore Database → 데이터베이스 만들기**에서
   위치(asia-northeast3 권장)를 선택하고 **테스트 모드**로 시작합니다.
3. 프로젝트 개요 옆 ⚙️ → **프로젝트 설정 → 내 앱 → 웹 앱 추가(</>)** 로
   앱을 등록하면 `firebaseConfig` 값이 표시됩니다.
4. 그 값을 `lib/firebase.js`의 `firebaseConfig`에 그대로 붙여넣고 저장하면
   앱이 자동으로 Firestore 모드로 전환됩니다.

> 테스트 모드 보안 규칙은 30일 후 만료됩니다. 운영 전에는 인증 연동과 함께
> 보안 규칙을 반드시 손봐야 합니다.

## Firestore 데이터 구조

모든 문서에 작성자 uid(`authorId`)를 저장해 사용자별로 구분합니다.

```
questions (컬렉션)
  └ { title, content, keyword, imageUrl, resolved,
      authorId, authorName, answerCount, createdAt }
    └ answers (하위 컬렉션)
        └ { content, imageUrl, authorId, authorName, createdAt }
notices (컬렉션)
  └ { title, content, authorId, authorName, createdAt }
keywords (컬렉션) — 관리자가 관리할 키워드 목록
  └ { name, order }   ※ 비어 있으면 기본 키워드가 자동으로 심어짐
```

## 관리자 역할 뼈대 (미리 준비됨)

- `lib/user.js`의 테스트 유저에 `role: "admin"`이 있고, 관리자 전용
  버튼은 `isAdmin(user)`로 감싸 둡니다(예: 공지 작성 버튼).
  학생 화면을 미리 보려면 role을 `"student"`로 바꿔 보세요.
- 키워드는 데이터(keywords 컬렉션)로 관리되며, 데이터 계층에
  addKeyword / renameKeyword / deleteKeyword / reorderKeywords가
  준비되어 있습니다. 관리자 UI(드래그 앤 드롭 등)는 추후 작업입니다.
- 실제 권한 강제는 인증 연동 시 Firestore 보안 규칙에서
  `request.auth.token.role`을 검사하는 것으로 완성됩니다.

## 나중에 Firebase Authentication 붙이기

1. Firebase 콘솔 **빌드 → Authentication → 시작하기**에서 이메일/비밀번호
   로그인을 활성화합니다.
2. `app/page.js`의 `handleSubmit` 안 TODO 위치에
   `signInWithEmailAndPassword` / `createUserWithEmailAndPassword`를 연결합니다.
3. `lib/user.js`의 `getCurrentUser()`가 `auth.currentUser`의 uid와 이름을
   반환하도록 수정합니다.

데이터 저장 코드는 전부 `getCurrentUser()`를 통해 uid를 받으므로
이 두 곳만 고치면 나머지는 그대로 동작합니다.

## 서버 코드 (Cloud Functions)

`functions/index.js`에 서버에서 동작해야 하는 세 가지 기능이 구현되어 있습니다.
답변 생성/삭제 시 answerCount 서버 집계, 역할 부여(setUserRole, 커스텀 클레임),
새 답변 알림(인앱 + FCM)과 주간 답변왕 집계(매주 월요일 9시)입니다.

배포 방법:

```bash
npm install -g firebase-tools
firebase login
cd functions && npm install && cd ..
firebase deploy --only functions
```

주의: Cloud Functions 배포에는 Blaze(종량제) 요금제 전환이 필요하며,
배포 후에는 `lib/store.js`의 `addAnswer` 안에 있는 클라이언트 카운트 증가
(updateDoc + increment) 부분을 삭제해야 중복 집계가 되지 않습니다.

## 폴더 구조

```
app/page.js          랜딩 페이지 (로그인/회원가입)
app/board/page.js    3단 게시판 (키워드 | 질문 | 공지)
components/          키워드 사이드바, 질문 카드/모달, 공지 패널 등
lib/firebase.js      Firebase 설정 (여기에 config 붙여넣기)
lib/user.js          현재 사용자 (테스트 유저 user_01)
lib/store.js         데이터 레이어 (Firestore ↔ 데모 모드 자동 전환)
```
