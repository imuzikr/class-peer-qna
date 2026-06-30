// =============================================================
// 첨부 업로드 — Firebase Storage
// -------------------------------------------------------------
// 이미지/파일을 Storage에 올리고 다운로드 URL을 반환합니다.
// 그 URL만 Firestore 문서에 저장하므로 문서 용량(1MB 제한)을 아끼고
// 원본 화질을 유지할 수 있습니다.
//
// 데모 모드(Firebase 미설정) 또는 Storage 미초기화 시에는 기존처럼
// data URL(base64)을 반환해 동작이 끊기지 않게 합니다.
//
// 경로 설계: uploads/{uid}/{시각}_{파일명}
//  · Storage 규칙에서 "본인 uid 폴더에만 쓰기"로 제한합니다.
// =============================================================
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { isFirebaseConfigured, storage } from "./firebase";
import { getCurrentUser } from "./user";
import { readImageAsDataUrl, readFileAsDataUrl } from "./image";

function storagePath(name) {
  const uid = getCurrentUser()?.uid ?? "anon";
  const safe = String(name || "file")
    .replace(/[^\w.\-]/g, "_")
    .slice(-80);
  return `uploads/${uid}/${Date.now()}_${safe}`;
}

async function putBlob(blobOrFile, name) {
  const r = ref(storage, storagePath(name));
  await uploadBytes(r, blobOrFile);
  return getDownloadURL(r);
}

// 이미지를 캔버스로 압축(JPEG) 후 Blob으로 만들어 업로드 용량을 줄입니다.
function compressImageToBlob(file, maxWidth) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("이미지 압축 실패"))),
          "image/jpeg",
          0.82
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// 이미지 업로드 → 다운로드 URL. (데모: 압축 data URL)
export async function uploadImage(file, maxWidth = 1280) {
  if (!isFirebaseConfigured || !storage) {
    return readImageAsDataUrl(file, 900);
  }
  const blob = await compressImageToBlob(file, maxWidth);
  return putBlob(blob, (file.name || "image").replace(/\.\w+$/, "") + ".jpg");
}

// 일반 파일 업로드(이미지 외) → 다운로드 URL. (데모: data URL)
export async function uploadFile(file) {
  if (!isFirebaseConfigured || !storage) {
    return readFileAsDataUrl(file);
  }
  return putBlob(file, file.name);
}
