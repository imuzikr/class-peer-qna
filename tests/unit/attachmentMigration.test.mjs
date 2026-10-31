import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { legacyPath, referencesIn, rewriteReferences, buildManifest, assertManifest } = require("../../functions/attachmentMigration.cjs");
const bucket = "private.firebasestorage.app";
const url = (path, target = bucket) => `https://firebasestorage.googleapis.com/v0/b/${target}/o/${encodeURIComponent(path)}?alt=media&token=OLDSECRET`;
const path = "uploads/student/old.jpg";

test("legacy parser only accepts own-bucket valid legacy objects", () => {
  assert.equal(legacyPath(url(path), bucket), path);
  for (const input of [url(path, "other"), "https://evil.example/" + url(path), "data:image/png;base64,AAAA", "javascript:x", "https://firebasestorage.googleapis.com/v0/b/private.firebasestorage.app/o/%ZZ",
    url("uploads/student/.."), url("uploads/student/a\n.jpg"),
    url(path).replace("https://", "https://user:password@"),
    url(path).replace("googleapis.com/", "googleapis.com:444/")]) {
    assert.equal(legacyPath(input, bucket), null);
  }
});

test("reverse index retains shared HTML/array/node references without recording token values", () => {
  const data = { imageUrl: url(path), html: `<p><img src="${url(path)}"></p>`, answers: { nodes: [{ image: url(path) }] }, attachments: [{ dataUrl: url(path) }] };
  const refs = referencesIn(data, bucket);
  assert.equal(refs.length, 4);
  assert(!JSON.stringify(refs).includes("OLDSECRET"));
  const fixture = { projectId: "demo", bucket,
    documents: [{ path: "bookActivities/a/entries/student", data }, { path: "lessons/l", data: { image: url(path) } }],
    objects: [{ name: path, generation: "7", size: "123", metadata: { firebaseStorageDownloadTokens: "SECRET" } }] };
  const manifest = buildManifest(fixture);
  assert.deepEqual(manifest.files[0].parents, ["bookActivities/a/entries/student", "lessons/l"]);
  assert.equal(manifest.files[0].status, "ready");
  assert.equal(manifest.files[0].hasDownloadTokens, true);
  assert(!JSON.stringify(manifest).includes("SECRET"));
  assertManifest(manifest);
  assert.throws(() => assertManifest({ ...manifest, files: [{ ...manifest.files[0], objectPath: "protected/someone/other" }] }));
});

test("rewrite updates all known own references without changing external images, data URLs, values or input", () => {
  const data = { text: "원문", html: `<img src="${url(path)}"><img src="${url(path, "external")}">`, node: { image: url(path) }, data: "data:image/png;base64,AAAA", count: 3 };
  const before = JSON.stringify(data);
  const next = rewriteReferences(data, bucket, new Map([[path, "attachment:abcdef1234567890"]]));
  assert.equal(next.node.image, "attachment:abcdef1234567890");
  assert(next.html.includes("attachment:abcdef1234567890"));
  assert(next.html.includes(url(path, "external")));
  assert.equal(next.text, data.text);
  assert.equal(next.data, data.data);
  assert.equal(next.count, data.count);
  assert.equal(JSON.stringify(data), before);
});

test("missing and unreferenced files are reported instead of receiving guessed class grants", () => {
  const manifest = buildManifest({ projectId: "demo", bucket,
    documents: [{ path: "questions/q", data: { image: url(path) } }],
    objects: [{ name: "uploads/teacher/orphan.jpg", size: 1 }, { name: "unknown/path/file.jpg", size: 1 }] });
  assert.equal(manifest.files.find((f) => f.legacyPath === path).status, "missing");
  assert.equal(manifest.files.find((f) => f.legacyPath.endsWith("orphan.jpg")).status, "unreferenced");
  assert.equal(manifest.files.find((f) => f.legacyPath.startsWith("unknown")).status, "review");
  assert(manifest.files.filter((f) => f.status !== "missing").every((f) => f.parents.length === 0));
});


test("unsupported parent collections are review items, not invisible migrated files", () => {
  const manifest = buildManifest({ projectId: "demo", bucket,
    documents: [{ path: "unknownCollection/doc", data: { image: url(path) } }],
    objects: [{ name: path, size: 1 }] });
  assert.equal(manifest.files[0].status, "review");
  assert.deepEqual(manifest.files[0].invalidParents, ["unknownCollection/doc"]);
});
