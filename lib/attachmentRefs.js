// 저장 문서에는 URL 대신 이 식별자를 보관합니다. 이 값 자체는 권한이 아닙니다.
const ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const REF_RE = /^attachment:([A-Za-z0-9_-]{16,128})$/;

export function attachmentId(value) {
  return typeof value === "string" ? value.match(REF_RE)?.[1] ?? null : null;
}

export function isAttachmentRef(value) {
  return attachmentId(value) !== null;
}

export const isProtectedAttachmentRef = isAttachmentRef;

export function attachmentRef(id) {
  if (!ID_RE.test(id ?? "")) throw new Error("올바르지 않은 첨부 식별자입니다.");
  return `attachment:${id}`;
}

// HTML 본문과 중첩된 활동 자료까지 같은 규칙으로 모읍니다. 저장 전후의 JSON
// 값만 읽으며, Date·순환 참조가 섞인 편집 상태에서도 원본을 고치지 않습니다.
export function collectAttachmentRefs(value) {
  const refs = new Set();
  const seen = new WeakSet();
  function visit(next) {
    if (typeof next === "string") {
      for (const match of next.matchAll(/attachment:([A-Za-z0-9_-]{16,128})(?![A-Za-z0-9_-])/g)) {
        refs.add(`attachment:${match[1]}`);
      }
    } else if (next && typeof next === "object" && !seen.has(next)) {
      seen.add(next);
      for (const item of Object.values(next)) visit(item);
    }
  }
  visit(value);
  return [...refs];
}

// 이관 도구·호환 표시용 판별입니다. 외부 사이트 URL을 Storage 파일로
// 오인하지 않도록 버킷과 HTTPS 엔드포인트를 함께 검증합니다.
export function parseLegacyStorageUrl(value, bucket) {
  if (typeof value !== "string" || typeof bucket !== "string" || !bucket) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com" ||
        url.port || url.username || url.password) return null;
    const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/([^/]+)$/);
    if (!match || decodeURIComponent(match[1]) !== bucket) return null;
    const path = decodeURIComponent(match[2]);
    const parts = path.split("/");
    if (parts.length < 3 || parts[0] !== "uploads" ||
        parts.some((part) => !part || part === "." || part === ".." || /[\x00-\x1f\x7f]/.test(part))) return null;
    return { bucket, path };
  } catch {
    return null;
  }
}
