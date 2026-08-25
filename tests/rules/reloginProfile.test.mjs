// =============================================================
// 재로그인 시 프로필 자동 재생성 — 실제로 되는가?
// -------------------------------------------------------------
// lib/auth.js의 buildAppUser()는 로그인할 때마다 ensureUserProfile(fbUser)를
// 부릅니다. 이때 extra를 넘기지 않아 regCode가 null로 들어갑니다.
// users 생성 규칙은 유효한 등록 코드를 요구하므로, 프로필 문서가 어떤
// 이유로든 사라진 계정은 이 경로로 되살아날 수 있는지 확인합니다.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { makeEnv, asStudent, seed } from "./helpers.mjs";

// ensureUserProfile()이 만드는 문서와 같은 모양 (lib/auth.js 참고)
function profileDoc({ regCode }) {
  return {
    email: "stu1@hansung.hs.kr",
    realName: "이다은",
    displayName: "다급한 달팽이",
    emoji: "🐌",
    role: "student",
    requestedRole: null,
    studentId: "20514",
    regCode,
    createdAt: new Date(),
  };
}

describe("프로필이 사라진 계정의 재로그인", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-relogin");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    // 유효한 등록 코드는 존재한다 (가입 때 쓰던 그 코드)
    await seed(env, async (db) => {
      await setDoc(doc(db, "registrationCodes", "HANSUNG25"), { active: true });
    });
    // users/stu1 문서는 일부러 만들지 않음 = '프로필이 사라진 상태'
  });

  it("buildAppUser 경로(regCode 없음)로는 프로필을 되살릴 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    // ensureUserProfile(fbUser) — extra 없음 → regCode: null
    await assertFails(setDoc(doc(db, "users", "stu1"), profileDoc({ regCode: null })));
  });

  it("가입 경로(유효한 regCode 동봉)로는 만들 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(
      setDoc(doc(db, "users", "stu1"), profileDoc({ regCode: "HANSUNG25" }))
    );
  });
});
