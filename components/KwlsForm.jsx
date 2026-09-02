"use client";

// =============================================================
// KWLS로 성찰하기 — 학생 입력 화면 (개인 활동)
// -------------------------------------------------------------
// K·W·L·S 네 칸을 한 화면에 나란히 두고 채웁니다. 읽기 전에 K·W를 적고,
// 다 읽은 뒤 L·S를 적는 활동이라 칸마다 '읽기 전 / 읽은 뒤' 딱지를 붙여
// 지금 어디를 채울 차례인지 헷갈리지 않게 했습니다.
//
// 읽기 전에 쓴 칸은 지우지 않고 그대로 둡니다 — 읽고 나서 무엇이 달라졌는지
// 스스로 견주어 보는 것이 이 활동의 핵심입니다.
//
// 저장은 자동입니다(입력을 멈추면 조용히 저장).
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeMyParatextEntry, saveKwlsActivityEntry, saveParatextTopic } from "@/lib/store";
import TopicAskModal from "./TopicAskModal";
import {
  KWLS_COLUMNS,
  KWLS_COLUMN_COUNT,
  emptyKwlsAnswers,
  kwlsChars,
  kwlsFilledCount,
  kwlsPhaseDone,
} from "@/lib/kwls";
import { safeBookUrl } from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";

const SAVE_DELAY = 900; // ms — 이만큼 입력이 없으면 저장

