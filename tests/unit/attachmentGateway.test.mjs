import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable, Writable } from "node:stream";
const require = createRequire(import.meta.url);
const { createAttachmentService, collectRefs, validUpload, byteRange, parentPath } = require("../../functions/attachments/service.js");
const { createHttpHandler, makeFirebaseDependencies, allowedOrigin } = require("../../functions/attachmentGateway.js");

const ID = "asset_1234567890123456";
const REF = `attachment:${ID}`;
const alice = { uid: "alice", token: "alice-token" };
const bob = { uid: "bob", token: "bob-token" };
const teacher = { uid: "teacher", token: "teacher-token" };
function fixture() {
  const assets = new Map();
  const documents = new Map();
  const readable = new Map();
  const files = new Map();
  const requests = [];
  const profiles = new Set(["alice", "bob", "teacher"]);
  const deps = {
    hasProfile: async (uid) => profiles.has(uid),
    newId: () => ID,
    getAsset: async (id) => assets.get(id),
    createAsset: async (id, data) => assets.set(id, data),
    readParentAsUser: async (path, token) => {
      requests.push({ path, token });
      return readable.get(path)?.has(token) ? documents.get(path) : null;
    },
    readParentForCleanup: async (path) => documents.get(path),
    addParents: async (ids, path, maximum) => {
      for (const id of ids) {
        const asset = assets.get(id);
        if (asset.deleting) throw Object.assign(new Error("busy"), { status: 409 });
        asset.parents = [...new Set([...asset.parents, path])];
        assert(asset.parents.length <= maximum);
      }
    },
    beginDelete: async (id, uid) => {
      const asset = assets.get(id);
      assert.equal(asset.ownerUid, uid);
      if (asset.deleting) throw Object.assign(new Error("busy"), { status: 409 });
      asset.deleting = true;
      return asset;
    },
    abortDelete: async (id) => { assets.get(id).deleting = false; },
    saveFile: async (path, bytes, metadata) => files.set(path, { bytes, metadata }),
    deleteFile: async (path) => files.delete(path),
    markDeleted: async (id) => Object.assign(assets.get(id), { deleted: true, deleting: false }),
  };
  const service = createAttachmentService(deps);
  const publish = (path, readers, data = { image: REF }) => {
    documents.set(path, data);
    readable.set(path, new Set(readers.map((x) => x.token)));
  };
  return { service, deps, assets, files, documents, readable, profiles, requests, publish };
}
const upload = (f) => f.service.upload(alice, Buffer.from("image bytes"), { name: "그림.png", contentType: "image/png" });
const denied = (promise, status, code) => assert.rejects(promise, (err) => err.status === status && (!code || err.code === code));

test("uploads are immutable server-owned drafts without reusable download tokens", async () => {
  const f = fixture();
  const result = await upload(f);
  assert.equal(result.ref, REF);
  assert(!JSON.stringify(result).includes("https:"));
  const asset = f.assets.get(ID);
  assert.equal(asset.objectPath, `protected/alice/${ID}`);
  assert.deepEqual(asset.parents, []);
  assert.deepEqual(f.files.get(asset.objectPath).metadata.metadata, {});
  assert(!JSON.stringify(asset).includes("firebaseStorageDownloadTokens"));
  assert.equal((await f.service.read(alice, ID)).id, ID);
  await denied(f.service.read(bob, ID), 409, "attachment-binding-pending");
});

test("raw Firebase accounts without an app profile and unauthenticated requests cannot access bytes", async () => {
  const f = fixture();
  await upload(f);
  await denied(f.service.read(null, ID), 401);
  await denied(f.service.upload({ uid: "stranger", token: "valid-id-token" }, Buffer.from("x"), { contentType: "image/png" }), 403, "unregistered");
  f.profiles.delete("alice");
  await denied(f.service.read(alice, ID), 403, "unregistered");
});

test("private parent ACL protects images from classmates and uploader cannot bypass revoked access", async () => {
  const f = fixture();
  await upload(f);
  const path = "bookActivities/map/entries/alice";
  f.publish(path, [alice, teacher]);
  await f.service.bind(alice, { parentPath: path, refs: [REF] });
  await f.service.read(teacher, ID);
  await denied(f.service.read(bob, ID), 403, "attachment-denied");
  f.readable.get(path).delete(alice.token);
  await denied(f.service.read(alice, ID), 403, "attachment-denied");
  const publicPath = "questions/public";
  f.publish(publicPath, [alice, bob]);
  await denied(f.service.bind(alice, { parentPath: publicPath, refs: [REF] }), 403, "source-denied");
});

