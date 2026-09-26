"use client";

// =============================================================
// 물음표로 책 읽기 — 학생 입력 화면 (개인 활동)
// -------------------------------------------------------------
// 종이 활동지를 그대로 옮겼습니다.
//   ① 나의 물음표 — 읽으며 물음표를 붙인 곳 가운데 가장 중요한 물음 하나와
//      그 이유(궁금증 · 이유는).
//   ② 나의 생각 — 다섯 물음 가운데 **두 개 이상** 골라(체크) 그 궁금증에
//      대한 내 생각을 씁니다. 고른 물음 아래에만 쓰는 칸이 열립니다.
//
// 넓은 화면에서는 두 열(①｜②)이고, 좁아지면 한 줄로 쌓입니다. 접는 기준은
// 창이 아니라 이 화면의 폭입니다(`@container` — 책방은 양옆에 패널이 서서
// 창 폭으로는 모릅니다. 해시태그 폼과 같은 까닭).
//
// 저장은 자동입니다(입력을 멈추면 조용히). 자리는 곁텍스트 · RAFT와 같은
// entries/{uid}.answers라 규칙을 안 건드립니다. 셈은 lib/qmark.js.
// =============================================================
import { useEffect, useRef, useState } from "react";
import { subscribeMyParatextEntry, saveParatextEntry, saveParatextTopic } from "@/lib/store";
import TopicAskModal from "./TopicAskModal";
import {
  QMARK_PROMPTS,
  QMARK_MIN_PICKS,
  emptyQmarkAnswers,
  normalizeQmarkAnswers,
  toggleQmarkPick,
  qmarkAnsweredPicks,
  qmarkChars,
  qmarkDone,
  qmarkQuestionDone,
} from "@/lib/qmark";
import { safeBookUrl } from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";

const SAVE_DELAY = 900; // ms — 이만큼 입력이 없으면 저장

