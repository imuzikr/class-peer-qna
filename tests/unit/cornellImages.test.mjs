import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockEmpty, usedBlocks, flattenBlocks } from '@/lib/cornell';

test('image-only Cornell blocks remain in saved blocks and legacy mirror', () => {
  for (const src of ['attachment:12345678-1234-1234-1234-123456789012', 'https://example.com/image.png', 'data:image/png;base64,AAAA']) {
    const notes = `<p><img src="${src}" alt="필기"></p>`;
    const block = {id:'b1',cue:'',notes};
    assert.equal(blockEmpty(block),false);
    assert.deepEqual(usedBlocks([block]),[block]);
    assert.equal(flattenBlocks([block]).notes,`<div>${notes}</div>`);
  }
  assert.equal(blockEmpty({cue:'',notes:'<div><br></div>'}),true);
});
