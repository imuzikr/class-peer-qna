// Firestore 저장과 첨부 권한 등록은 서로 다른 요청입니다. 본문 저장 뒤 등록만
// 실패했을 때 글을 다시 만들지 않고, 문서 경로와 파일 번호만 보관해 재시도합니다.
import { collectAttachmentRefs } from "./attachmentRefs";

const KEY_PREFIX = "protected_attachment_bindings:v1:";
const transient = (error) => error?.status === 429 || error?.status >= 500
  || /(?:network|unavailable|timeout|deadline|resource-exhausted|internal)/i
    .test(`${error?.code ?? ""} ${error?.message ?? ""}`);

export function createAttachmentBindingQueue({
  bind,
  getUid,
  getStorage = () => null,
  onChange = () => {},
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const queues = new Map();
  const listeners = new Set();
  const retries = new Map();
  const revisions = new Map();
  const revisionKey = (uid, parentPath) => `${uid}\0${parentPath}`;
  const revision = (uid, parentPath) => revisions.get(revisionKey(uid, parentPath)) ?? 0;

  function queue(uid) {
    if (queues.has(uid)) return queues.get(uid);
    const tasks = new Map();
    try {
      const saved = JSON.parse(getStorage()?.getItem(KEY_PREFIX + uid) ?? "null");
      if (saved?.version === 1 && Array.isArray(saved.tasks)) {
        for (const task of saved.tasks) {
          if (typeof task.parentPath !== "string") continue;
          const refs = collectAttachmentRefs(task.refs);
          if (refs.length) tasks.set(task.parentPath, { ...task, refs });
        }
      }
    } catch { /* 저장소가 막혀도 현재 탭의 재시도 대장은 유지합니다. */ }
    queues.set(uid, tasks);
    return tasks;
  }

  function status() {
    const uid = getUid();
    const tasks = uid ? [...queue(uid).values()] : [];
    return {
      uid: uid ?? null,
      pendingCount: tasks.length,
      lastError: tasks.at(-1)?.lastError ?? "",
      retrying: !!uid && retries.has(uid),
    };
  }

  function emit(uid) {
    try {
      const tasks = [...queue(uid).values()];
      const storage = getStorage();
      if (tasks.length) storage?.setItem(KEY_PREFIX + uid, JSON.stringify({ version: 1, tasks }));
      else storage?.removeItem(KEY_PREFIX + uid);
    } catch { /* 메모리 대장과 경고는 남겨 둡니다. 본문은 이미 저장됐습니다. */ }
    if (getUid() !== uid) return;
    const value = status();
    try { onChange(value); } catch { /* 알림 실패가 이미 저장된 글을 실패로 바꾸지 않습니다. */ }
    for (const listener of listeners) {
      try { listener(value); } catch { /* 다른 구독자에게도 상태를 전달합니다. */ }
    }
  }

  function finish(uid, parentPath, refs) {
    const tasks = queue(uid);
    const task = tasks.get(parentPath);
    if (task) {
      const done = new Set(refs);
      const remaining = task.refs.filter((ref) => !done.has(ref));
      if (remaining.length) tasks.set(parentPath, { ...task, refs: remaining });
      else tasks.delete(parentPath);
    }
    emit(uid);
  }

  function forget(parentPath, uid = getUid()) {
    if (!uid) return;
    const key = revisionKey(uid, parentPath);
    revisions.set(key, revision(uid, parentPath) + 1);
    queue(uid).delete(parentPath);
    emit(uid);
  }

  async function tryBind(parentPath, refs, uid) {
    for (let attempt = 0; ; attempt++) {
      try {
        if (getUid() !== uid) {
          throw Object.assign(new Error("로그인 사용자가 바뀌어 첨부파일 연결을 보류했습니다."), {
            code: "attachment/auth-changed",
          });
        }
        await bind(parentPath, refs);
        return;
      } catch (error) {
        if (attempt >= 2 || !transient(error)) throw error;
        await wait(attempt === 0 ? 200 : 600);
      }
    }
  }

  async function afterWrite(parentPath, data, originUid = getUid()) {
    const refs = collectAttachmentRefs(data);
    if (!refs.length) return;
    const uid = originUid;
    // 인증된 Firestore 쓰기가 끝난 직후이므로 정상 경로에서는 uid가 있습니다.
    // 이 사이 로그아웃하면 이전 사용자의 작업을 다음 사용자에게 귀속시키지 않습니다.
    if (!uid) return;
    const startedAt = revision(uid, parentPath);
    try {
      await tryBind(parentPath, refs, uid);
      if (revision(uid, parentPath) !== startedAt) return;
      finish(uid, parentPath, refs);
    } catch (error) {
      // 사용자가 문서를 지운 동안 도착한 실패 응답은 재시도 대장을 되살리지 않습니다.
      if (revision(uid, parentPath) !== startedAt) return;
      const previous = queue(uid).get(parentPath);
      queue(uid).set(parentPath, {
        parentPath,
        refs: [...new Set([...(previous?.refs ?? []), ...refs])],
        lastError: String(error?.message || "첨부파일 권한 등록을 완료하지 못했습니다."),
        updatedAt: Date.now(),
      });
      emit(uid);
      // 본문은 저장됐습니다. addDoc를 실패로 돌려 같은 글이 중복 생성되지
      // 않도록 하고, 화면의 공통 경고와 복구 대장에서 등록 실패를 알립니다.
    }
  }

  async function retry() {
    const uid = getUid();
    if (!uid) return status();
    if (retries.has(uid)) return retries.get(uid);
    const work = (async () => {
      for (const task of [...queue(uid).values()]) {
        if (getUid() !== uid) break;
        if (queue(uid).get(task.parentPath) !== task) continue;
        const startedAt = revision(uid, task.parentPath);
        try {
          await tryBind(task.parentPath, task.refs, uid);
          if (revision(uid, task.parentPath) !== startedAt) continue;
          finish(uid, task.parentPath, task.refs);
        } catch (error) {
          if (revision(uid, task.parentPath) !== startedAt) continue;
          queue(uid).set(task.parentPath, {
            ...task, lastError: String(error?.message || "첨부파일 권한 등록에 실패했습니다."),
            updatedAt: Date.now(),
          });
          emit(uid);
        }
      }
    })();
    retries.set(uid, work);
    emit(uid);
    try { await work; } finally { retries.delete(uid); emit(uid); }
    return status();
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(status());
    return () => listeners.delete(listener);
  }

  return { afterWrite, forget, retry, status, subscribe };
}
