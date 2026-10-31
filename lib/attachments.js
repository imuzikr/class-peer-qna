import { getToken as getAppCheckToken } from "firebase/app-check";
import { auth, appCheck, isFirebaseConfigured } from "./firebase";
import { collectAttachmentRefs, isAttachmentRef } from "./attachmentRefs";
import { createAttachmentTransport } from "./attachmentTransport";

let transport = null;

export function attachmentGatewayUrl() {
  const projectId = auth?.app?.options?.projectId || "class-peer-qna";
  return process.env.NEXT_PUBLIC_ATTACHMENT_GATEWAY_URL ||
    `https://asia-northeast3-${projectId}.cloudfunctions.net/attachmentGateway`;
}

async function credentials() {
  if (!isFirebaseConfigured || !auth) {
    throw Object.assign(new Error("첨부파일 서비스가 설정되지 않았습니다."), { code: "attachment/unconfigured" });
  }
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("로그인이 필요합니다."), { code: "attachment/unauthenticated", status: 401 });
  const token = await user.getIdToken();
  let appCheckToken;
  if (appCheck) {
    try { appCheckToken = (await getAppCheckToken(appCheck)).token; } catch { /* 서버의 App Check 설정이 최종 판정합니다. */ }
  }
  return { uid: user.uid, token, appCheckToken };
}

function client() {
  if (!transport) transport = createAttachmentTransport({
    baseUrl: attachmentGatewayUrl(), getCredentials: credentials,
    getSessionKey: () => auth?.currentUser?.uid ?? null,
    xhrFactory: typeof XMLHttpRequest !== "undefined" ? () => new XMLHttpRequest() : null,
  });
  return transport;
}

export function uploadAttachmentBlob(blob, name, options) {
  return client().upload(blob, name, options);
}

export async function registerAttachmentsForDocument(parentPath, data) {
  const refs = collectAttachmentRefs(data);
  if (!isFirebaseConfigured || !refs.length) return;
  await client().bind(parentPath, refs);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("attachments-bound", { detail: { refs } }));
}

export async function fetchAttachmentBlob(ref, options = {}) {
  // 다른 기기의 저장 문서 snapshot이 bind보다 먼저 도착할 수 있습니다.
  // cold start까지 기다리되 실제 권한 거부는 재시도하지 않습니다.
  const delays = [250, 750, 1500, 3000, 5000, 8000, 10000];
  for (let attempt = 0; ; attempt++) {
    try { return await client().blob(ref, options); } catch (error) {
      if (!/binding-pending$/.test(error.code ?? "") || attempt >= delays.length || options.signal?.aborted) throw error;
      await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(Object.assign(new Error("취소되었습니다."), { name: "AbortError" })); };
        const timer = setTimeout(() => { options.signal?.removeEventListener("abort", abort); resolve(); }, delays[attempt]);
        options.signal?.addEventListener("abort", abort, { once: true });
      });
    }
  }
}

export function deleteProtectedAttachment(ref) {
  return client().remove(ref);
}

export async function resolveAttachmentUrl(src) {
  if (!isAttachmentRef(src) && /^(https?:\/\/|data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,|blob:|\/(?!\/))/i.test(src ?? "")) {
    return { url: src, release() {} };
  }
  const { acquireSecureImage } = await import("./secureImage");
  return acquireSecureImage(src);
}

export async function downloadAttachment(src, name) {
  const resolved = await resolveAttachmentUrl(src);
  const a = document.createElement("a");
  a.href = resolved.url;
  a.download = name || resolved.name || "첨부파일";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 브라우저가 다운로드를 시작할 때까지 URL의 사용 표시를 유지합니다.
  setTimeout(resolved.release, 1000);
}

export async function openAttachment(src) {
  if (!isAttachmentRef(src)) {
    if (!/^(https?:\/\/|data:|blob:)/i.test(src ?? "")) throw new Error("첨부 주소가 올바르지 않습니다.");
    window.open(src, "_blank", "noopener,noreferrer");
    return;
  }
  // 사용자 클릭이 끝나기 전에 빈 탭을 열어 팝업 차단을 피합니다.
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  try {
    const resolved = await resolveAttachmentUrl(src);
    if (!tab) { resolved.release(); throw new Error("새 창을 열 수 없습니다. 팝업 설정을 확인해 주세요."); }
    // HTML/SVG를 앱 origin의 blob 문서로 열면 스크립트가 실행될 수 있습니다.
    // PDF와 래스터 이미지에만 미리보기를 허용하고 그 밖의 형식은 다운로드합니다.
    if (!/^(application\/pdf|image\/(?:png|jpeg|gif|webp|avif|bmp))$/i.test(resolved.type ?? "")) {
      tab.close();
      const a = document.createElement("a");
      a.href = resolved.url;
      a.download = resolved.name || "첨부파일";
      a.click();
      setTimeout(resolved.release, 1000);
      return;
    }
    tab.location.replace(resolved.url);
    const watcher = setInterval(() => { if (tab.closed) { clearInterval(watcher); resolved.release(); } }, 1000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
