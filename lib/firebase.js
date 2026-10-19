// =============================================================
// Firebase 초기화
// -------------------------------------------------------------
// Firebase 콘솔(https://console.firebase.google.com)에서
// 프로젝트 생성 → 웹 앱 등록 후 발급받은 설정값을 아래에 붙여넣으세요.
// 설정값을 붙여넣기 전까지는 앱이 자동으로 '데모 모드'(브라우저 메모리
// 저장)로 동작하므로, 먼저 화면과 기능을 확인해 볼 수 있습니다.
// =============================================================
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

// 로그인 창의 주소(authDomain) — 실서비스 주소에서는 우리 사이트 자신을 씁니다.
// 학교 와이파이·자녀 보호 앱이 firebaseapp.com만 막아, 일부 학생에게 구글
// 로그인 창이 '사이트에 연결할 수 없음'으로 떴습니다. next.config.mjs의
// rewrites가 /__/auth/* 를 firebaseapp.com으로 넘겨 주므로, 학생 기기는
// vercel.app 하나에만 닿으면 됩니다. Google Cloud 콘솔의 OAuth 클라이언트에
// 'https://class-peer-qna.vercel.app/__/auth/handler'가 리디렉션 URI로 올라가
// 있어야 합니다(없으면 redirect_uri_mismatch). 미리보기 주소·localhost는
// 그 URI가 없어 지금까지대로 firebaseapp.com을 씁니다.
const FIREBASE_AUTH_DOMAIN = "class-peer-qna.firebaseapp.com";
const PROXIED_AUTH_HOSTS = ["class-peer-qna.vercel.app"];
// 한 번 켰다가 redirect_uri_mismatch(구글 쪽 반영이 늦음)로 모든 학생의
// 로그인이 막혀 되돌린 뒤, ?authproxy=1 로 한 기기에서 먼저 확인하고 켰습니다.
// 다시 시험할 일이 생기면 false로 두면 그 표시가 있는 기기에서만 켜집니다
// (?authproxy=1 켬 · ?authproxy=0 끔, localStorage에 기억).
const AUTH_PROXY_FOR_ALL = true;
function authProxyOn() {
  if (AUTH_PROXY_FOR_ALL) return true;
  try {
    const flag = new URLSearchParams(window.location.search).get("authproxy");
    if (flag === "1") localStorage.setItem("bn_auth_proxy", "1");
    if (flag === "0") localStorage.removeItem("bn_auth_proxy");
    return localStorage.getItem("bn_auth_proxy") === "1";
  } catch {
    return false;
  }
}
const authDomain =
  typeof window !== "undefined" &&
  PROXIED_AUTH_HOSTS.includes(window.location.hostname) &&
  authProxyOn()
    ? window.location.hostname
    : FIREBASE_AUTH_DOMAIN;

const firebaseConfig = {
  apiKey: "AIzaSyCoysC2cNDOSVO7pbJayf3JuAnwFrXKyfI",
  authDomain,
  projectId: "class-peer-qna",
  storageBucket: "class-peer-qna.firebasestorage.app",
  messagingSenderId: "1024597989167",
  appId: "1:1024597989167:web:e06888642fe09ded3af3da",
};

// App Check — Google Cloud에서 발급한 reCAPTCHA Enterprise 키 ID.
// Firebase 콘솔 App Check 메뉴에서도 동일한 키로 웹 앱을 등록해야 함.
const RECAPTCHA_ENTERPRISE_SITE_KEY = "6LcqJGMtAAAAACO76NOhAcdydVPcf9rFHkOgsL1q";

// 설정값이 아직 자리표시자(YOUR_...)이면 데모 모드로 동작합니다.
export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith("YOUR_");

let db = null;
let auth = null;
let storage = null;
let functions = null;
let appCheck = null;

if (isFirebaseConfigured) {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  // 첨부 이미지/파일 저장소 (data URL 대신 원본을 Storage에 업로드)
  storage = getStorage(app);
  // Cloud Functions(callable) — 리전은 functions/index.js의 setGlobalOptions와 일치해야 함
  functions = getFunctions(app, "asia-northeast3");

  // App Check는 브라우저 DOM(reCAPTCHA)이 필요해 SSR/정적 빌드 환경에서는 건너뜀
  if (typeof window !== "undefined") {
    // 로컬 개발(localhost)은 reCAPTCHA Enterprise 심사를 통과할 수 없으므로
    // 디버그 토큰 모드로 전환 — 콘솔에 출력되는 토큰을 Firebase 콘솔 > App Check >
    // 앱 관리 > 디버그 토큰에 등록해야 개발 중 요청이 차단되지 않음.
    if (process.env.NODE_ENV !== "production") {
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }
}

export { db, auth, storage, functions, appCheck };
