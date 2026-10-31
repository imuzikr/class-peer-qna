"use strict";
const { createHash } = require("node:crypto");
const digest = (value) => createHash("sha256").update(value).digest("hex");
function assertCutoverReport(report, { projectId, storageRules }) {
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
function assertDeploymentRecord(record, { projectId, storageRules, manifestHash }) {
  if (record?.version !== 1 || record.kind !== "attachment-storage-final-deployed" ||
    record.projectId !== projectId || record.storageRulesHash !== digest(storageRules) ||
    record.manifestHash !== manifestHash || !record.deployedAt) {
    throw new Error("Revoke/verify require the successful final Storage deployment record for this manifest, project and rules");
  }
  return true;
}
module.exports = { assertCutoverReport, assertDeploymentRecord };
