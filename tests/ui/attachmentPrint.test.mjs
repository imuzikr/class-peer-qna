import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAttachmentRef } from '@/lib/attachmentRefs';
const source=readFileSync(new URL('../../lib/exportStudy.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('export async function printHtmlDoc('))
  .replace('export async function','async function').replace('await import("./secureImage")','await loadImages()');
const A='attachment:12345678-1234-1234-1234-123456789012';
const B='attachment:abcdef01-1234-1234-1234-123456789012';
function fixture(images, acquire) {
  let printed=0,removed=0,alerts=0;
  const frame={style:{},remove(){removed++;},contentWindow:{document:{images,open(){},write(){},close(){}},focus(){},print(){printed++;}}};
  const timers=[];
  const print=runInNewContext(body+'\nprintHtmlDoc;', {
    document:{createElement:()=>frame,body:{appendChild(){}}},window:{alert(){alerts++;}},
    isAttachmentRef,loadImages:async()=>({acquireSecureImage:acquire}),
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},
  });
  return {print,timers,stats:()=>({printed,removed,alerts})};
}
const image=(src,complete=true,width=1)=>({src,complete,naturalWidth:width,getAttribute:()=>src,addEventListener(){},removeEventListener(){}});

test('print waits for all protected images before error cleanup and releases late successes',async()=>{
  let resolveSlow,released=0;
  const f=fixture([image(A),image(B)],async(src)=>{
    if(src===A)throw new Error('denied');
    await new Promise(resolve=>{resolveSlow=resolve;});
    return {url:'blob:private',release(){released++;}};
  });
  const pending=f.print('<html></html>');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.stats().removed,0,'must not clean up before late acquisitions settle');
  resolveSlow();
  assert.equal(await pending,false);
  assert.equal(released,1);
  assert.deepEqual(f.stats(),{printed:0,removed:1,alerts:1});
});
test('already failed ordinary images cancel printing immediately instead of waiting for a missed event',async()=>{
  const f=fixture([image('https://example.com/missing.png',true,0)],()=>{throw new Error('unexpected');});
  assert.equal(await f.print('<html></html>'),false);
  assert.equal(f.timers.length,0);
  assert.equal(f.stats().printed,0);
});
test('successful print uses resolved bytes and releases them after the print call',async()=>{
  let released=0;
  const img=image(A),f=fixture([img],async()=>({url:'blob:private',release(){released++;}}));
  assert.equal(await f.print('<html></html>'),true);
  assert.equal(img.src,'blob:private');assert.equal(f.stats().printed,1);assert.equal(released,0);
  f.timers.find(timer=>timer.ms===1000).fn();assert.equal(released,1);assert.equal(f.stats().removed,1);
});
