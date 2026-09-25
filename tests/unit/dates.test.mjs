// 흩어져 있던 날짜 셈을 lib/dates.js로 모았습니다. 옛 함수들을 **그대로 옮겨
// 적은 참조본**과 새 함수가 같은 값을 내는지 날짜마다 견줍니다 — 모으다가
// 한 글자라도 달라지면 문서 ID(uid_날짜)가 어긋나 지난 기록을 못 찾습니다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dateKeyOf, todayDateKey, dateKeyFromParts, shiftDateKey, dateKeyLabel, dateKeyDots,
} from "@/lib/dates";

// ── 옛 구현(삭제 전 컴포넌트에서 그대로) ──
const old = {
  ymd(date) { // KwlSemesterHeatmap · toYMD(KwlDateCalendar·KwlFullscreenModal) · getToday(KwlPanel)
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },
  toDateKey(year, month, day) { // LessonMemoPanel · StudyAttendanceModal
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  },
  shiftTeacher(dateKey, days) { // TeacherKwlPanel
    const d = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateKey;
    d.setDate(d.getDate() + days);
    return old.ymd(d);
  },
  shiftCornell(key, days) { // CornellNotesPanel
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return old.ymd(dt);
  },
  longLabel(dateStr) { // fmtDate · dateLabel(TeacherKwlPanel) · formatDateLabel(KwlPanel·KwlFullscreenModal)
    const d = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  },
  dots(dateKey) { // formatDateLabel(LessonMemoPanel · StudyAttendanceModal)
    if (!dateKey) return "";
    const [year, month, day] = String(dateKey).split("-");
    return `${year}.${month}.${day}`;
  },
};

// 2025-01-01부터 두 해(윤년 2028은 아니지만 달 경계·해 경계가 다 들어감)
function* everyDay() {
  const d = new Date(2025, 0, 1);
  for (let i = 0; i < 731; i++) {
    yield new Date(d);
    d.setDate(d.getDate() + 1);
  }
}

test("날짜 → 열쇠: 옛 셈과 두 해치 날짜가 모두 같습니다", () => {
  for (const d of everyDay()) {
    assert.equal(dateKeyOf(d), old.ymd(d));
    assert.equal(todayDateKey(d), old.ymd(d));
    assert.equal(dateKeyFromParts(d.getFullYear(), d.getMonth(), d.getDate()),
      old.toDateKey(d.getFullYear(), d.getMonth(), d.getDate()));
  }
});

test("열쇠 ± 며칠: 두 옛 구현과 같고, 달·해 경계를 넘습니다", () => {
  for (const d of everyDay()) {
    const k = old.ymd(d);
    for (const n of [-7, -1, 1, 7]) {
      assert.equal(shiftDateKey(k, n), old.shiftTeacher(k, n));
      assert.equal(shiftDateKey(k, n), old.shiftCornell(k, n));
    }
  }
  assert.equal(shiftDateKey("2025-12-31", 1), "2026-01-01");
  assert.equal(shiftDateKey("2024-03-01", -1), "2024-02-29");
});

test("긴 글자와 점 글자: 옛 셈과 같습니다", () => {
  for (const d of everyDay()) {
    const k = old.ymd(d);
    assert.equal(dateKeyLabel(k), old.longLabel(k));
    assert.equal(dateKeyDots(k), old.dots(k));
  }
  assert.equal(dateKeyDots("2026-09-25"), "2026.09.25");
});

test("읽을 수 없는 값은 받은 그대로 — 'Invalid Date'·'NaN-NaN-NaN'을 만들지 않습니다", () => {
  assert.equal(dateKeyLabel("오늘"), "오늘");
  assert.equal(shiftDateKey("오늘", 1), "오늘");
  assert.equal(dateKeyDots(""), "");
  assert.equal(dateKeyDots(null), "");
});
