// =============================================================
// 손님 가입 — 등록 코드가 도메인과 소속 반을 함께 정합니다.
//
// 학교 코드(BYDWHS)는 지금까지처럼 @hansung.hs.kr 계정만 받고, 입장 코드로
// 아무 반이나 들어갑니다. 손님 코드(GUEST)는 allowAnyDomain으로 도메인을
// 면제하는 대신 classId가 가리키는 반에만 소속시킵니다.
//
// 여기서 꼭 확인해야 하는 것은 '되는 것'보다 '안 되는 것'입니다.
//  · 손님이 homeClassId를 다른 반으로 적어 가입하면? (소속 위조)
//  · 손님이 다른 반의 멀쩡한 입장 코드를 알아내면? (탈출)
//  · 학교 코드로 가입하면서 homeClassId를 끼워 넣으면? (권한 상승)
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { makeEnv, seed } from "./helpers.mjs";

const HOUR = 60 * 60 * 1000;

// 학교 계정 / 개인 계정 — 도메인만 다른 같은 학생 컨텍스트입니다.
const asSchool = (env, uid) =>
  env.authenticatedContext(uid, { email: `${uid}@hansung.hs.kr`, email_verified: true });
const asOutsider = (env, uid) =>
  env.authenticatedContext(uid, { email: `${uid}@gmail.com`, email_verified: true });

// 가입 시 실제로 쓰는 프로필 모양(lib/auth.js ensureUserProfile와 같은 필드)
const profile = (extra) => ({
  role: "student",
  displayName: "다급한 달팽이",
  emoji: "🐌",
  realName: "손님",
  studentId: null,
  requestedRole: null,
  homeClassId: "",
  ...extra,
});

