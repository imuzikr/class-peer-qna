"use strict";
const { createHash } = require("node:crypto");
const digest = (value) => createHash("sha256").update(value).digest("hex");
function assertCutoverReport(report, { projectId, storageRules }) {
  if (report?.scope === "selected-files" && (!Number.isInteger(report.preservedFiles) || report.preservedFiles < 1 ||
    !/^[a-f0-9]{64}$/.test(report.preservationHash || ""))) throw new Error("Selected cutover requires a bound preservation inventory");
  if (report?.scope !== "selected-files" && (report?.preservedFiles || report?.preservationHash)) throw new Error("Preservation scope mismatch");
  const countsValid = ["legacyReferences", "unresolvedFiles", "copiedFiles", "plannedFiles"]
    .every((key) => Number.isInteger(report?.[key]) && report[key] >= 0);
  if (!countsValid || report?.version !== 1 || report.phase !== "prepared" ||
    report.readyForStorageCutover !== true || report.writesPaused !== true ||
    report.projectId !== projectId || report.storageRulesHash !== digest(storageRules) ||
    report.legacyReferences !== 0 || report.unresolvedFiles !== 0 ||
    !Array.isArray(report.failures) || report.failures.length !== 0 ||
    report.gatewayVerified !== true || report.iamPrivateVerified !== true ||
    report.copiedFiles !== report.plannedFiles || !report.manifestHash) {
    throw new Error("Final Storage deployment requires a matching pre-cutover readiness report and an active write-maintenance window");
  }
  return true;
}
function assertDeploymentRecord(record, { projectId, storageRules, manifestHash, preservationHash = null }) {
  if (record?.version !== 1 || record.kind !== "attachment-storage-final-deployed" ||
    record.projectId !== projectId || record.storageRulesHash !== digest(storageRules) ||
    record.manifestHash !== manifestHash || (record.preservationHash || null) !== preservationHash || !record.deployedAt) {
    throw new Error("Revoke/verify require the successful final Storage deployment record for this manifest, project and rules");
  }
  return true;
}
module.exports = { assertCutoverReport, assertDeploymentRecord };
