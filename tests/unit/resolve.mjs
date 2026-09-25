// =============================================================
// 시험용 경로 해석기 — Node에 내장된 시험 도구(node --test)가 앱 코드를
// **그대로 import**하게 해 줍니다.
// -------------------------------------------------------------
// 앱 코드는 Next(webpack)가 푸는 두 가지 모양으로 적혀 있습니다.
//   · `@/lib/dates`   — jsconfig.json의 별칭(@ = 저장소 뿌리)
//   · `./dates`       — 확장자 없는 상대 경로
// Node는 둘 다 모르므로, 여기서 `.js`·`.jsx`·`.mjs`·`/index.js`를 차례로
// 붙여 보고 있는 파일로 바꿔 줍니다. 그 밖의 것(react 등)은 Node에 맡깁니다.
//
// 시험 도구(vitest·jest)를 설치하지 않는 까닭: 루트에 개발 의존성을
// 늘리면 Vercel 빌드가 그만큼 오래 걸립니다(tests/rules·functions를 따로
// 둔 것과 같은 이유). 이 스무 줄이면 순수 함수 시험에는 충분합니다.
//
// **JSX 파일은 못 읽습니다**(변환기가 없습니다). 컴포넌트 안의 셈을
// 시험하려면 그 셈을 lib/의 함수로 빼내세요 — RewardTiming의
// rewardTimingStat이 그렇게 옮겨 간 예입니다.
// =============================================================
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TRY = ["", ".js", ".mjs", ".jsx", "/index.js"];

function findFile(base) {
  for (const ext of TRY) {
    const f = base + ext;
    if (existsSync(f) && statSync(f).isFile()) return f;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  let base = null;
  if (specifier.startsWith("@/")) base = path.join(ROOT, specifier.slice(2));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (base) {
    const f = findFile(base);
    // 앱 코드의 .js는 ESM 문법인데 package.json에 "type": "module"이 없어,
    // 형식을 못 박아 줘야 Node가 CommonJS로 읽다 멈추지 않습니다.
    if (f) return { url: pathToFileURL(f).href, format: f.endsWith(".jsx") ? undefined : "module", shortCircuit: true };
  }
  return next(specifier, context);
}
