#!/usr/bin/env bash
# =============================================================
# Firestore 규칙 + Cloud Functions 배포
# -------------------------------------------------------------
# 사용법:
#   npm run deploy              # 규칙 테스트 후 규칙+함수 모두 배포
#   npm run deploy -- --rules-only
#   npm run deploy -- --functions-only
#   npm run deploy -- --indexes-only # 색인(firestore.indexes.json)만
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

for arg in "$@"; do
  case "$arg" in
    --rules-only) TARGET="firestore:rules" ;;
    --functions-only) TARGET="functions" ;;
    --indexes-only) TARGET="firestore:indexes" ;;
    --skip-tests) SKIP_TESTS=1 ;;
    *)
      echo "알 수 없는 옵션: $arg" >&2
      echo "사용법: npm run deploy -- [--rules-only|--functions-only|--indexes-only] [--skip-tests]" >&2
      exit 1
      ;;
  esac
done

if [[ "$TARGET" == *"firestore:rules"* && "$SKIP_TESTS" -ne 1 ]]; then
  echo "▶ 배포 전 Firestore 규칙 테스트를 먼저 돌립니다 (건너뛰려면 --skip-tests)"
  if [ ! -d tests/rules/node_modules ]; then
    echo "  tests/rules/node_modules가 없어 먼저 설치합니다..."
    npm --prefix tests/rules install
  fi
  npm run test:rules
  echo "✔ 규칙 테스트 통과"
  echo ""
fi

if [[ "$TARGET" == *"functions"* ]]; then
  echo "▶ functions/ 의존성을 확인합니다"
  npm --prefix functions install
  echo ""
fi

echo "▶ 배포 대상: $TARGET"
echo "  (최초 1회는 'npx firebase-tools login'으로 먼저 로그인해야 합니다)"
npx firebase-tools deploy --only "$TARGET"
