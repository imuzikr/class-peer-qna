import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

// Run the production calculation without bootstrapping Firebase or a browser.
const store = readFileSync(new URL("../../lib/store.js", import.meta.url), "utf8");
const toDate = store.match(/export function toDate\(value\) \{[\s\S]*?\n\}/)[0].replace("export ", "");
const sessions = readFileSync(new URL("../../lib/lessonSessions.js", import.meta.url), "utf8")
  .replace(/import \{ toDate \} from "\.\/store";/, "")
  .replaceAll("export ", "");
const component = readFileSync(new URL("../../components/RewardTiming.jsx", import.meta.url), "utf8");
const marker = "const stat = useMemo(() => {";
const start = component.indexOf(marker) + marker.length;
const end = component.indexOf("}, [events, attendance]);", start);
assert.ok(start >= marker.length && end > start, "production useMemo calculation is present");
// A daytime clock makes accidental toDate(undefined) => now deterministic.
class DaytimeDate extends Date {
  constructor(...args) { super(...(args.length ? args : ["2026-09-17T12:00:00+09:00"])); }
}
const { buildLessonSessions, sessionAt, calculate } = runInNewContext(
  `${toDate}\n${sessions}\n({ buildLessonSessions, sessionAt, calculate(events, attendance) {${component.slice(start, end)}} });`,
  { Date: DaytimeDate },
);
const at = (time, date = "2026-09-17") => `${date}T${time}+09:00`;
const attendance = (...times) => times.map(time => ({ attendedAt: at(time) }));
const ms = time => new Date(at(time)).getTime();
const plain = value => JSON.parse(JSON.stringify(value));

test("morning and evening attendance cannot create or shift a daytime lesson", () => {
  const result = buildLessonSessions(attendance("07:50:00", "08:10:00", "22:00:00"));
  assert.equal(result.length, 1);
  assert.equal(result[0].start, ms("08:10:00"));
  assert.equal(result[0].end, ms("08:55:00"));
});

test("only out-of-hours attendance yields no inferred lessons", () => {
  assert.equal(buildLessonSessions(attendance("07:59:59.999", "16:00:00", "23:40:00")).length, 0);
});

test("08:00 is included, 16:00 is excluded, and the final lesson stops at 16:00", () => {
  const result = buildLessonSessions(attendance("08:00:00", "15:50:00"));
  assert.equal(result.length, 2);
  assert.ok(sessionAt(result, at("08:00:00")));
  assert.equal(result[1].end, ms("16:00:00"));
  assert.ok(sessionAt(result, at("15:59:59.999")));
  assert.equal(sessionAt(result, at("16:00:00")), null);
  assert.equal(sessionAt(result, at("16:10:00")), null);
});

test("a lesson starting just before 16:00 is bounded to that school day", () => {
  const result = buildLessonSessions(attendance("15:59:59.999"));
  assert.equal(result.length, 1);
  assert.equal(result[0].end, ms("16:00:00"));
  assert.equal(sessionAt(result, at("16:00:00")), null);
});

test("UTC timestamps are interpreted in Korea even across the UTC date boundary", () => {
  const result = buildLessonSessions([
    { attendedAt: "2026-09-16T22:59:59.999Z" },
    { attendedAt: "2026-09-16T23:00:00Z" },
    { attendedAt: "2026-09-17T07:00:00Z" },
    { attendedAt: "2026-09-17T23:00:00Z" },
  ]);
  assert.deepEqual(plain(result.map(s => s.start)), [ms("08:00:00"), new Date(at("08:00:00", "2026-09-18")).getTime()]);
});

test("school-hour filtering preserves normal 15-minute bands and ignores revocations", () => {
  const result = calculate([
    { at: at("08:00:00"), delta: 2 },
    { at: at("08:14:59.999"), delta: 1 },
    { at: at("08:15:00"), delta: 3 },
    { at: at("08:29:59.999"), delta: 1 },
    { at: at("08:30:00"), delta: 4 },
    { at: at("08:44:59.999"), delta: 1 },
    { at: at("08:10:00"), delta: -5 },
  ], attendance("08:00:00"));
  assert.deepEqual(plain(result), { sessions: 1, counts: [3, 4, 5], total: 12, outside: 0 });
});

test("night notebook rewards never enter percentages or inflate session counts", () => {
  const result = calculate([
    { at: at("07:40:00"), delta: 11 },
    { at: at("08:00:00"), delta: 2 },
    { at: at("08:15:00"), delta: 3 },
    { at: at("08:30:00"), delta: 4 },
    { at: at("15:59:00"), delta: 5 },
    { at: at("16:00:00"), delta: 7 },
    { at: at("22:10:00"), delta: 13 },
  ], attendance("07:30:00", "08:00:00", "15:50:00", "22:00:00"));
  assert.deepEqual(plain(result), { sessions: 2, counts: [7, 3, 4], total: 14, outside: 31 });
});

test("school-day breaks still stay out of the three bands", () => {
  const result = calculate([{ at: at("10:00:00"), delta: 2 }], attendance("08:00:00"));
  assert.deepEqual(plain(result), { sessions: 1, counts: [0, 0, 0], total: 0, outside: 2 });
});

test("legacy timestamps and Firestore timestamps are supported, missing times are not now", () => {
  const result = buildLessonSessions([
    {}, { attendedAt: "invalid" }, { attendedAt: "" },
    { createdAt: at("08:00:00") },
    { attendedAt: { toDate: () => new Date(at("09:00:00")) } },
  ]);
  assert.deepEqual(plain(result.map(s => s.start)), [ms("08:00:00"), ms("09:00:00")]);
});


test("reward events without valid timestamps are never dated as now", () => {
  const result = calculate([{delta:99}, {at:"",delta:99}, {at:"invalid",delta:99}], attendance("12:00:00"));
  assert.deepEqual(plain(result), {sessions:1, counts:[0,0,0], total:0, outside:0});
});
