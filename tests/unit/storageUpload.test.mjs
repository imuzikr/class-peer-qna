import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectAttachmentRefs, isAttachmentRef } from "@/lib/attachmentRefs";

const REF = "attachment:12345678-1234-1234-1234-123456789abc";
const source = readFileSync(new URL("../../lib/storageUpload.js", import.meta.url), "utf8")
  .replace(/^import[^;]+;\n/gm, "").replace(/^export /gm, "");
function setup(configured = true) {
  const calls = [];
  const api = runInNewContext(source + "\n({uploadImage,uploadImageBlob,uploadFile,uploadDataUrl,deleteUploadedFile})", {
    isFirebaseConfigured: configured, storage: configured ? {} : null,
    uploadAttachmentBlob: async (...args) => { calls.push(["upload", ...args]); return REF; },
    deleteProtectedAttachment: async (...args) => calls.push(["delete", ...args]),
    readImageAsDataUrl: async () => "data:image/jpeg;base64,DEMO",
    readFileAsDataUrl: async () => "data:application/pdf;base64,DEMO",
    collectAttachmentRefs, isAttachmentRef,
    createImageBitmap: async () => ({ width: 1400, height: 1000, close() {} }),
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob: (fn) => fn(new Blob(["compressed"], { type: "image/jpeg" })) }) },
    fetch: async () => ({ blob: async () => new Blob(["drawing"], { type: "image/png" }) }),
    ref: (_, url) => url, deleteObject: async (url) => calls.push(["legacy-delete", url]), Blob,
  });
  return { api, calls };
}

test("사진·사전 생성 이미지·일반 파일·그림판 네 경로 모두 보호 식별자를 반환합니다", async () => {
  const { api, calls } = setup();
  const file = new Blob(["photo"], { type: "image/png" }); file.name = "photo.png";
  assert.equal(await api.uploadImage(file), REF);
  assert.equal(await api.uploadImageBlob(file, "slide.png"), REF);
  assert.equal(await api.uploadFile(file), REF);
  assert.equal(await api.uploadDataUrl("data:image/png;base64,AAA", "drawing.png"), REF);
  assert.equal(calls.filter(([type]) => type === "upload").length, 4);
  assert.equal(calls[0][1].type, "image/jpeg", "normal photos retain compression");
  assert.equal(calls[1][1], file, "pre-rendered slide keeps original bytes");
});

test("체험 모드는 네 업로드 경로 모두 네트워크 요청 없이 동작합니다", async () => {
  const { api, calls } = setup(false);
  const file = new Blob(["x"]); file.name = "memo.pdf";
  assert.match(await api.uploadImage(file), /^data:image/);
  assert.match(await api.uploadImageBlob(file), /^data:/);
  assert.match(await api.uploadFile(file), /^data:/);
  assert.equal(await api.uploadDataUrl("data:image/png;base64,AAA"), "data:image/png;base64,AAA");
  assert.equal(calls.length, 0);
});

test("보호 파일 정리는 서버를 사용하고 외부 URL은 지우지 않습니다", async () => {
  const { api, calls } = setup();
  await api.deleteUploadedFile(REF);
  await api.deleteUploadedFile("https://external.test/image.jpg");
  assert.deepEqual(calls, [["delete", REF]]);
});
