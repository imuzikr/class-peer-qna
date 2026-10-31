# 보호된 첨부파일 전환

새 첨부는 `attachment:<id>`를 본문에 저장합니다. 서버 전용
`_attachments/{id}`가 원본 문서 경로와 실제 `protected/{uid}/{id}` 객체를 연결합니다.
`attachmentGateway`는 매 요청의 Firebase 사용자를 확인하고 **그 사용자의 토큰으로
원본 Firestore 문서를 읽어** 현재 읽기 규칙을 적용합니다. Admin SDK로 문서를 읽는
데 성공했다는 사실을 열람 허가로 사용하지 않습니다.

질문방은 로그인한 회원 전체에게, 개인 기록·모둠 기록·쪽지는 각 원본 문서를 읽을 수
있는 사람에게만 파일을 전달합니다. 문서에서 첨부가 제거되거나 문서가 삭제되면 남은
레지스트리 연결만으로 파일을 계속 볼 수 없습니다. 여러 반 수업에서 재사용한 자료는
실제로 참조하는 각 문서를 연결하며 업로더의 현재 반을 추정해 권한을 부여하지 않습니다.

## 코드 적용과 운영 완료는 다릅니다

- `storage.rules`는 **최종 전환용**입니다. `protected/`와 옛 `uploads/`의 브라우저
  직접 읽기·쓰기·목록을 모두 거부합니다. 파일 전송은 권한을 검사한 gateway가 담당합니다.
- `storage.transition.rules`와 `firebase.attachments-transition.json`은 backend를 먼저
  배포할 때 필요한 **임시 호환 설정**입니다. 옛 업로드의 넓은 읽기 권한이 남으므로
  이 단계만으로 개인정보 문제가 해결되었다고 표시하지 않습니다.
- 규칙은 이미 발급된 `firebaseStorageDownloadTokens` URL을 무효화하지 않습니다.
  기존 파일 이관 → 최종 직접 접근 차단 규칙 배포 → 옛 토큰 폐기 → 비로그인 실제 HTTP
  요청 검증까지 마쳐야 완료입니다. 토큰 폐기보다 직접 metadata 접근 차단이 먼저입니다.
- 새 객체도 토큰 없는 metadata로 저장해야 합니다. 토큰 URL 대신 식별자를 본문에
  적는 것만으로 기존 객체의 공개 토큰이 사라지는 것은 아닙니다.
- 공개 객체 ACL, 버킷·프로젝트 IAM의 `allUsers`/`allAuthenticatedUsers` 권한도 점검합니다.
  객체 버전 관리를 켠 버킷은 이전 generation의 공개 토큰·ACL도 별도 조사합니다.
  IAM 조회 실패를 “비공개 확인”으로 취급하지 않습니다.

## 배포 순서

1. 테스트 프로젝트에서 Auth·Firestore·Storage·gateway를 실행합니다. 개인/모둠/쪽지/
   질문방·수업 방송 권한과 이미지·일반 첨부·HTML·확대·인쇄를 확인합니다. 이미지가 많은
   화면의 최초/반복 로딩도 비교합니다. 로컬 에뮬레이터 수치는 운영 네트워크 수치와 구분합니다.
2. 실제 프로젝트를 명시해 backend와 Firestore registry 차단 규칙을 먼저 배포합니다.
   필요한 경우에만 아래 임시 Storage 설정을 명시적으로 사용합니다. 새 gateway와
   CORS, 실제 ID token, 파일 크기/타입 제한을 실제 사이트에서 확인합니다.
3. 새 frontend를 배포하고 새 업로드가 보호된 식별자만 생성하는지 확인합니다. 옛 클라이언트가
   남아 있지 않게 새로고침을 안내하고, 최종 이관 동안은 첨부 쓰기를 잠시 중지합니다.
4. 아래 도구로 미리보기 → 복사 → 문서 참조 전환을 진행하고, 쓰기 중지 상태에서
   `prepare-cutover` 준비 보고서를 만듭니다. 이것은 토큰 폐기 완료 보고서가 아닙니다.
5. 준비 보고서를 확인해 **최종 Storage 차단 규칙을 먼저 배포**합니다. 성공하면 배포 스크립트가
   `준비보고서.deployed.json` 기록을 남깁니다. 일반 `npm run deploy`는 Storage를 자동 배포하지 않습니다.
