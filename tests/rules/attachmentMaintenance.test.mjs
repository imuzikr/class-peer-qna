import { describe, it, before, after } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
const require = createRequire(import.meta.url);
const { pausedFirestoreRules } = require("../../functions/attachmentMaintenance.cjs");

describe("attachment cutover maintenance preserves reads and blocks all client roles from writes", () => {
  let env;
  before(async () => {
    env = await initializeTestEnvironment({ projectId: "demo-attachment-maintenance", firestore: {
      rules: pausedFirestoreRules(readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8")),
      host: "127.0.0.1", port: Number(process.env.FIRESTORE_EMULATOR_HOST.split(":")[1]),
    } });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "questions", "existing"), { authorId: "teacher", title: "fixture" });
      await setDoc(doc(ctx.firestore(), "users", "student"), { name: "fixture" });
    });
  });
  after(async () => { await env?.cleanup(); });
  for (const role of ["student", "teacher", "admin"]) {
    it(`${role} can read existing material but cannot create/update/delete`, async () => {
      const db = env.authenticatedContext(role, { role, email: role + "@example.invalid", email_verified: true }).firestore();
      await assertSucceeds(getDoc(doc(db, "questions", "existing")));
      await assertFails(setDoc(doc(db, "questions", "new"), { authorId: role, title: "new" }));
      await assertFails(updateDoc(doc(db, "questions", "existing"), { title: "changed" }));
      await assertFails(deleteDoc(doc(db, "questions", "existing")));
      await assertFails(setDoc(doc(db, "users", role, "notifications", "n"), { read: true }));
    });
  }
});
