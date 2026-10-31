"use client";

import { useState } from "react";
import { isAttachmentRef } from "@/lib/attachmentRefs";
import { downloadAttachment, openAttachment } from "@/lib/attachments";

export default function ProtectedAttachmentLink({ href, download, onClick, children, ...rest }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const protectedFile = isAttachmentRef(href);
  if (!protectedFile) return <a {...rest} href={href} download={download} onClick={onClick}>{children}</a>;

  async function open(event) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (download !== undefined && download !== false) {
        await downloadAttachment(href, typeof download === "string" ? download : undefined);
      } else {
        await openAttachment(href);
      }
    } catch {
      setError("파일을 열지 못했어요. 로그인 상태와 열람 권한을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <a {...rest} href="#" onClick={open} aria-busy={busy || undefined}
      aria-disabled={busy || undefined} title={error || rest.title}>{children}</a>
    {error && <span className="form-error" role="alert">{error}</span>}
  </>;
}
