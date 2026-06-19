"use client";

// KWL 사이드 패널 — 공부방 왼쪽 고정 패널
// 저장마다 새 항목이 누적되고, 저장 후 입력창은 초기화됩니다.
import { useEffect, useState } from "react";
import { subscribeMyTodayKwl, subscribeAllKwl, subscribeMyAllKwl, addKwl } from "@/lib/store";

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

function KwlEntry({ entry }) {
  return (
    <div className="kwl-entry">
      {entry.K && (
        <div className="kwl-history-row">
          <span className="kwl-badge kwl-badge-k">K</span>
          <p>{entry.K}</p>
        </div>
      )}
      {entry.W && (
        <div className="kwl-history-row">
          <span className="kwl-badge kwl-badge-w">W</span>
          <p>{entry.W}</p>
        </div>
      )}
      {entry.L && (
        <div className="kwl-history-row">
          <span className="kwl-badge kwl-badge-l">L</span>
          <p>{entry.L}</p>
        </div>
      )}
    </div>
  );
}

export default function KwlPanel({ classId, user, isTeacher, onAsk }) {
  const today = getToday();

  const [tab, setTab] = useState("today");
  const [K, setK] = useState("");
  const [W, setW] = useState("");
  const [L, setL] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [todayEntries, setTodayEntries] = useState([]);
  const [allEntries, setAllEntries] = useState([]);
  const [showAllW, setShowAllW] = useState(false);
  const [history, setHistory] = useState([]);
  const [expandedDate, setExpandedDate] = useState(null);

  // 오늘 내 항목 구독
  useEffect(() => {
    if (!classId || !user) return;
    return subscribeMyTodayKwl(classId, user.uid, today, setTodayEntries);
  }, [classId, user?.uid, today]);

  // 교사: 오늘 전체 학생 구독
  useEffect(() => {
    if (!isTeacher || !classId) return;
    return subscribeAllKwl(classId, today, setAllEntries);
  }, [isTeacher, classId, today]);

  // 기록 탭: 내 전체 항목 구독 (오늘 포함)
  useEffect(() => {
    if (tab !== "history" || !classId || !user) return;
    return subscribeMyAllKwl(classId, user.uid, setHistory);
  }, [tab, classId, user?.uid, today]);

  async function handleSave() {
    if (!classId || !user) return;
    if (!K.trim() && !W.trim() && !L.trim()) return;
    setSaving(true);
    try {
      await addKwl(classId, user, today, { K, W, L });
      // 저장 후 입력창 초기화
      setK("");
      setW("");
      setL("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const allW = allEntries.filter((e) => e.W?.trim() && e.userId !== user?.uid);
  const isEmpty = !K.trim() && !W.trim() && !L.trim();

  // 기록 탭: 날짜별로 그룹화
  const historyByDate = history.reduce((acc, entry) => {
    if (!acc[entry.date]) acc[entry.date] = [];
    acc[entry.date].push(entry);
    return acc;
  }, {});
  const historyDates = Object.keys(historyByDate).sort((a, b) => b.localeCompare(a));

  if (!classId || !user) return null;

  return (
    <aside className="kwl-panel">
      {/* 탭 */}
      <div className="kwl-tabs">
        <button
          type="button"
          className={`kwl-tab ${tab === "today" ? "active" : ""}`}
          onClick={() => setTab("today")}
        >
          오늘
        </button>
        <button
          type="button"
          className={`kwl-tab ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          📚 기록
        </button>
      </div>

      {tab === "today" ? (
        <>
          <div className="kwl-panel-date">{formatDateLabel(today)}</div>

          {/* 입력 폼 */}
          <div className="kwl-section">
            <label className="kwl-label">
              <span className="kwl-badge kwl-badge-k">K</span>
              알고 있었던 것
            </label>
            <textarea
              className="kwl-textarea"
              value={K}
              onChange={(e) => setK(e.target.value)}
              placeholder="이미 알고 있던 내용..."
              rows={3}
            />
          </div>

          <div className="kwl-section">
            <div className="kwl-label-row">
              <label className="kwl-label">
                <span className="kwl-badge kwl-badge-w">W</span>
                알고 싶은 것
              </label>
              {W.trim() && onAsk && (
                <button
                  type="button"
                  className="kwl-ask-btn"
                  onClick={() => onAsk(W.trim())}
                >
                  ❓ 질문으로
                </button>
              )}
            </div>
            <textarea
              className="kwl-textarea"
              value={W}
              onChange={(e) => setW(e.target.value)}
              placeholder="궁금한 점, 더 알고 싶은 것..."
              rows={3}
            />
          </div>

          <div className="kwl-section">
            <label className="kwl-label">
              <span className="kwl-badge kwl-badge-l">L</span>
              새롭게 알게 된 것
            </label>
            <textarea
              className="kwl-textarea"
              value={L}
              onChange={(e) => setL(e.target.value)}
              placeholder="오늘 배우고 깨달은 것..."
              rows={3}
            />
          </div>

          <button
            type="button"
            className="kwl-save-btn"
            onClick={handleSave}
            disabled={saving || isEmpty}
          >
            {saving ? "저장 중..." : saved ? "✓ 저장됨" : "저장"}
          </button>

          {/* 오늘 저장된 항목 목록 */}
          {todayEntries.length > 0 && (
            <div className="kwl-today-entries">
              <p className="kwl-today-entries-label">
                오늘 저장된 항목 ({todayEntries.length})
              </p>
              {todayEntries.map((entry) => (
                <KwlEntry key={entry.id} entry={entry} />
              ))}
            </div>
          )}

          {/* 교사: 학생 W 모아보기 */}
          {isTeacher && allW.length > 0 && (
            <div className="kwl-all-w">
              <button
                type="button"
                className="kwl-all-w-toggle"
                onClick={() => setShowAllW((v) => !v)}
              >
                <span>👥 학생 W 모음 ({allW.length})</span>
                <span className="kwl-chevron">{showAllW ? "▴" : "▾"}</span>
              </button>
              {showAllW && (
                <ul className="kwl-all-w-list">
                  {allW.map((e) => (
                    <li key={e.id} className="kwl-all-w-item">
                      <span className="kwl-all-w-author">
                        {e.authorEmoji} {e.authorName}
                      </span>
                      <p className="kwl-all-w-text">{e.W}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        /* 기록 탭 */
        <div className="kwl-history">
          {historyDates.length === 0 ? (
            <p className="kwl-history-empty">아직 저장된 기록이 없어요.</p>
          ) : (
            <ul className="kwl-history-list">
              {historyDates.map((date) => {
                const open = expandedDate === date;
                const entries = historyByDate[date];
                return (
                  <li key={date} className="kwl-history-item">
                    <button
                      type="button"
                      className="kwl-history-toggle"
                      onClick={() => setExpandedDate(open ? null : date)}
                    >
                      <span className="kwl-history-date">
                        {formatDateLabel(date)}
                        {entries.length > 1 && (
                          <span className="kwl-history-count"> ×{entries.length}</span>
                        )}
                      </span>
                      <span className="kwl-chevron">{open ? "▴" : "▾"}</span>
                    </button>
                    {open && (
                      <div className="kwl-history-body">
                        {entries.map((entry) => (
                          <KwlEntry key={entry.id} entry={entry} />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
