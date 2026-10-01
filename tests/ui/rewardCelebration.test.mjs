import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";
import { returnedGain } from "../../lib/selfFruitGain.js";

const source = readFileSync(new URL("../../lib/useRewardCelebration.js", import.meta.url), "utf8");

function loadHook() {
  let activeSubscription = null;
  const unsubscribes = [];

  const runner = createHookRunner((hooks) => runInNewContext(
    source
      .replace(/^import .*;\r?\n/gm, "")
      .replace("export function useRewardCelebration", "function useRewardCelebration")
      + "\nuseRewardCelebration;",
    {
      ...hooks,
      // 과일 바구니에서 스스로 되찾은 몫 — 이 시험은 교사가 준 과일만 다루므로
      // 늘어난 만큼을 그대로 돌려줍니다(덜어 내는 셈은 tests/unit/selfFruitGain).
      takeSelfGain: (classId, uid, gain) => gain,
      // 이벤트 취소의 반납 표시 — 진짜 셈을 그대로 씁니다(순수 함수)
      returnedGain,
      subscribeMyClassRewardCount: (classId, uid, onCount) => {
        const subscription = { classId, uid, onCount, active: true };
        activeSubscription = subscription;
        return () => {
          subscription.active = false;
          unsubscribes.push({ classId, uid });
          if (activeSubscription === subscription) activeSubscription = null;
        };
      },
    },
  ));

  return {
    render: (props) => runner.render(props),
    amount: () => runner.result?.[0] ?? 0,
    clear: () => runner.result?.[1]?.(),
    emit: (count, mark = null) => {
      if (!activeSubscription?.active) throw new Error("No active reward subscription");
      activeSubscription.onCount(count, mark);
    },
    active: () => activeSubscription && { classId: activeSubscription.classId, uid: activeSubscription.uid },
    unsubscribes: () => [...unsubscribes],
  };
}

function createHookRunner(load) {
  let state = [];
  let refs = [];
  let effects = [];
  let pendingEffects = [];
  let hookIndex = 0;
  let props = null;
  let result = null;
  let hook = null;
  let rendering = false;

  const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b)
    && a.length === b.length
    && a.every((value, index) => Object.is(value, b[index]));

  const run = () => {
    if (!hook) hook = load(api);
    rendering = true;
    hookIndex = 0;
    result = hook(props.classId, props.uid, props.enabled);
    rendering = false;
    while (pendingEffects.length) {
      const index = pendingEffects.shift();
      effects[index]?.cleanup?.();
      effects[index].cleanup = effects[index].effect() || undefined;
    }
  };

  const api = {
    useCallback: (fn) => fn,
    useEffect: (effect, deps) => {
      const index = hookIndex++;
      if (!effects[index] || !sameDeps(effects[index].deps, deps)) {
        effects[index] = { ...effects[index], effect, deps };
        pendingEffects.push(index);
      }
    },
    useRef: (initialValue) => {
      const index = hookIndex++;
      if (!refs[index]) refs[index] = { current: initialValue };
      return refs[index];
    },
    useState: (initialValue) => {
      const index = hookIndex++;
      if (state[index] === undefined) state[index] = initialValue;
      const setState = (nextValue) => {
        state[index] = typeof nextValue === "function" ? nextValue(state[index]) : nextValue;
        if (!rendering) run();
      };
      return [state[index], setState];
    },
  };

  return {
    get result() { return result; },
    render: (nextProps) => {
      props = nextProps;
      run();
      return result;
    },
  };
}

test("accumulates rapid reward increases while celebration is active", () => {
  const hook = loadHook();
  hook.render({ classId: "class-a", uid: "student-a", enabled: true });

  hook.emit(0);
  assert.equal(hook.amount(), 0);

  hook.emit(1);
  assert.equal(hook.amount(), 1);

  hook.emit(2);
  assert.equal(hook.amount(), 2);

  hook.emit(3);
  assert.equal(hook.amount(), 3);
});

test("ignores repeated and decreased totals while preserving the reward baseline", () => {
  const hook = loadHook();
  hook.render({ classId: "class-a", uid: "student-a", enabled: true });

  hook.emit(5);
  hook.emit(6);
  assert.equal(hook.amount(), 1);

  hook.emit(6);
  assert.equal(hook.amount(), 1);

  hook.emit(4);
  assert.equal(hook.amount(), 1);

  hook.emit(7);
  assert.equal(hook.amount(), 4);
});

test("adds multi-fruit server jumps to the active celebration amount", () => {
  const hook = loadHook();
  hook.render({ classId: "class-a", uid: "student-a", enabled: true });

  hook.emit(10);
  hook.emit(12);
  assert.equal(hook.amount(), 2);

  hook.emit(15);
  assert.equal(hook.amount(), 5);
});

test("starts a fresh amount after the active celebration is cleared", () => {
  const hook = loadHook();
  hook.render({ classId: "class-a", uid: "student-a", enabled: true });

  hook.emit(0);
  hook.emit(2);
  assert.equal(hook.amount(), 2);

  hook.clear();
  assert.equal(hook.amount(), 0);

  hook.emit(3);
  assert.equal(hook.amount(), 1);
});

test("changing class user or enabled state clears pending amount and reward baseline", () => {
  const hook = loadHook();
  hook.render({ classId: "class-a", uid: "student-a", enabled: true });

  hook.emit(0);
  hook.emit(2);
  assert.equal(hook.amount(), 2);

  hook.render({ classId: "class-b", uid: "student-a", enabled: true });
  assert.equal(hook.amount(), 0);
  assert.deepEqual(hook.unsubscribes(), [{ classId: "class-a", uid: "student-a" }]);
  assert.deepEqual(hook.active(), { classId: "class-b", uid: "student-a" });
  hook.emit(9);
  assert.equal(hook.amount(), 0);
  hook.emit(10);
  assert.equal(hook.amount(), 1);

  hook.render({ classId: "class-b", uid: "student-b", enabled: true });
  assert.equal(hook.amount(), 0);
  hook.emit(4);
  assert.equal(hook.amount(), 0);
  hook.emit(6);
  assert.equal(hook.amount(), 2);

  hook.render({ classId: "class-b", uid: "student-b", enabled: false });
  assert.equal(hook.amount(), 0);
  assert.equal(hook.active(), null);

  hook.render({ classId: "class-b", uid: "student-b", enabled: true });
  hook.emit(20);
  assert.equal(hook.amount(), 0);
  hook.emit(21);
  assert.equal(hook.amount(), 1);
});

test("이벤트 취소로 돌려받은 과일에는 축포가 안 터지고, 그 뒤 교사가 준 것만 터짐", () => {
  const hook = loadHook();
  hook.render({ classId: "class-a", uid: "student-a", enabled: true });

  const old = { id: "r0", n: 3 };
  hook.emit(2, old);            // 처음 값 — 지난 반납 표시는 기준점일 뿐
  hook.emit(3, old);            // 교사가 1개 줌 → 축포 1
  assert.equal(hook.amount(), 1);
  hook.clear();

  const back = { id: "r1", n: 4 };
  hook.emit(7, back);           // 이벤트 취소로 4개 돌려받음 → 축포 없음
  assert.equal(hook.amount(), 0);

  hook.emit(8, back);           // 같은 표시 그대로 교사가 1개 → 축포 1
  assert.equal(hook.amount(), 1);
  hook.clear();

  hook.emit(11, { id: "r2", n: 2 }); // 반납 2 + 같은 순간 교사 1 → 축포 1
  assert.equal(hook.amount(), 1);
});
