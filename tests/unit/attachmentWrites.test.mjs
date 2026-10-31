import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Execute the actual write wrappers with an SDK double, as in the repository's
// existing UI tests. No Firestore network or JSX transformer is required.
const source = readFileSync(new URL('../../lib/data/attachmentWrites.js', import.meta.url), 'utf8');
function writes(overrides = {}) {
  const events = [];
  const auth = { currentUser: { uid: 'original-user' } };
  const values = {
    auth,
    firebaseAddDoc: async (ref, data) => { events.push(['add', ref.path, data]); return { path: ref.path + '/new-id', id: 'new-id' }; },
    firebaseSetDoc: async (...args) => events.push(['set', ...args]),
    firebaseUpdateDoc: async (...args) => events.push(['update', ...args]),
    firebaseDeleteDoc: async (...args) => events.push(['delete', ...args]),
    firebaseWriteBatch: () => ({
      set: (...args) => events.push(['batch-set', ...args]),
      update: (...args) => events.push(['batch-update', ...args]),
      delete: (...args) => events.push(['batch-delete', ...args]),
      commit: async () => { events.push(['commit']); return 'committed'; },
    }),
    bindings: {
      afterWrite: async (...args) => events.push(['bind', ...args]),
      forget: (...args) => events.push(['forget', ...args]),
    },
    ...overrides,
  };
  const functions = runInNewContext(source.slice(source.indexOf('export async function addDoc'))
    .replaceAll('export ', '') + '\n({addDoc,setDoc,updateDoc,deleteDoc,writeBatch});', values);
  return { functions, auth, events };
}

test('a newly created document keeps its id and binds only after the SDK save resolves', async () => {
  const { functions, events } = writes();
  const ref = await functions.addDoc({ path: 'questions' }, { images: ['attachment:abcdefghijklmnop'] });
  assert.equal(ref.id, 'new-id');
  assert.equal(events[0][0], 'add');
  assert.equal(events[1][0], 'bind');
  assert.equal(events[1][1], 'questions/new-id');
});

test('a failed Firestore save creates no asset grant', async () => {
  const { functions, events } = writes({ firebaseSetDoc: async () => { throw new Error('rules denied write'); } });
  await assert.rejects(functions.setDoc({ path: 'private/a' }, { image: 'attachment:abcdefghijklmnop' }), /denied/);
  assert.equal(events.length, 0);
});

test('post-commit registration retains the user who started the write even when login changes', async () => {
  let release;
  const committed = new Promise(resolve => { release = resolve; });
  const { functions, auth, events } = writes({ firebaseUpdateDoc: async () => committed });
  const saving = functions.updateDoc({ path: 'questions/q1' }, { image: 'attachment:abcdefghijklmnop' });
  auth.currentUser = { uid: 'next-user' };
  release();
  await saving;
  assert.equal(events.at(-1)[3], 'original-user');
});

test('copying several fields in one batch binds each resulting parent once after commit', async () => {
  const { functions, events } = writes();
  const batch = functions.writeBatch({});
  assert.equal(batch.set({ path: 'lessons/new' }, { first: 'attachment:abcdefghijklmnop' }), batch);
  batch.update({ path: 'lessons/new' }, { second: 'attachment:qrstuvwxyzabcdef' });
  batch.set({ path: 'broadcasts/classA' }, { image: 'attachment:abcdefghijklmnop' });
  batch.delete({ path: 'lessons/old' });
  assert(!events.some(e => e[0] === 'bind'));
  assert.equal(await batch.commit(), 'committed');
  const commit = events.findIndex(e => e[0] === 'commit');
  assert(events.every((e, i) => e[0] !== 'bind' || i > commit));
  const parents = events.filter(e => e[0] === 'bind').map(e => e[1]);
  assert.deepEqual(parents, ['lessons/new', 'broadcasts/classA']);
});

test('delete cancels the original user task only after its SDK delete succeeds', async () => {
  let finishDelete;
  const deleting = new Promise(resolve => { finishDelete = resolve; });
  const { functions, auth, events } = writes({ firebaseDeleteDoc: async () => deleting });
  const result = functions.deleteDoc({ path: 'questions/q1' });
  assert.equal(events.length, 0);
  auth.currentUser = { uid: 'next-user' };
  finishDelete();
  await result;
  assert.deepEqual(events.at(-1), ['forget', 'questions/q1', 'original-user']);
});

test('failed document deletion retains the pending task', async () => {
  const { functions, events } = writes({ firebaseDeleteDoc: async () => { throw new Error('delete denied'); } });
  await assert.rejects(functions.deleteDoc({ path: 'questions/q1' }), /delete denied/);
  assert(!events.some(event => event[0] === 'forget'));
});

test('batch final deletion cancels binding while a set after deletion binds the new document', async () => {
  const { functions, events } = writes();
  const batch = functions.writeBatch({});
  batch.set({ path: 'questions/deleted' }, { image: 'attachment:abcdefghijklmnop' });
  batch.delete({ path: 'questions/deleted' });
  batch.set({ path: 'lessons/recreated' }, { old: 'attachment:abcdefghijklmnop' });
  batch.delete({ path: 'lessons/recreated' });
  batch.set({ path: 'lessons/recreated' }, { image: 'attachment:qrstuvwxyzabcdef' });
  assert(!events.some(event => event[0] === 'forget' || event[0] === 'bind'));
  await batch.commit();
  assert.deepEqual(events.find(event => event[0] === 'forget'), ['forget', 'questions/deleted', 'original-user']);
  const binds = events.filter(event => event[0] === 'bind');
  assert.equal(binds.length, 1);
  assert.equal(binds[0][1], 'lessons/recreated');
  assert(!JSON.stringify(binds[0][2]).includes('abcdefghijklmnop'));
});
