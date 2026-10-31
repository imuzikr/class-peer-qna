import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAttachmentBindingQueue } from '@/lib/attachmentBindingQueue';

const A = 'attachment:aaaaaaaaaaaaaaaa';
const B = 'attachment:bbbbbbbbbbbbbbbb';
function storage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function setup(bind, extra = {}) {
  let uid = 'first';
  const saved = storage();
  const updates = [];
  const queue = createAttachmentBindingQueue({ bind, getUid: () => uid,
    getStorage: () => saved, onChange: status => updates.push(status), wait: async () => {}, ...extra });
  return { queue, saved, updates, setUid: value => { uid = value; }, getUid: () => uid };
}

test('plain documents perform no attachment request', async () => {
  let calls = 0;
  const { queue } = setup(async () => { calls++; });
  await queue.afterWrite('questions/q1', { text: 'plain', image: 'https://example.com/image.jpg' });
  assert.equal(calls, 0);
  assert.equal(queue.status().pendingCount, 0);
});

test('transient binding failures retry without recreating the saved document', async () => {
  let calls = 0;
  const { queue } = setup(async (path, refs) => {
    assert.equal(path, 'questions/q1');
    assert.deepEqual(refs, [A]);
    if (++calls < 3) throw Object.assign(new Error('offline'), { status: 503 });
  });
  await queue.afterWrite('questions/q1', { html: `<img src="${A}">` });
  assert.equal(calls, 3);
  assert.equal(queue.status().pendingCount, 0);
});

test('post-save failure is visible, persisted without body, and recoverable after page reload', async () => {
  const { queue, saved, updates, getUid } = setup(async () => { throw new Error('binding denied'); });
  await queue.afterWrite('questions/q1', { secretBody: 'DO NOT PERSIST THE BODY', image: A });
  assert.equal(queue.status().pendingCount, 1);
  assert.equal(updates.at(-1).pendingCount, 1);
  assert(![...saved.values.values()].join('').includes('DO NOT PERSIST'));
  const recovered = createAttachmentBindingQueue({ bind: async () => {}, getUid, getStorage: () => saved });
  assert.equal(recovered.status().pendingCount, 1);
  await recovered.retry();
  assert.equal(recovered.status().pendingCount, 0);
  assert.equal(saved.values.size, 0);
});

test('a pending attachment is never retried as the next logged-in user', async () => {
  let calls = 0;
  const { queue, setUid } = setup(async () => { calls++; throw new Error('denied'); });
  await queue.afterWrite('questions/q1', [A]);
  setUid('second');
  assert.equal(queue.status().pendingCount, 0);
  await queue.retry();
  assert.equal(calls, 1);
  setUid('first');
  assert.equal(queue.status().pendingCount, 1);
});

test('auth changes during a committed write retain the task under the original uid', async () => {
  let calls = 0;
  const { queue, setUid } = setup(async () => { calls++; });
  setUid('second');
  await queue.afterWrite('questions/q1', [A], 'first');
  assert.equal(calls, 0);
  assert.equal(queue.status().pendingCount, 0);
  setUid('first');
  assert.equal(queue.status().pendingCount, 1);
  await queue.retry();
  assert.equal(calls, 1);
});

test('successful newer patches do not drop unrelated pending refs in the same document', async () => {
  let failed = true;
  const { queue } = setup(async () => { if (failed) throw new Error('denied'); });
  await queue.afterWrite('questions/q1', [A]);
  failed = false;
  await queue.afterWrite('questions/q1', [B]);
  assert.equal(queue.status().pendingCount, 1);
  await queue.retry();
  assert.equal(queue.status().pendingCount, 0);
});

test('blocked session storage and throwing subscribers cannot turn a committed save into a duplicate retry', async () => {
  const { queue } = setup(async () => { throw new Error('denied'); }, {
    getStorage: () => { throw new Error('blocked'); }, onChange: () => { throw new Error('UI gone'); },
  });
  await assert.doesNotReject(queue.afterWrite('questions/q1', [A]));
  assert.equal(queue.status().pendingCount, 1);
});

test('successful document deletion cancels only that document pending task and persists cancellation', async () => {
  const { queue, saved, getUid } = setup(async () => { throw new Error('denied'); });
  await queue.afterWrite('questions/deleted', [A]);
  await queue.afterWrite('questions/still-unauthorized', [B]);
  queue.forget('questions/deleted');
  assert.equal(queue.status().pendingCount, 1);
  const restored = createAttachmentBindingQueue({ bind: async path => {
    assert.equal(path, 'questions/still-unauthorized');
    throw new Error('denied');
  }, getUid, getStorage: () => saved });
  await restored.retry();
  assert.equal(restored.status().pendingCount, 1);
});

test('late failed post-save binding cannot recreate a task after the document was deleted', async () => {
  let rejectBind;
  const { queue } = setup(() => new Promise((_, reject) => { rejectBind = reject; }));
  const pending = queue.afterWrite('questions/deleted', [A]);
  queue.forget('questions/deleted');
  rejectBind(new Error('denied'));
  await pending;
  assert.equal(queue.status().pendingCount, 0);
});

test('a late failed retry cannot recreate the task canceled by document deletion', async () => {
  let rejectBind;
  let slow = false;
  const { queue } = setup(() => slow
    ? new Promise((_, reject) => { rejectBind = reject; })
    : Promise.reject(new Error('denied')));
  await queue.afterWrite('questions/deleted', [A]);
  slow = true;
  const retrying = queue.retry();
  queue.forget('questions/deleted');
  rejectBind(new Error('denied'));
  await retrying;
  assert.equal(queue.status().pendingCount, 0);
});

test('forget uses original user scope when login changes during deletion', async () => {
  const { queue, setUid } = setup(async () => { throw new Error('denied'); });
  await queue.afterWrite('questions/q1', [A]);
  setUid('second');
  await queue.afterWrite('questions/q1', [B]);
  queue.forget('questions/q1', 'first');
  assert.equal(queue.status().pendingCount, 1);
  setUid('first');
  assert.equal(queue.status().pendingCount, 0);
});
