import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentDownloadName, createAttachmentTransport } from "@/lib/attachmentTransport";

const REF = "attachment:12345678-1234-1234-1234-123456789abc";
function setup(fetchImpl, extra = {}) {
  let uid = "student";
  return { transport: createAttachmentTransport({ baseUrl: "https://gateway.test/attachmentGateway/",
    getCredentials: async () => ({ uid: "student", token: "cached-id-token", appCheckToken: "app-check" }),
    getSessionKey: () => uid, fetchImpl, ...extra }), setUid: (value) => { uid = value; } };
}

test("업로드는 인증된 바이너리 요청 한 번으로 식별자를 돌려주고 공개 URL을 만들지 않습니다", async () => {
  const calls = [], progress = [];
  const { transport } = setup(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ ref: REF });
  });
  const blob = new Blob(["image"], { type: "image/jpeg" });
  assert.equal(await transport.upload(blob, "우리 사진.jpg", { onProgress: (v) => progress.push(v) }), REF);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/upload?name=" + encodeURIComponent("우리 사진.jpg")));
  assert.equal(calls[0].options.body, blob);
  assert.equal(calls[0].options.headers.Authorization, "Bearer cached-id-token");
  assert.equal(calls[0].options.headers["X-Firebase-AppCheck"], "app-check");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.cache, "no-store");
  assert.deepEqual(progress, [0, 1]);
});

test("문서 연결은 100개 단위로 나누고 식별자가 없으면 인증·네트워크 요청을 하지 않습니다", async () => {
  const calls = [];
  const { transport } = setup(async (url, options) => { calls.push(JSON.parse(options.body)); return Response.json({ ok: true }); });
  await transport.bind("questions/q", []);
  assert.equal(calls.length, 0);
  const refs = Array.from({ length: 205 }, (_, i) => `attachment:${String(i).padStart(16, "0")}`);
  await transport.bind("questions/q", refs);
  assert.deepEqual(calls.map((call) => call.refs.length), [100, 100, 5]);
  assert.deepEqual(calls.flatMap((call) => call.refs), refs);
  assert.ok(calls.every((call) => call.parentPath === "questions/q"));
});

test("권한 거부는 서버 이유 그대로 전달하며 공개 다운로드로 재시도하지 않습니다", async () => {
  let calls = 0;
  const { transport } = setup(async () => { calls++; return Response.json({ error: { code: "attachment-denied", message: "권한 없음" } }, { status: 403 }); });
  await assert.rejects(transport.blob(REF), (error) => error.status === 403 && error.code === "attachment-denied");
  assert.equal(calls, 1);
});

test("로그인하지 않은 사용자는 업로드·다운로드 전에 거부됩니다", async () => {
  let calls = 0;
  const { transport } = setup(async () => { calls++; }, { getCredentials: async () => null });
  await assert.rejects(transport.blob(REF), (error) => error.status === 401);
  await assert.rejects(transport.upload(new Blob(["x"]), "x"), (error) => error.status === 401);
  assert.equal(calls, 0);
});

test("다운로드 도중 사용자가 바뀌면 이전 사용자의 바이트를 반환하지 않습니다", async () => {
  let finish;
  const { transport, setUid } = setup(async () => new Response(new ReadableStream({ start(controller) { finish = () => { controller.enqueue(new TextEncoder().encode("private")); controller.close(); }; } })));
  const pending = transport.blob(REF);
  await new Promise((resolve) => setImmediate(resolve));
  setUid("another-student");
  finish();
  await assert.rejects(pending, (error) => error.code === "attachment/session-changed");
});

