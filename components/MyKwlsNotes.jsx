"use client";

// =============================================================
// 내 KWLS 노트 (학생 전용) — 수업 노트 크게 보기의 'KWLS 노트' 탭
// -------------------------------------------------------------
// 코넬 노트 탭과 **같은 줄·같은 단추**입니다(.cornell-read-bar) — 한 창 안의
// 두 탭이라 넘기는 방법이 다르면 탭을 옮길 때마다 다시 익혀야 합니다.
// 다른 점은 셋뿐입니다:
//   · 한 장이 코넬 2단이 아니라 K·W·L·S 네 칸(KwlsNoteSheet)
//   · 인쇄가 없습니다 — 코넬 노트는 복습하러 종이로 뽑는 자리인데, KWLS는
//     화면에서 견주어 보는 기록이라 종이로 뽑을 일이 없습니다.
//   · 날짜 달력이 있습니다(📅). 코넬은 하루 한 장이라 드롭다운으로 충분한데,
//     KWLS는 띄엄띄엄 쌓여 '언제 썼더라'를 먼저 봐야 할 때가 있습니다.
//
// [읽기]
// 내 기록만 받습니다(subscribeMyAllKwl — classId·userId 등호 둘). 이 탭을
// 처음 열 때 붙고, 그 뒤로는 탭을 오가도 그대로 둡니다(부모가 안 지웁니다).
// 달력이 쓰는 '어느 날에 썼나'도 이 목록에서 세므로 따로 읽지 않습니다.
//
// [빈 기록은 세지 않습니다]
// 한 칸도 안 쓴 문서가 남아 있을 수 있습니다. 그것까지 한 장으로 세면
// 넘기다 빈 화면을 만나고 달력도 초록인데 볼 것이 없습니다 — 교사 화면의
// 달력·화살표와 같은 기준(한 칸이라도 썼나)으로 거릅니다.
// =============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { subscribeMyAllKwl } from "@/lib/store";
import { kwlsAnswersFromEntry, kwlsFilledCount } from "@/lib/kwls";
import KwlsNoteSheet from "./KwlsNoteSheet";
import KwlDateCalendar from "./KwlDateCalendar";

export default function MyKwlsNotes({ classId, user, active = true }) {
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [id, setId] = useState(null);
  const [calOpen, setCalOpen] = useState(false);

  useEffect(() => {
    if (!classId || !user?.uid) {
      setLoaded(true);
      return;
    }
    return subscribeMyAllKwl(classId, user.uid, (list) => {
      setEntries(list);
      setLoaded(true);
    });
  }, [classId, user?.uid]);

  // 최근이 앞 — 코넬 노트 목록과 같은 차례라 '이전(‹)'이 index+1입니다.
  // createdAt이 아니라 date로 셉니다: 방금 쓴 것은 createdAt이 잠깐 null로
  // 오고(serverTimestamp), 책방 활동과 공부방 성찰은 쓴 시각이 뒤섞입니다.
  const notes = useMemo(
    () =>
      entries
        .filter((e) => e?.date && kwlsFilledCount(kwlsAnswersFromEntry(e)) > 0)
        .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [entries]
  );

  // 목록이 바뀌어 보던 것이 사라졌으면 맨 앞(가장 최근)으로
  useEffect(() => {
    if (notes.length === 0) return;
    if (!id || !notes.some((n) => n.id === id)) setId(notes[0].id);
  }, [notes, id]);

  const index = notes.findIndex((n) => n.id === id);
  const note = index >= 0 ? notes[index] : null;

  // 달력에 깔 값 — 그날 쓴 내 기록 건수(하루에 둘일 수 있습니다:
  // 공부방 하루 성찰 + 책방 KWLS 활동).
  const days = useMemo(() => {
    const m = {};
    notes.forEach((n) => { m[n.date] = (m[n.date] ?? 0) + 1; });
    return m;
  }, [notes]);

  const go = useCallback(
    (step) => {
      setId((cur) => {
        const i = notes.findIndex((n) => n.id === cur);
        const next = i + step;
        if (i < 0 || next < 0 || next >= notes.length) return cur;
        return notes[next].id;
      });
    },
    [notes]
  );

  // ← 더 옛날 / → 더 최근. 이 탭이 보이는 동안에만 듣습니다 — 코넬 탭도
  // 같은 자판을 쓰므로, 둘이 함께 들으면 한 번 눌러 두 장이 넘어갑니다.
  useEffect(() => {
    if (!active) return;
    function onKey(e) {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") go(1);
      else if (e.key === "ArrowRight") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, go]);

  function pickDate(date) {
    // 그 날짜의 첫 장(같은 날 둘이면 목록에서 앞선 것)으로
    const hit = notes.find((n) => n.date === date);
    if (hit) setId(hit.id);
    setCalOpen(false);
  }

  if (!loaded) return <p className="empty-note">불러오는 중이에요…</p>;
  if (notes.length === 0) {
    return (
      <p className="empty-note">
        아직 쓴 KWLS가 없어요. 공부방의 ‘KWLS 차트’나 책방의 KWLS 활동에서
        적어 보세요.
      </p>
    );
  }

  return (
    <>
      <div className="cornell-read-bar">
        <select
          className="cornell-read-date"
          value={id ?? ""}
          onChange={(e) => setId(e.target.value)}
          aria-label="날짜 고르기"
        >
          {notes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.date}
              {String(n.topic ?? "").trim() ? ` · ${n.topic}` : ""}
            </option>
          ))}
        </select>
        <div className="cornell-read-nav">
          <button
            type="button"
            className="cornell-read-step"
            onClick={() => go(1)}
            disabled={index >= notes.length - 1}
            title="이전 기록 (←)"
            aria-label="이전 기록"
          >
            ‹
          </button>
          <button
            type="button"
            className="cornell-read-step"
            onClick={() => go(-1)}
            disabled={index <= 0}
            title="다음 기록 (→)"
            aria-label="다음 기록"
          >
            ›
          </button>
        </div>
        <span className="cornell-read-count">
          {index + 1} / {notes.length}
        </span>
        {/* 달력 — 이 줄 안에서 아래로 펴집니다(자리를 잡아 두려고 감쌉니다) */}
        <span className="cornell-read-calwrap">
          <button
            type="button"
            className={`cornell-read-pdf${calOpen ? " on" : ""}`}
            onClick={() => setCalOpen((v) => !v)}
            aria-expanded={calOpen}
            title="달력에서 날짜 고르기 — 쓴 날이 초록으로 보입니다"
          >
            📅 달력
          </button>
          {calOpen && (
            <KwlDateCalendar
              date={note?.date ?? ""}
              days={days}
              onPick={pickDate}
              onClose={() => setCalOpen(false)}
              showCount={false}
              disableEmpty
              foot="초록 = 내가 쓴 날"
              cellTitle={(n) => (n > 0 ? `${n}건 썼어요` : "쓴 기록 없음")}
            />
          )}
        </span>
      </div>

      <KwlsNoteSheet entry={note} />

      <p className="cornell-viewer-hint">
        읽기 전에 적은 K·W와 읽은 뒤의 L·S를 견주어 보세요. ← → 로 넘길 수 있어요.
      </p>
    </>
  );
}
