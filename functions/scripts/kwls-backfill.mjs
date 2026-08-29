// =============================================================
// 책방 KWLS → 공부방 KWLS 스트림(kwl) 옮기기
// -------------------------------------------------------------
// 같은 성찰인데 저장한 자리가 달라 따로 쌓였습니다. 새로 저장하는 것부터는
// 두 곳에 함께 적히지만(store.js의 saveKwlsActivityEntry), 그 전에 쌓인
// 기록은 kwl 스트림에 없어서 히트맵·리포트·교사 패널에 안 잡힙니다.
// 이 스크립트가 그 과거분을 옮깁니다.
//
// [기본은 미리보기입니다]
//   node functions/scripts/kwls-backfill.mjs            ← 세어만 보고 안 씁니다
//   node functions/scripts/kwls-backfill.mjs --apply    ← 실제로 씁니다
// 학생 제출물을 다루는 일이라 --apply를 명시하지 않으면 절대 쓰지 않습니다.
//
// [자격 증명]
// firebase-admin의 기본 자격 증명을 씁니다. 둘 중 하나면 됩니다.
//   · GOOGLE_APPLICATION_CREDENTIALS=<서비스 계정 키.json>
//   · gcloud auth application-default login
//
// [이 폴더에 둔 이유]
// firebase-admin이 functions/node_modules에만 있습니다. Node는 실행 위치가
// 아니라 '파일 위치'에서 위로 올라가며 모듈을 찾으므로, 스크립트가 이
// 안에 있어야 풀립니다(루트 scripts/에 두면 못 찾습니다).
// =============================================================
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const PROJECT_ID = "class-peer-qna";
const APPLY = process.argv.includes("--apply");
const KWLS_KEYS = ["know", "want", "learned", "still"];
const LEGACY = { know: "K", want: "W", learned: "L", still: "S" };

