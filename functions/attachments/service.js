"use strict";

// Attachment metadata is server-owned. A parent is a real stored document, not a
// class ID supplied by a browser. Its existing Firestore read rules remain the
// authority each time the bytes are requested.
const { randomUUID } = require("node:crypto");
const ID = /^[A-Za-z0-9_-]{16,128}$/;
const REF_PATTERN = /attachment:([A-Za-z0-9_-]{16,128})(?![A-Za-z0-9_-])/g;
const MAX_BIND_REFS = 100;
const MAX_PARENTS = 200;
const SMALL_TYPES = new Set(["application/octet-stream"]);
const DOCUMENT_TYPES = new Set([
  "application/pdf", "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const PARENT_PATTERNS = [
  /^(questions|notices|groupMemos|studentNotes|kwl|lessons|studyTemplates|broadcasts)\/[^/]+$/,
  /^questions\/[^/]+\/answers\/[^/]+$/,
  /^studyBoards\/[^/]+(?:\/cards\/[^/]+)?$/,
  /^bookActivities\/[^/]+(?:\/(entries|hashtagPosts|opinionNotes|hashtagComments|peerReviews)\/[^/]+)?$/,
  /^bookActivities\/[^/]+\/groups\/[^/]+\/(bwNotes|xwHints|words)\/[^/]+$/,
  /^classes\/[^/]+\/(cornellNotes|chatMessages|lessonMemos|classNotices|signalMessages)\/[^/]+$/,
  /^classes\/[^/]+\/(popQuizzes|polls)\/[^/]+(?:\/(submissions|votes)\/[^/]+)?$/,
];

function problem(status, code, message) {
  const error = new Error(message);
  Object.assign(error, { status, code });
  return error;
}
function attachmentId(value) {
  const id = typeof value === "string" && value.startsWith("attachment:") ? value.slice(11) : value;
  if (typeof id !== "string" || !ID.test(id)) throw problem(400, "invalid-ref", "첨부파일 번호가 올바르지 않습니다.");
  return id;
}
function parentPath(value) {
  if (typeof value !== "string" || value.length > 1500 || /[\x00-\x20?#\\]/.test(value) ||
      value.split("/").some((part) => part === "." || part === "..") || !PARENT_PATTERNS.some((p) => p.test(value))) {
    throw problem(400, "invalid-parent", "첨부할 문서 경로가 올바르지 않습니다.");
  }
  return value;
}
function collectRefs(value) {
  const found = new Set();
  const seen = new Set();
  function walk(item) {
    if (typeof item === "string") {
      for (const match of item.matchAll(REF_PATTERN)) found.add(`attachment:${match[1]}`);
    } else if (item && typeof item === "object" && !seen.has(item)) {
      seen.add(item);
      for (const child of Object.values(item)) walk(child);
    }
  }
  walk(value);
  return found;
}
function validUpload(size, rawType) {
  const type = String(rawType || "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (!Number.isSafeInteger(size) || size <= 0) throw problem(400, "empty-file", "빈 파일은 올릴 수 없습니다.");
  const limit = type.startsWith("image/") ? 6 * 1024 * 1024
    : DOCUMENT_TYPES.has(type) ? 20 * 1024 * 1024
    : type.startsWith("text/") || SMALL_TYPES.has(type) ? 1024 * 1024 : 0;
  if (!limit) throw problem(415, "file-type", "지원하지 않는 파일 형식입니다.");
  if (size >= limit) throw problem(413, "file-size", "파일 크기가 허용 범위를 넘었습니다.");
  return type;
}
function cleanName(name) {
  return String(name || "attachment").replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(-180) || "attachment";
}
function objectPath(asset, id) {
  const expected = `protected/${asset.ownerUid}/${id}`;
  if (!asset.ownerUid || /[\/\x00-\x1f]/.test(asset.ownerUid) || asset.objectPath !== expected) {
    throw problem(404, "not-found", "첨부파일을 찾을 수 없습니다.");
  }
  return expected;
}
function byteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw problem(416, "invalid-range", "지원하지 않는 다운로드 범위입니다.");
  const first = match[1] === "" ? null : Number(match[1]);
  const last = match[2] === "" ? null : Number(match[2]);
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) {
    throw problem(416, "invalid-range", "지원하지 않는 다운로드 범위입니다.");
  }
  const start = first === null ? Math.max(0, size - last) : first;
  const end = first === null || last === null ? size - 1 : Math.min(last, size - 1);
  if (start < 0 || start >= size || end < start || (first === null && last === 0)) {
    throw problem(416, "invalid-range", "지원하지 않는 다운로드 범위입니다.");
  }
  return { start, end };
}

function createAttachmentService(deps) {
  async function registered(identity) {
    if (!identity?.uid || /[\/\x00-\x1f]/.test(identity.uid) || !identity.token) {
      throw problem(401, "unauthenticated", "로그인이 필요합니다.");
    }
    if (!(await deps.hasProfile(identity.uid))) throw problem(403, "unregistered", "가입 정보를 확인할 수 없습니다.");
  }
  async function findAsset(id) {
    const asset = await deps.getAsset(id);
    if (!asset || asset.deleted) throw problem(404, "not-found", "첨부파일을 찾을 수 없습니다.");
    objectPath(asset, id);
    return asset;
  }
  function readableParentReader(identity) {
    const cache = new Map();
    return (path) => {
      if (!cache.has(path)) {
        let valid;
        try { valid = parentPath(path); } catch { return Promise.resolve(null); }
        cache.set(path, deps.readParentAsUser(valid, identity.token));
      }
      return cache.get(path);
    };
  }
  async function hasReadableSource(asset, ref, readParent) {
    for (const path of Array.isArray(asset.parents) ? asset.parents : []) {
      const data = await readParent(path);
      if (data && collectRefs(data).has(ref)) return true;
    }
    return false;
  }
  return {
    async upload(identity, bytes, { name, contentType } = {}) {
      await registered(identity);
      if (!Buffer.isBuffer(bytes)) throw problem(400, "invalid-body", "파일 내용을 확인할 수 없습니다.");
      const type = validUpload(bytes.length, contentType);
      const id = (deps.newId || randomUUID)();
      attachmentId(id);
      const asset = {
        ownerUid: identity.uid, objectPath: `protected/${identity.uid}/${id}`, parents: [],
        name: cleanName(name), contentType: type, size: bytes.length, createdAt: deps.now ? deps.now() : new Date(),
      };
      // Use GCS/Admin upload, not Firebase upload endpoints which create a
      // reusable firebaseStorageDownloadTokens URL. No token metadata is copied.
      await deps.saveFile(asset.objectPath, bytes, { contentType: type, metadata: {} });
      try { await deps.createAsset(id, asset); }
      catch (error) { await deps.deleteFile(asset.objectPath).catch(() => {}); throw error; }
      return { ref: `attachment:${id}`, id, name: asset.name, size: asset.size, contentType: type };
    },
    async bind(identity, body) {
      await registered(identity);
      const path = parentPath(body?.parentPath);
      if (!Array.isArray(body?.refs) || body.refs.length > MAX_BIND_REFS) {
        throw problem(400, "invalid-refs", "첨부파일은 한 번에 100개까지 연결할 수 있습니다.");
      }
      const ids = [...new Set(body.refs.map(attachmentId))];
      const readParent = readableParentReader(identity);
      const target = await readParent(path);
      if (!target) throw problem(403, "parent-denied", "이 문서를 읽을 권한이 없습니다.");
      const actual = collectRefs(target);
      // Validate every binding first so an invalid batch does not partly publish.
      const staleRefs = [];
      const checked = await Promise.all(ids.map(async (id) => {
        const ref = `attachment:${id}`;
        if (!actual.has(ref)) { staleRefs.push(ref); return null; }
        const asset = await findAsset(id);
        const ownDraft = (asset.parents || []).length === 0 && asset.ownerUid === identity.uid;
        if (!ownDraft && !(await hasReadableSource(asset, ref, readParent))) {
          throw problem(403, "source-denied", "이 첨부파일을 연결할 권한이 없습니다.");
        }
        if ((asset.parents || []).length >= MAX_PARENTS && !asset.parents.includes(path)) {
          throw problem(409, "too-many-parents", "참조가 많은 첨부파일은 새 사본으로 올려 주세요.");
        }
        return id;
      }));
      const assets = checked.filter(Boolean);
      await deps.addParents(assets, path, MAX_PARENTS);
      return { bound: assets.length, parentPath: path, boundRefs: assets.map((id) => `attachment:${id}`), staleRefs };
    },
    async read(identity, rawId, rangeHeader) {
      await registered(identity);
      const id = attachmentId(rawId);
      const asset = await findAsset(id);
      const ref = `attachment:${id}`;
      const parents = Array.isArray(asset.parents) ? asset.parents : [];
      // An uploader's draft is private. Once attached, ownership must never
      // bypass the document ACL, including removal, class changes and DMs.
      const allowed = parents.length === 0 ? asset.ownerUid === identity.uid
        : await hasReadableSource(asset, ref, readableParentReader(identity));
      if (!allowed && parents.length === 0) throw problem(409, "attachment-binding-pending", "첨부파일을 문서에 연결하고 있습니다.");
      if (!allowed) throw problem(403, "attachment-denied", "이 첨부파일을 읽을 권한이 없습니다.");
      let range;
      try { range = byteRange(rangeHeader, asset.size); }
      catch (error) { if (error.status === 416) error.fileSize = asset.size; throw error; }
      return { id, asset, range, path: objectPath(asset, id) };
    },
    async remove(identity, rawId) {
      await registered(identity);
      const id = attachmentId(rawId);
      const asset = await findAsset(id);
      if (asset.ownerUid !== identity.uid) throw problem(403, "delete-denied", "첨부파일을 지울 권한이 없습니다.");
      // Lock the latest registry version before checking live parents. Binding
      // transactions reject this lock, preventing a new reference from being
      // registered between the garbage-collection check and object deletion.
      const locked = await deps.beginDelete(id, identity.uid);
      try {
        // Admin reads here are only for retaining referenced files, never for
        // granting a reader access to another person's private document.
        for (const path of Array.isArray(locked.parents) ? locked.parents : []) {
          const data = await deps.readParentForCleanup(path);
          if (data && collectRefs(data).has(`attachment:${id}`)) {
            await deps.abortDelete(id);
            return { deleted: false, inUse: true };
          }
        }
        await deps.deleteFile(objectPath(locked, id));
        await deps.markDeleted(id);
        return { deleted: true };
      } catch (error) {
        await deps.abortDelete(id).catch(() => {});
        throw error;
      }
    },
  };
}

module.exports = { createAttachmentService, collectRefs, parentPath, attachmentId, validUpload, byteRange, cleanName, problem, MAX_BIND_REFS, MAX_PARENTS };
