"use strict";
// Run only against disposable local Firebase emulators. This script never accepts
// a real project, even if production credentials exist in the shell.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { createRequire } = require("node:module");
const projectId = process.env.GCLOUD_PROJECT || "demo-attachment-pilot";
const hosts = ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"];
if (!projectId.startsWith("demo-") || hosts.some((key) => !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[key] || ""))) {
  throw new Error("Pilot requires a demo- project and loopback Auth, Firestore and Storage emulators.");
}
const req = createRequire(path.resolve(__dirname, "../../functions/package.json"));
const admin = req("firebase-admin");
const express = req("express");
const { createAttachmentService } = require("../../functions/attachments/service");
const { makeFirebaseDependencies, createHttpHandler } = require("../../functions/attachmentGateway");
const bucketName = `${projectId}.appspot.com`;
admin.initializeApp({ projectId, storageBucket: bucketName });
const db = admin.firestore(), bucket = admin.storage().bucket();
const service = createAttachmentService(makeFirebaseDependencies({ admin, db, bucket, projectId }));
const app = express();
app.use(express.json({ limit: "128kb" }));
app.use(express.raw({ type: () => true, limit: "21mb" }));
app.use((request, response, next) => { request.rawBody = request.body; next(); });
app.use(createHttpHandler({ service, emulator: true,
  verifyIdToken: (token) => admin.auth().verifyIdToken(token, true),
  fileStream: (file, range) => bucket.file(file).createReadStream(range || {}),
}));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN3cAAAAASUVORK5CYII=", "base64");
const image = Buffer.concat([PNG, Buffer.alloc(256 * 1024 - PNG.length)]);
const users = {}, results = [];
let server, baseUrl, baselineEnvironment;
async function createUser(key, role = "student", profile = true) {
  const email = `${key}-${Date.now()}@example.test`, password = "pilot-only-password";
  const authBase = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
  const signup = await fetch(`${authBase}/accounts:signUp?key=demo-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const signed = await signup.json();
  if (!signup.ok) throw new Error(JSON.stringify(signed));
  await admin.auth().setCustomUserClaims(signed.localId, role === "student" ? {} : { role });
  const login = await fetch(`${authBase}/accounts:signInWithPassword?key=demo-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const fresh = await login.json();
  users[key] = { uid: signed.localId, token: fresh.idToken };
  if (profile) await db.doc(`users/${signed.localId}`).set({ role, email, realName: key });
  return users[key];
}
async function call(actor, endpoint, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (actor) headers.Authorization = `Bearer ${users[actor].token}`;
  return fetch(`${baseUrl}${endpoint}`, { ...options, headers });
}
async function expectStatus(actor, endpoint, status, options) {
  const response = await call(actor, endpoint, options);
  assert.equal(response.status, status, `${actor || "logged-out"} ${endpoint}: ${response.status} expected ${status}`);
  await response.arrayBuffer();
}
async function upload() {
  const response = await call("owner", "/upload?name=pilot.png", { method: "POST", headers: { "Content-Type": "image/png" }, body: image });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}
async function bind(asset, parentPath, actor = "owner") {
  const response = await call(actor, "/bind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentPath, refs: [asset.ref] }) });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).bound, 1);
}
async function measure(label, fn, count = 20) {
  const values = [];
  for (let i = 0; i < count; i++) { const start = performance.now(); await fn(); values.push(performance.now() - start); }
  const sorted = [...values].sort((a, b) => a - b);
  const result = { label, samples: count, firstMs: +values[0].toFixed(2), p50Ms: +sorted[Math.floor(count * .5)].toFixed(2), p95Ms: +sorted[Math.min(count - 1, Math.floor(count * .95))].toFixed(2) };
  results.push(result); return result;
}
async function main() {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  await Promise.all([createUser("owner"), createUser("classmate"), createUser("otherClassmate"), createUser("outsider"), createUser("teacher", "teacher"), createUser("otherTeacher", "teacher"), createUser("unregistered", "student", false)]);
  await db.doc("classes/a").set({ createdBy: users.teacher.uid, archived: false });
  await db.doc("classes/b").set({ createdBy: users.otherTeacher.uid, archived: false });
  for (const key of ["owner", "classmate", "otherClassmate"]) await db.doc(`memberships/${users[key].uid}_a`).set({ uid: users[key].uid, classId: "a" });
  await db.doc(`memberships/${users.outsider.uid}_b`).set({ uid: users.outsider.uid, classId: "b" });
  await db.doc("bookActivities/individual").set({ classId: "a", type: "mindmap", createdBy: users.teacher.uid });
  const asset = await upload();
  await expectStatus("owner", `/file/${asset.id}`, 200);
  await expectStatus("classmate", `/file/${asset.id}`, 409);
  const parent = `bookActivities/individual/entries/${users.owner.uid}`;
  await db.doc(parent).set({ authorId: users.owner.uid, answers: { nodes: [{ id: "root", parentId: null, text: "개인 기록", image: asset.ref }] } });
  await bind(asset, parent);
  for (const actor of ["owner", "teacher"]) await expectStatus(actor, `/file/${asset.id}`, 200);
  for (const actor of ["classmate", "outsider", "otherTeacher", "unregistered"]) await expectStatus(actor, `/file/${asset.id}`, 403);
  await expectStatus(null, `/file/${asset.id}`, 401);
  // A guessed attachment identifier cannot be laundered through another user's public question.
  await db.doc("questions/forged").set({ authorId: users.outsider.uid, imageUrl: asset.ref });
  await expectStatus("outsider", "/bind", 403, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentPath: "questions/forged", refs: [asset.ref] }) });
  // Same-class membership alone is not permission to read a private group or DM.
  const grouped = await upload();
  await db.doc("studyBoards/private-group").set({ classId: "a", activityType: "group", viewMode: "private" });
  await db.doc("studyBoards/private-group/cards/group1").set({ authorId: users.owner.uid,
    memberUids: [users.owner.uid, users.classmate.uid], imageUrl: grouped.ref });
  await bind(grouped, "studyBoards/private-group/cards/group1");
  for (const actor of ["owner", "classmate", "teacher"]) await expectStatus(actor, `/file/${grouped.id}`, 200);
  for (const actor of ["otherClassmate", "outsider", "otherTeacher"]) await expectStatus(actor, `/file/${grouped.id}`, 403);
  const dm = await upload();
  await db.doc("classes/a/chatMessages/private-dm").set({ room: `dm_${users.owner.uid}`, html: `<img src="${dm.ref}">` });
  await bind(dm, "classes/a/chatMessages/private-dm");
  for (const actor of ["owner", "teacher"]) await expectStatus(actor, `/file/${dm.id}`, 200);
  for (const actor of ["classmate", "otherClassmate", "outsider", "otherTeacher"]) await expectStatus(actor, `/file/${dm.id}`, 403);
  // An explicitly published current broadcast grants the class access only while
  // that broadcast really contains the file; it does not publish the whole source.
  await db.doc("broadcasts/a").set({ classId: "a", imageUrl: asset.ref });
  await bind(asset, "broadcasts/a", "teacher");
  await expectStatus("classmate", `/file/${asset.id}`, 200);
  await expectStatus("outsider", `/file/${asset.id}`, 403);
  await db.doc("broadcasts/a").delete();
  await expectStatus("classmate", `/file/${asset.id}`, 403);
  // Question images preserve cross-class access, but require a real registered login.
  const question = await upload();
  await db.doc("questions/shared").set({ authorId: users.owner.uid, imageUrl: question.ref });
  await bind(question, "questions/shared");
  for (const actor of ["owner", "classmate", "outsider", "otherTeacher"]) await expectStatus(actor, `/file/${question.id}`, 200);
  await expectStatus(null, `/file/${question.id}`, 401);
  await expectStatus("unregistered", `/file/${question.id}`, 403);
  // The side channel is closed: no file metadata, no download tokens, no direct SDK read.
  const stored = (await db.doc(`_attachments/${asset.id}`).get()).data();
  const metadata = (await bucket.file(stored.objectPath).getMetadata())[0];
  assert(!metadata.metadata?.firebaseStorageDownloadTokens);
  const direct = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucketName}/o/${encodeURIComponent(stored.objectPath)}?alt=media`;
  for (const actor of [null, "owner", "classmate", "outsider"]) {
    const response = await fetch(direct, { headers: actor ? { Authorization: `Bearer ${users[actor].token}` } : {} });
    assert.equal(response.status, 403); await response.arrayBuffer();
  }
  // Changes to the real source document immediately affect subsequent gateway requests.
  await db.doc("questions/shared").update({ imageUrl: "" });
  await expectStatus("owner", `/file/${question.id}`, 403);
  await db.doc("questions/shared").update({ imageUrl: question.ref });
  const range = await call("owner", `/file/${asset.id}`, { headers: { Range: "bytes=0-63" } });
  assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 64);
  // Localhost-only comparison, not a prediction of production network/cold-start latency.
  const legacyPath = "uploads/pilot/benchmark.png", token = "local-test-only-token";
  await bucket.file(legacyPath).save(image, { metadata: { contentType: "image/png", metadata: { firebaseStorageDownloadTokens: token } } });
  const baseline = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucketName}/o/${encodeURIComponent(legacyPath)}?alt=media&token=${token}`;
  await measure("legacy_token_download_256KiB", async () => {
    const r = await fetch(baseline); assert.equal(r.status, 200); assert.equal((await r.arrayBuffer()).byteLength, image.length);
  });
  await measure("protected_download_256KiB", async () => {
    const r = await call("owner", `/file/${asset.id}`); assert.equal(r.status, 200); assert.equal((await r.arrayBuffer()).byteLength, image.length);
  });
  const testRequire = createRequire(path.resolve(__dirname, "../rules/package.json"));
  const { initializeTestEnvironment } = testRequire("@firebase/rules-unit-testing");
  const { ref, uploadBytes, getDownloadURL } = testRequire("firebase/storage");
  const [storageHost, storagePort] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(":");
  baselineEnvironment = await initializeTestEnvironment({ projectId: "demo-attachment-baseline", storage: {
    host: storageHost, port: Number(storagePort),
    rules: fs.readFileSync(path.resolve(__dirname, "../../storage.transition.rules"), "utf8"),
  } });
  const baselineStorage = baselineEnvironment.authenticatedContext("pilot-uploader", {
    email: "pilot-uploader@example.test", email_verified: true,
  }).storage();
  let sequence = 0;
  await measure("legacy_authenticated_upload_256KiB", async () => {
    const target = ref(baselineStorage, `uploads/pilot-uploader/pilot-${Date.now()}-${sequence++}.png`);
    const uploaded = await uploadBytes(target, image, { contentType: "image/png" });
    assert((await getDownloadURL(uploaded.ref)).startsWith("http://"));
  }, 10);
  await measure("protected_upload_256KiB", async () => { await upload(); }, 10);
  await bucket.file(legacyPath).setMetadata({ metadata: { firebaseStorageDownloadTokens: null } });
  // firebase-tools merges tokens in emulator metadata; unlike production,
  // GCS setMetadata(null) does not revoke its internal token list. Exercise its
  // explicit admin revoke endpoint rather than weakening the anonymous probe.
  const revoke = await fetch(`http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucketName}/o/${encodeURIComponent(legacyPath)}?delete_token=${encodeURIComponent(token)}`, {
    method: "POST", headers: { Authorization: "Bearer owner" },
  });
  assert.equal(revoke.status, 200); await revoke.arrayBuffer();
  const revoked = await fetch(baseline); assert.equal(revoked.status, 403, "old token URL must stop working after explicit revocation"); await revoked.arrayBuffer();
  console.log("PASS: draft privacy, exact individual/group/DM ACL, broadcast lifetime, cross-class question sharing, raw Auth denial, forged binding denial, token-free storage, direct bypass denial, parent change and Range streaming.");
  const report = { environment: "loopback Firebase Auth/Firestore/Storage emulators", productionRepresentative: false, revocationMethod: "emulator explicit admin revoke; production metadata removal requires live anonymous probe", imageBytes: image.length, measuredAt: new Date().toISOString(), results };
  console.log(JSON.stringify(report, null, 2));
  if (process.env.ATTACHMENT_PILOT_REPORT) fs.writeFileSync(process.env.ATTACHMENT_PILOT_REPORT, JSON.stringify(report, null, 2)+"\n");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await baselineEnvironment?.cleanup();
  await admin.app().delete();
});
