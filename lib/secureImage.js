"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase";
import { fetchAttachmentBlob } from "./attachments";
import { isAttachmentRef } from "./attachmentRefs";
import { createSecureImageCache, isPassthroughSrc } from "./secureImageCache";

let cache = null;
const currentUid = () => auth?.currentUser?.uid ?? null;

export function getSecureImageCache() {
  if (cache) return cache;
  cache = createSecureImageCache({
    fetchBlob: fetchAttachmentBlob,
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    sessionKey: currentUid,
  });
  if (typeof window !== "undefined" && isFirebaseConfigured && auth) {
    let previousUid = currentUid();
    onAuthStateChanged(auth, (user) => {
      const uid = user?.uid ?? null;
      if (uid !== previousUid) {
        previousUid = uid;
        cache.clear();
      }
    });
    // 실패한 요청은 캐시하지 않습니다. 연결이 복구되면 현재 화면이
    // 다시 시도합니다. 반·화면·대화방 전환도 캐시를 비우며 새 요청은 서버에서 권한을 확인합니다.
    window.addEventListener("online", () => cache.clear());
    window.addEventListener("class-change", () => cache.clear());
    window.addEventListener("attachment-scope-change", () => cache.clear());
    window.addEventListener("attachments-bound", (event) => cache.notify(event.detail?.refs ?? []));
  }
  return cache;
}

export function clearSecureImageCache() {
  cache?.clear();
}

function useCacheGeneration(src) {
  const [generation, setGeneration] = useState(0);
  useEffect(() => getSecureImageCache().subscribe((event) => {
    if (event?.type === "retry" && src && !event.refs?.includes(src)) return;
    setGeneration((value) => value + 1);
  }), [src]);
  return generation;
}

export function useSecureImage(src) {
  const generation = useCacheGeneration(src);
  const uid = currentUid();
  const retry = () => getSecureImageCache().notify([src]);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!src) return undefined;
    const c = getSecureImageCache();
    let alive = true;
    const pending = c.acquire(src);
    pending.then((next) => {
      if (alive && currentUid() === uid) setResult({ ...next, src, uid, generation });
    });
    return () => { alive = false; pending.release(); };
  }, [src, uid, generation]);
  if (!src) return { status: "idle", url: null, reason: null, retry };
  if (isPassthroughSrc(src)) return { status: "ready", url: src.trim(), reason: null, retry };
  // 이벤트 효과가 실행되기 전의 render에서도 다른 사용자/파일의 Blob을
  // 내보내지 않습니다. 로그아웃 이벤트는 URL 자체도 즉시 revoke합니다.
  if (!result || result.src !== src || result.uid !== uid || result.generation !== generation) {
    return { status: "loading", url: null, reason: null, retry };
  }
  return { status: result.status, url: result.url ?? null, reason: result.reason ?? null, retry };
}

export async function acquireSecureImage(src) {
  if (isAttachmentRef(src) && auth) await auth.authStateReady();
  const c = getSecureImageCache();
  const pending = c.acquire(src);
  const result = await pending;
  if (result.status !== "ready") {
    pending.release();
    throw Object.assign(new Error(result.reason === "denied"
      ? "이 첨부파일을 볼 수 있는 권한이 없습니다."
      : "첨부파일을 불러오지 못했습니다."), { code: `attachment/${result.reason}` });
  }
  let released = false;
  return { url: result.url, type: result.type, name: result.name, release: () => { if (!released) { released = true; pending.release(); } } };
}

const requests = new WeakMap();

export function hydrateSecureImages(root, held) {
  if (!root?.querySelectorAll) return;
  const c = getSecureImageCache();
  // 편집기에서 붙여넣을 때마다 호출되어도 기존 그림의 lease를 중복하지 않습니다.
  for (let index = held.length - 1; index >= 0; index--) {
    const item = held[index];
    if (typeof item !== "string" && root.contains && !root.contains(item.img)) {
      item.release?.();
      if (requests.get(item.img) === item.request) requests.delete(item.img);
      held.splice(index, 1);
    }
  }
  root.querySelectorAll('img[src^="attachment:"], img[data-attachment-ref]').forEach((img) => {
    const src = img.getAttribute("data-attachment-ref") || img.getAttribute("src");
    if (held.some((item) => item.img === img && item.src === src && requests.get(img) === item.request)) return;
    for (let index = held.length - 1; index >= 0; index--) {
      const previous = held[index];
      if (previous.img === img) { previous.release?.(); held.splice(index, 1); }
    }
    if (!isAttachmentRef(src)) {
      img.removeAttribute("src");
      img.setAttribute("data-secure-image-error", "invalid");
      return;
    }
    const request = {};
    requests.set(img, request);
    img.setAttribute("data-attachment-ref", src);
    img.removeAttribute("src");
    img.setAttribute("aria-busy", "true");
    const pending = c.acquire(src);
    held.push({ src, img, request, release: pending.release });
    pending.then((result) => {
      if (requests.get(img) !== request) return;
      img.removeAttribute("aria-busy");
      if (result.status === "ready") {
        img.removeAttribute("data-secure-image-error");
        img.setAttribute("src", result.url);
      } else {
        img.setAttribute("data-secure-image-error", result.reason || "error");
        img.setAttribute("alt", result.reason === "denied" ? "볼 수 있는 권한이 없는 그림이에요" : "그림을 불러오지 못했어요");
      }
    });
  });
}

export function releaseSecureImages(held) {
  for (const item of held.splice(0)) {
    if (typeof item === "string") { cache?.release(item); continue; }
    if (requests.get(item.img) === item.request) requests.delete(item.img);
    if (item.release) item.release();
    else cache?.release(item.src);
  }
}

export function serializeSecureHtml(root) {
  if (!root) return "";
  if (!root.querySelector?.("img[data-attachment-ref]")) return root.innerHTML;
  const copy = root.cloneNode(true);
  copy.querySelectorAll("img[data-attachment-ref]").forEach((img) => {
    const ref = img.getAttribute("data-attachment-ref");
    if (isAttachmentRef(ref)) img.setAttribute("src", ref);
    else img.removeAttribute("src");
    img.removeAttribute("data-attachment-ref");
    img.removeAttribute("aria-busy");
    img.removeAttribute("data-secure-image-error");
  });
  return copy.innerHTML;
}

export function useSecureHtml(containerRef, html) {
  useEffect(() => {
    const held = [];
    const c = getSecureImageCache();
    hydrateSecureImages(containerRef.current, held);
    const unsubscribe = c.subscribe((event) => {
      const root = containerRef.current;
      if (!root?.querySelectorAll) return;
      if (event?.type === "clear") {
        root.querySelectorAll("img[data-attachment-ref]").forEach((img) => img.removeAttribute("src"));
        releaseSecureImages(held);
        hydrateSecureImages(root, held);
      } else if (event?.type === "retry") {
        // 같은 HTML의 다른 그림이 아직 내려오는 중이면 그대로 둡니다.
        // 연결 성공/수동 재시도 대상 중 실패한 그림만 새 lease를 만듭니다.
        for (let index = held.length - 1; index >= 0; index--) {
          const item = held[index];
          if (!event.refs?.includes(item.src) || !item.img?.getAttribute("data-secure-image-error")) continue;
          item.release?.();
          if (requests.get(item.img) === item.request) requests.delete(item.img);
          held.splice(index, 1);
        }
        hydrateSecureImages(root, held);
      }
    });
    return () => { unsubscribe(); releaseSecureImages(held); };
  }, [containerRef, html]);
}
