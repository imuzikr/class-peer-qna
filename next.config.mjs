/** @type {import('next').NextConfig} */

// Content-Security-Policy — 앱이 실제로 쓰는 출처만 허용.
//  · script/eval: Next 하이드레이션(inline) + Pyodide(wasm-eval) + jsDelivr CDN
//    + reCAPTCHA Enterprise(App Check, www.google.com)
//  · connect: Firebase(Firestore/Auth/Storage/Installations = *.googleapis.com)
//    + Cloud Functions(callable, *.cloudfunctions.net) + Pyodide CDN
//    + reCAPTCHA Enterprise 검증 요청(www.google.com)
//  · img: Storage 등 https 이미지 + data/blob(미리보기·그리기)
//  · worker/blob: 파이썬 실행 Web Worker
//  · frame: 구글/Firebase 인증 팝업 + reCAPTCHA Enterprise 위젯 iframe
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://apis.google.com https://www.google.com https://*.gstatic.com blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://cdn.jsdelivr.net https://apis.google.com https://www.google.com https://*.cloudfunctions.net wss://*.firebaseio.com data: blob:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://class-peer-qna.firebaseapp.com https://apis.google.com https://accounts.google.com https://www.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig = {
  reactStrictMode: true,

  // 린트는 빌드가 아니라 `npm run lint`로 따로 돌립니다(보고만 — 루트
  // eslint.config.mjs 머리말). ESLint는 tools/lint에만 설치돼 있어, 빌드가
  // 루트 설정을 보고 린트를 돌리려 하면 찾지 못해 멈춥니다.
  eslint: { ignoreDuringBuilds: true },

  // 구글 로그인 창을 우리 주소로 띄우기 — /__/auth/* 와 /__/firebase/* 를
  // firebaseapp.com으로 넘겨 줍니다(lib/firebase.js의 authDomain 주석).
  async rewrites() {
    return [
      { source: "/__/auth/:path*", destination: "https://class-peer-qna.firebaseapp.com/__/auth/:path*" },
      { source: "/__/firebase/:path*", destination: "https://class-peer-qna.firebaseapp.com/__/firebase/:path*" },
    ];
  },

  async headers() {
    return [
      {
        // /__/ 아래(넘겨 준 로그인 창)는 빼야 합니다 — 우리 CSP의
        // frame-ancestors 'none'·X-Frame-Options DENY가 붙으면 앱이 같은
        // 주소의 로그인 iframe(/__/auth/iframe)을 못 띄웁니다.
        source: "/:path((?!__/).*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
