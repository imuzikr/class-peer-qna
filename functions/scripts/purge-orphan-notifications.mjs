// =============================================================
// 주인 없는 알림함 치우기 (일회성)
// -------------------------------------------------------------
// users/{uid} 문서는 지워졌는데 그 아래 notifications만 남은 것들을 찾아
// 지웁니다. Firestore는 문서를 지워도 하위 컬렉션을 함께 지우지 않아서,
// 탈퇴 처리에 알림함이 빠져 있던 동안 이렇게 남았습니다(콘솔에서 기울임꼴로
// 뜨는 '존재하지 않는 문서'가 그것입니다).
//
// 원인 자체는 functions/index.js의 purgeStudentData에 알림함 정리를 넣어
// 막았습니다. 이 스크립트는 그 전에 이미 남은 것을 치우는 용도라, 한 번
// 돌리고 나면 다시 쓸 일이 없어야 정상입니다.
//
// [왜 남으면 곤란한가] 반 공지 알림에는 보낸 교사의 실명과 공지 본문이
// 들어 있습니다. 탈퇴한 학생의 알림함에 그것이 남아 있는 셈이라,
// '탈퇴하면 자료를 지운다'는 약속과 어긋납니다.
//
// [쓰는 법]
//   node functions/scripts/purge-orphan-notifications.mjs           ← 찾아만 보기
//   node functions/scripts/purge-orphan-notifications.mjs --apply   ← 실제 삭제
// --apply 없이는 한 건도 지우지 않습니다(다른 스크립트와 같은 약속).
//
// [자격 증명] gcloud 로그인만 있으면 됩니다(Cloud Shell은 이미 되어 있습니다).
//   내부에서 `gcloud auth print-access-token`을 씁니다. 의존성 없이
//   node 내장만 쓰므로 npm install이 필요 없습니다.
//
// [개인정보] 프로필 내용은 읽지도 찍지도 않습니다. 문서가 '있는지 없는지'와
//   경로만 봅니다.
// =============================================================
import { execSync } from "node:child_process";

const PROJECT_ID = "class-peer-qna";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const APPLY = process.argv.includes("--apply");

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

// showMissing=true 를 주면 '문서는 없지만 하위 컬렉션이 있는 자리'까지
// 함께 돌려줍니다. 그것이 바로 우리가 찾는 주인 없는 알림함입니다.
// (실재하는 문서에는 createTime이 있고, 없는 자리에는 name만 옵니다)
async function listUserSlots() {
  const out = [];
  let pageToken = "";
  do {
    const body = await api(
      `${BASE}/users?showMissing=true&pageSize=300` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "")
    );
    out.push(...(body.documents ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

async function listAll(path) {
  const out = [];
  let pageToken = "";
  do {
    const body = await api(
      `${BASE}/${path}?pageSize=300` + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "")
    );
    out.push(...(body.documents ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

async function subCollections(docName) {
  const body = await api(`https://firestore.googleapis.com/v1/${docName}:listCollectionIds`, {
    method: "POST",
    body: "{}",
  });
  return body.collectionIds ?? [];
}

async function main() {
  console.log(`\nusers 컬렉션을 훑습니다…${APPLY ? "" : " (찾아만 봅니다 — 아무것도 지우지 않습니다)"}\n`);
  const slots = await listUserSlots();
  const missing = slots.filter((d) => !d.createTime);
  console.log(`전체 자리 ${slots.length}개 · 그중 주인 없는 자리 ${missing.length}개\n`);

  if (missing.length === 0) {
    console.log("치울 것이 없습니다.\n");
    return;
  }

  let total = 0;
  const jobs = [];
  for (const slot of missing) {
    const uid = slot.name.split("/").pop();
    // 스키마를 외우지 않고 그 자리에 실제로 뭐가 달렸는지 따라갑니다.
    const kids = await subCollections(slot.name);
    for (const cid of kids) {
      const docs = await listAll(`users/${uid}/${cid}`);
      total += docs.length;
      jobs.push({ uid, cid, docs });
      console.log(`  ${uid}  ${cid}: ${docs.length}건`);
    }
  }

  console.log(`\n합계 ${total}건`);
  if (!APPLY) {
    console.log("실제로 지우려면 --apply 를 붙이세요.\n");
    return;
  }

  let done = 0;
  for (const job of jobs) {
    for (const d of job.docs) {
      await api(`https://firestore.googleapis.com/v1/${d.name}`, { method: "DELETE" });
      done += 1;
      if (done % 50 === 0) console.log(`  ${done}/${total}`);
    }
  }
  console.log(`\n${done}건을 지웠습니다.`);
  console.log("콘솔에서 기울임꼴 문서가 사라졌는지 확인해 주세요.\n");
}

main().catch((e) => {
  console.error("\n실패:", e.message, "\n");
  process.exit(1);
});