test("question attachments follow the parent across classes, and removed references immediately stop access", async () => {
  const f = fixture();
  await upload(f);
  const path = "questions/shared";
  f.publish(path, [alice, bob, teacher]);
  await f.service.bind(alice, { parentPath: path, refs: [REF] });
  await f.service.read(bob, ID);
  f.documents.set(path, { image: null });
  await denied(f.service.read(alice, ID), 403);
  await denied(f.service.read(bob, ID), 403);
});

test("binding checks the stored target and refuses private-source rebinding by unrelated readers", async () => {
  const f = fixture();
  await upload(f);
  f.publish("classes/c1/chatMessages/private", [alice, teacher]);
  await f.service.bind(alice, { parentPath: "classes/c1/chatMessages/private", refs: [REF] });
  f.publish("questions/forged", [alice, bob]);
  await denied(f.service.bind(bob, { parentPath: "questions/forged", refs: [REF] }), 403, "source-denied");
  assert.deepEqual(f.assets.get(ID).parents, ["classes/c1/chatMessages/private"]);
  await denied(f.service.bind(bob, { parentPath: "classes/c1/chatMessages/private", refs: [REF] }), 403, "parent-denied");
});

test("queued bindings skip stale references without publishing them", async () => {
  const f = fixture();
  await upload(f);
  f.publish("questions/changed", [alice], { image: null });
  const result = await f.service.bind(alice, { parentPath: "questions/changed", refs: [REF] });
  assert.deepEqual(result.boundRefs, []);
  assert.deepEqual(result.staleRefs, [REF]);
  assert.deepEqual(f.assets.get(ID).parents, []);
});

test("reusable teaching assets accept multiple real parent references without stale ACL grants", async () => {
  const f = fixture();
  await upload(f);
  f.publish("lessons/library", [alice]);
  await f.service.bind(alice, { parentPath: "lessons/library", refs: [REF] });
  f.publish("broadcasts/class1", [alice, bob]);
  await f.service.bind(alice, { parentPath: "broadcasts/class1", refs: [REF] });
  await f.service.read(bob, ID);
  f.documents.delete("broadcasts/class1");
  await denied(f.service.read(bob, ID), 403);
  await f.service.read(alice, ID);
});

test("delete retains files referenced by private parents, even if the owner cannot read them", async () => {
  const f = fixture();
  await upload(f);
  f.publish("questions/saved", [alice]);
  await f.service.bind(alice, { parentPath: "questions/saved", refs: [REF] });
  f.readable.set("questions/saved", new Set());
  assert.deepEqual(await f.service.remove(alice, ID), { deleted: false, inUse: true });
  assert.equal(f.assets.get(ID).deleting, false);
  await denied(f.service.remove(bob, ID), 403, "delete-denied");
  f.documents.delete("questions/saved");
  assert.deepEqual(await f.service.remove(alice, ID), { deleted: true });
  assert.equal(f.files.size, 0);
  await denied(f.service.read(alice, ID), 404);
});

test("delete locks metadata against concurrent binds and releases the lock on storage failure", async () => {
  const f = fixture();
  await upload(f);
  let bindRejected = false;
  f.deps.deleteFile = async () => {
    f.publish("questions/new", [alice]);
    try { await f.service.bind(alice, { parentPath: "questions/new", refs: [REF] }); }
    catch (error) { bindRejected = error.status === 409; }
    throw new Error("storage unavailable");
  };
  await assert.rejects(f.service.remove(alice, ID), /storage unavailable/);
  assert.equal(bindRejected, true);
  assert.equal(f.assets.get(ID).deleting, false);
  assert.equal(f.assets.get(ID).deleted, undefined);
});

