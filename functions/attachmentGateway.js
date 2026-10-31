"use strict";

const { pipeline } = require("node:stream/promises");
const { createAttachmentService, problem } = require("./attachments/service");

const DEFAULT_ORIGINS = [
  "https://class-peer-qna.vercel.app", "https://class-peer-qna.web.app",
  "https://class-peer-qna.firebaseapp.com",
];
function allowedOrigin(origin, { origins = DEFAULT_ORIGINS, emulator = false } = {}) {
  if (!origin) return true; // Non-browser callers still need a verified ID token.
  if (origins.includes(origin)) return true;
  if (emulator && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

function makeFirebaseDependencies({ admin, db, bucket, fetchImpl = fetch, projectId }) {
  const registry = db.collection("_attachments");
  const project = projectId || process.env.GCLOUD_PROJECT || admin.app().options.projectId;
  if (!project) throw new Error("Attachment gateway requires a Firebase project ID");
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  const base = emulator ? `http://${emulator}/v1` : "https://firestore.googleapis.com/v1";
  return {
    async hasProfile(uid) { return (await db.doc(`users/${uid}`).get()).exists; },
    async getAsset(id) { const doc = await registry.doc(id).get(); return doc.exists ? doc.data() : null; },
    async createAsset(id, asset) { await registry.doc(id).create(asset); },
    async readParentAsUser(path, token, appCheckToken) {
      // Admin SDK reads bypass Firestore rules. This request deliberately uses
      // the caller's Firebase ID token so the same deployed rules used by the
      // app authorize the parent, including group/private/archived exceptions.
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      let response;
      try {
        response = await fetchImpl(`${base}/projects/${encodeURIComponent(project)}/databases/(default)/documents/${encodedPath}`, {
          headers: { Authorization: `Bearer ${token}`,
            ...(appCheckToken ? { "X-Firebase-AppCheck": appCheckToken } : {}) }, signal: AbortSignal.timeout(10000),
        });
      } catch {
        throw problem(503, "permission-unavailable", "첨부파일 권한을 확인하지 못했습니다. 잠시 뒤 다시 해 주세요.");
      }
      if (response.status === 403 || response.status === 404) return null;
      if (response.status === 401) throw problem(401, "unauthenticated", "로그인 상태를 다시 확인해 주세요.");
      if (!response.ok) throw problem(503, "permission-unavailable", "첨부파일 권한을 확인하지 못했습니다.");
      return response.json();
    },
    async readParentForCleanup(path) { const doc = await db.doc(path).get(); return doc.exists ? doc.data() : null; },
    async addParents(ids, path, maximum) {
      if (!ids.length) return;
      await db.runTransaction(async (tx) => {
        const refs = ids.map((id) => registry.doc(id));
        const snapshots = await tx.getAll(...refs);
        for (let i = 0; i < snapshots.length; i += 1) {
          const asset = snapshots[i].data();
          if (!asset || asset.deleted || asset.deleting) throw problem(409, "attachment-changed", "첨부파일 상태가 바뀌었습니다. 다시 확인해 주세요.");
          const parents = [...new Set([...(asset.parents || []), path])];
          if (parents.length > maximum) throw problem(409, "too-many-parents", "참조가 많은 첨부파일은 새 사본으로 올려 주세요.");
          tx.update(refs[i], { parents });
        }
      });
    },
    async saveFile(path, bytes, metadata) {
      await bucket.file(path).save(bytes, {
        resumable: false, validation: "crc32c", preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: metadata.contentType, cacheControl: "private, no-store", metadata: {} },
      });
    },
    async deleteFile(path) { await bucket.file(path).delete({ ignoreNotFound: true }); },
    async beginDelete(id, ownerUid) {
      return db.runTransaction(async (tx) => {
        const ref = registry.doc(id);
        const snap = await tx.get(ref);
        const asset = snap.data();
        if (!asset || asset.deleted) throw problem(404, "not-found", "첨부파일을 찾을 수 없습니다.");
        if (asset.ownerUid !== ownerUid) throw problem(403, "delete-denied", "첨부파일을 지울 권한이 없습니다.");
        if (asset.deleting) throw problem(409, "attachment-busy", "첨부파일을 정리하고 있습니다. 잠시 뒤 다시 해 주세요.");
        tx.update(ref, { deleting: true });
        return asset;
      });
    },
    async abortDelete(id) { await registry.doc(id).update({ deleting: false }); },
    async markDeleted(id) { await registry.doc(id).update({ deleted: true, deleting: false, deletedAt: new Date() }); },
  };
}

function createHttpHandler({ service, verifyIdToken, verifyAppCheck, fileStream, origins, emulator = false, requireAppCheck = false, log = () => {} }) {
  return async function attachmentGateway(req, res) {
    const origin = req.get?.("origin") || req.headers.origin;
    res.set("Vary", "Origin");
    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    if (!allowedOrigin(origin, { origins, emulator })) return res.status(403).json({ error: { code: "origin-denied", message: "허용되지 않은 요청 출처입니다." } });
    if (origin) res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Expose-Headers", "Content-Length, Content-Type, Content-Disposition, Content-Range, Accept-Ranges");
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "GET, HEAD, POST, DELETE, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Range, X-Firebase-AppCheck");
      res.set("Access-Control-Max-Age", "3600");
      return res.status(204).end();
    }
    try {
      const authorization = req.get?.("authorization") || req.headers.authorization || "";
      const match = /^Bearer (\S+)$/i.exec(authorization);
      if (!match) throw problem(401, "unauthenticated", "로그인이 필요합니다.");
      let decoded;
      try { decoded = await verifyIdToken(match[1]); }
      catch { throw problem(401, "unauthenticated", "로그인 상태를 다시 확인해 주세요."); }
      const appCheckToken = req.get?.("X-Firebase-AppCheck") || req.headers["x-firebase-appcheck"];
      if (requireAppCheck) {
        const token = appCheckToken;
        try { if (!token || !verifyAppCheck) throw new Error(); await verifyAppCheck(token); }
        catch { throw problem(401, "app-check-required", "앱 인증을 확인하지 못했습니다."); }
      }
      const identity = { uid: decoded.uid || decoded.sub, token: match[1], appCheckToken };
      const path = (req.path || new URL(req.url, "https://attachment.invalid").pathname).replace(/\/+$/, "") || "/";
      if (req.method === "POST" && path === "/upload") {
        const bytes = req.rawBody;
        const result = await service.upload(identity, bytes, {
          name: req.query?.name, contentType: req.get?.("content-type") || req.headers["content-type"],
        });
        return res.status(201).json(result);
      }
      if (req.method === "POST" && path === "/bind") return res.json(await service.bind(identity, req.body));
      const file = /^\/file\/([A-Za-z0-9_-]{16,128})$/.exec(path);
      if (file && req.method === "DELETE") return res.json(await service.remove(identity, file[1]));
      if (file && (req.method === "GET" || req.method === "HEAD")) {
        const result = await service.read(identity, file[1], req.get?.("range") || req.headers.range);
        const { asset, range } = result;
        const inline = /^image\/(jpeg|png|gif|webp|avif|bmp)$/i.test(asset.contentType);
        const ascii = asset.name.replace(/[^\x20-\x7e]|["\\]/g, "_");
        const encodedName = encodeURIComponent(asset.name).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
        res.set("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodedName}`);
        res.set("Content-Type", asset.contentType);
        res.set("Content-Security-Policy", "default-src 'none'; sandbox");
        res.set("Accept-Ranges", "bytes");
        res.set("Content-Length", String(range ? range.end - range.start + 1 : asset.size));
        if (range) res.set("Content-Range", `bytes ${range.start}-${range.end}/${asset.size}`);
        res.status(range ? 206 : 200);
        if (req.method === "HEAD") return res.end();
        await pipeline(fileStream(result.path, range), res);
        return;
      }
      throw problem(404, "not-found", "첨부파일 요청을 찾을 수 없습니다.");
    } catch (error) {
      if (res.headersSent) { res.destroy?.(); return; }
      const status = error.status || (Number(error.code) === 404 ? 404 : 500);
      // Never log ID tokens, parent document content, or private file URLs.
      if (status >= 500) log("attachment-gateway-error", { code: String(error.code || "internal") });
      res.removeHeader?.("Content-Length");
      res.removeHeader?.("Content-Disposition");
      if (status === 416 && Number.isSafeInteger(error.fileSize)) res.set("Content-Range", `bytes */${error.fileSize}`);
      return res.status(status).json({ error: { code: error.status ? error.code : "unavailable", message: error.status ? error.message : "첨부파일을 처리하지 못했습니다. 잠시 뒤 다시 해 주세요." } });
    }
  };
}

function createFirebaseGateway(admin, db) {
  const bucket = admin.storage().bucket();
  const service = createAttachmentService(makeFirebaseDependencies({ admin, db, bucket }));
  const origins = [...new Set([...DEFAULT_ORIGINS, ...(process.env.ATTACHMENT_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)])];
  return createHttpHandler({
    service, origins, emulator: process.env.FUNCTIONS_EMULATOR === "true",
    requireAppCheck: process.env.ATTACHMENT_REQUIRE_APP_CHECK === "true",
    verifyIdToken: (token) => admin.auth().verifyIdToken(token, true),
    verifyAppCheck: (token) => admin.appCheck().verifyToken(token),
    fileStream: (path, range) => bucket.file(path).createReadStream(range || {}),
    log: (message, details) => console.error(message, details),
  });
}

module.exports = { createFirebaseGateway, createHttpHandler, makeFirebaseDependencies, allowedOrigin, DEFAULT_ORIGINS };