6. 그 배포 기록을 지정해 옛 토큰을 폐기하고 마지막 검증 보고서를 만듭니다. 옛 metadata를
   직접 읽을 수 있는 동안 토큰을 먼저 폐기하면 다른 사용자가 새 토큰을 얻는 경쟁 조건이
   생기므로 순서를 뒤집지 않습니다. 마지막 검증까지 첨부 쓰기 중지를 유지합니다.
7. 실제 사이트와 로그아웃한 브라우저에서 다시 확인합니다. 로그인한 일반 사용자도 옛 파일의
   metadata/getDownloadURL을 직접 읽지 못해야 합니다. Firebase 콘솔의 배포된 규칙이
   저장소 파일과 일치하는지 확인하고, 본문 권한 변경·탈퇴·반 보관·방송 종료도 검사합니다.

```bash
# Backend-first; these commands are operational mutations, run only after review.
npm run deploy -- --functions-only
npm run deploy -- --rules-only

# Only when legacy client compatibility is deliberately needed temporarily.
npm run deploy -- --attachments-storage-transition --confirm-project PROJECT_ID

# FINAL deny rules before token revocation. Requires prepared readiness + paused writes.
# Run only after the prepare-cutover command below, not immediately after transition.
npm run deploy -- --attachments-storage-final /secure/path/ready.json --confirm-project PROJECT_ID --writes-paused
# Success creates /secure/path/ready.json.deployed.json for revoke/verify.
```

## 이관 도구

`functions/scripts/attachments-migrate.mjs`의 기본 동작은 **읽기 전용 inventory**입니다.
운영 쓰기는 `--apply`와 정확한 `--confirm-project`를 함께 주어야 가능하며, 문서 전환과
토큰 폐기는 `--writes-paused`도 요구합니다. 토큰 폐기와 최종 검증에는 성공한 final
Storage 배포 기록(`--deployed-report`)이 추가로 필요합니다. 자격 증명은 기존 Admin SDK ADC 선택을
사용합니다. 이 도구 때문에 서비스 계정 키를 저장소에 추가하지 마세요.

보고서·checkpoint·backup에는 비공개 문서 정보가 있을 수 있습니다. 결과 파일은 0600,
백업 디렉터리는 0700으로 만들며, 접근 제한된 별도 경로에 보관하고 Git에 넣지 않습니다.
토큰 문자열을 stdout에 출력하지 않습니다. 에뮬레이터 모드는 Firestore와 Storage가 모두
loopback 주소이고 `demo-` 프로젝트일 때만 허용해 실제 버킷과 섞이지 않게 합니다. 복원은 새 보호 경로와 권한 검사를 유지하는
방식으로 진행하며, 공개 토큰을 되살리는 방식으로 rollback하지 않습니다.

```bash
# Offline fixture: neither credentials nor cloud reads/writes.
node functions/scripts/attachments-migrate.mjs \
  --fixture tests/fixtures/attachment-migration.json --output /tmp/attachment-fixture.json

# Live inventory: explicit target; cloud reads only, no content/token values printed.
node functions/scripts/attachments-migrate.mjs \
  --project PROJECT_ID --bucket BUCKET_NAME --output /secure/path/inventory.json

# The same phase WITHOUT --apply only generates a local action preview.
node functions/scripts/attachments-migrate.mjs --phase copy \
  --manifest /secure/path/inventory.json --output /secure/path/copy-preview.json

# After reviewing references, multiple uses, object integrity, and IAM findings:
node functions/scripts/attachments-migrate.mjs --phase copy --apply \
  --manifest /secure/path/inventory.json --confirm-project PROJECT_ID
node functions/scripts/attachments-migrate.mjs --phase rewrite --apply --writes-paused \
  --manifest /secure/path/inventory.json --confirm-project PROJECT_ID
# Read-only PRE-cutover readiness: copies/refs/IAM/gateway are ready; tokens still pending.
node functions/scripts/attachments-migrate.mjs --phase prepare-cutover --writes-paused \
  --manifest /secure/path/inventory.json --gateway-verified --iam-private-verified \
  --output /secure/path/ready.json

# Block direct metadata reads BEFORE revoking tokens, so old clients cannot mint
# another token while transition read permission remains open.
npm run deploy -- --attachments-storage-final /secure/path/ready.json --confirm-project PROJECT_ID --writes-paused

node functions/scripts/attachments-migrate.mjs --phase revoke --apply --writes-paused \
  --manifest /secure/path/inventory.json --confirm-project PROJECT_ID \
  --deployed-report /secure/path/ready.json.deployed.json

# Only this final report may say protectionVerified=true. Continue maintenance
# until exact old-URL anonymous probes and actual gateway access checks pass.
node functions/scripts/attachments-migrate.mjs --phase verify \
  --manifest /secure/path/inventory.json --gateway-verified --iam-private-verified \
  --deployed-report /secure/path/ready.json.deployed.json --output /secure/path/verified.json

```

