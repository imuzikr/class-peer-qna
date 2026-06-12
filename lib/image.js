// =============================================================
// 이미지 첨부 공용 유틸
// -------------------------------------------------------------
// 첨부 이미지를 캔버스로 리사이즈해서 data URL로 변환합니다.
// (Firestore 문서는 1MB 제한이 있어 폭 900px / JPEG 80%로 압축.
//  나중에 큰 원본이 필요하면 Firebase Storage로 교체하면 됩니다.)
// =============================================================
export function readImageAsDataUrl(file, maxWidth = 900) {
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
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