describe("손님 등록 코드", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-guest");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      // 학교 코드 — 도메인 제한 유지, 강제 소속 반 없음
      await setDoc(doc(db, "registrationCodes", "BYDWHS"), { active: true });
      // 손님 코드 — 도메인 면제 + GUEST ROOM 강제 소속
      await setDoc(doc(db, "registrationCodes", "GUEST"), {
        active: true,
        allowAnyDomain: true,
        classId: "guestRoom",
      });
      // 폐기된 손님 코드 — active가 false면 도메인 면제도 함께 사라져야 합니다
      await setDoc(doc(db, "registrationCodes", "OLDGUEST"), {
        active: false,
        allowAnyDomain: true,
        classId: "guestRoom",
      });

      await setDoc(doc(db, "classes", "guestRoom"), {
        name: "GUEST ROOM", ownerUid: "teacherA", archived: false,
      });
      await setDoc(doc(db, "classes", "class3"), {
        name: "3학년 1반", ownerUid: "teacherA", archived: false,
      });
      // 다른 반의 '멀쩡하고 만료되지 않은' 입장 코드 — 손님이 이걸 알아내도
      // 그 반으로 넘어가지 못해야 합니다.
      await setDoc(doc(db, "joinCodes", "MATH31"), {
        classId: "class3", createdBy: "teacherA",
        expiresAt: new Date(Date.now() + HOUR),
      });
    });
  });

  describe("가입 (users 생성)", () => {
    it("학교 코드 + 학교 이메일 — 지금까지처럼 가입된다", async () => {
      const db = asSchool(env, "stu1").firestore();
      await assertSucceeds(
        setDoc(doc(db, "users", "stu1"), profile({ regCode: "BYDWHS" }))
      );
    });

    it("학교 코드 + 개인 계정 — 막힌다", async () => {
      const db = asOutsider(env, "out1").firestore();
      await assertFails(
        setDoc(doc(db, "users", "out1"), profile({ regCode: "BYDWHS" }))
      );
    });

    it("손님 코드 + 개인 계정 — 가입된다 (도메인 면제)", async () => {
      const db = asOutsider(env, "out1").firestore();
      await assertSucceeds(
        setDoc(doc(db, "users", "out1"), profile({ regCode: "GUEST", homeClassId: "guestRoom" }))
      );
    });

    it("손님 코드 + 학교 계정도 가입된다 (선생님이 시연해 볼 수 있게)", async () => {
      const db = asSchool(env, "stu1").firestore();
      await assertSucceeds(
        setDoc(doc(db, "users", "stu1"), profile({ regCode: "GUEST", homeClassId: "guestRoom" }))
      );
    });

    // ── 위조 차단 ──
    it("손님 코드로 가입하며 homeClassId를 비워 두면 막힌다", async () => {
      // 비워 두고 통과하면 도메인만 면제받고 소속 강제는 빠져나갑니다.
      const db = asOutsider(env, "out1").firestore();
      await assertFails(
        setDoc(doc(db, "users", "out1"), profile({ regCode: "GUEST", homeClassId: "" }))
      );
    });

    it("손님 코드로 가입하며 homeClassId를 다른 반으로 적으면 막힌다", async () => {
      const db = asOutsider(env, "out1").firestore();
      await assertFails(
        setDoc(doc(db, "users", "out1"), profile({ regCode: "GUEST", homeClassId: "class3" }))
      );
    });

    it("학교 코드로 가입하며 homeClassId를 끼워 넣으면 막힌다", async () => {
      // 통과하면 입장 코드 없이 아무 반이나 소속될 수 있게 됩니다.
      const db = asSchool(env, "stu1").firestore();
      await assertFails(
        setDoc(doc(db, "users", "stu1"), profile({ regCode: "BYDWHS", homeClassId: "class3" }))
      );
    });

    it("폐기된(active:false) 손님 코드로는 가입되지 않는다", async () => {
      const db = asOutsider(env, "out1").firestore();
      await assertFails(
        setDoc(doc(db, "users", "out1"), profile({ regCode: "OLDGUEST", homeClassId: "guestRoom" }))
      );
    });

    it("없는 코드로는 가입되지 않는다", async () => {
      const db = asOutsider(env, "out1").firestore();
      await assertFails(
        setDoc(doc(db, "users", "out1"), profile({ regCode: "NOSUCH", homeClassId: "guestRoom" }))
      );
    });
  });

  describe("소속 (memberships 생성)", () => {
    beforeEach(async () => {
      await seed(env, async (db) => {
        // 손님 계정 — 손님방으로 못박힘
        await setDoc(doc(db, "users", "guest1"), profile({
          regCode: "GUEST", homeClassId: "guestRoom",
        }));
        // 일반 학생 — 강제 소속 반 없음
        await setDoc(doc(db, "users", "stu1"), profile({
          regCode: "BYDWHS", homeClassId: "",
        }));
      });
    });

    it("손님은 입장 코드 없이 손님방에 소속된다", async () => {
      const db = asOutsider(env, "guest1").firestore();
      await assertSucceeds(
        setDoc(doc(db, "memberships", "guest1_guestRoom"), {
          uid: "guest1", classId: "guestRoom", joinedAt: new Date(),
        })
      );
    });

    // ── 이 테스트가 '강제 소속'의 핵심입니다 ──
    it("손님은 다른 반의 유효한 입장 코드를 알아도 그 반에 못 들어간다", async () => {
      const db = asOutsider(env, "guest1").firestore();
      await assertFails(
        setDoc(doc(db, "memberships", "guest1_class3"), {
          uid: "guest1", classId: "class3", code: "MATH31", joinedAt: new Date(),
        })
      );
    });

    it("손님도 입장 코드 없이 아무 반에나 들어갈 수는 없다", async () => {
      const db = asOutsider(env, "guest1").firestore();
      await assertFails(
        setDoc(doc(db, "memberships", "guest1_class3"), {
          uid: "guest1", classId: "class3", joinedAt: new Date(),
        })
      );
    });

    it("일반 학생은 지금까지처럼 입장 코드로 소속된다", async () => {
      const db = asSchool(env, "stu1").firestore();
      await assertSucceeds(
        setDoc(doc(db, "memberships", "stu1_class3"), {
          uid: "stu1", classId: "class3", code: "MATH31", joinedAt: new Date(),
        })
      );
    });

    it("일반 학생이 입장 코드 없이 들어가려 하면 막힌다", async () => {
      // 손님 갈래(homeClassId)가 일반 사용자에게 새어 나가지 않는지 확인합니다.
      const db = asSchool(env, "stu1").firestore();
      await assertFails(
        setDoc(doc(db, "memberships", "stu1_class3"), {
          uid: "stu1", classId: "class3", joinedAt: new Date(),
        })
      );
    });

    it("손님은 자기 프로필의 homeClassId를 바꿀 수 없다 (탈출 차단)", async () => {
      // 바꿀 수 있으면 위 강제가 통째로 무의미해집니다.
      const db = asOutsider(env, "guest1").firestore();
      await assertFails(
        setDoc(doc(db, "users", "guest1"), { homeClassId: "class3" }, { merge: true })
      );
    });
  });
});
