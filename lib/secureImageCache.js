import { isAttachmentRef } from "./attachmentRefs";

export const MAX_ENTRIES = 40;
export const MAX_BYTES = 30 * 1024 * 1024;
const PASSTHROUGH = /^(https?:\/\/|data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml);|blob:|\/(?!\/)|\.\.?\/)/i;

export function isPassthroughSrc(src) {
  return typeof src === "string" && PASSTHROUGH.test(src.trim());
}

export function errorReason(error) {
  if (error?.name === "AbortError" || error?.code === "attachment/session-changed") return "cancelled";
  if (error?.status === 401 || error?.status === 403) return "denied";
  if (error?.status === 404) return "missing";
  if (error?.code === "attachment/unconfigured") return "unavailable";
  return "error";
}

// 한 사용자 세션 안에서만 쓰는 Blob 캐시. URL은 화면이 사용하는 동안만
// 고정하고, 비활성 항목은 LRU·용량·수명 제한으로 정리합니다. 권한 결과를
// 브라우저 영구 저장소에 기록하지 않으며 실패도 캐시하지 않습니다.
export function createSecureImageCache({ fetchBlob, createObjectURL, revokeObjectURL,
  sessionKey = () => "session", maxEntries = MAX_ENTRIES, maxBytes = MAX_BYTES,
  maxAge = 60_000, maxConcurrent = 6, now = () => Date.now() } = {}) {
  const entries = new Map();
  const listeners = new Set();
  const queue = [];
  let active = 0;
  let bytes = 0;
  let generation = 0;
  let session = sessionKey();

  function pump() {
    while (active < maxConcurrent && queue.length) {
      const job = queue.shift();
      if (job.signal.aborted) { job.reject(Object.assign(new Error("cancelled"), { name: "AbortError" })); continue; }
      active++;
      Promise.resolve().then(job.work).then(job.resolve, job.reject).finally(() => { active--; pump(); });
    }
  }
  function schedule(work, signal) {
    return new Promise((resolve, reject) => { queue.push({ work, signal, resolve, reject }); pump(); });
  }
  function drop(key, entry) {
    if (entries.get(key) !== entry) return;
    entries.delete(key);
    entry.controller.abort();
    if (entry.ready) {
      bytes -= entry.size;
      revokeObjectURL(entry.url);
    }
  }
  function evict() {
    for (const [key, entry] of entries) {
      if (entry.refs > 0 || !entry.ready) continue;
      if (entries.size > maxEntries || bytes > maxBytes || now() - entry.createdAt >= maxAge) drop(key, entry);
    }
  }
  function clear() {
    generation++;
    for (const [key, entry] of [...entries]) drop(key, entry);
    bytes = 0;
    session = sessionKey();
    for (const listener of listeners) listener({ type: "clear" });
  }
  function synchronizeSession() {
    if (sessionKey() !== session) clear();
  }
  function load(src) {
    const gen = generation;
    const controller = new AbortController();
    const entry = { controller, refs: 0, size: 0, url: null, ready: false, createdAt: now(), promise: null };
    entries.set(src, entry);
    entry.promise = schedule(() => fetchBlob(src, { signal: controller.signal }), controller.signal).then((blob) => {
      if (generation !== gen || sessionKey() !== session || entries.get(src) !== entry || controller.signal.aborted) {
        return { status: "error", reason: "cancelled" };
      }
      entry.url = createObjectURL(blob);
      entry.size = blob.size || 0;
      entry.ready = true;
      entry.createdAt = now();
      bytes += entry.size;
      evict();
      return { status: "ready", url: entry.url, type: blob.type || "application/octet-stream", name: blob.attachmentName || "" };
    }, (error) => {
      if (entries.get(src) === entry) entries.delete(src);
      return { status: "error", reason: errorReason(error) };
    });
    return entry;
  }
  function acquire(src) {
    synchronizeSession();
    if (isPassthroughSrc(src)) return Object.assign(Promise.resolve({ status: "ready", url: src.trim() }), { release() {} });
    if (!isAttachmentRef(src)) return Object.assign(Promise.resolve({ status: "error", reason: "invalid" }), { release() {} });
    evict();
    let entry = entries.get(src);
    if (!entry) entry = load(src);
    else { entries.delete(src); entries.set(src, entry); }
    entry.refs++;
    return Object.assign(entry.promise.then((result) => result), { release: () => releaseEntry(src, entry) });
  }
  function releaseEntry(src, entry) {
    if (!entry || entries.get(src) !== entry || entry.refs === 0) return;
    entry.refs--;
    if (entry.refs === 0 && !entry.ready) drop(src, entry);
    evict();
  }
  function release(src) { releaseEntry(src, entries.get(src)); }
  function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  function notify(refs) {
    for (const listener of listeners) listener({ type: "retry", refs });
  }
  return { acquire, release, clear, subscribe, notify, stats: () => ({ entries: entries.size, bytes, active }) };
}
