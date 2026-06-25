"use client";

// =============================================================
// 학생 KWL 기록 패널 (관리자 대시보드) — 선택한 학생의 KWL을 날짜별로 표시.
// entries: { id, date, K, W, L }[] (subscribeUserKwl 결과, 최신순)
// =============================================================
import { IconKwlK, IconKwlW, IconKwlL } from "@/components/StatusIcons";

function fmtDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

export default function StudentKwlPanel({ entries = [] }) {
  const byDate = {};
  entries.forEach((e) => {
    (byDate[e.date] ??= []).push(e);
  });
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <section className="admin-activity-panel kwl-record-panel">
      <div className="admin-panel-head">
        <h2>📒 KWL 기록</h2>
        <span>{dates.length}일 · {entries.length}건</span>
      </div>

      {dates.length === 0 ? (
        <div className="admin-empty">아직 KWL 기록이 없습니다.</div>
      ) : (
        <div className="kwl-record-list">
          {dates.map((date) => (
            <div key={date} className="kwl-record-day">
              <div className="kwl-record-date">{fmtDate(date)}</div>
              {byDate[date].map((e) => (
                <div key={e.id} className="kwl-record-entry">
                  {e.K && (
                    <div className="kwl-history-row">
                      <IconKwlK size={22} />
                      <p>{e.K}</p>
                    </div>
                  )}
                  {e.W && (
                    <div className="kwl-history-row">
                      <IconKwlW size={22} />
                      <p>{e.W}</p>
                    </div>
                  )}
                  {e.L && (
                    <div className="kwl-history-row">
                      <IconKwlL size={22} />
                      <p>{e.L}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