export default function QmarkForm({ activity, user, onBack }) {
  const [answers, setAnswers] = useState(emptyQmarkAnswers);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  // 내가 적은 도서명 — 교사가 주제어를 비워 두었을 때(KWLS와 같은 자리)
  const [myTopic, setMyTopic] = useState("");
  const [topicAsk, setTopicAsk] = useState(false);
  // 내가 고친 뒤로는 서버 값이 와도 덮어쓰지 않습니다(입력 중 글자가 튀지 않게)
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);
  // 방금 고른 물음 — 그려진 뒤 그 칸으로 커서를 데려갑니다
  const focusRef = useRef(null);

  const locked = !!activity.locked;
  const bookUrl = safeBookUrl(activity.bookUrl);

  useEffect(() => {
    return subscribeMyParatextEntry(activity.id, user?.uid, (entry) => {
      if (!dirtyRef.current) setAnswers(normalizeQmarkAnswers(entry?.answers));
      setMyTopic(entry?.topic ?? "");
      setLoaded(true);
    });
  }, [activity.id, user?.uid]);

  // 활동에도 없고 내가 적은 것도 없으면 한 번 물어봅니다(KWLS와 같음).
  const askedRef = useRef(false);
  useEffect(() => {
    if (!loaded || locked || askedRef.current) return;
    if ((activity.topic ?? "").trim() || myTopic.trim()) return;
    askedRef.current = true;
    setTopicAsk(true);
  }, [loaded, locked, activity.topic, myTopic]);

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
        await saveParatextEntry(activity.id, user, normalizeQmarkAnswers(answers));
        setStatus("saved");
      } catch {
        setStatus("idle");
      }
    }, SAVE_DELAY);
    return () => clearTimeout(timerRef.current);
  }, [answers, activity.id, user, locked]);

  function edit(key, value) {
    dirtyRef.current = true;
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }
  function togglePick(key) {
    if (locked) return;
    dirtyRef.current = true;
    const turningOn = !answers.picks.includes(key);
    setAnswers((prev) => toggleQmarkPick(prev, key));
    if (turningOn) focusRef.current = key;
  }
  useEffect(() => {
    const key = focusRef.current;
    if (!key) return;
    focusRef.current = null;
    document.getElementById(`qmark-${key}`)?.focus({ preventScroll: false });
  }, [answers.picks]);

  const answered = qmarkAnsweredPicks(answers).length;
  const askDone = qmarkQuestionDone(answers);
  const done = qmarkDone(answers);
  const question = answers.question.trim();

  return (
    <main className="books-main qmark-main">
      <div className="books-head">
        <div className="books-head-title">
          <h1 className="book-group-title">{activity.title}</h1>
          <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
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
        {(shownTopic || bookUrl) && (
          <div className="books-head-row">
            <div className="books-head-main">
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
              <a className="btn-primary book-info-btn" href={bookUrl} target="_blank" rel="noopener noreferrer">
                <IconBook size={15} /> 도서 정보
              </a>
            )}
          </div>
        )}
        <div className="paratext-status">
          <span className="paratext-progress">
            {done ? "완성" : `물음표 ${askDone ? "✓" : "–"} · 나의 생각 ${answered} / ${QMARK_MIN_PICKS}`}
            {" · "}{qmarkChars(answers)}자
          </span>
          {locked ? (
            <span className="paratext-saved locked">
              <IconLock size={14} /> 잠김
            </span>
          ) : (
            status !== "idle" && (
              <span className="paratext-saved">{status === "saving" ? "저장 중…" : "저장됨"}</span>
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
        <TopicAskModal initial={myTopic} onSave={saveTopic} onClose={() => setTopicAsk(false)} />
      )}

      {!loaded ? (
        <p className="empty-note">불러오는 중이에요…</p>
      ) : (
        <div className="qmark-wrap">
          {/* 이 활동의 흐름을 한 줄로 — 책에 물음표를 붙이는 일은 화면 밖에서
              합니다(종이책 여백 · 포스트잇). 여기서는 그 가운데 하나를 고릅니다. */}
          <p className="qmark-guide">
            <span className={`qmark-guide-step${askDone ? " done" : ""}`}>
              <b>①</b> 읽으며 궁금한 곳에 <b className="qmark-q">?</b>를 붙이고, 가장 중요한 물음 하나와 그 이유를 적어요
            </span>
            <span className="qmark-guide-arrow" aria-hidden="true">→</span>
            <span className={`qmark-guide-step${answered >= QMARK_MIN_PICKS ? " done" : ""}`}>
              <b>②</b> 아래 물음 가운데 <b>{QMARK_MIN_PICKS}개 이상</b> 골라 내 생각을 써요
            </span>
          </p>

          <div className="qmark-form">
            <section className={`qmark-sec qmark-sec--ask${askDone ? " filled" : ""}`}>
              <h2 className="qmark-sec-title">
                <span className="qmark-badge" aria-hidden="true">?</span>
                나의 물음표
                <em>여백에 적은 물음 가운데 가장 중요하다고 생각하는 물음 하나</em>
              </h2>
              <label className="qmark-field">
                <span className="qmark-field-lab">궁금증</span>
                <textarea
                  rows={3}
                  value={answers.question}
                  onChange={(e) => edit("question", e.target.value)}
                  placeholder="예: 주인공은 왜 끝까지 사실을 말하지 않았을까?"
                  disabled={locked}
                />
              </label>
              <label className="qmark-field">
                <span className="qmark-field-lab">이유는</span>
                <textarea
                  rows={5}
                  value={answers.reason}
                  onChange={(e) => edit("reason", e.target.value)}
                  placeholder="이 물음이 궁금했던 까닭 · 중요하다고 생각한 까닭을 적어 보세요"
                  disabled={locked}
                />
              </label>
            </section>

            <section className={`qmark-sec qmark-sec--think${answered >= QMARK_MIN_PICKS ? " filled" : ""}`}>
              <h2 className="qmark-sec-title">
                <span className="qmark-badge qmark-badge--think" aria-hidden="true">✓</span>
                나의 생각
                <em>{QMARK_MIN_PICKS}개 이상 골라 답하기</em>
                <b className={`qmark-count${answered >= QMARK_MIN_PICKS ? " full" : ""}`}>
                  {answered} / {QMARK_MIN_PICKS}
                </b>
              </h2>
              {/* 무엇에 대한 생각인지 — 위에 적은 물음을 그대로 한 줄 */}
              <p className={`qmark-myq${question ? "" : " empty"}`}>
                {question ? `“${question}”` : "먼저 왼쪽에 나의 물음을 적어 주세요."}
              </p>
              <ul className="qmark-prompts">
                {QMARK_PROMPTS.map((p) => {
                  const on = answers.picks.includes(p.key);
                  const filled = on && answers[p.key].trim().length > 0;
                  return (
                    <li key={p.key} className={`qmark-prompt${on ? " on" : ""}${filled ? " filled" : ""}`}>
                      <label className="qmark-check">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => togglePick(p.key)}
                          disabled={locked}
                        />
                        <span className="qmark-check-text">{p.text}</span>
                      </label>
                      {on && (
                        <textarea
                          id={`qmark-${p.key}`}
                          rows={4}
                          value={answers[p.key]}
                          onChange={(e) => edit(p.key, e.target.value)}
                          placeholder="이 물음에 대한 내 생각을 적어 보세요"
                          disabled={locked}
                          aria-label={p.text}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
