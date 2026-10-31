import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { cleanupProtectedAttachmentRefs, cleanupProtectedAttachmentsForOwner } = require('../../functions/protectedAttachmentCleanup.js');
const ID = '12345678-1234-1234-1234-123456789abc';
const REF = `attachment:${ID}`;
function setup(parents) {
  const asset = { ownerUid: 'u1', objectPath: `protected/u1/${ID}`, parents: Object.keys(parents) };
  const calls = [];
  const deps = {
    getAsset: async () => asset,
    beginDelete: async (id, owner) => { calls.push(['lock', id, owner]); return asset; },
    readParentForCleanup: async path => parents[path],
    deleteFile: async path => calls.push(['delete', path]),
    markDeleted: async id => calls.push(['mark', id]),
    abortDelete: async id => calls.push(['unlock', id]),
  };
  return { deps, asset, calls };
}

test('trusted cleanup retains an image still referenced by a surviving copied lesson', async () => {
  const { deps, calls } = setup({ 'studyBoards/deleted/cards/a': null,
    'lessons/kept': { slides: [{ imageUrl: REF }] } });
  const result = await cleanupProtectedAttachmentRefs(deps, { html: `<img src="${REF}">` });
  assert.deepEqual(result, [{ id: ID, deleted: false, inUse: true }]);
  assert(calls.some(c => c[0] === 'unlock'));
  assert(!calls.some(c => c[0] === 'delete'));
});

test('trusted cleanup removes the object only after all registered parent references disappeared', async () => {
  const { deps, calls } = setup({ 'lessons/deleted': null, 'studyBoards/changed': { text: 'image removed' } });
  assert.deepEqual(await cleanupProtectedAttachmentRefs(deps, [REF, REF]), [{ id: ID, deleted: true }]);
  assert.deepEqual(calls.map(c => c[0]), ['lock', 'delete', 'mark']);
});

test('failed parent verification retains the object and releases its registry lock', async () => {
  const { deps, calls } = setup({ 'questions/q1': null });
  deps.readParentForCleanup = async () => { throw new Error('Firestore unavailable'); };
  await assert.rejects(cleanupProtectedAttachmentRefs(deps, [REF]), /unavailable/);
  assert.deepEqual(calls.map(c => c[0]), ['lock', 'unlock']);
});

test('cleanup refuses a registry object path outside the protected owner/id prefix', async () => {
  const { deps, asset, calls } = setup({});
  asset.objectPath = 'another-user/private.jpg';
  await assert.rejects(cleanupProtectedAttachmentRefs(deps, [REF]), /Unsafe/);
  assert.equal(calls.length, 0);
});

test('account cleanup queries only that account and preserves shared live references', async () => {
  const { deps, calls } = setup({ 'questions/q1': { images: [REF] } });
  const db = { collection(name) {
    assert.equal(name, '_attachments');
    return { where(field, op, uid) {
      assert.deepEqual([field, op, uid], ['ownerUid', '==', 'u1']);
      return { get: async () => ({ docs: [{ id: ID }] }) };
    } };
  } };
  await cleanupProtectedAttachmentsForOwner(db, deps, 'u1');
  assert(!calls.some(c => c[0] === 'delete'));
});
