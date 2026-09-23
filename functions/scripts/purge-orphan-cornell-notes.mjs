// =============================================================
// 주인 없는 수업 노트 치우기 (일회성)
// -------------------------------------------------------------
// 탈퇴한 학생의 수업 노트(classes/{반}/cornellNotes/{uid}_날짜)가 남아 있는
// 것을 찾아 지웁니다.
//
// [왜 남았나] 탈퇴 정리(purgeStudentData)는 노트를
// `collectionGroup("cornellNotes").where("uid","==",uid)`로 훑는데, 그
// 질의에 필요한 **컬렉션 그룹 범위 색인**이 firestore.indexes.json에 빠져
// 있었습니다. 그래서 그 한 줄만 `9 FAILED_PRECONDITION`으로 떨어지고
// 나머지(질문·답변·카드·KWLS·과일·누가기록·낱말·알림함·소속·프로필)는
// 정상으로 지워졌습니다. 색인은 넣었으니 **앞으로 탈퇴하는 학생은 이 일이
// 안 생깁니다.** 이 스크립트는 그 전에 이미 남은 것을 치우는 용도라,
// 한 번 돌리고 나면 다시 쓸 일이 없어야 정상입니다.
//
// [왜 남으면 곤란한가] 노트에는 학생이 수업 중에 적은 필기와 선생님이 남긴
// 한 마디가 그대로 들어 있습니다. 탈퇴한 학생의 글이 남아 있는 셈이라
// '탈퇴하면 자료를 지운다'는 약속과 어긋납니다.
//
// [무엇을 '주인 없음'으로 보는가] 노트의 `uid`로 `users/{uid}`를 찾아보고
// **그 프로필이 없으면** 주인 없는 노트입니다. 탈퇴 정리는 프로필을 맨
// 마지막에 지우므로(functions/index.js의 순서), 프로필이 없다는 것은 이미
// 탈퇴 처리가 끝난 계정이라는 뜻입니다.
//   · 반에서만 빠진 학생(프로필은 살아 있음)은 **건드리지 않습니다.**
//     그 학생의 노트는 다시 넣으면 그대로 돌아와야 합니다.
//   · 색인이 아직 안 만들어졌어도 이 스크립트는 돕니다 — collectionGroup
//     질의를 안 쓰고 반을 하나씩 훑기 때문입니다.
//
// [쓰는 법]
//   node functions/scripts/purge-orphan-cornell-notes.mjs            ← 찾아만 보기
//   node functions/scripts/purge-orphan-cornell-notes.mjs --apply    ← 실제 삭제
//   node functions/scripts/purge-orphan-cornell-notes.mjs --uid=xxx  ← 그 학생만
// --apply 없이는 한 건도 지우지 않습니다(다른 스크립트와 같은 약속).
//
// [자격 증명] gcloud 로그인만 있으면 됩니다(Cloud Shell은 이미 되어 있습니다).
//   내부에서 `gcloud auth print-access-token`을 씁니다. 의존성 없이
//   node 내장만 쓰므로 npm install이 필요 없습니다.
//
// [개인정보] 필기·요약·피드백은 **읽지도 찍지도 않습니다.** 노트에서 받아
//   오는 칸은 `uid` 하나뿐이고(mask.fieldPaths), 화면에는 uid와 날짜만
//   적습니다. 이름을 찍으려면 프로필을 읽어야 하는데, 그 프로필이 이미
//   없어서 여기까지 온 것이라 읽을 것도 없습니다.
// =============================================================
import { execSync } from "node:child_process";

const PROJECT_ID = "class-peer-qna";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const APPLY = process.argv.includes("--apply");
const ONLY_UID = (process.argv.find((a) => a.startsWith("--uid=")) ?? "").slice(6);

let token = null;
const auth = () => (token ??= execSync("gcloud auth print-access-token").toString().trim());

async function api(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${auth()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 204) return {};
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${body?.error?.message ?? res.statusText}`);
  return body;
}

// 문서가 있나 — 없으면 404입니다. 위 api()는 404도 예외로 던지므로
// 여기서만 따로 처리합니다(없는 것이 오류가 아니라 답인 자리라서요).
async function docExists(path) {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${auth()}` },
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return true;
}

