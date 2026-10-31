#!/usr/bin/env bash
# =============================================================
# Firestore 규칙 + Cloud Functions 배포
# -------------------------------------------------------------
# 사용법:
#   npm run deploy              # 규칙 테스트 후 규칙+함수 모두 배포
#   npm run deploy -- --rules-only
#   npm run deploy -- --functions-only
#   npm run deploy -- --indexes-only # 색인(firestore.indexes.json)만
#   npm run deploy -- --attachments-storage-transition --confirm-project PROJECT
#                              # preparatory legacy-compatible Storage rules only
#   npm run deploy -- --attachments-storage-final READY_REPORT --confirm-project PROJECT --writes-paused
#                              # final deny rules, gated on migration verification
#   npm run deploy -- --skip-tests   # 규칙 테스트를 건너뜀 (권장하지 않음)
#
# 색인은 기본 대상에 넣지 않았습니다. 색인 배포는 파일에 없는 기존 색인을
# 지울지 되묻는 경우가 있어(콘솔에서 직접 만든 것이 있으면 특히), 자동으로
# 도는 자리에 두면 스크립트가 그 물음 앞에서 멈춥니다. 색인을 새로 추가한
# 뒤에만 --indexes-only로 따로 올리세요. 만드는 데 몇 분 걸리므로, 그 색인을
# 쓰는 코드보다 먼저 배포해야 합니다.
#
# 최초 1회 준비:
#   npx firebase-tools login     # 브라우저로 Google 계정 로그인
#
# firebase-tools는 이 스크립트가 npx로 그때그때 받아 씁니다. 루트
# package.json의 devDependency로 넣지 않은 이유는 Vercel 빌드가 이
# 패키지를 전혀 쓰지 않는데도 설치 시간만 늘어나기 때문입니다
# (tests/rules/, functions/ 를 별도 워크스페이스로 분리한 것과 같은 이유).
# =============================================================
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

TARGET="firestore:rules,functions"
SKIP_TESTS=0
CONFIG="firebase.json"
CUTOVER_REPORT=""
CONFIRM_PROJECT=""
STORAGE_MODE=""
WRITES_PAUSED=0

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --rules-only) TARGET="firestore:rules" ;;
    --functions-only) TARGET="functions" ;;
    --indexes-only) TARGET="firestore:indexes" ;;
    --attachments-storage-transition) TARGET="storage"; STORAGE_MODE="transition"; CONFIG="firebase.attachments-transition.json" ;;
    --attachments-storage-final)
      [[ "$#" -ge 2 ]] || { echo "검증 보고서 경로가 필요합니다." >&2; exit 1; }
      TARGET="storage"; STORAGE_MODE="final"; CUTOVER_REPORT="$2"; shift ;;
    --confirm-project)
      [[ "$#" -ge 2 ]] || { echo "프로젝트 ID가 필요합니다." >&2; exit 1; }
      CONFIRM_PROJECT="$2"; shift ;;
    --writes-paused) WRITES_PAUSED=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    *)
      echo "알 수 없는 옵션: $1" >&2
      echo "사용법: npm run deploy -- [--rules-only|--functions-only|--indexes-only|--attachments-storage-transition|--attachments-storage-final REPORT] [--confirm-project PROJECT] [--skip-tests]" >&2
      exit 1 ;;
  esac
  shift
done

# Storage must never be part of an ordinary deploy before the existing objects
# and token URLs have been migrated. Its separate explicit target is deliberate.
if [[ -n "$STORAGE_MODE" ]]; then
  [[ "$TARGET" == "storage" ]] || { echo "Storage 전환 대상과 다른 배포 대상을 섞지 마세요." >&2; exit 1; }
  [[ -n "$CONFIRM_PROJECT" ]] || { echo "Storage 배포에는 --confirm-project PROJECT가 필요합니다." >&2; exit 1; }
  if [[ "$STORAGE_MODE" == "final" ]]; then
    [[ "$WRITES_PAUSED" -eq 1 ]] || { echo "최종 Storage 전환 중 첨부 쓰기를 중지하고 --writes-paused를 명시하세요." >&2; exit 1; }
    [[ "$SKIP_TESTS" -eq 0 ]] || { echo "최종 Storage 전환은 테스트를 생략할 수 없습니다." >&2; exit 1; }
    node scripts/verify-attachment-cutover.cjs "$CUTOVER_REPORT" "$CONFIRM_PROJECT"
  else
    echo "▶ 준비 단계 Storage 규칙: 기존 토큰 URL은 아직 차단되지 않습니다."
  fi
fi

if [[ ( "$TARGET" == *"firestore:rules"* || "$TARGET" == "storage" ) && "$SKIP_TESTS" -ne 1 ]]; then
  echo "▶ 배포 전 Firestore + Storage 규칙 테스트를 돌립니다"
  if [ ! -d tests/rules/node_modules ]; then
    echo "  tests/rules/node_modules가 없어 먼저 설치합니다..."
    npm --prefix tests/rules install
  fi
  npm run test:rules
  echo "✔ 규칙 테스트 통과"
fi

if [[ "$TARGET" == *"functions"* ]]; then
  echo "▶ functions/ 의존성을 확인합니다"
  npm --prefix functions install
  echo ""
fi

echo "▶ 배포 대상: $TARGET"
echo "  (최초 1회는 'npx firebase-tools login'으로 먼저 로그인해야 합니다)"
if [[ -n "$CONFIRM_PROJECT" ]]; then
  npx firebase-tools deploy --config "$CONFIG" --project "$CONFIRM_PROJECT" --only "$TARGET"
else
  npx firebase-tools deploy --config "$CONFIG" --only "$TARGET"
fi

# Only a successful firebase deploy reaches here. Token revocation/verification
# occurs AFTER direct legacy metadata reads have been denied, preventing a user
# from obtaining a freshly regenerated token between verification and closure.
if [[ "$STORAGE_MODE" == "final" ]]; then
  node scripts/verify-attachment-cutover.cjs "$CUTOVER_REPORT" "$CONFIRM_PROJECT" --record-deployment
fi
