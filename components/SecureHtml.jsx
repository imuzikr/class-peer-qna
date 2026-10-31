"use client";

import { useMemo, useRef } from "react";
import { prepareSecureHtml, sanitizeHtml } from "@/lib/html";
import { useSecureHtml } from "@/lib/secureImage";

// 원문은 식별자를 유지하고, 화면의 img에만 인증받은 임시 blob URL을 채웁니다.
export default function SecureHtml({ html = "", as: Tag = "div", ref: outerRef, ...rest }) {
  const innerRef = useRef(null);
  const safeHtml = useMemo(() => prepareSecureHtml(sanitizeHtml(html)), [html]);
  useSecureHtml(innerRef, safeHtml);
  const setRef = (element) => {
    innerRef.current = element;
    if (typeof outerRef === "function") outerRef(element);
    else if (outerRef) outerRef.current = element;
  };
  return <Tag {...rest} ref={setRef} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