Inventory는 실제 소속 문서에서 파일로 향하는 역색인을 만듭니다. HTML `<img src>`,
배열, 마인드맵 노드와 일반 문자열 필드를 모두 조사하되, 다른 버킷·외부 HTTPS·data URL은
임의로 바꾸지 않습니다. 미참조 파일·없는 파일·알 수 없는 경로는 자동으로 공개하거나
아무 반에 배정하지 않습니다. 관리자 검토 후 별도 보관/정리하고 inventory를 다시 만듭니다.
이 미해결 항목이 남으면 전환 준비 검증은 통과하지 않습니다.

복사는 deterministic ID와 destination generation=0으로 덮어쓰기를 막고, size/CRC32C를
비교합니다. 토큰을 포함한 옛 metadata는 복사하지 않습니다. 문서 변경은 현재 snapshot을
백업하고 updateTime precondition으로 동시에 바뀐 문서를 덮어쓰지 않습니다. 각 단계는
checkpoint를 남기며 중단 후 재실행할 수 있습니다. final revoke 직전에는 전체 문서를
다시 읽어 옛 URL이 하나라도 남으면 중지합니다. Storage 객체 목록도 다시 대조해
inventory 이후 생긴 미확인 파일이나 토큰이 하나라도 남으면 최종 검증을 중지합니다.

옛 파일은 바로 삭제하지 않습니다. Storage 직접 접근을 먼저 차단하고 토큰을 폐기한 상태로
복구 기간 동안 보관합니다. checkpoint의 옛 URL probe에는 폐기한 토큰이 포함될 수
있으므로 checkpoint도 비공개 파일입니다. 보호된 복사본의 내용·참조가 확인되기 전에는
final Storage 규칙 배포나 그 뒤의 토큰 폐기를 하지 않습니다.

## 에뮬레이터의 토큰 폐기 차이

현재 firebase-tools Storage 에뮬레이터는 GCS metadata에서
`firebaseStorageDownloadTokens: null`을 설정해도 내부 downloadTokens 배열에서 기존
토큰을 제거하지 않습니다. 실제 실험에서 이전 URL이 계속 200으로 응답했습니다.
loopback 전용 pilot은 에뮬레이터 관리자 token 삭제 API로 기존 토큰을 명시적으로
폐기한 뒤 이전 URL이 403이 되는 것을 별도 검증합니다. 마지막 토큰을 지우면
에뮬레이터는 새 미발급 토큰을 내부적으로 생성한다는 차이도 기록합니다.

운영 이관 도구는 이 차이를 이유로 검증을 생략하지 않습니다. metadata 제거 결과와
이전 URL의 실제 비로그인 요청이 모두 통과하지 않으면 **중지**하고 final Storage
전환 보고서를 만들지 않습니다. 에뮬레이터의 성공을 운영 버킷 토큰 폐기 성공으로
대체하지 않습니다.

## 검증 명령

```bash
npm run test:unit
npm run test:rules  # Firestore + Storage emulators
npm run lint
npm run build
```

운영 완료 기준은 ① 허용된 사용자의 파일 열람/다운로드 성공 ② 본문 권한 없는 사용자의
실패 ③ 앱 프로필 없는 Auth 계정·비로그인·다른 반의 우회 실패 ④ 기존 토큰 URL의 실제
비로그인 HTTP 실패 ⑤ 공개 IAM/ACL 없음입니다. 이미 내려받은 사본까지 회수할 수 있다는
의미는 아닙니다. 이 문서는 계획/도구를 제공하며, 도구 실행이나 배포를 대신하지 않습니다.
