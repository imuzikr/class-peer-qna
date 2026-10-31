"use strict";

// Trusted Admin cleanup only. HTTP callers must use the owner-only gateway.
// Deleting a copied/shared document must not remove a file another live document uses.
const { collectRefs } = require("./attachments/service");

async function cleanupProtectedAttachmentRefs(deps, data) {
  const results = [];
  for (const reference of collectRefs(data)) {
    const id = reference.slice("attachment:".length);
    const asset = await deps.getAsset(id);
    if (!asset || asset.deleted) continue;
    if (!asset.ownerUid || /[\/\x00-\x1f]/.test(asset.ownerUid)
      || asset.objectPath !== `protected/${asset.ownerUid}/${id}`) {
      throw new Error(`Unsafe protected attachment object path: ${id}`);
    }
    const locked = await deps.beginDelete(id, asset.ownerUid);
    try {
      let inUse = false;
      for (const parent of Array.isArray(locked.parents) ? locked.parents : []) {
        const document = await deps.readParentForCleanup(parent);
        if (document && collectRefs(document).has(reference)) { inUse = true; break; }
      }
      if (inUse) {
        await deps.abortDelete(id);
        results.push({ id, deleted: false, inUse: true });
        continue;
      }
      await deps.deleteFile(locked.objectPath);
      await deps.markDeleted(id);
      results.push({ id, deleted: true });
    } catch (error) {
      await deps.abortDelete(id).catch(() => {});
      throw error;
    }
  }
  return results;
}

async function cleanupProtectedAttachmentsForOwner(db, deps, uid) {
  const owned = await db.collection("_attachments").where("ownerUid", "==", uid).get();
  return cleanupProtectedAttachmentRefs(deps, owned.docs.map((doc) => `attachment:${doc.id}`));
}

module.exports = { cleanupProtectedAttachmentRefs, cleanupProtectedAttachmentsForOwner };
