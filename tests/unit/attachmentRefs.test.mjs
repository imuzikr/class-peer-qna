import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentId, attachmentRef, collectAttachmentRefs, isAttachmentRef, parseLegacyStorageUrl } from "@/lib/attachmentRefs";

const ID = "12345678-1234-1234-1234-123456789abc";
const REF = `attachment:${ID}`;

test("첨부 식별자는 한 개의 엄격한 값이며 실행 주소·경로·부분 일치를 받지 않습니다", () => {
  assert.equal(attachmentId(REF), ID);
  assert.equal(attachmentRef(ID), REF);
  for (const input of ["attachment:x", `${REF}/secret`, `${REF}?token=x`, " attachment:" + ID,
    "attachment:" + "x".repeat(129), "javascript:alert(1)", "https://example.com/a.jpg", null]) {
    assert.equal(isAttachmentRef(input), false, String(input));
  }
});

test("HTML·이미지 배열·마인드맵의 식별자를 원본 변경 없이 중복 제거해 모읍니다", () => {
  const second = "attachment:abcdefghijklmnop";
  const data = { imageUrl: REF, attachments: [{ dataUrl: REF }], content: `<p><img src="${second}"></p>`,
    answers: { nodes: [{ image: REF }] }, invalid: "attachment:" + "z".repeat(129) };
  const before = JSON.stringify(data);
  assert.deepEqual(collectAttachmentRefs(data), [REF, second]);
  assert.equal(JSON.stringify(data), before);
  data.loop = data;
  assert.deepEqual(collectAttachmentRefs(data), [REF, second]);
});

test("기존 URL 이관 판별은 지정한 버킷의 정상 uploads 경로만 받습니다", () => {
  const bucket = "our-bucket.firebasestorage.app";
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent("uploads/student/a.jpg")}?alt=media&token=old`;
  assert.deepEqual(parseLegacyStorageUrl(url, bucket), { bucket, path: "uploads/student/a.jpg" });
  for (const bad of [url.replace(bucket, "another"), url.replace("https:", "http:"),
    url.replace("firebasestorage.googleapis.com", "firebasestorage.googleapis.com.evil.test"),
    url.replace("uploads%2Fstudent%2Fa.jpg", "uploads%2F..%2Fa.jpg"),
    url.replace("uploads%2Fstudent%2Fa.jpg", "uploads%2Fstudent%2F%00.jpg")]) {
    assert.equal(parseLegacyStorageUrl(bad, bucket), null);
  }
});
