// =============================================================
// ESLint — 지금은 **보고만** 합니다(빌드를 막지 않습니다).
// -------------------------------------------------------------
// 루트에서 `npm run lint`. **설치물은 tools/lint에** 따로 둡니다 — tests/rules와
// 같은 까닭으로, Vercel 빌드가 쓰지 않는 패키지를 설치하느라 느려지지 않게.
// **설정 파일만 루트에** 있습니다 — ESLint는 설정 파일이 있는 폴더 바깥의
// 파일을 통째로 무시해서, tools/lint 안에 두면 app·components·lib를 못 봅니다.
// 그래서 플러그인은 tools/lint/node_modules에서 경로로 가져옵니다.
// `next build`가 이 설정을 보고 린트를 돌리려 하지 않게 next.config.mjs에
// `eslint.ignoreDuringBuilds`를 켜 두었습니다(루트에는 ESLint가 없습니다).
//
// 켜 둔 것은 둘뿐입니다.
//   · React 훅 규칙 — 훅을 조건문 안에서 부르는 것(오류), 의존성 배열에서
//     빠진 값(경고). 옛 값을 붙잡는 버그가 이 앱에서 여러 번 났습니다.
//   · 쓸모없어진 끄기 주석 — `eslint-disable-next-line react-hooks/…`가
//     47개 있는데, 설정이 없던 동안은 아무것도 끄지 않는 글자였습니다.
//     이제 그중 무엇이 정말 필요한지 이 보고가 가려 줍니다.
// 규칙을 더 켤 때는 먼저 경고로 두고 개수를 본 뒤 올리세요.
// =============================================================
import reactHooks from "./tools/lint/node_modules/eslint-plugin-react-hooks/index.js";
import globals from "./tools/lint/node_modules/globals/index.js";

export default [
  {
    files: ["app/**/*.{js,jsx,mjs}", "components/**/*.{js,jsx,mjs}", "lib/**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
