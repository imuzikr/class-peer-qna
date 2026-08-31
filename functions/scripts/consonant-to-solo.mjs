// =============================================================
// 닿소리 채우기 — 모둠 활동을 '개별 활동'으로 옮기기 (일회성)
// -------------------------------------------------------------
// 이미 모둠으로 진행한 활동을, 학생마다 판이 하나씩 있는 개별 활동으로
// 바꿉니다. 학생이 넣은 낱말은 그대로 자기 판으로 따라갑니다.
//
// [왜 앱이 아니라 스크립트인가]
// 낱말 생성 규칙이 "작성자 == 쓰는 사람"을 요구합니다(firestore.rules의
// words create). 그래서 교사가 학생 낱말을 옮겨 적으면 작성자가 교사로
// 바뀌어 버립니다. 규칙을 풀면 교사가 언제든 학생 이름으로 글을 만들 수
// 있게 되므로, 일회성 이사 하나 때문에 그 권한을 상시로 여는 대신
// admin SDK(규칙 우회)로 한 번만 처리합니다.
//
// [쓰는 법]
//   node functions/scripts/consonant-to-solo.mjs                 ← 활동 목록 보기
//   node functions/scripts/consonant-to-solo.mjs <활동id>          ← 미리보기
//   node functions/scripts/consonant-to-solo.mjs <활동id> --apply  ← 실제 전환
// 학생 제출물을 다루는 일이라 --apply를 명시하지 않으면 절대 쓰지 않습니다.
//
// [안전한 순서]
// 새 판을 먼저 만들고 → 낱말을 복사하고 → 개수가 맞는지 확인한 뒤 →
// 옛 모둠을 지웁니다. 중간에 멈춰도 원본이 남아 있어 다시 돌리면 됩니다.
// 새 판 id는 solo_<uid>라 옛 모둠(group_N)과 겹치지 않습니다.
//
// [자격 증명] — kwls-backfill.mjs와 같습니다
//   · GOOGLE_APPLICATION_CREDENTIALS=<서비스 계정 키.json>
//   · gcloud auth application-default login
// =============================================================
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "class-peer-qna";
const APPLY = process.argv.includes("--apply");
const ACT_ID = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? null;

function fmtDate(ts) {
  const d = ts && typeof ts.toDate === "function" ? ts.toDate() : null;
  return d ? d.toISOString().slice(0, 10) : "날짜 없음";
}

// 활동 id를 모를 때 — 닿소리 활동을 죽 보여 주고 고르게 합니다.
async function listActivities(db) {
  const snap = await db.collection("bookActivities").where("type", "==", "consonant").get();
  if (snap.empty) {
    console.log("닿소리 채우기 활동이 없습니다.\n");
    return;
  }
  console.log("닿소리 채우기 활동 목록 — 옮길 활동의 id를 골라 다시 실행하세요.\n");
  for (const d of snap.docs) {
    const a = d.data();
    const groups = await d.ref.collection("groups").get();
    let words = 0;
    for (const g of groups.docs) words += (await g.ref.collection("words").get()).size;
    console.log(
      `  ${d.id}\n` +
        `    ${a.title ?? "제목 없음"} · 주제 ${a.topic ?? "-"} · ${fmtDate(a.createdAt)}\n` +
        `    방식 ${a.groupMode ?? "teacher"} · 판 ${groups.size}개 · 낱말 ${words}개\n`
    );
  }
  console.log(`실행: node functions/scripts/consonant-to-solo.mjs <활동id>\n`);
}