export default function KwlsForm({ activity, user, onBack }) {
  const [answers, setAnswers] = useState(emptyKwlsAnswers);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  // 내가 적은 주제어(도서명) — 교사가 활동에 주제어를 넣지 않았을 때 씁니다.
  // 다루는 책·주제가 학생마다 다를 수 있어, 그때는 각자 적습니다
  // (곁텍스트 읽기와 같은 방식 — 같은 entries/{uid}.topic 자리를 씁니다).
  const [myTopic, setMyTopic] = useState("");
  const [topicAsk, setTopicAsk] = useState(false); // 물어보는 창이 떠 있는지
  // 내가 고친 뒤로는 서버 값이 와도 덮어쓰지 않습니다(입력 중 글자가 튀는 것 방지)
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);

  const locked = !!activity.locked;
  const bookUrl = safeBookUrl(activity.bookUrl);

  useEffect(() => {
    return subscribeMyParatextEntry(activity.id, user?.uid, (entry) => {
      if (!dirtyRef.current) {
        setAnswers({ ...emptyKwlsAnswers(), ...(entry?.answers ?? {}) });
      }
      setMyTopic(entry?.topic ?? "");
      setLoaded(true);
    });
  }, [activity.id, user?.uid]);

  // 활동에도 없고 내가 적은 것도 없으면 한 번 물어봅니다 — 무엇에 대한
  // 것인지 모른 채 칸을 채우기 시작하지 않도록. 닫으면 다시 뜨지 않고,
  // 배지를 눌러 언제든 적을 수 있습니다(닫을 길을 막지 않습니다).
  const askedRef = useRef(false);
  useEffect(() => {
    if (!loaded || locked || askedRef.current) return;
    if ((activity.topic ?? "").trim() || myTopic.trim()) return;
    askedRef.current = true;
    setTopicAsk(true);
  }, [loaded, locked, activity.topic, myTopic]);

  // 화면에 쓸 주제어 — 교사가 정해 둔 것이 있으면 그것이 먼저입니다.
  // (반 전체가 같은 주제로 하는 활동에서 학생이 제 것으로 바꿔 부르면 안 됩니다)
  const shownTopic = (activity.topic ?? "").trim() || myTopic.trim();
  const canEditTopic = !(activity.topic ?? "").trim() && !locked;

  async function saveTopic(next) {
    const text = String(next ?? "").trim();
    setMyTopic(text);
    setTopicAsk(false);
    if (text) await saveParatextTopic(activity.id, user, text);
  }

  useEffect(() => {
    if (!dirtyRef.current || locked) return;
    clearTimeout(timerRef.current);
    setStatus("saving");
    timerRef.current = setTimeout(async () => {
      try {
        // 책방 기록과 함께 공부방 KWLS 스트림(kwl)에도 적습니다 —
        // 두 곳에서 쓴 성찰을 한 흐름으로 보기 위함(store.js 주석 참고).
        await saveKwlsActivityEntry(activity, user, answers, myTopic);
        setStatus("saved");
      } catch {
        setStatus("idle");
      }
    }, SAVE_DELAY);
    return () => clearTimeout(timerRef.current);
  }, [answers, activity.id, user, locked, myTopic]);

  function edit(key, value) {
    dirtyRef.current = true;
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  const filled = useMemo(() => kwlsFilledCount(answers), [answers]);
  const chars = kwlsChars(answers);
  const beforeDone = kwlsPhaseDone("before", answers);
  const afterDone = kwlsPhaseDone("after", answers);

  return (
    <main className="books-main kwls-main">
      <div className="books-head">
        {/* 교사 화면(KwlsBoard)과 같은 짜임 — 제목 줄에 돌아가는 길,
            둘째 줄에 딸림 정보(주제어) */}
        <div className="books-head-title">
          <h1 className="book-group-title">{activity.title}</h1>
          <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
          {/* 아직 제 책을 안 적었을 때만 — 곁텍스트 읽기와 같은 자리·같은
              모양입니다(네 활동의 학생 화면이 여기서 갈리면 안 됩니다).
              적고 나면 그 값은 둘째 줄 배지가 보여 주므로 사라집니다. */}
          {!shownTopic && canEditTopic && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setTopicAsk(true)}
              title="무엇을 읽고 있는지 적어 주세요 — 내 카드에 표시됩니다"
            >
              도서명/주제 적기
            </button>
          )}
        </div>
        {/* 둘째 줄은 적어 둔 주제어나 도서 링크가 있을 때만 — 빈 줄이 남으면
            제목 아래가 괜히 벌어집니다. */}
        {(shownTopic || bookUrl) && (
        <div className="books-head-row">
          <div className="books-head-main">
            {/* 적어 둔 주제어 — 눌러서 고칠 수 있습니다. */}
            {shownTopic &&
              (canEditTopic ? (
                <button
                  type="button"
                  className="book-group-topic book-topic-edit"
                  onClick={() => setTopicAsk(true)}
                  title="눌러서 도서명·주제 고치기"
                >
                  {shownTopic}
                </button>
              ) : (
                <span className="book-group-topic">{shownTopic}</span>
              ))}
          </div>
          {bookUrl && (
            <a
              className="btn-primary book-info-btn"
              href={bookUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBook size={15} /> 도서 정보
            </a>
          )}
        </div>
        )}
        <div className="paratext-status">
          <span className="paratext-progress">
            {filled} / {KWLS_COLUMN_COUNT}칸 · {chars}자
          </span>
          {locked ? (
            <span className="paratext-saved locked">
              <IconLock size={14} /> 잠김
            </span>
          ) : (
            status !== "idle" && (
              <span className="paratext-saved">
                {status === "saving" ? "저장 중…" : "저장됨"}
              </span>
            )
          )}
        </div>
      </div>

      {locked && (
        <p className="book-locked-note">
          <IconLock size={15} /> 지금은 잠겨 있어 고칠 수 없어요. 쓴 내용은 그대로 남아 있습니다.
        </p>
      )}


      {topicAsk && (
        <TopicAskModal
          initial={myTopic}
          onSave={saveTopic}
          onClose={() => setTopicAsk(false)}
        />
      )}

      {!loaded ? (
        <p className="empty-note">불러오는 중이에요…</p>
      ) : (
        <>
          {/* 언제 어느 칸을 채우는지 — 이 활동의 흐름을 한 줄로 */}
          <p className="kwls-guide">
            <span className={`kwls-guide-step${beforeDone ? " done" : ""}`}>
              <b>읽기 전</b> K·W를 채우고
            </span>
            <span className="kwls-guide-arrow" aria-hidden="true">→</span>
            <span className={`kwls-guide-step${afterDone ? " done" : ""}`}>
              <b>읽은 뒤</b> L·S를 채웁니다
            </span>
            <em>먼저 쓴 칸은 지우지 마세요 — 무엇이 달라졌는지 견주어 보는 것이 핵심이에요.</em>
          </p>

          <div className="kwls-grid">
            {KWLS_COLUMNS.map((c) => (
              <section
                key={c.key}
                className={`kwls-col ${c.phase}${
                  String(answers[c.key] ?? "").trim() ? " filled" : ""
                }`}
              >
                <header className="kwls-col-head">
                  <span className="paratext-letter" aria-hidden="true">{c.letter}</span>
                  <span className="paratext-card-title">
                    <strong>{c.ko}</strong>
                    <em>{c.en}</em>
                  </span>
                  <span className={`kwls-phase-tag ${c.phase}`}>
                    {c.phase === "before" ? "읽기 전" : "읽은 뒤"}
                  </span>
                </header>
                <p className="kwls-col-prompt">
                  {c.prompt}
                  {c.hint && <em className="paratext-hint">{c.hint}</em>}
                </p>
                <textarea
                  rows={9}
                  value={answers[c.key] ?? ""}
                  onChange={(e) => edit(c.key, e.target.value)}
                  placeholder={c.placeholder}
                  disabled={locked}
                  aria-label={`${c.ko} (${c.en})`}
                />
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
