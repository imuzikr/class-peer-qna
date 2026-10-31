import { describe, it, before, after } from "node:test";
import { assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection } from "firebase/firestore";
import { ref, getBytes, getMetadata, getDownloadURL, uploadBytes, deleteObject, listAll } from "firebase/storage";
import { makeEnv, asStudent, asTeacher, asAdmin } from "./helpers.mjs";

describe("protected attachments: no direct Storage/registry bypass", () => {
  let env;
  const asset = "protected/studentA/1234567890abcdef1234567890abcdef";
  const legacy = "uploads/studentA/old.jpg";

  before(async () => {
    env = await makeEnv("demo-rules-protected-attachments", { storage: true });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "_attachments", "asset"), {
        ownerUid: "studentA", objectPath: asset, parents: ["questions/q1"],
      });
      for (const path of [asset, legacy]) {
        await uploadBytes(ref(ctx.storage(), path), new Uint8Array([1, 2, 3]), { contentType: "image/jpeg" });
      }
    });
  });
  after(async () => { await env?.cleanup(); });

  const readers = [
    ["uploader", () => asStudent(env, "studentA")],
    ["another student", () => asStudent(env, "studentB")],
    ["teacher", () => asTeacher(env, "teacherA")],
    ["admin", () => asAdmin(env, "adminA")],
    ["logged out", () => env.unauthenticatedContext()],
  ];

  for (const [label, context] of readers) {
    it(`${label} must use authenticated gateway, including metadata/token reads`, async () => {
      const storage = context().storage();
      for (const path of [asset, legacy]) {
        await assertFails(getBytes(ref(storage, path)));
        await assertFails(getMetadata(ref(storage, path)));
        await assertFails(getDownloadURL(ref(storage, path)));
        await assertFails(deleteObject(ref(storage, path)));
      }
      for (const prefix of ["", "protected", "protected/studentA", "uploads", "uploads/studentA"]) {
        await assertFails(listAll(ref(storage, prefix)));
      }
    });

    it(`${label} cannot create files or forge attachment grants`, async () => {
      const ctx = context();
      await assertFails(uploadBytes(ref(ctx.storage(), "protected/studentA/forged"), new Uint8Array([4])));
      await assertFails(uploadBytes(ref(ctx.storage(), "uploads/studentA/new.jpg"), new Uint8Array([4])));
      const db = ctx.firestore();
      await assertFails(getDoc(doc(db, "_attachments", "asset")));
      await assertFails(getDocs(collection(db, "_attachments")));
      await assertFails(setDoc(doc(db, "_attachments", "fake"), {
        ownerUid: "studentB", objectPath: asset, parents: ["questions/public"],
      }));
      await assertFails(updateDoc(doc(db, "_attachments", "asset"), { parents: ["questions/public"] }));
      await assertFails(deleteDoc(doc(db, "_attachments", "asset")));
    });
  }
});
