// Firestore 문서가 먼저 존재해야 서버가 실제 본문과 읽기 권한을 검증할 수 있습니다.
// 모든 첨부 저장 경로가 아래 공통 처리기를 거치게 하여 복사·방송도 빠뜨리지 않습니다.
import {
  addDoc as firebaseAddDoc,
  setDoc as firebaseSetDoc,
  updateDoc as firebaseUpdateDoc,
  deleteDoc as firebaseDeleteDoc,
  writeBatch as firebaseWriteBatch,
} from "firebase/firestore";
import { auth } from "../firebase";
import { registerAttachmentsForDocument } from "../attachments";
import { createAttachmentBindingQueue } from "../attachmentBindingQueue";

const bindings = createAttachmentBindingQueue({
  bind: registerAttachmentsForDocument,
  getUid: () => auth?.currentUser?.uid ?? null,
  getStorage: () => typeof window === "undefined" ? null : window.sessionStorage,
  onChange: (status) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("attachment-bindings-changed", { detail: status }));
    }
  },
});

export const retryPendingAttachmentBindings = () => bindings.retry();
export const getAttachmentBindingStatus = () => bindings.status();
export const subscribeAttachmentBindingStatus = (listener) => bindings.subscribe(listener);

export async function addDoc(collectionRef, data) {
  const uid = auth?.currentUser?.uid ?? null;
  const ref = await firebaseAddDoc(collectionRef, data);
  await bindings.afterWrite(ref.path, data, uid);
  return ref;
}

export async function setDoc(ref, data, ...options) {
  const uid = auth?.currentUser?.uid ?? null;
  await firebaseSetDoc(ref, data, ...options);
  await bindings.afterWrite(ref.path, data, uid);
}

export async function updateDoc(ref, data, ...values) {
  const uid = auth?.currentUser?.uid ?? null;
  await firebaseUpdateDoc(ref, data, ...values);
  await bindings.afterWrite(ref.path, [data, ...values], uid);
}

export async function deleteDoc(ref) {
  const uid = auth?.currentUser?.uid ?? null;
  await firebaseDeleteDoc(ref);
  bindings.forget(ref.path, uid);
}

export function writeBatch(db) {
  const uid = auth?.currentUser?.uid ?? null;
  const batch = firebaseWriteBatch(db);
  const operations = new Map();
  function rememberWrite(ref, data) {
    const previous = operations.get(ref.path);
    const values = previous?.kind === "write" ? previous.data : [];
    operations.set(ref.path, { kind: "write", data: [...values, data] });
  }
  const wrapper = {
    set(ref, data, ...options) {
      batch.set(ref, data, ...options);
      rememberWrite(ref, data);
      return wrapper;
    },
    update(ref, data, ...values) {
      batch.update(ref, data, ...values);
      rememberWrite(ref, [data, ...values]);
      return wrapper;
    },
    delete(ref) {
      batch.delete(ref);
      operations.set(ref.path, { kind: "delete" });
      return wrapper;
    },
    async commit() {
      const result = await batch.commit();
      // 한 문서를 여러 번 수정한 배치도 등록 요청은 한 번만 보냅니다.
      await Promise.all([...operations].map(([path, operation]) => operation.kind === "delete"
        ? bindings.forget(path, uid)
        : bindings.afterWrite(path, operation.data, uid)));
      return result;
    },
  };
  return wrapper;
}
