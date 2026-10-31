import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { assertCutoverReport, assertDeploymentRecord } = require("../../functions/attachmentCutover.cjs");
const storageRules = "deny all direct file reads";
const rulesHash = createHash("sha256").update(storageRules).digest("hex");
const report = { version: 1, phase: "prepared", readyForStorageCutover: true, writesPaused: true,
  projectId: "demo", storageRulesHash: rulesHash, manifestHash: "reviewed-manifest-hash",
  legacyReferences: 0, unresolvedFiles: 0, failures: [], gatewayVerified: true,
  iamPrivateVerified: true, copiedFiles: 2, plannedFiles: 2 };

test("final deny deployment requires pre-cutover readiness, not prior token revocation", () => {
  assert.equal(assertCutoverReport(report, { projectId: "demo", storageRules }), true);
  for (const patch of [{ readyForStorageCutover: false }, { writesPaused: false }, { phase: "verified" },
    { legacyReferences: 1 }, { unresolvedFiles: 1 }, { failures: ["bad copy"] }, { gatewayVerified: false },
    { iamPrivateVerified: false }, { copiedFiles: 3 }, { plannedFiles: -1 }, { manifestHash: "" },
    { storageRulesHash: "other" }, { projectId: "production" }]) {
    assert.throws(() => assertCutoverReport({ ...report, ...patch }, { projectId: "demo", storageRules }));
  }
  assert.throws(() => assertCutoverReport(report, { projectId: "demo", storageRules: "changed after readiness check" }));
});

test("token revocation and final verification require a matching successful deny-rule deployment record", () => {
  const record = { version: 1, kind: "attachment-storage-final-deployed", projectId: "demo",
    storageRulesHash: rulesHash, manifestHash: report.manifestHash, deployedAt: "2026-10-31T00:00:00Z" };
  const target = { projectId: "demo", storageRules, manifestHash: report.manifestHash };
  assert.equal(assertDeploymentRecord(record, target), true);
  for (const patch of [{ kind: "prepared" }, { projectId: "production" }, { manifestHash: "different" },
    { storageRulesHash: "different" }, { deployedAt: null }]) {
    assert.throws(() => assertDeploymentRecord({ ...record, ...patch }, target));
  }
});

test("selected-file cutover binds the preserved inventory without claiming a global cutover", () => {
  const preservationHash = "a".repeat(64);
  const selected = { ...report, scope: "selected-files", preservedFiles: 13, preservationHash };
  assert.equal(assertCutoverReport(selected, { projectId: "demo", storageRules }), true);
  for (const patch of [{ preservationHash: null }, { preservedFiles: 0 }, { scope: "all-files" }]) {
    assert.throws(() => assertCutoverReport({ ...selected, ...patch }, { projectId: "demo", storageRules }));
  }
  const record = { version: 1, kind: "attachment-storage-final-deployed", projectId: "demo",
    storageRulesHash: rulesHash, manifestHash: report.manifestHash, preservationHash, deployedAt: "now" };
  const target = { projectId: "demo", storageRules, manifestHash: report.manifestHash, preservationHash };
  assert.equal(assertDeploymentRecord(record, target), true);
  assert.throws(() => assertDeploymentRecord(record, { ...target, preservationHash: null }));
});
