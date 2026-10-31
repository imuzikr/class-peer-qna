#!/usr/bin/env node
const { readFileSync, writeFileSync, chmodSync } = require("node:fs");
const { resolve } = require("node:path");
const { assertCutoverReport } = require("../functions/attachmentCutover.cjs");
const [reportPath, projectId, mode] = process.argv.slice(2);
if (!reportPath || !projectId) throw new Error("Usage: verify-attachment-cutover.cjs REPORT PROJECT_ID [--record-deployment]");
const report = JSON.parse(readFileSync(resolve(reportPath), "utf8"));
assertCutoverReport(report, {
  projectId, storageRules: readFileSync(resolve(__dirname, "../storage.rules"), "utf8"),
});
if (mode === "--record-deployment") {
  const output = resolve(`${reportPath}.deployed.json`);
  writeFileSync(output, JSON.stringify({ version: 1, kind: "attachment-storage-final-deployed", projectId,
    storageRulesHash: report.storageRulesHash, manifestHash: report.manifestHash,
    scope: report.scope || "all-files", preservationHash: report.preservationHash || null,
    deployedAt: new Date().toISOString() }, null, 2) + "\n", { mode: 0o600 });
  chmodSync(output, 0o600);
  console.log(`Successful final Storage deployment recorded: ${output}`);
} else if (mode) throw new Error("Unsupported verification mode");
else console.log("Pre-cutover readiness verified. This is NOT a completed token-revocation report.");
