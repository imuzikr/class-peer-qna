// =============================================================
// 실수로 지운 독서 활동 되살리기 (일회성 · 급할 때)
// -------------------------------------------------------------
// Firestore는 PITR을 켜지 않아도 최근 1시간의 이전 버전을 갖고 있습니다
// (databases describe의 versionRetentionPeriod: 3600s). 이 스크립트는 그
// '지난 시각의 모습'을 REST API의 readTime으로 직접 읽어옵니다.
//
// [왜 gcloud export가 아닌가]
//   gcloud firestore export --snapshot-time 은 PITR이 켜져 있어야만 됩니다
//   ("Point-in-Time Recovery must be enabled..."). 반면 readTime 읽기는
//   보존 기간(1시간) 안이면 PITR 없이도 됩니다. 그래서 이 길로 갑니다.
//
// [무엇보다 먼저 — dump]
//   1시간이 지나면 되살릴 방법이 사라집니다. 되돌리기(restore)는 나중에
//   해도 되지만 dump는 지금 해야 합니다. 파일로 빼 두면 시계에서 벗어납니다.
//
// [쓰는 법]
//   # ① 그때 어떤 활동이 있었는지 보기 (지운 활동의 id를 찾습니다)
//   node functions/scripts/rescue-activity.mjs --at=2026-09-01T06:47:00Z --list
//
//   # ② 그 활동을 통째로 파일에 담기 (모둠·낱말·학생 기록까지)
//   node functions/scripts/rescue-activity.mjs --at=2026-09-01T06:47:00Z --dump=<활동id>
//
//   # ③ 확인한 뒤 되돌리기 (이때만 실제로 씁니다)
//   node functions/scripts/rescue-activity.mjs --restore=rescue-<활동id>.json --apply
//
// [담는 방식] Firestore REST가 주는 그대로(wire format) 담고 그대로 되돌립니다.
//   중간에 JS 값으로 바꾸지 않으므로 시각(timestamp)·숫자 종류까지 원본
//   그대로입니다. 문서 경로(name)도 그대로라 id가 바뀌지 않습니다.
//
// [자격 증명] gcloud 로그인만 있으면 됩니다(Cloud Shell은 이미 되어 있습니다).
//   내부에서 `gcloud auth print-access-token`을 씁니다.
// =============================================================
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const PROJECT_ID = "class-peer-qna";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const AT = arg("at");
const LIST = process.argv.includes("--list");
const DUMP = arg("dump");
const RESTORE = arg("restore");
const APPLY = process.argv.includes("--apply");

let token = null;
function auth() {
  if (!token) token = execSync("gcloud auth print-access-token").toString().trim();
  return token;
}

async function api(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${auth()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message ?? res.statusText;
    throw new Error(`${res.status} ${msg}`);
  }
  return body;
}

