"use strict";

// Pure migration planning. Never guesses a class from the uploader's current
// memberships: the actual referencing Firestore document is the authority.
const { createHash } = require("node:crypto");
const { parentPath, MAX_PARENTS = 200 } = require("./attachments/service");
function supportedParent(path) {
  try { parentPath(path); return true; } catch { return false; }
}
const LEGACY_URL = /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/\s"'<>]+\/o\/[^\s"'<>)]*/g;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const isPlain = (value) => value && typeof value === "object" &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function legacyPath(url, bucket) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "firebasestorage.googleapis.com" ||
      parsed.username || parsed.password || parsed.port) return null;
    const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!match || decodeURIComponent(match[1]) !== bucket) return null;
    const path = decodeURIComponent(match[2]);
    return /^uploads\/[^/]+\/[^/]+$/.test(path) && !/[\x00-\x20\\]/.test(path) &&
      !path.split("/").some((part) => part === "." || part === "..") ? path : null;
  } catch { return null; }
}

function mapStrings(value, transform, field = "") {
  if (typeof value === "string") return transform(value, field);
  if (Array.isArray(value)) return value.map((item, i) => mapStrings(item, transform, `${field}/${i}`));
  if (!isPlain(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    mapStrings(item, transform, `${field}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`)]));
}

function referencesIn(data, bucket) {
  const found = [];
  mapStrings(data, (text, field) => {
    for (const match of text.matchAll(LEGACY_URL)) {
      const path = legacyPath(match[0], bucket);
      if (path) found.push({ path, field, urlHash: hash(match[0]) });
    }
    return text;
  });
  return found;
}

function rewriteReferences(data, bucket, replacements) {
  return mapStrings(data, (text) => text.replace(LEGACY_URL, (url) => {
    const path = legacyPath(url, bucket);
    return path && replacements.has(path) ? replacements.get(path) : url;
  }));
}

function buildManifest({ projectId, bucket, documents, objects, now = new Date().toISOString(), iam = null }) {
  if (!projectId || !bucket) throw new Error("Explicit projectId and bucket are required");
  const reverse = new Map();
  const docs = [];
  for (const document of documents) {
    const refs = document.references ?? referencesIn(document.data, bucket);
    if (!refs.length) continue;
    docs.push({ path: document.path, updateTime: document.updateTime ?? null, references: refs });
    for (const reference of refs) {
      if (!reverse.has(reference.path)) reverse.set(reference.path, new Set());
      reverse.get(reference.path).add(document.path);
    }
  }
  const byPath = new Map(objects.map((object) => [object.path ?? object.name, object]));
  const paths = new Set([...reverse.keys(), ...byPath.keys()]);
  const files = [...paths].sort().map((path) => {
    const object = byPath.get(path);
    const parents = [...(reverse.get(path) ?? [])].sort();
    const ownerUid = /^uploads\/([^/]+)\/[^/]+$/.exec(path)?.[1] ?? null;
    const id = hash(`${bucket}/${path}`).slice(0, 32);
    const invalidParents = parents.filter((path) => !supportedParent(path));
    const status = !object ? "missing" : !ownerUid || invalidParents.length || parents.length > MAX_PARENTS
      ? "review" : !parents.length ? "unreferenced" : "ready";
    return {
      legacyPath: path, ownerUid, parents, status, id,
      ...(invalidParents.length ? { invalidParents } : {}),
      objectPath: ownerUid ? `protected/${ownerUid}/${id}` : null,
      ref: `attachment:${id}`,
      sourceGeneration: object?.generation ?? null,
      size: object?.size == null ? null : Number(object.size),
      crc32c: object?.crc32c ?? null,
      contentType: object?.contentType ?? "application/octet-stream",
      name: path.split("/").at(-1),
      hasDownloadTokens: !!object?.metadata?.firebaseStorageDownloadTokens,
      publicAcl: (object?.acl ?? []).filter((entry) => ["allUsers", "allAuthenticatedUsers"].includes(entry.entity))
        .map((entry) => ({ entity: entry.entity, role: entry.role })),
    };
  });
  const statuses = Object.fromEntries(["ready", "missing", "review", "unreferenced"].map((status) =>
    [status, files.filter((file) => file.status === status).length]));
  return { version: 1, phase: "inventory", projectId, bucket, createdAt: now,
    documents: docs.sort((a, b) => a.path.localeCompare(b.path)), files,
    iam, summary: { documents: docs.length, files: files.length, ...statuses },
    limitations: ["Rules cannot invalidate Firebase download-token URLs.",
      "Unreferenced/review/missing files are never assigned to a guessed class.",
      "Actual anonymous old-URL and authorized gateway tests are required after revocation."] };
}

function assertManifest(manifest) {
  if (manifest?.version !== 1 || !manifest.projectId || !manifest.bucket || !Array.isArray(manifest.files)) {
    throw new Error("Unsupported migration manifest");
  }
  for (const file of manifest.files) {
    const expected = hash(`${manifest.bucket}/${file.legacyPath}`).slice(0, 32);
    const owner = /^uploads\/([^/]+)\/[^/]+$/.exec(file.legacyPath)?.[1];
    if (file.id !== expected || file.ref !== `attachment:${expected}` ||
      (owner && file.objectPath !== `protected/${owner}/${expected}`)) throw new Error("Manifest path/ref mismatch");
  }
  return manifest;
}

function preservedFiles(manifest, enabled) {
  if (!enabled) return [];
  const files = manifest.files.filter((file) => file.status !== "ready");
  if (!files.length || files.some((file) => !["missing", "unreferenced"].includes(file.status))) {
    throw new Error("Preservation requires explicitly inventoried missing/unreferenced files; review items cannot be excluded");
  }
  return files;
}

function selectedLegacyReferences(documents, manifest, preserved) {
  const paths = new Set(preserved.map((file) => file.legacyPath));
  const known = new Set(manifest.documents.flatMap((doc) => doc.references
    .filter((ref) => paths.has(ref.path)).map((ref) => JSON.stringify([doc.path, ref.path, ref.field, ref.urlHash]))));
  return documents.map((doc) => ({ ...doc, references: doc.references.filter((ref) =>
    !known.has(JSON.stringify([doc.path, ref.path, ref.field, ref.urlHash]))) })).filter((doc) => doc.references.length);
}

module.exports = { legacyPath, referencesIn, rewriteReferences, buildManifest, assertManifest, hash,
  preservedFiles, selectedLegacyReferences };