test("preserves upload limits and rejects malformed parent paths, refs and ranges", () => {
  assert.equal(validUpload(20 * 1024 * 1024 - 1, "application/pdf"), "application/pdf");
  assert.throws(() => validUpload(20 * 1024 * 1024, "application/pdf"), { status: 413 });
  assert.throws(() => validUpload(6 * 1024 * 1024, "image/png"), { status: 413 });
  assert.throws(() => validUpload(1024 * 1024, "text/plain"), { status: 413 });
  assert.throws(() => validUpload(1, "video/mp4"), { status: 415 });
  assert.throws(() => validUpload(0, "image/png"), { status: 400 });
  for (const path of ["_attachments/x", "users/alice", "questions/a/../b", "questions/a?x=y", "questions/a/answers"]) assert.throws(() => parentPath(path));
  assert.equal(parentPath("classes/c1/popQuizzes/q1/submissions/alice"), "classes/c1/popQuizzes/q1/submissions/alice");
  assert.deepEqual([...collectRefs({ html: `<img src="${REF}">`, nodes: [{ image: REF }], bad: `attachment:${"a".repeat(129)}` })], [REF]);
  assert.deepEqual(byteRange("bytes=2-5", 10), { start: 2, end: 5 });
  assert.deepEqual(byteRange("bytes=-3", 10), { start: 7, end: 9 });
  assert.deepEqual(byteRange("bytes=6-", 10), { start: 6, end: 9 });
  for (const range of ["bytes=10-", "bytes=5-2", "bytes=-0", "bytes=0-1,4-5", "bytes=9999999999999999999-"]) assert.throws(() => byteRange(range, 10), { status: 416 });
});

test("Firestore authorization uses the caller bearer token and handles outages without granting", async () => {
  let request;
  const db = { collection: () => ({}) };
  const deps = makeFirebaseDependencies({ admin: {}, db, bucket: {}, projectId: "project", fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ fields: { image: { stringValue: REF } } }) };
  } });
  assert(collectRefs(await deps.readParentAsUser("questions/q1", "caller-token")).has(REF));
  assert.equal(request.options.headers.Authorization, "Bearer caller-token");
  assert(request.url.includes("/projects/project/databases/(default)/documents/questions/q1"));
  const failed = makeFirebaseDependencies({ admin: {}, db, bucket: {}, projectId: "project", fetchImpl: async () => ({ status: 503, ok: false }) });
  await denied(failed.readParentAsUser("questions/q1", "token"), 503);
});

class Response extends Writable {
  constructor() { super(); this.headers = {}; this.statusCode = 200; this.chunks = []; }
  _write(chunk, _encoding, callback) { this.chunks.push(Buffer.from(chunk)); callback(); }
  set(key, value) { this.headers[key.toLowerCase()] = value; return this; }
  removeHeader(key) { delete this.headers[key.toLowerCase()]; }
  status(code) { this.statusCode = code; return this; }
  json(value) { this.jsonBody = value; this.end(JSON.stringify(value)); return this; }
}
const request = (method, path, headers = {}, extra = {}) => ({ method, path, headers, get(key) { return this.headers[key.toLowerCase()]; }, ...extra });

test("HTTP gateway streams authorized byte ranges and never redirects to a public URL", async () => {
  const f = fixture();
  await upload(f);
  const handler = createHttpHandler({ service: f.service, verifyIdToken: async () => ({ uid: "alice" }), fileStream: (_path, range) => Readable.from(Buffer.from("image bytes").subarray(range?.start || 0, range ? range.end + 1 : undefined)) });
  const response = new Response();
  await handler(request("GET", `/file/${ID}`, { authorization: "Bearer token", range: "bytes=2-5" }), response);
  assert.equal(response.statusCode, 206);
  assert.equal(Buffer.concat(response.chunks).toString(), "age ");
  assert.equal(response.headers["content-range"], "bytes 2-5/11");
  assert.equal(response.headers["cache-control"], "private, no-store");
  assert.equal(response.headers.location, undefined);
  const invalid = new Response();
  await handler(request("GET", `/file/${ID}`, { authorization: "Bearer token", range: "bytes=999-" }), invalid);
  assert.equal(invalid.statusCode, 416);
  assert.equal(invalid.headers["content-range"], "bytes */11");
});

test("HTTP preflight does not require login, but actual requests do; origins and App Check are validated", async () => {
  const handler = createHttpHandler({ service: {}, verifyIdToken: async () => ({ uid: "alice" }), requireAppCheck: true });
  const preflight = new Response();
  await handler(request("OPTIONS", "/upload", { origin: "https://class-peer-qna.vercel.app" }), preflight);
  assert.equal(preflight.statusCode, 204);
  const noAuth = new Response();
  await handler(request("GET", `/file/${ID}`), noAuth);
  assert.equal(noAuth.statusCode, 401);
  const noAppCheck = new Response();
  await handler(request("GET", `/file/${ID}`, { authorization: "Bearer token" }), noAppCheck);
  assert.equal(noAppCheck.jsonBody.error.code, "app-check-required");
  assert(allowedOrigin("http://localhost:3000", { emulator: true }));
  assert(!allowedOrigin("https://malicious.vercel.app"));
  assert(!allowedOrigin("http://localhost:3000"));
});