// 날짜는 학생이 화면에서 본 것과 같아야 합니다 — kwl의 date는 한국 달력
// 기준 문자열이라(lib/store.js의 todayDateKey), UTC로 자르면 오전 9시 이전
// 기록이 하루 앞으로 밀립니다.
function seoulDateKey(value) {
  // instanceof Timestamp로 좁히지 않습니다 — node_modules에 firebase-admin이
  // 두 벌 들어가면 클래스가 달라 instanceof가 어긋나고, 그러면 시각이 멀쩡한
  // 기록까지 전부 '시각 없음'으로 빠져 한 건도 안 옮겨집니다(조용히).
  // toDate()를 가졌는지만 봅니다.
  const d =
    typeof value?.toDate === "function"
      ? value.toDate()
      : value instanceof Date
      ? value
      : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function normalizeAnswers(raw = {}) {
  const out = {};
  KWLS_KEYS.forEach((k) => {
    out[k] = String(raw?.[k] ?? "").trim();
  });
  return out;
}

function isEmpty(answers) {
  return KWLS_KEYS.every((k) => !answers[k]);
}

// db를 밖에서 받습니다 — 가짜 db를 물려 분류 로직만 따로 돌려 볼 수 있게
// (학생 데이터를 다루는 스크립트라, 처음 실행이 실제 데이터가 되면 안 됩니다).
export async function runBackfill(db, { apply = false, projectId = PROJECT_ID } = {}) {
  console.log(`\n대상 프로젝트: ${projectId}`);
  console.log(apply ? "모드: 실제 쓰기(--apply)\n" : "모드: 미리보기 (아무것도 쓰지 않습니다)\n");
  const APPLY = apply;

  const acts = await db
    .collection("bookActivities")
    .where("type", "==", "kwls")
    .get();

  if (acts.empty) {
    console.log("KWLS 활동이 없습니다. 옮길 것이 없습니다.\n");
    return;
  }

  const buckets = {
    move: [],       // 옮길 것
    exists: [],     // kwl에 이미 있음(새 저장 경로로 이미 적힌 것)
    noClass: [],    // 활동에 classId가 없어 kwl에 넣을 수 없음
    empty: [],      // 네 칸이 모두 비어 있음
    noDate: [],     // 시각이 없어 날짜를 정할 수 없음
  };

  for (const act of acts.docs) {
    const a = act.data();
    const entries = await act.ref.collection("entries").get();
    for (const e of entries.docs) {
      const d = e.data();
      const uid = d.authorId ?? e.id;
      const answers = normalizeAnswers(d.answers);
      const row = {
        actId: act.id,
        actTitle: a.title || a.topic || "(제목 없음)",
        uid,
        name: d.authorName ?? "?",
        chars: KWLS_KEYS.reduce((n, k) => n + answers[k].length, 0),
      };

      if (isEmpty(answers)) { buckets.empty.push(row); continue; }
      if (!a.classId) { buckets.noClass.push(row); continue; }

      const date = seoulDateKey(d.updatedAt) ?? seoulDateKey(a.createdAt);
      if (!date) { buckets.noDate.push(row); continue; }

      const id = `${uid}_${a.classId}_act_${act.id}`;
      const already = await db.collection("kwl").doc(id).get();
      if (already.exists) { buckets.exists.push({ ...row, id }); continue; }

      buckets.move.push({
        ...row,
        id,
        date,
        payload: {
          classId: a.classId,
          userId: uid,
          date,
          answers,
          ...Object.fromEntries(KWLS_KEYS.map((k) => [LEGACY[k], answers[k]])),
          activityId: act.id,
          activityTitle: a.title ?? "",
          topic: a.topic ?? "",
          authorName: d.authorName ?? "",
          authorEmoji: "🙂",
          createdAt: d.updatedAt ?? Timestamp.now(),
          backfilled: true, // 옮겨온 것임을 표시 — 나중에 되돌릴 때 씁니다
        },
      });
    }
  }

  console.log(`KWLS 활동 ${acts.size}개를 훑었습니다.\n`);
  console.log(`  옮길 것          ${buckets.move.length}건`);
  console.log(`  이미 있음        ${buckets.exists.length}건`);
  console.log(`  건너뜀 (빈 기록) ${buckets.empty.length}건`);
  console.log(`  건너뜀 (반 없음) ${buckets.noClass.length}건`);
  console.log(`  건너뜀 (시각 없음) ${buckets.noDate.length}건\n`);

  if (buckets.move.length) {
    console.log("옮길 목록 (앞 20건):");
    buckets.move.slice(0, 20).forEach((r) =>
      console.log(`  ${r.date}  ${String(r.name).padEnd(10)} ${r.chars}자  ← ${r.actTitle}`)
    );
    if (buckets.move.length > 20) console.log(`  … 그 밖 ${buckets.move.length - 20}건`);
    console.log("");
  }
  if (buckets.noClass.length) {
    console.log("⚠ 반(classId)이 없는 활동의 기록은 kwl에 넣을 수 없습니다:");
    [...new Set(buckets.noClass.map((r) => r.actTitle))].forEach((t) =>
      console.log(`  · ${t}`)
    );
    console.log("");
  }

  if (!APPLY) {
    console.log("미리보기라 아무것도 쓰지 않았습니다.");
    console.log("실제로 옮기려면 --apply 를 붙여 다시 실행하세요.\n");
    return;
  }

  // 실제 쓰기 — 500건씩 나눠 커밋합니다(Firestore 배치 한도)
  let done = 0;
  for (let i = 0; i < buckets.move.length; i += 400) {
    const batch = db.batch();
    buckets.move.slice(i, i + 400).forEach((r) => {
      batch.set(db.collection("kwl").doc(r.id), r.payload, { merge: true });
    });
    await batch.commit();
    done += Math.min(400, buckets.move.length - i);
    console.log(`  … ${done}/${buckets.move.length}건 옮김`);
  }
  console.log(`\n끝났습니다. ${done}건을 kwl로 옮겼습니다.`);
  console.log("책방 쪽 원본(entries)은 그대로 두었습니다 — 안전망으로 남깁니다.\n");
}

async function main() {
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
  return runBackfill(getFirestore(), { apply: APPLY });
}

// 직접 실행할 때만 자격 증명을 잡습니다(import만 하면 아무 일도 안 일어남)
if (process.argv[1] && process.argv[1].endsWith("kwls-backfill.mjs")) {
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
