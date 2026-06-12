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

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// 설정값이 아직 자리표시자(YOUR_...)이면 데모 모드로 동작합니다.
export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith("YOUR_");

let db = null;
let auth = null;

if (isFirebaseConfigured) {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);
  // 나중에 Firebase Authentication을 붙일 때 사용합니다.
  auth = getAuth(app);
}

export { db, auth };
