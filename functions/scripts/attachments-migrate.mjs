#!/usr/bin/env node
// Default is inventory only. No cloud write is reachable without --apply,
// an exact --confirm-project, and a previously generated manifest.
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { referencesIn, rewriteReferences, buildManifest, assertManifest, hash } = require("../attachmentMigration.cjs");
const { assertDeploymentRecord } = require("../attachmentCutover.cjs");

function argsOf(argv) {
  const values = {};
  const flags = new Set(["apply", "writes-paused", "gateway-verified", "iam-private-verified"]);
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, "");
    if (!argv[i].startsWith("--")) throw new Error(`Unexpected argument: ${argv[i]}`);
    if (flags.has(key)) values[key] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Missing value for --${key}`);
      values[key] = argv[++i];
    }
  }
  return values;
}
const options = argsOf(process.argv.slice(2));
const phase = options.phase || "inventory";
const phases = ["inventory", "copy", "rewrite", "prepare-cutover", "revoke", "verify"];
if (!phases.includes(phase)) throw new Error(`Unknown phase: ${phase}`);
const json = (file) => JSON.parse(readFileSync(resolve(file), "utf8"));
const output = resolve(options.output || `attachment-migration-${phase}.json`);
function save(file, value) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
}
const fixture = options.fixture ? json(options.fixture) : null;
let manifest = options.manifest ? assertManifest(json(options.manifest)) : null;
const projectId = options.project || manifest?.projectId || fixture?.projectId;
const bucketName = options.bucket || manifest?.bucket || fixture?.bucket;
if (!projectId || !bucketName) throw new Error("Provide --project and --bucket explicitly (or a reviewed manifest/fixture).");
if (manifest && (manifest.projectId !== projectId || manifest.bucket !== bucketName)) throw new Error("Manifest project/bucket does not match arguments");
if (options.apply && (fixture || !["copy", "rewrite", "revoke"].includes(phase))) throw new Error("--apply is only valid for live copy/rewrite/revoke phases");
if (options.apply && options["confirm-project"] !== projectId) throw new Error("--apply requires --confirm-project matching the exact project ID");
if (options.apply && ["rewrite", "revoke"].includes(phase) && !options["writes-paused"]) throw new Error("Rewrite/revoke require a controlled write-maintenance window (--writes-paused)");
if (phase !== "inventory" && !manifest) throw new Error("A reviewed --manifest is required after inventory");
if (phase === "prepare-cutover" && !options["writes-paused"]) throw new Error("Pre-cutover readiness requires --writes-paused and an active maintenance window");
if (["revoke", "verify"].includes(phase) && (options.apply || phase === "verify")) {
  const record = options["deployed-report"] ? json(options["deployed-report"]) : null;
  assertDeploymentRecord(record, { projectId,
    storageRules: readFileSync(new URL("../../storage.rules", import.meta.url), "utf8"),
    manifestHash: hash(JSON.stringify(manifest)) });
}

let db, bucket, FieldValue;
async function connect() {
  if (db) return;
  const emulatorHosts = [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_STORAGE_EMULATOR_HOST];
  if (emulatorHosts.some(Boolean) && (!emulatorHosts.every((host) => /^(127\.0\.0\.1|localhost):\d+$/.test(host || "")) || !projectId.startsWith("demo-"))) {
    throw new Error("Migration emulator mode requires BOTH loopback Firestore/Storage hosts and a demo- project; mixed cloud/emulator targets are refused");
  }
  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const firestore = await import("firebase-admin/firestore");
  const { getStorage } = await import("firebase-admin/storage");
  const app = initializeApp({ projectId, storageBucket: bucketName,
    ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }) });
  db = firestore.getFirestore(app);
  FieldValue = firestore.FieldValue;
  bucket = getStorage(app).bucket(bucketName);
}
async function documentsWithLegacyReferences() {
  const documents = [];
  let count = 0;
  const limit = Number(options["max-documents"] || 100000);
  async function walk(collection) {
    // listDocuments also includes missing ancestor documents with subcollections.
    // collection.stream() alone silently misses their nested attachments.
    const refs = await collection.listDocuments();
    for (let offset = 0; offset < refs.length; offset += 100) {
      const snapshots = await db.getAll(...refs.slice(offset, offset + 100));
      for (const doc of snapshots) {
        count += 1;
        if (count > limit) throw new Error(`Document limit (${limit}) reached; inventory is incomplete`);
        if (doc.exists) {
          const references = referencesIn(doc.data(), bucketName);
          if (references.length) documents.push({ path: doc.ref.path,
            updateTime: doc.updateTime?.toDate().toISOString(), references });
        }
        for (const sub of await doc.ref.listCollections()) await walk(sub);
      }
    }
  }
  for (const collection of await db.listCollections()) {
    if (collection.id === "_attachments") continue;
    await walk(collection);
  }
  return documents;
}
async function objectInventory() {
  const [files] = await bucket.getFiles({ prefix: "uploads/" });
  const objects = [];
  for (const file of files) {
    const [metadata] = await file.getMetadata();
    objects.push({ name: file.name, generation: metadata.generation, size: metadata.size,
      crc32c: metadata.crc32c, contentType: metadata.contentType,
      metadata: metadata.metadata, acl: metadata.acl });
  }
  return objects;
}
const checkpointFile = resolve(options.checkpoint || `${options.manifest || output}.checkpoint.json`);
let checkpoint = existsSync(checkpointFile) ? json(checkpointFile) : { version: 1, projectId, bucket: bucketName,
  copied: {}, rewritten: {}, revoked: {}, legacyProbes: [] };
if (checkpoint.projectId !== projectId || checkpoint.bucket !== bucketName) throw new Error("Checkpoint belongs to another project/bucket");
const persist = () => save(checkpointFile, checkpoint);

if (phase === "inventory") {
  if (fixture) {
    manifest = buildManifest({ ...fixture, projectId, bucket: bucketName });
  } else {
    await connect();
    const documents = await documentsWithLegacyReferences();
    const objects = await objectInventory();
    let iam;
    try {
      const [policy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 });
      iam = { checked: true, publicBindings: (policy.bindings || []).filter((binding) =>
        binding.members?.some((member) => ["allUsers", "allAuthenticatedUsers"].includes(member))) };
    } catch (error) { iam = { checked: false, errorCode: String(error.code || "unavailable") }; }
    manifest = buildManifest({ projectId, bucket: bucketName, documents, objects, iam });
  }
  save(output, manifest);
  console.log(JSON.stringify({ phase, writes: 0, manifest: output, summary: manifest.summary }));
} else if (!options.apply && !["prepare-cutover", "verify"].includes(phase)) {
  // Showing a plan from an existing manifest never initializes Admin credentials.
  save(output, { phase, writes: 0, projectId, bucket: bucketName,
    summary: manifest.summary, action: `Would ${phase}; no cloud changes were made.` });
  console.log(JSON.stringify({ phase, writes: 0, plan: output, summary: manifest.summary }));
} else {
  await connect();
  const ready = manifest.files.filter((file) => file.status === "ready");
  const readyByPath = new Map(ready.map((file) => [file.legacyPath, file]));
  const replacements = new Map(ready.map((file) => [file.legacyPath, file.ref]));
  const backupDir = resolve(options["backup-dir"] || `${options.manifest}.backups`);
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });

  async function verifyProtected(file) {
    const [metadata] = await bucket.file(file.objectPath).getMetadata();
    if (Number(metadata.size) !== file.size || (file.crc32c && metadata.crc32c !== file.crc32c) ||
      metadata.metadata?.firebaseStorageDownloadTokens) throw new Error(`Protected copy verification failed: ${file.id}`);
    return metadata;
  }

  if (phase === "copy") {
    for (const file of ready) {
      if (!file.sourceGeneration || file.size == null || !file.crc32c) throw new Error(`Missing source integrity information: ${file.id}`);
      const [sourceMetadata] = await bucket.file(file.legacyPath).getMetadata();
      if (String(sourceMetadata.generation) !== String(file.sourceGeneration)) throw new Error(`Source changed since inventory: ${file.id}`);
      const target = bucket.file(file.objectPath);
      const [exists] = await target.exists();
      if (!exists) {
        // Streaming a new object with a whitelist of metadata avoids copying the
        // old firebaseStorageDownloadTokens. Generation=0 prevents overwrite.
        await pipeline(bucket.file(file.legacyPath, { generation: file.sourceGeneration }).createReadStream(),
          target.createWriteStream({ resumable: false, validation: "crc32c", preconditionOpts: { ifGenerationMatch: 0 },
            metadata: { contentType: file.contentType, cacheControl: "private, no-store", metadata: {} } }));
      }
      const metadata = await verifyProtected(file);
      const asset = db.doc(`_attachments/${file.id}`);
      const existing = await asset.get();
      if (existing.exists) {
        const assetData = existing.data();
        if (assetData.objectPath !== file.objectPath || assetData.ownerUid !== file.ownerUid ||
          assetData.deleted || assetData.deleting || assetData.migration?.sourcePath !== file.legacyPath ||
          String(assetData.migration?.sourceGeneration) !== String(file.sourceGeneration)) {
          throw new Error(`Existing registry mismatch: ${file.id}`);
        }
        const merged = [...new Set([...(assetData.parents || []), ...file.parents])];
        if (merged.length > 200) throw new Error(`Too many reviewed source documents: ${file.id}`);
        if (merged.length !== (assetData.parents || []).length) {
          await asset.update({ parents: merged }, { lastUpdateTime: existing.updateTime });
        }
      } else {
        await asset.create({ ownerUid: file.ownerUid, objectPath: file.objectPath, parents: file.parents,
          contentType: file.contentType, name: file.name, size: file.size, createdAt: FieldValue.serverTimestamp(),
          migration: { sourcePath: file.legacyPath, sourceGeneration: file.sourceGeneration } });
      }
      checkpoint.copied[file.legacyPath] = { id: file.id, generation: metadata.generation, crc32c: metadata.crc32c };
      persist();
    }
  }

  if (phase === "rewrite") {
    for (const file of ready) {
      if (!checkpoint.copied[file.legacyPath]) throw new Error(`Copy phase is incomplete: ${file.id}`);
      await verifyProtected(file);
    }
    for (const document of manifest.documents) {
      const ref = db.doc(document.path);
      const snapshot = await ref.get();
      if (!snapshot.exists) { checkpoint.rewritten[document.path] = { deleted: true }; persist(); continue; }
      const before = snapshot.data();
      const current = referencesIn(before, bucketName);
      const unknown = current.filter((reference) => !readyByPath.has(reference.path));
      if (unknown.length) throw new Error(`Unreviewed/missing attachment in ${document.path}; regenerate inventory`);
      if (current.length) {
        // Backups contain private document content and potentially old tokens.
        // The directory/file permissions are intentional; never commit these.
        const backup = resolve(backupDir, `${hash(document.path)}.json`);
        if (!existsSync(backup)) save(backup, { path: document.path, updateTime: { seconds: snapshot.updateTime.seconds, nanoseconds: snapshot.updateTime.nanoseconds }, data: before });
        const next = rewriteReferences(before, bucketName, replacements);
        await ref.update(next, { lastUpdateTime: snapshot.updateTime });
      }
      checkpoint.rewritten[document.path] = { verifiedAt: new Date().toISOString() };
      persist();
    }
  }

  if (phase === "revoke") {
    // Run a full fresh scan: a manifest alone cannot establish that old clients
    // stopped uploading or that no later write introduced another token URL.
    const remaining = await documentsWithLegacyReferences();
    if (remaining.length) throw new Error(`Legacy references remain in ${remaining.length} documents; revoke aborted`);
    if (manifest.files.some((file) => file.status !== "ready")) {
      throw new Error("Unreferenced/review/missing files remain. Resolve them in a reviewed manifest before revocation/cutover.");
    }
    const freshObjects = await objectInventory();
    if (freshObjects.some((object) => !readyByPath.has(object.name))) {
      throw new Error("New/unreviewed legacy objects appeared after inventory; revoke aborted");
    }
    for (const file of ready) {
      if (!checkpoint.copied[file.legacyPath]) throw new Error(`Copy phase is incomplete: ${file.id}`);
      await verifyProtected(file);
      const source = bucket.file(file.legacyPath);
      const [metadata] = await source.getMetadata();
      if (String(metadata.generation) !== String(file.sourceGeneration)) throw new Error(`Legacy bytes changed: ${file.id}`);
      const tokens = String(metadata.metadata?.firebaseStorageDownloadTokens || "").split(",").filter(Boolean);
      for (const token of tokens) {
        const origin = process.env.FIREBASE_STORAGE_EMULATOR_HOST
          ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}` : "https://firebasestorage.googleapis.com";
        const url = `${origin}/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(file.legacyPath)}?alt=media&token=${encodeURIComponent(token)}`;
        if (!checkpoint.legacyProbes.some((probe) => probe.url === url)) checkpoint.legacyProbes.push({ id: file.id, url });
      }
      // Save probes privately BEFORE revocation, so an interrupted run can still
      // test the exact previous token URLs. No token is printed to stdout.
      persist();
      await source.setMetadata({ cacheControl: "private, no-store", metadata: { firebaseStorageDownloadTokens: null } });
      const [after] = await source.getMetadata();
      if (after.metadata?.firebaseStorageDownloadTokens) throw new Error(`Token revocation did not persist: ${file.id}`);
      checkpoint.revoked[file.legacyPath] = { generation: after.generation, verifiedAt: new Date().toISOString() };
      persist();
    }
  }

  if (["prepare-cutover", "verify"].includes(phase)) {
    const preCutover = phase === "prepare-cutover";
    const remaining = await documentsWithLegacyReferences();
    const failures = [];
    const freshObjects = await objectInventory();
    for (const object of freshObjects) {
      if (!readyByPath.has(object.name)) failures.push({ reason: "unreviewed-legacy-object" });
      else if (String(object.generation) !== String(readyByPath.get(object.name).sourceGeneration)) {
        failures.push({ id: readyByPath.get(object.name).id, reason: "legacy-generation-changed" });
      }
      if (!preCutover && object.metadata?.firebaseStorageDownloadTokens) failures.push({ reason: "legacy-token-remains" });
      if ((object.acl ?? []).some((entry) => ["allUsers", "allAuthenticatedUsers"].includes(entry.entity))) {
        failures.push({ reason: "public-object-acl" });
      }
    }
    for (const file of ready) {
      try { await verifyProtected(file); } catch { failures.push({ id: file.id, reason: "protected-integrity" }); }
      if (!checkpoint.copied[file.legacyPath]) failures.push({ id: file.id, reason: "not-copied" });
      if (!preCutover && !checkpoint.revoked[file.legacyPath]) failures.push({ id: file.id, reason: "not-revoked" });
    }
    if (!preCutover) for (const probe of checkpoint.legacyProbes) {
      try {
        const response = await fetch(probe.url, { headers: { Range: "bytes=0-0" }, redirect: "error" });
        await response.body?.cancel();
        if (![401, 403, 404].includes(response.status)) failures.push({ id: probe.id, reason: `old-url-status-${response.status}` });
      } catch { failures.push({ id: probe.id, reason: "old-url-probe-unavailable" }); }
    }
    const unresolved = manifest.files.filter((file) => file.status !== "ready").length;
    const basePassed = !remaining.length && !unresolved && !failures.length &&
      options["gateway-verified"] === true && options["iam-private-verified"] === true;
    const complete = preCutover ? basePassed && options["writes-paused"] === true
      : basePassed && (!ready.length || checkpoint.legacyProbes.length > 0);
    const report = { version: 1, phase: preCutover ? "prepared" : "verified", projectId, bucket: bucketName,
      environment: process.env.FIREBASE_STORAGE_EMULATOR_HOST ? "loopback-emulator" : "firebase",
      verifiedAt: new Date().toISOString(), manifestHash: hash(JSON.stringify(manifest)),
      storageRulesHash: hash(readFileSync(new URL("../../storage.rules", import.meta.url), "utf8")),
      legacyReferences: remaining.length, unresolvedFiles: unresolved,
      plannedFiles: ready.length,
      copiedFiles: ready.filter((file) => checkpoint.copied[file.legacyPath]).length,
      revokedFiles: ready.filter((file) => checkpoint.revoked[file.legacyPath]).length,
      anonymousUrlProbes: checkpoint.legacyProbes.length, failures,
      gatewayVerified: options["gateway-verified"] === true,
      iamPrivateVerified: options["iam-private-verified"] === true,
      ...(preCutover ? { writesPaused: true, tokenRevocationPending: true, readyForStorageCutover: complete }
        : { storageDeploymentRecorded: true, protectionVerified: complete }) };
    save(output, report);
    console.log(JSON.stringify({ phase, report: output,
      ...(preCutover ? { readyForStorageCutover: complete, tokenRevocationPending: true }
        : { protectionVerified: complete }),
      legacyReferences: remaining.length, unresolvedFiles: unresolved, failures: failures.length }));
    if (!complete) process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ phase, projectId, checkpoint: checkpointFile,
      copied: Object.keys(checkpoint.copied).length, rewritten: Object.keys(checkpoint.rewritten).length,
      revoked: Object.keys(checkpoint.revoked).length }));
  }
}
