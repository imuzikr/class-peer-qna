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

const firebaseConfig = {
  apiKey: "AIzaSyCoysC2cNDOSVO7pbJayf3JuAnwFrXKyfI",
  authDomain: "class-peer-qna.firebaseapp.com",
  projectId: "class-peer-qna",
  storageBucket: "class-peer-qna.firebasestorage.app",
  messagingSenderId: "1024597989167",
  appId: "1:1024597989167:web:e06888642fe09ded3af3da",
};

// 설정값이 아직 자리표시자(YOUR_...)이면 데모 모드로 동작합니다.
export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith("YOUR_");

let db = null;
let auth = null;
let storage = null;

if (isFirebaseConfigured) {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  // 첨부 이미지/파일 저장소 (data URL 대신 원본을 Storage에 업로드)
  storage = getStorage(app);
}

export { db, auth, storage };