// db를 밖에서 받습니다 — 가짜 db를 물려 계획 부분만 따로 돌려 볼 수 있게
// (학생 데이터를 다루는 스크립트라, 처음 실행이 실제 데이터가 되면 안 됩니다).
export async function runConvert(db, actId, { apply = false, projectId = PROJECT_ID } = {}) {
  console.log(`\n대상 프로젝트: ${projectId}`);
  console.log(apply ? "모드: 실제 쓰기(--apply)\n" : "모드: 미리보기 (아무것도 쓰지 않습니다)\n");

  const actRef = db.doc(`bookActivities/${actId}`);
  const actSnap = await actRef.get();
  if (!actSnap.exists) throw new Error(`활동을 찾지 못했습니다: ${actId}`);
  const act = actSnap.data();

  if (act.type !== "consonant") {
    throw new Error(`닿소리 채우기 활동이 아닙니다 (type: ${act.type}).`);
  }
  if (act.groupMode === "solo") {
    console.log("이미 개별 활동입니다. 옮길 것이 없습니다.\n");
    return;
  }
  console.log(`활동: ${act.title ?? "제목 없음"} · 주제 ${act.topic ?? "-"} · 반 ${act.classId}\n`);

  // ── 1) 지금 있는 판과 낱말을 모두 읽습니다 ──
  const groupsSnap = await actRef.collection("groups").get();
  const oldGroups = [];
  const words = [];
  for (const g of groupsSnap.docs) {
    const wSnap = await g.ref.collection("words").get();
    oldGroups.push({ id: g.id, data: g.data(), wordCount: wSnap.size });
    wSnap.docs.forEach((w) => words.push({ id: w.id, data: w.data() }));
  }
  console.log(`지금: 모둠 ${oldGroups.length}개 · 낱말 ${words.length}개`);

  // ── 2) 옮겨 갈 학생 명단 ──
  // 반 명단(memberships)이 기준입니다. 여기에, 반을 떠났지만 낱말을 남긴
  // 사람도 더합니다 — 그러지 않으면 그 낱말이 조용히 사라집니다.
  const roster = new Map(); // uid -> { uid, name, studentId, emoji, fromRoster }
  if (act.classId) {
    const mems = await db.collection("memberships").where("classId", "==", act.classId).get();
    for (const m of mems.docs) {
      const uid = m.data().uid;
      if (!uid) continue;
      const u = (await db.doc(`users/${uid}`).get()).data() ?? {};
      roster.set(uid, {
        uid,
        name: u.realName || u.studentId || "이름 미설정",
        studentId: u.studentId ?? null,
        emoji: u.emoji ?? "🙂",
        fromRoster: true,
      });
    }
  }
  const strays = [];
  for (const w of words) {
    const uid = w.data.authorId;
    if (!uid || roster.has(uid)) continue;
    roster.set(uid, {
      uid,
      name: w.data.authorName || "반을 떠난 학생",
      studentId: null,
      emoji: "🙂",
      fromRoster: false,
    });
    strays.push(uid);
  }

  // ── 3) 계획 ──
  const wordsByUid = new Map();
  words.forEach((w) => {
    const uid = w.data.authorId;
    if (!uid) return;
    if (!wordsByUid.has(uid)) wordsByUid.set(uid, []);
    wordsByUid.get(uid).push(w);
  });
  const orphan = words.filter((w) => !w.data.authorId); // 작성자가 없는 낱말

  const plan = [...roster.values()]
    .sort((a, b) => String(a.studentId ?? a.name).localeCompare(String(b.studentId ?? b.name), "ko"))
    .map((s) => ({ ...s, newId: `solo_${s.uid}`, words: wordsByUid.get(s.uid) ?? [] }));

  console.log(`옮긴 뒤: 학생 판 ${plan.length}개\n`);
  plan.forEach((s) => {
    const mark = s.fromRoster ? " " : "*";
    console.log(`  ${mark} ${(s.studentId ?? "-").padEnd(6)} ${s.name.padEnd(12)} 낱말 ${s.words.length}개`);
  });
  if (strays.length > 0) {
    console.log(`\n  * = 지금 반 명단에는 없지만 낱말을 남긴 사람 (${strays.length}명)`);
    console.log("    낱말이 사라지지 않도록 그 사람 이름으로 판을 함께 만듭니다.");
  }
  if (orphan.length > 0) {
    console.log(`\n⚠ 작성자를 알 수 없는 낱말 ${orphan.length}개는 옮기지 않습니다(옛 모둠과 함께 지워집니다).`);
  }

  const movable = plan.reduce((n, s) => n + s.words.length, 0);
  console.log(`\n낱말 ${words.length}개 중 ${movable}개를 옮깁니다.\n`);

  if (!apply) {
    console.log("미리보기라 아무것도 쓰지 않았습니다.");
    console.log("실제로 옮기려면 --apply 를 붙여 다시 실행하세요.\n");
    return;
  }

  // ── 4) 새 판 만들기 + 낱말 복사 (옛것은 아직 그대로 둡니다) ──
  console.log("새 판을 만들고 낱말을 옮기는 중…");
  const ops = [];
  plan.forEach((s, i) => {
    const gRef = actRef.collection("groups").doc(s.newId);
    ops.push({
      ref: gRef,
      data: {
        activityId: actId,
        groupIndex: i + 1,
        groupName: s.name,
        groupSetName: `${act.topic || act.title || "닿소리 채우기"} 개별 활동`,
        memberUids: [s.uid],
        members: [{ uid: s.uid, name: s.name, studentId: s.studentId, emoji: s.emoji }],
        leaderUid: null,
        retired: false,
        createdAt: act.createdAt ?? new Date(),
      },
    });
    // 낱말은 원본 필드를 그대로 두고 groupId만 새 판으로 바꿉니다
    // (작성자·시각이 보존돼야 학습 기록으로서 값이 유지됩니다).
    s.words.forEach((w) => {
      ops.push({
        ref: gRef.collection("words").doc(w.id),
        data: { ...w.data, groupId: s.newId },
      });
    });
  });

  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((o) => batch.set(o.ref, o.data));
    await batch.commit();
    console.log(`  … ${Math.min(i + 400, ops.length)}/${ops.length}건`);
  }

  // ── 5) 옮겨진 개수 확인 — 맞지 않으면 옛것을 지우지 않습니다 ──
  let copied = 0;
  for (const s of plan) {
    copied += (await actRef.collection("groups").doc(s.newId).collection("words").get()).size;
  }
  if (copied !== movable) {
    console.log(
      `\n⚠ 옮긴 낱말이 ${copied}개로, 예상(${movable}개)과 다릅니다.\n` +
        "  옛 모둠은 그대로 두었습니다. 확인한 뒤 다시 실행해 주세요.\n"
    );
    return;
  }
  console.log(`낱말 ${copied}개 확인 완료.`);

  // ── 6) 옛 모둠과 그 낱말 지우기 ──
  console.log("옛 모둠을 정리하는 중…");
  for (const g of oldGroups) {
    const gRef = actRef.collection("groups").doc(g.id);
    const wSnap = await gRef.collection("words").get();
    for (let i = 0; i < wSnap.docs.length; i += 400) {
      const batch = db.batch();
      wSnap.docs.slice(i, i + 400).forEach((w) => batch.delete(w.ref));
      await batch.commit();
    }
    await gRef.delete();
  }

  // ── 7) 활동을 개별 활동으로 표시 ──
  await actRef.update({
    groupMode: "solo",
    groupSetName: `${act.topic || act.title || "닿소리 채우기"} 개별 활동`,
  });

  console.log(
    `\n끝났습니다. '${act.title ?? actId}'를 개별 활동으로 바꿨습니다.\n` +
      `  학생 판 ${plan.length}개 · 낱말 ${copied}개\n` +
      "  책방에서 활동을 열면 왼쪽에 학생 목록이 나옵니다.\n"
  );
}

async function main() {
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
  const db = getFirestore();
  if (!ACT_ID) return listActivities(db);
  return runConvert(db, ACT_ID, { apply: APPLY });
}

// 직접 실행할 때만 자격 증명을 잡습니다(import만 하면 아무 일도 안 일어남)
if (process.argv[1] && process.argv[1].endsWith("consonant-to-solo.mjs")) {
  main().catch((err) => {
    console.error("\n실패:", err?.message ?? err);
    if (String(err?.message ?? "").includes("credential")) {
      console.error(
        "\n자격 증명을 찾지 못했습니다. 둘 중 하나를 해 주세요:\n" +
          "  export GOOGLE_APPLICATION_CREDENTIALS=<서비스 계정 키.json>\n" +
          "  gcloud auth application-default login\n"
      );
    }
    process.exit(1);
  });
}
