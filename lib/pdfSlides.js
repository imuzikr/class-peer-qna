"use client";

// =============================================================
// PDF → 슬라이드 이미지 변환 (브라우저에서 수행)
// -------------------------------------------------------------
// 수업 자료를 올릴 때 한 번만 실행됩니다. PDF를 페이지마다 캔버스에
// 그린 뒤 JPEG로 뽑아 Storage에 올립니다.
//
// [왜 이미지로 바꾸나]
// 학생 화면을 교사와 "같은 장"으로 맞추려면 앱이 지금 몇 번째 장인지
// 알아야 합니다. 구글 슬라이드·캔바 링크를 iframe으로 띄우면 그 안의
// 페이지는 남의 사이트 영역이라 읽지도 넘기지도 못합니다. 반면 장별
// 이미지는 그냥 배열 인덱스라, 교사가 넘긴 번호만 보내면 학생 화면이
// 정확히 같은 장을 띄웁니다.
//
// pdf.js는 무거워서(수 MB) 실제로 변환할 때만 동적으로 불러옵니다.
//
// [legacy 빌드를 쓰는 이유]
// 기본 빌드는 Map.prototype.getOrInsertComputed 같은 아주 최신 문법을 써서
// Chromium 141에서도 render()가 바로 실패합니다(실제로 확인). 교실 기기는
// 최신 브라우저를 보장할 수 없으니 트랜스파일된 legacy 빌드를 씁니다.
// 메인 스크립트와 워커는 반드시 같은 빌드로 짝을 맞춰야 합니다
// (scripts/copy-pdf-worker.mjs도 legacy 워커를 복사합니다).
// =============================================================

let pdfjsPromise = null;

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      // 워커는 같은 출처(public/)에서 — CSP가 worker-src 'self'로 제한됨.
      // scripts/copy-pdf-worker.mjs가 빌드 전에 복사해 둡니다.
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

// PDF 파일 → [Blob, Blob, …] (페이지 순서대로)
//  · maxWidth: 가로 기준 렌더 해상도. 전자칠판·빔프로젝터를 고려해 넉넉히.
//  · onProgress(0~1): 페이지 변환 진행률
export async function pdfToSlideBlobs(
  file,
  { maxWidth = 1600, quality = 0.82, onProgress } = {}
) {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  // destroy()는 문서 객체가 아니라 '로딩 태스크'에 있습니다 — 참조를 들고 있어야
  // 끝나고 워커를 정리할 수 있습니다.
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;

  const blobs = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      // 원본보다 크게 늘리지는 않되(최대 2배), 너무 작지 않게 확대합니다.
      const viewport = page.getViewport({ scale: Math.min(2, maxWidth / base.width) });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      // PDF 배경은 투명이라 JPEG로 바꾸면 검게 나옵니다 — 흰색을 먼저 깔아 줍니다.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, viewport }).promise;
      page.cleanup();

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("슬라이드 이미지 변환 실패"))),
          "image/jpeg",
          quality
        );
      });
      blobs.push(blob);
      onProgress?.(n / doc.numPages);
    }
  } finally {
    // 워커 정리는 실패해도 무시합니다 — 다 변환해 둔 슬라이드를
    // 정리 단계 오류 때문에 잃어버리면 안 되니까요.
    try {
      await task.destroy();
    } catch {
      /* 무시 */
    }
  }
  return blobs;
}
