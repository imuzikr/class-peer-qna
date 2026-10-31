import { test } from "node:test";
import assert from "node:assert/strict";
import { createSecureImageCache } from "@/lib/secureImageCache";

const ref = (id) => `attachment:${String(id).padStart(16, "0")}`;
const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup(options = {}) {
  const fetched = [], revoked = [];
  let uid = "alice", time = 0, serial = 0;
  const cache = createSecureImageCache({
    fetchBlob: async (src) => { fetched.push(src); return new Blob([src], { type: "image/jpeg" }); },
    createObjectURL: () => `blob:${++serial}`, revokeObjectURL: (url) => revoked.push(url),
    sessionKey: () => uid, now: () => time, ...options,
  });
  return { cache, fetched, revoked, setUid: (next) => { uid = next; }, setTime: (next) => { time = next; } };
}

test("같은 보호 이미지를 여러 화면이 동시에 요청하면 한 번만 내려받습니다", async () => {
  const { cache, fetched } = setup();
  const a = cache.acquire(ref(1)), b = cache.acquire(ref(1));
  assert.deepEqual(await a, await b);
  assert.equal(fetched.length, 1);
  a.release(); b.release();
  const again = cache.acquire(ref(1));
  assert.equal((await again).status, "ready");
  assert.equal(fetched.length, 1);
  again.release();
});

test("실패한 읽기는 캐시하지 않아 권한이 생기면 다시 내려받습니다", async () => {
  let calls = 0;
  const { cache } = setup({ fetchBlob: async () => { calls++; if (calls === 1) throw { status: 403 }; return new Blob(["allowed"]); } });
  const first = cache.acquire(ref(1));
  assert.equal((await first).reason, "denied");
  first.release();
  const second = cache.acquire(ref(1));
  assert.equal((await second).status, "ready");
  assert.equal(calls, 2);
  second.release();
});

test("사용자가 바뀌면 이전 Blob을 폐기하고 같은 파일도 새 권한으로 요청합니다", async () => {
  const { cache, fetched, revoked, setUid } = setup();
  const oldLease = cache.acquire(ref(1));
  const old = await oldLease;
  setUid("bob");
  const nextLease = cache.acquire(ref(1));
  const next = await nextLease;
  assert.notEqual(next.url, old.url);
  assert.deepEqual(revoked, [old.url]);
  assert.equal(fetched.length, 2);
  // 이전 React 효과의 cleanup이 새 사용자의 사용 표시를 감소시키면 안 됩니다.
  oldLease.release();
  cache.clear();
  assert.deepEqual(revoked, [old.url, next.url]);
  nextLease.release();
});

test("로그아웃 중 내려받던 파일의 결과는 Blob URL을 만들지 않고 버립니다", async () => {
  let finish, made = 0, signal;
  const { cache } = setup({ fetchBlob: (_, options) => { signal = options.signal; return new Promise((resolve) => { finish = resolve; }); },
    createObjectURL: () => { made++; return "blob:private"; } });
  const lease = cache.acquire(ref(1));
  await tick();
  cache.clear();
  assert.equal(signal.aborted, true);
  finish(new Blob(["private"]));
  assert.equal((await lease).reason, "cancelled");
  assert.equal(made, 0);
  lease.release();
});

test("화면이 닫히면 사용하지 않는 진행 중 요청을 취소합니다", async () => {
  let signal;
  const { cache } = setup({ fetchBlob: (_, options) => { signal = options.signal; return new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error(), { name: "AbortError" })))); } });
  const lease = cache.acquire(ref(1));
  await tick();
  lease.release();
  assert.equal(signal.aborted, true);
  assert.equal((await lease).reason, "cancelled");
  assert.equal(cache.stats().entries, 0);
});

test("LRU는 화면에서 사용 중인 그림을 유지하고 비활성 그림부터 버립니다", async () => {
  const { cache, revoked } = setup({ maxEntries: 2 });
  const pinned = cache.acquire(ref(1)); const a = await pinned;
  const idle = cache.acquire(ref(2)); const b = await idle; idle.release();
  const third = cache.acquire(ref(3)); await third;
  assert.deepEqual(revoked, [b.url]);
  assert(!revoked.includes(a.url));
  pinned.release(); third.release();
});

test("비활성 캐시 수명이 지나면 현재 사용자 권한으로 다시 확인합니다", async () => {
  const { cache, fetched, setTime } = setup({ maxAge: 100 });
  const first = cache.acquire(ref(1)); await first; first.release();
  setTime(101);
  const next = cache.acquire(ref(1)); await next; next.release();
  assert.equal(fetched.length, 2);
});

test("많은 이미지를 한꺼번에 열어도 동시 다운로드 수를 제한합니다", async () => {
  let current = 0, peak = 0;
  const finish = [];
  const { cache } = setup({ maxConcurrent: 2, fetchBlob: () => new Promise((resolve) => {
    current++; peak = Math.max(peak, current);
    finish.push(() => { current--; resolve(new Blob(["x"])); });
  }) });
  const leases = [1, 2, 3, 4].map((id) => cache.acquire(ref(id)));
  await tick(); assert.equal(finish.length, 2);
  finish.shift()(); await tick(); assert.equal(peak, 2);
  while (finish.length) { finish.shift()(); await tick(); }
  await Promise.all(leases);
  assert.equal(peak, 2);
  leases.forEach((lease) => lease.release());
});

test("일반 HTTPS·체험 이미지·정적 그림은 그대로, 잘못된 식별자는 거부합니다", async () => {
  const { cache, fetched } = setup();
  for (const src of ["https://example.com/a.jpg", "data:image/png;base64,AAA", "/fruit/apple.png"]) {
    assert.equal((await cache.acquire(src)).url, src);
  }
  for (const src of ["javascript:alert(1)", "attachment:x", "//evil.test/a.png"]) {
    assert.equal((await cache.acquire(src)).reason, "invalid");
  }
  assert.equal(fetched.length, 0);
});

test("연결 성공 알림은 이미 받은 이미지의 캐시나 사용 중 다운로드를 취소하지 않습니다", async () => {
  const { cache, fetched, revoked } = setup();
  const lease = cache.acquire(ref(1)); const value = await lease;
  const events = [];
  const unsubscribe = cache.subscribe((event) => events.push(event));
  cache.notify([ref(1)]);
  const second = cache.acquire(ref(1));
  assert.equal((await second).url, value.url);
  assert.equal(fetched.length, 1);
  assert.equal(revoked.length, 0);
  assert.deepEqual(events, [{ type: "retry", refs: [ref(1)] }]);
  unsubscribe(); lease.release(); second.release();
});