// `mask`를 주면 그 칸만 받아 옵니다. 노트 본문을 아예 안 가져오려고
// uid 하나만 받습니다.
async function listAll(path, mask = "") {
  const out = [];
  let pageToken = "";
  do {
    const body = await api(
      `${BASE}/${path}?pageSize=300` +
        (mask ? `&mask.fieldPaths=${encodeURIComponent(mask)}` : "") +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "")
    );
    out.push(...(body.documents ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

// 문서 id는 `uid_날짜` 약속이지만, 진짜 값은 `uid` 칸입니다. 칸이 비어 있는
// 옛 기록만 id 앞부분으로 넘겨짚습니다.
function uidOf(doc) {
  const field = doc.fields?.uid?.stringValue;
  if (field) return field;
  const id = doc.name.split("/").pop();
  const cut = id.lastIndexOf("_");
  return cut > 0 ? id.slice(0, cut) : id;
}

async function main() {
  console.log(
    `\n반마다 수업 노트를 훑습니다…${APPLY ? "" : " (찾아만 봅니다 — 아무것도 지우지 않습니다)"}` +
      (ONLY_UID ? `\n대상을 uid ${ONLY_UID} 하나로 좁혔습니다.` : "") +
      "\n"
  );

  const classes = await listAll("classes", "createdAt");
  console.log(`반 ${classes.length}개\n`);

  // uid -> 프로필이 있나 (같은 학생이 여러 반에 있으므로 한 번만 물어봅니다)
  const aliveCache = new Map();
  const alive = async (uid) => {
    if (!aliveCache.has(uid)) aliveCache.set(uid, await docExists(`users/${uid}`));
    return aliveCache.get(uid);
  };

  const orphans = []; // { name, uid, date, classId }
  let scanned = 0;

  for (const cls of classes) {
    const classId = cls.name.split("/").pop();
    const notes = await listAll(`classes/${classId}/cornellNotes`, "uid");
    scanned += notes.length;

    const hits = [];
    for (const n of notes) {
      const uid = uidOf(n);
      if (ONLY_UID && uid !== ONLY_UID) continue;
      if (await alive(uid)) continue; // 프로필이 살아 있으면 주인 있는 노트
      const id = n.name.split("/").pop();
      const cut = id.lastIndexOf("_");
      hits.push({ name: n.name, uid, date: cut > 0 ? id.slice(cut + 1) : "?", classId });
    }

    console.log(`  ${classId}: 노트 ${notes.length}건 · 주인 없는 것 ${hits.length}건`);
    orphans.push(...hits);
  }

  console.log(`\n훑은 노트 ${scanned}건 · 주인 없는 노트 ${orphans.length}건`);

  if (orphans.length === 0) {
    console.log("치울 것이 없습니다.\n");
    return;
  }

  // 누구 것이 몇 건인지 — uid와 날짜 범위만 적습니다(이름·본문 없음).
  const byUid = new Map();
  for (const o of orphans) {
    if (!byUid.has(o.uid)) byUid.set(o.uid, []);
    byUid.get(o.uid).push(o.date);
  }
  console.log("");
  for (const [uid, dates] of byUid) {
    const sorted = [...dates].sort();
    console.log(`  ${uid}  ${dates.length}건  (${sorted[0]} ~ ${sorted[sorted.length - 1]})`);
  }

  if (!APPLY) {
    console.log("\n실제로 지우려면 --apply 를 붙이세요.\n");
    return;
  }

  // 한 건씩 차례로 — 수백 건을 한꺼번에 던지지 않습니다(휴지통 비우기와 같은 약속).
  let done = 0;
  for (const o of orphans) {
    await api(`https://firestore.googleapis.com/v1/${o.name}`, { method: "DELETE" });
    done += 1;
    if (done % 50 === 0) console.log(`  ${done}/${orphans.length}`);
  }
  console.log(`\n${done}건을 지웠습니다.`);
  console.log("다시 돌려 '치울 것이 없습니다'가 나오는지 확인해 주세요.\n");
}

main().catch((e) => {
  console.error("\n실패:", e.message, "\n");
  process.exit(1);
});
