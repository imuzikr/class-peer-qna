"use client";

import { useSecureImage } from "@/lib/secureImage";

const ERROR_TEXT = {
  denied: "이 그림을 볼 수 있는 권한이 없어요.",
  missing: "그림을 찾을 수 없어요.",
  unavailable: "지금은 그림을 불러올 수 없어요.",
};

// 저장된 첨부 식별자는 img src로 직접 보내지 않습니다. 현재 사용자의
// 문서 열람 권한으로 받은 이미지 데이터만 브라우저에 표시합니다.
export default function SecureImage({ src, alt = "", className, style, fallback, ...rest }) {
  const image = useSecureImage(src);
  if (!src) return null;
  if (image.status === "ready") {
    return <img src={image.url} alt={alt} className={className} style={style} {...rest} />;
  }
  if (image.status === "error") {
    if (fallback !== undefined) return fallback;
    return (
      <span className={className} role="group" aria-label={alt || ERROR_TEXT[image.reason] || "그림을 불러오지 못했어요."}
        data-attachment-error={image.reason || "error"}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 48,
          padding: 8, fontSize: 12, color: "var(--text-sub)", background: "var(--bg-deep)", borderRadius: 8, ...style }}>
        <span>{ERROR_TEXT[image.reason] || "그림을 불러오지 못했어요."}</span>
        {image.retry && <button type="button" className="btn-ghost"
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); image.retry(); }}>
          다시 불러오기
        </button>}
      </span>
    );
  }
  return <span className={className} aria-busy="true" role="img" aria-label={alt || "그림 불러오는 중"}
    style={{ display: "inline-block", minHeight: 48, background: "var(--bg-deep)", borderRadius: 8, ...style }} />;
}
