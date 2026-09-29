// 서버 답을 끝없이 기다리지 않게 하는 도우미(lib/ackTimeout.js).
// 저장 단추가 '저장 중…'에 멈추던 신고에서 나왔습니다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withAckTimeout, isAckTimeout, AckTimeoutError } from "@/lib/ackTimeout";

test("제때 끝나면 그 값을 그대로 돌려줍니다", async () => {
  assert.equal(await withAckTimeout(Promise.resolve(42), 50), 42);
});

test("제때 실패하면 그 오류를 그대로 던집니다(시간 초과로 바꾸지 않음)", async () => {
  const err = Object.assign(new Error("거부"), { code: "permission-denied" });
  await assert.rejects(withAckTimeout(Promise.reject(err), 50), (e) => {
    assert.equal(e.code, "permission-denied");
    assert.equal(isAckTimeout(e), false);
    return true;
  });
});

test("답이 영영 안 오면 정해 둔 시간에 AckTimeoutError로 끝납니다", async () => {
  const never = new Promise(() => {});
  const t0 = Date.now();
  await assert.rejects(withAckTimeout(never, 40), (e) => {
    assert.ok(e instanceof AckTimeoutError);
    assert.ok(isAckTimeout(e));
    return true;
  });
  assert.ok(Date.now() - t0 >= 35);
});

test("값이 약속이 아니어도 받습니다", async () => {
  assert.equal(await withAckTimeout(undefined, 50), undefined);
});
