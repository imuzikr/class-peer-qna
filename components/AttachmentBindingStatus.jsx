"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { clearSecureImageCache } from "@/lib/secureImage";
import { useAuth } from "@/lib/authContext";
import {
  getAttachmentBindingStatus,
  retryPendingAttachmentBindings,
  subscribeAttachmentBindingStatus,
} from "@/lib/data/attachmentWrites";

export default function AttachmentBindingStatus() {
  const { user } = useAuth();
  const pathname = usePathname();
  useEffect(() => { clearSecureImageCache(); }, [pathname]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const uid = user?.uid ?? null;
  useEffect(() => {
    if (!uid) { setStatus(null); return undefined; }
    const sync = () => setStatus(getAttachmentBindingStatus());
    const unsubscribe = subscribeAttachmentBindingStatus(sync);
    sync();
    const retry = () => retryPendingAttachmentBindings().catch(() => {});
    retry();
    window.addEventListener("online", retry);
    return () => { unsubscribe(); window.removeEventListener("online", retry); };
  }, [uid]);
  if (!uid || status?.uid !== uid || !status.pendingCount) return null;
  return (
    <aside className="attachment-binding-status" role="status" aria-live="polite">
      <span>글은 저장됐습니다. 일부 첨부는 아직 다른 사용자에게 보이지 않습니다.</span>
      <button type="button" className="btn-ghost" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await retryPendingAttachmentBindings(); }
        catch { setStatus(getAttachmentBindingStatus()); }
        finally { setBusy(false); }
      }}>{busy ? "확인 중…" : "다시 시도"}</button>
    </aside>
  );
}
