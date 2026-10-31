# 첨부파일 — 보호된 첨부

이미지·파일 첨부를 원본 문서의 읽기 권한에 묶는 방식입니다. 운영 전환 절차는
[protected-attachments-rollout.md](protected-attachments-rollout.md), 로컬 검증 기록은
[protected-attachments-validation.md](protected-attachments-validation.md)에 있습니다.

## 먼저 지킬 것

- **새 첨부는 주소가 아니라 `attachment:<id>` 식별자로 저장합니다.** 업로드는
  `lib/storageUpload.js`(`uploadImage` · `uploadFile` · `uploadDataUrl` …)가 게이트웨이
  함수로 보내고 식별자만 돌려줍니다. 토큰이 붙은 `getDownloadURL` 주소를 새로 만들지 않습니다.
- **첨부가 든 문서는 `lib/data/attachmentWrites.js`의 `addDoc` · `setDoc` · `updateDoc` ·
  `writeBatch`로 씁니다.** 문서가 저장된 **뒤에** 서버에 '이 파일은 이 문서의 것'을
  등록해야(`registerAttachmentsForDocument`) 서버가 실제 본문과 읽기 권한을 검증할 수
  있습니다. `firebase/firestore`의 함수를 곧바로 쓰면 등록이 빠져, 올린 사람 말고는 아무도
  그 그림을 못 봅니다. 등록 실패는 사용자별 재시도 대장에 남습니다(`attachmentBindingQueue`).
- **화면은 식별자를 `<img src>`에 곧바로 넣지 않습니다.** 서식 글은 `SecureHtml`, 그림 한 장은
  `SecureImage`, 파일 링크는 `ProtectedAttachmentLink`로 그립니다. 이들이 현재 사용자의 권한으로
  받은 임시 blob URL만 화면에 씁니다(같은 이미지는 합쳐 받고, 동시 6건까지).
- **첨부를 붙일 새 컬렉션을 만들면** 게이트웨이의 허용 경로
  `functions/attachments/service.js`의 `PARENT_PATTERNS`에 그 문서 경로를 더합니다.
  안 더하면 등록이 `invalid-parent`로 거부됩니다.
- 열람 권한은 **원본 문서의 Firestore 읽기 규칙 그 자체**입니다. 게이트웨이가 요청한 사람의
  토큰(+ App Check 토큰)으로 원본 문서를 읽어 보고, 읽히면 파일을 보냅니다. Storage 규칙에
  반별 권한을 따로 베껴 두지 않습니다.
- `_attachments/{id}`(파일 ↔ 원본 문서 연결)는 서버 전용입니다. Firestore 규칙이 브라우저의
  읽기·쓰기를 모두 막습니다 — 열면 남의 비공개 파일을 공개 글에 잇는 위조가 가능해집니다.
- **배포 차례: 함수 → 규칙 → 앱.** 화면은 업로드와 열람을 `attachmentGateway`로 보내므로,
  함수가 없는 채 앱만 올라가면 새 첨부가 모두 실패합니다. main 푸시가 곧 Vercel 배포입니다.
- 데모 모드는 지금까지처럼 data URL을 씁니다.
- 다른 주제 문서에서 첨부를 'Storage 주소 · https 주소 · `getDownloadURL`'로 설명한 곳(마인드맵 노드
  그림, 질문 · 카드 첨부, 학습 자료 등)은 **2026-11-01 전환 이전의 모양**입니다. 지금 새로 저장되는 값은
  `attachment:<id>`이고, 그런 칸을 거르는 셈(예: `safeNodeImage`)도 이 값을 받습니다.

## 옛 첨부 (토큰 URL)

예전 첨부는 `uploads/{uid}/…`에 있고 본문에 `token=`이 붙은 주소가 적혀 있습니다. 그 주소는
규칙을 거치지 않아 **주소만 알면 로그인 없이 열립니다.** Storage 규칙을 닫아도 이미 발급된
토큰은 살아 있으므로, 이관 → 최종 차단 규칙 → 토큰 폐기 → 로그아웃 상태의 실제 요청 검증까지
마쳐야 끝납니다. 차례와 명령은 [protected-attachments-rollout.md](protected-attachments-rollout.md).

- `storage.rules`는 **최종 차단 규칙**(모든 직접 읽기·쓰기 거부)이고,
  `storage.transition.rules`는 옛 화면을 잠시 살려 두는 **임시 호환 규칙**입니다.
  임시 규칙을 개인정보 문제의 해결로 보지 않습니다.
- `npm run deploy`는 Storage 규칙을 저절로 배포하지 않습니다
  (`--attachments-storage-transition` · `--attachments-storage-final`만).
- 토큰 폐기는 반드시 최종 차단 규칙을 배포한 **뒤**에 합니다. 거꾸로 하면 넓은 읽기가 남은 동안
  누군가 새 토큰을 받아 갈 수 있습니다.
- 화면은 옛 `https://firebasestorage…` 주소를 그대로 보여 줍니다(`resolveAttachmentUrl`) —
  이관이 끝날 때까지의 호환입니다.

## 비용

이미지를 볼 때마다 게이트웨이 함수 호출 한 번과 Firestore 읽기(원본 문서 · 연결 문서)가
생깁니다. [deploy.md](deploy.md)의 '함수 요금' 절이 전제한 '함수는 하루 몇 번'은 이 함수에는
맞지 않습니다. 이미지가 많은 화면(모아보기 · 발표)에서 `maxInstances`(10) × 동시 8건에
닿는지, 콜드 스타트가 체감되는지 콘솔에서 봅니다.
