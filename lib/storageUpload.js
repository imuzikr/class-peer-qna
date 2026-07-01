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
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
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

// Blob 업로드 → 다운로드 URL. onProgress(0~1)로 진행률을 전달합니다.
// uploadBytesResumable을 쓰면 업로드 진행 상태를 실시간으로 받을 수 있어
// (uploadBytes와 달리) 프로그레스 바를 그릴 수 있습니다.
function putBlob(blobOrFile, name, onProgress) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, storagePath(name)), blobOrFile);
    task.on(
      "state_changed",
      (snap) => {
        if (onProgress && snap.totalBytes) {
          onProgress(snap.bytesTransferred / snap.totalBytes);
        }
      },
      reject,
      () => getDownloadURL(task.snapshot.ref).then(resolve, reject)
    );
  });
}

// 이미지를 압축(JPEG)해 업로드 용량을 줄입니다.
//  · createImageBitmap: 파일에서 바로 디코딩(base64 변환 생략, 하드웨어 가속)
//    → 지원 안 되는 구형 브라우저는 FileReader+Image로 폴백.
async function compressImageToBlob(file, maxWidth, quality) {
  const bitmap = await decodeImage(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close(); // ImageBitmap 메모리 해제
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("이미지 압축 실패"))),
      "image/jpeg",
      quality
    );
  });
}

// createImageBitmap 우선, 미지원 시 FileReader→Image 폴백.
function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).catch(() => decodeImageLegacy(file));
  }
  return decodeImageLegacy(file);
}

function decodeImageLegacy(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => resolve(img);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// 이미지 업로드 → 다운로드 URL. (데모: 압축 data URL)
//  · maxWidth 1080 / 품질 0.72 — 판서·화면 사진 화질은 유지하며 용량을 크게 절감.
export async function uploadImage(file, { maxWidth = 1080, quality = 0.72, onProgress } = {}) {
  if (!isFirebaseConfigured || !storage) {
    return readImageAsDataUrl(file, 900);
  }
  const blob = await compressImageToBlob(file, maxWidth, quality);
  return putBlob(blob, (file.name || "image").replace(/\.\w+$/, "") + ".jpg", onProgress);
}

// 일반 파일 업로드(이미지 외) → 다운로드 URL. (데모: data URL)
export async function uploadFile(file, { onProgress } = {}) {
  if (!isFirebaseConfigured || !storage) {
    return readFileAsDataUrl(file);
  }
  return putBlob(file, file.name, onProgress);
}

// data URL(그리기 결과·붙여넣기 등)을 Storage에 업로드 → 다운로드 URL.
// 데모/미설정 시 data URL을 그대로 반환합니다.
export async function uploadDataUrl(dataUrl, name = "image.png", { onProgress } = {}) {
  if (!isFirebaseConfigured || !storage) return dataUrl;
  if (!dataUrl?.startsWith("data:")) return dataUrl; // 이미 URL이면 그대로
  const blob = await (await fetch(dataUrl)).blob();
  return putBlob(blob, name, onProgress);
}
