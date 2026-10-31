import { attachmentId, isAttachmentRef } from "./attachmentRefs";

export const ATTACHMENT_TIMEOUTS = Object.freeze({ upload: 120_000, read: 60_000, bind: 30_000, remove: 30_000 });

function transportError(code, message, status = 0) {
  return Object.assign(new Error(message), { code, status });
}

export function attachmentDownloadName(disposition) {
  if (typeof disposition !== "string") return "";
  let name = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (name) {
    try { name = decodeURIComponent(name); } catch { name = ""; }
  }
  if (!name) name = disposition.match(/filename="([^"]*)"/i)?.[1] || disposition.match(/filename=([^;\s]+)/i)?.[1] || "";
  return name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 200);
}

async function responseError(response) {
  let detail;
  try { detail = (await response.json())?.error; } catch { /* HTTP 상태로 구분 */ }
  return transportError(detail?.code || `attachment/http-${response.status}`,
    detail?.message || "첨부파일 요청을 처리하지 못했습니다.", response.status);
}

// Firebase·브라우저 구현을 주입하여 실제 요청의 인증 헤더, 취소·로그아웃,
// 진행률, 오류 처리를 네트워크 없이도 시험합니다.
export function createAttachmentTransport({ baseUrl, getCredentials, getSessionKey,
  fetchImpl = (...args) => fetch(...args), xhrFactory = null,
  timeouts = {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const base = String(baseUrl ?? "").replace(/\/$/, "");
  const limits = Object.fromEntries(Object.entries(ATTACHMENT_TIMEOUTS).map(([kind, fallback]) =>
    [kind, Number.isFinite(timeouts[kind]) && timeouts[kind] > 0 ? timeouts[kind] : fallback]));

  const timeoutError = () => transportError("attachment/timeout", "첨부파일 요청 시간이 초과되었습니다. 연결을 확인하고 다시 시도해 주세요.", 408);
  const abortError = () => Object.assign(new Error("첨부파일 요청이 취소되었습니다."), { name: "AbortError" });

  // 응답 헤더만 받은 시점이 아니라 인증 대기부터 본문 수신 완료까지 셉니다.
  // 외부 signal과 제한 시간을 한 controller로 합쳐 fetch/XHR 양쪽을 취소합니다.
  function deadline(parentSignal, timeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    let rejectStopped;
    const stopped = new Promise((_, reject) => { rejectStopped = reject; });
    const onAbort = () => rejectStopped(timedOut ? timeoutError() : abortError());
    controller.signal.addEventListener("abort", onAbort, { once: true });
    const cancel = () => controller.abort();
    if (parentSignal?.aborted) cancel();
    else parentSignal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimer(() => { timedOut = true; controller.abort(); }, timeoutMs);
    return {
      signal: controller.signal,
      assertActive() { if (controller.signal.aborted) throw timedOut ? timeoutError() : abortError(); },
      async run(work) {
        try {
          return await Promise.race([Promise.resolve().then(() => {
            this.assertActive();
            return work(controller.signal);
          }), stopped]);
        } finally {
          clearTimer(timer);
          parentSignal?.removeEventListener("abort", cancel);
          controller.signal.removeEventListener("abort", onAbort);
        }
      },
    };
  }

  async function credentials() {
    const session = await getCredentials();
    if (!session?.uid || !session?.token) throw transportError("attachment/unauthenticated", "로그인이 필요합니다.", 401);
    return session;
  }
  function headers(session, extra = {}) {
    return { ...extra, Authorization: `Bearer ${session.token}`,
      ...(session.appCheckToken ? { "X-Firebase-AppCheck": session.appCheckToken } : {}) };
  }
  function assertCurrent(session) {
    if (getSessionKey && getSessionKey() !== session.uid) {
      throw transportError("attachment/session-changed", "로그인 사용자가 바뀌었습니다.", 401);
    }
  }
  async function request(route, options = {}, timeoutMs = limits.read, consume = (response) => response.json()) {
    const scope = deadline(options.signal, timeoutMs);
    return scope.run(async (signal) => {
      const session = await credentials();
      scope.assertActive();
      assertCurrent(session);
      const response = await fetchImpl(`${base}${route}`, { ...options, signal,
        headers: headers(session, options.headers), credentials: "omit", cache: "no-store" });
      if (!response.ok) throw await responseError(response);
      const result = await consume(response);
      scope.assertActive();
      assertCurrent(session);
      return result;
    });
  }

  async function upload(blob, name, { onProgress, signal } = {}) {
    if (!blob || !Number.isFinite(blob.size) || blob.size <= 0) {
      throw transportError("attachment/empty-file", "빈 파일은 올릴 수 없습니다.");
    }
    const route = `/upload?name=${encodeURIComponent(name || "file")}`;
    const type = blob.type || "application/octet-stream";
    let result;
    if (xhrFactory) {
      const scope = deadline(signal, limits.upload);
      result = await scope.run(async (requestSignal) => {
        const session = await credentials();
        scope.assertActive();
        assertCurrent(session);
        return new Promise((resolve, reject) => {
          const xhr = xhrFactory();
          const cancel = () => xhr.abort();
          let finished = false;
          function finish(fn, value) {
            if (finished) return;
            finished = true;
            requestSignal.removeEventListener("abort", cancel);
            fn(value);
          }
          xhr.open("POST", `${base}${route}`);
          xhr.timeout = limits.upload;
          for (const [key, value] of Object.entries(headers(session, { "Content-Type": type }))) xhr.setRequestHeader(key, value);
          xhr.upload.onprogress = (event) => {
            if (requestSignal.aborted) return;
            if (event.lengthComputable && onProgress) onProgress(Math.min(0.95, event.loaded / event.total));
          };
          xhr.onload = () => {
            let body;
            try { body = JSON.parse(xhr.responseText); } catch { body = null; }
            if (xhr.status < 200 || xhr.status >= 300) {
              finish(reject, transportError(body?.error?.code || `attachment/http-${xhr.status}`,
                body?.error?.message || "첨부파일을 올리지 못했습니다.", xhr.status));
            } else {
              try { assertCurrent(session); finish(resolve, body); } catch (error) { finish(reject, error); }
            }
          };
          xhr.onerror = () => finish(reject, transportError("attachment/network", "연결을 확인한 뒤 다시 올려 주세요."));
          xhr.ontimeout = () => finish(reject, timeoutError());
          xhr.onabort = () => finish(reject, abortError());
          if (requestSignal.aborted) { finish(reject, abortError()); return; }
          requestSignal.addEventListener("abort", cancel, { once: true });
          onProgress?.(0);
          xhr.send(blob);
        });
      });
    } else {
      onProgress?.(0);
      result = await request(route, { method: "POST", headers: { "Content-Type": type }, body: blob, signal }, limits.upload);
    }
    if (!isAttachmentRef(result?.ref)) throw transportError("attachment/invalid-response", "첨부 업로드 응답을 확인하지 못했습니다.");
    onProgress?.(1);
    return result.ref;
  }

  async function bind(parentPath, refs) {
    if (!refs.length) return;
    // 서버 제한과 맞추며 대량 수업 자료도 중복 없이 연결합니다.
    for (let offset = 0; offset < refs.length; offset += 100) {
      await request("/bind", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentPath, refs: refs.slice(offset, offset + 100) }) }, limits.bind);
    }
  }
  async function blob(ref, { signal } = {}) {
    const id = attachmentId(ref);
    if (!id) throw transportError("attachment/invalid-ref", "첨부 식별자가 올바르지 않습니다.");
    return request(`/file/${encodeURIComponent(id)}`, { signal }, limits.read, async (response) => {
      const result = await response.blob();
      const name = attachmentDownloadName(response.headers.get("Content-Disposition"));
      if (name) Object.defineProperty(result, "attachmentName", { value: name });
      return result;
    });
  }
  async function remove(ref) {
    const id = attachmentId(ref);
    if (!id) return;
    return request(`/file/${encodeURIComponent(id)}`, { method: "DELETE" }, limits.remove);
  }
  return { upload, bind, blob, remove };
}
