"use client";

// =============================================================
// KWLS 종합 격자 (교사 전용) — /admin 「종합 분석」 맨 아래
// -------------------------------------------------------------
// 세로 = 반 학생, 가로 = KWLS를 쓴 날. 한 칸이 '그 학생이 그날 채운 칸 수'
// (1~4)이고, 많이 채울수록 진합니다.
//
// [왜 '수업일'이 아니라 'KWLS를 쓴 날'인가]
// 달력의 모든 날을 세우면 대부분이 빈 열이라 격자가 가로로만 길어집니다.
// 아무도 안 쓴 날은 애초에 볼 것이 없으므로, 기록이 하나라도 있는 날만
// 세웁니다(출석부의 '기록이 있는 날짜만 열로'와 같은 생각입니다).
//
// [세는 단위는 건수가 아니라 칸]
// 한 학생이 같은 날 두 건을 쓸 수 있습니다(공부방 하루 성찰 + 책방 KWLS
// 활동). 건수로 세면 두 곳에 쓴 학생이 네 칸을 다 채운 학생보다 진해지므로,
// 그날의 기록을 합쳐 'K·W·L·S 중 몇 칸이 찼나'로 셉니다.
//
// [읽기 비용]
// 새로 읽는 문서가 없습니다 — 종합 분석 화면이 이미 들고 있는 classKwl
// 배열을 그대로 받습니다(KwlOutcome·ParticipationBreadth와 같은 자료).
//
// 칸을 누르면 그 날짜·그 학생으로 KwlFullscreenModal이 열립니다. 거기서
// 학생 드롭다운·달력·좌우 화살표로 계속 넘겨 볼 수 있습니다.
// =============================================================
import { useMemo, useState } from "react";
import { KWLS_COLUMNS, kwlsFilledKeysOf } from "@/lib/kwls";
import KwlFullscreenModal from "./KwlFullscreenModal";

function shortDate(ymd) {
  const [, m, d] = ymd.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function fullDate(ymd) {
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

export default function KwlClassGrid({ classId, kwl = [], roster = [] }) {
  const [open, setOpen] = useState(null); // { date, uid } — 크게 볼 칸

  const { dates, rows, total, dateIndex } = useMemo(() => {
    // (학생, 날짜) → 그날 그 학생의 기록들
    const bucket = new Map();
    const dateSet = new Set();
    kwl.forEach((e) => {
      if (!e?.date || !e?.userId) return;
      dateSet.add(e.date);
      const key = `${e.userId}|${e.date}`;
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key).push(e);
    });
    // 날짜는 오름차순 — 왼쪽이 학기 초, 오른쪽이 최근입니다(읽는 방향과 같게).
    const dateList = [...dateSet].sort();

    // 학번순 — 자리표·출석부·전광판과 같은 차례라 눈이 다시 헤매지 않습니다.
    const people = roster
      .map((s) => ({
        uid: s.uid ?? s.id,
        name: s.realName || s.name || "이름 미설정",
        studentId: s.studentId || "",
      }))
      .filter((s) => s.uid)
      .sort((a, b) =>
        String(a.studentId || a.name).localeCompare(
          String(b.studentId || b.name),
          "ko",
          { numeric: true }
        )
      );

    // 크게 보기 창의 달력·좌우 화살표가 쓸 '어느 날에 누가 썼나'를 여기서
    // 함께 만들어 넘깁니다 — 격자가 이미 세고 있는 값이라, 그 창이 같은
    // 질의를 다시 하지 않아도 됩니다. 셈은 격자가 칸을 칠하는 기준과 같은
    // 것이라야 합니다(한 칸이라도 채운 날만) — 다르면 색이 없는 칸으로
    // 화살표가 내려앉습니다.
    let filledCells = 0;
    const counts = {};
    const byUid = {};
    const rowList = people.map((p) => ({
      ...p,
      cells: dateList.map((date) => {
        const list = bucket.get(`${p.uid}|${date}`);
        if (!list) return { date, level: 0, labels: [] };
        const filled = kwlsFilledKeysOf(list);
        const cols = KWLS_COLUMNS.filter((c) => filled.has(c.key));
        if (cols.length > 0) {
          filledCells += 1;
          counts[date] = (counts[date] ?? 0) + 1;
          (byUid[p.uid] ||= []).push(date);
        }
        return { date, level: cols.length, labels: cols.map((c) => c.ko) };
      }),
    }));

    return {
      dates: dateList,
      rows: rowList,
      total: filledCells,
      dateIndex: { counts, byUid },
    };
  }, [kwl, roster]);

  return (
    <section className="admin-chart-panel kgrid">
      <div className="admin-panel-head">
        <h2>🗓 KWLS 종합</h2>
        <span className="kgrid-note">
          학생 {rows.length}명 · 기록이 있는 날 {dates.length}일 · 쓴 칸{" "}
          <b>{total}</b>
        </span>
      </div>

      {dates.length === 0 || rows.length === 0 ? (
        <p className="dash-side-empty">아직 저장된 KWLS가 없어요.</p>
      ) : (
        <>
          <div className="kgrid-scroll">
            <table className="kgrid-table">
              <thead>
                <tr>
                  <th className="kgrid-corner">학생</th>
                  {dates.map((d) => (
                    <th key={d} className="kgrid-date" title={fullDate(d)}>
                      {shortDate(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.uid}>
                    <th className="kgrid-name" title={`${r.studentId} ${r.name}`.trim()}>
                      {r.studentId && <em>{r.studentId}</em>}
                      {r.name}
                    </th>
                    {r.cells.map((c) => (
                      <td key={c.date}>
                        <button
                          type="button"
                          className={`kgrid-cell lv${c.level}`}
                          onClick={() => setOpen({ date: c.date, uid: r.uid })}
                          title={
                            `${fullDate(c.date)} · ${r.name}\n` +
                            (c.level > 0
                              ? `${c.level}/4칸 — ${c.labels.join(", ")}`
                              : "안 씀")
                          }
                          aria-label={`${fullDate(c.date)} ${r.name} ${
                            c.level > 0 ? `${c.level}칸` : "안 씀"
                          } — 눌러서 내용 보기`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="kgrid-legend">
            <span>안 씀</span>
            {[0, 1, 2, 3, 4].map((lv) => (
              <i key={lv} className={`kgrid-swatch lv${lv}`} />
            ))}
            <span>네 칸</span>
            <em className="kgrid-legend-hint">칸을 누르면 그날 쓴 내용이 열립니다</em>
          </div>
        </>
      )}

      {open && (
        <KwlFullscreenModal
          classId={classId}
          initialDate={open.date}
          initialUid={open.uid}
          roster={roster}
          dateIndex={dateIndex}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