test("업로드 진행률은 서버의 성공 응답 전에는 완료로 표시하지 않습니다", async () => {
  const progress = [];
  let xhr;
  const { transport } = setup(null, { xhrFactory: () => (xhr = { upload: {}, open() {}, setRequestHeader() {},
    send() { this.upload.onprogress({ lengthComputable: true, loaded: 10, total: 10 }); }, abort() { this.onabort?.(); } }) });
  const pending = transport.upload(new Blob(["private"]), "memo.txt", { onProgress: (v) => progress.push(v) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(progress, [0, 0.95]);
  xhr.status = 200; xhr.responseText = JSON.stringify({ ref: REF }); xhr.onload();
  assert.equal(await pending, REF);
  assert.equal(progress.at(-1), 1);
});

test("서버가 공개 URL이나 잘못된 값을 반환해도 저장하지 않습니다", async () => {
  const { transport } = setup(async () => Response.json({ ref: "https://bucket.test/a?token=leak" }));
  await assert.rejects(transport.upload(new Blob(["x"]), "x.txt"), (error) => error.code === "attachment/invalid-response");
});

test("인증 다운로드는 한글 파일명을 보존하고 경로·제어 문자를 제거합니다", async () => {
  assert.equal(attachmentDownloadName("attachment; filename*=UTF-8''" + encodeURIComponent("수업 자료.pdf")), "수업 자료.pdf");
  assert.equal(attachmentDownloadName('attachment; filename="../secret.html"'), ".._secret.html");
  const { transport } = setup(async () => new Response("pdf", { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent("내 기록.pdf"),
  } }));
  const blob = await transport.blob(REF);
  assert.equal(blob.type, "application/pdf");
  assert.equal(blob.attachmentName, "내 기록.pdf");
});

function clock() {
  const tasks = [], cleared = [];
  return { tasks, cleared, setTimer: (callback, ms) => { const task = { callback, ms }; tasks.push(task); return task; },
    clearTimer: (task) => cleared.push(task) };
}

test("응답이 영영 오지 않는 다운로드도 60초 뒤 취소하고 제한 시간 오류로 끝납니다", async () => {
  const timer = clock(); let signal;
  const { transport } = setup(async (_, options) => { signal = options.signal; return new Promise(() => {}); }, timer);
  const pending = transport.blob(REF);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timer.tasks[0].ms, 60_000);
  timer.tasks[0].callback();
  await assert.rejects(pending, (error) => error.code === "attachment/timeout" && error.status === 408);
  assert.equal(signal.aborted, true);
  assert.deepEqual(timer.cleared, timer.tasks);
});

test("다운로드 헤더가 와도 본문이 멈추면 같은 제한 시간으로 취소합니다", async () => {
  const timer = clock(); let signal;
  const { transport } = setup(async (_, options) => {
    signal = options.signal;
    return new Response(new ReadableStream({ start() {} }));
  }, timer);
  const pending = transport.blob(REF);
  await new Promise((resolve) => setImmediate(resolve));
  timer.tasks[0].callback();
  await assert.rejects(pending, (error) => error.code === "attachment/timeout");
  assert.equal(signal.aborted, true);
});

test("외부 취소 signal도 내부 fetch로 전달되고 타이머를 정리합니다", async () => {
  const timer = clock(), controller = new AbortController(); let signal;
  const { transport } = setup(async (_, options) => { signal = options.signal; return new Promise(() => {}); }, timer);
  const pending = transport.blob(REF, { signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  assert.equal(signal.aborted, true);
  assert.deepEqual(timer.cleared, timer.tasks);
});

test("인증 대기 자체가 멈추면 시간 초과 뒤 늦게 인증되어도 요청을 보내지 않습니다", async () => {
  const timer = clock(); let finish; let calls = 0;
  const { transport } = setup(async () => { calls++; }, { ...timer,
    getCredentials: () => new Promise((resolve) => { finish = resolve; }) });
  const pending = transport.bind("questions/q", [REF]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timer.tasks[0].ms, 30_000);
  timer.tasks[0].callback();
  await assert.rejects(pending, (error) => error.code === "attachment/timeout");
  finish({ uid: "student", token: "late" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 0);
});

test("XHR 업로드는 120초 제한과 ontimeout을 처리하고 완료 진행률을 내보내지 않습니다", async () => {
  const timer = clock(), progress = []; let xhr;
  const { transport } = setup(null, { ...timer, xhrFactory: () => (xhr = { upload: {}, open() {}, setRequestHeader() {}, send() {}, abort() { this.onabort?.(); } }) });
  const pending = transport.upload(new Blob(["x"]), "x.txt", { onProgress: (value) => progress.push(value) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(xhr.timeout, 120_000);
  assert.equal(timer.tasks[0].ms, 120_000);
  xhr.ontimeout();
  await assert.rejects(pending, (error) => error.code === "attachment/timeout");
  assert.deepEqual(progress, [0]);
  assert.deepEqual(timer.cleared, timer.tasks);
});

test("XHR 업로드 외부 취소는 실제 xhr.abort를 호출하고 요청을 끝냅니다", async () => {
  const timer = clock(), controller = new AbortController(); let aborts = 0;
  const { transport } = setup(null, { ...timer, xhrFactory: () => ({ upload: {}, open() {}, setRequestHeader() {}, send() {}, abort() { aborts++; this.onabort?.(); } }) });
  const pending = transport.upload(new Blob(["x"]), "x.txt", { signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  assert.equal(aborts, 1);
  assert.deepEqual(timer.cleared, timer.tasks);
});