// 한 컬렉션의 문서를 그 시각 모습 그대로 — 쪽이 나뉘면 끝까지 따라갑니다.
async function listDocs(collectionPath, readTime) {
  const out = [];
  let pageToken = "";
  do {
    const url =
      `${BASE}/${collectionPath}?pageSize=300` +
      (readTime ? `&readTime=${encodeURIComponent(readTime)}` : "") +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const body = await api(url);
    out.push(...(body.documents ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

// 이 문서 아래에 어떤 하위 컬렉션이 있었는지 — 스키마를 외워 두지 않고
// 그때 있던 것을 그대로 따라갑니다(빠뜨리는 것이 없게).
async function subCollections(docName, readTime) {
  const body = await api(`https://firestore.googleapis.com/v1/${docName}:listCollectionIds`, {
    method: "POST",
    body: JSON.stringify(readTime ? { readTime } : {}),
  });
  return body.collectionIds ?? [];
}

// 문서 하나와 그 아래 전부를 담습니다(깊이 제한 없음).
async function dumpDoc(doc, readTime, depth = 0) {
  const rows = [{ name: doc.name, fields: doc.fields ?? {} }];
  const kids = await subCollections(doc.name, readTime);
  for (const cid of kids) {
    const path = doc.name.split("/documents/")[1];
    const docs = await listDocs(`${path}/${cid}`, readTime);
    console.log(`${"  ".repeat(depth + 1)}${cid}: ${docs.length}개`);
    for (const d of docs) rows.push(...(await dumpDoc(d, readTime, depth + 1)));
  }
  return rows;
}

async function main() {
  if (RESTORE) return restore();
  if (!AT) {
    console.error("--at=<RFC3339 시각>이 필요합니다. 예: --at=2026-09-01T06:47:00Z");
    console.error("그 시각은 databases describe의 earliestVersionTime 이후여야 합니다.");
    process.exit(1);
  }

  if (LIST) {
    const docs = await listDocs("bookActivities", AT);
    console.log(`\n${AT} 시점의 독서 활동 ${docs.length}개\n`);
    for (const d of docs) {
      const f = d.fields ?? {};
      const v = (k) => f[k]?.stringValue ?? "";
      console.log(
        `  ${d.name.split("/").pop().padEnd(24)} ${(v("type") || "?").padEnd(10)} ` +
        `${v("title")}${v("topic") ? ` · ${v("topic")}` : ""}  [반 ${v("classId")}]`
      );
    }
    console.log("\n지운 활동의 id를 골라 --dump=<id> 로 담으세요.\n");
    return;
  }

  if (!DUMP) {
    console.error("--list 로 활동을 찾거나 --dump=<활동id> 로 담으세요.");
    process.exit(1);
  }

  console.log(`\n${AT} 시점의 활동 ${DUMP} 을(를) 담습니다…\n`);
  const docs = await listDocs("bookActivities", AT);
  const target = docs.find((d) => d.name.endsWith(`/${DUMP}`));
  if (!target) {
    console.error(`그 시각에 ${DUMP} 활동이 없습니다. --list 로 id를 다시 확인해 주세요.`);
    process.exit(1);
  }
  const rows = await dumpDoc(target, AT);
  const file = `rescue-${DUMP}.json`;
  writeFileSync(file, JSON.stringify({ project: PROJECT_ID, readTime: AT, docs: rows }, null, 2));
  console.log(`\n문서 ${rows.length}개를 ${file} 에 담았습니다.`);
  console.log("이제 1시간 시계에서 벗어났습니다. 내용을 확인한 뒤 --restore 로 되돌리세요.\n");
}

async function restore() {
  const data = JSON.parse(readFileSync(RESTORE, "utf8"));
  const rows = data.docs ?? [];
  console.log(`\n${RESTORE} — 문서 ${rows.length}개${APPLY ? "" : " (미리보기: 아무것도 쓰지 않습니다)"}\n`);

  // 이미 있는 문서를 덮어쓰지 않는지 먼저 봅니다 — 같은 id로 다시 만들어
  // 두었다면 그것을 지워 버리는 셈이 되므로, 그때는 멈추고 알립니다.
  const clashes = [];
  for (const r of rows) {
    try {
      await api(`https://firestore.googleapis.com/v1/${r.name}`);
      clashes.push(r.name.split("/documents/")[1]);
    } catch (e) {
      if (!String(e.message).startsWith("404")) throw e;
    }
  }
  if (clashes.length > 0) {
    console.log(`⚠ 이미 있는 문서 ${clashes.length}개 — 되돌리면 지금 값이 옛 값으로 덮입니다:`);
    for (const c of clashes.slice(0, 10)) console.log(`   ${c}`);
    if (clashes.length > 10) console.log(`   … 그 밖 ${clashes.length - 10}개`);
    console.log("");
  }

  if (!APPLY) {
    for (const r of rows.slice(0, 15)) console.log(`  ${r.name.split("/documents/")[1]}`);
    if (rows.length > 15) console.log(`  … 그 밖 ${rows.length - 15}개`);
    console.log("\n실제로 되돌리려면 --apply 를 붙이세요.\n");
    return;
  }

  let done = 0;
  for (const r of rows) {
    await api(`https://firestore.googleapis.com/v1/${r.name}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: r.fields }),
    });
    done += 1;
    if (done % 50 === 0) console.log(`  ${done}/${rows.length}`);
  }
  console.log(`\n문서 ${done}개를 되돌렸습니다. 앱에서 활동이 보이는지 확인해 주세요.\n`);
}

main().catch((e) => {
  console.error("\n실패:", e.message, "\n");
  process.exit(1);
});
