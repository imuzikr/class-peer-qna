"use client";

// =============================================================
// 물음표로 책 읽기 — 학생 입력 화면 (개인 활동)
// -------------------------------------------------------------
// 종이 활동지를 옮기되, 두 군데를 넓혔습니다(선생님 요청).
//   ① 나의 물음표 — 읽으며 물음표를 붙인 곳 가운데 중요한 물음과 그 이유를
//      적습니다. 칸은 **처음부터 다섯 쌍**(QMARK_ASK_COUNT)이 서 있고 학생은
//      내용만 적습니다 — 더하기 · 빼기 단추가 없습니다(선생님 요청). 쌍은
//      **접었다 폅니다** — 펼친 것은 하나, 나머지는 번호 · 궁금증 한 줄 ·
//      상태로 접힙니다. 접힌 줄은 오른쪽 '물음 고르기'의 줄과 **같은 높이**라
//      다섯 줄씩 나란히 맞습니다.
//   ② 물음 고르기 — 다섯 물음 가운데 **두 개 이상** 체크합니다.
//   ③ 나의 생각 정리 — 체크한 물음을 길잡이 삼아 **한 칸에** 씁니다. 예전에는
//      체크한 물음마다 칸이 따로 열렸는데, 생각이 물음마다 조각나 한 편의
//      글로 이어지지 않았습니다.
//
// 넓은 화면에서는 ①｜② 두 열이고, ③은 그 아래 **가로를 다 쓰는 한 줄**
// 입니다(두 열 어느 쪽에도 속하지 않는 마무리 자리). 좁아지면 한 줄로 쌓입니다. 접는 기준은
// 창이 아니라 이 화면의 폭입니다(`@container` — 책방은 양옆에 패널이 서서
// 창 폭으로는 모릅니다. 해시태그 폼과 같은 까닭).
//
// 저장은 자동입니다(입력을 멈추면 조용히). 자리는 곁텍스트 · RAFT와 같은
// entries/{uid}.answers라 규칙을 안 건드립니다. 셈 · 옛 모양 읽기는 lib/qmark.js.
// =============================================================
import { useEffect, useRef, useState } from "react";
import { subscribeMyParatextEntry, saveParatextEntry, saveParatextTopic } from "@/lib/store";
import TopicAskModal from "./TopicAskModal";
import {
  QMARK_PROMPTS,
  QMARK_MIN_PICKS,
  QMARK_ASK_COUNT,
  QMARK_TEXT_MAX,
  QMARK_THOUGHT_MAX,
  emptyQmarkAnswers,
  normalizeQmarkAnswers,
  editQmarkAsk,
  toggleQmarkPick,
  qmarkChars,
  qmarkDone,
  qmarkQuestionDone,
  qmarkThoughtDone,
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
  // 펼친 물음표 쌍(하나만, 없으면 null) — 나머지는 한 줄로 접힙니다.
  // 처음에는 아직 다 안 쓴 첫 쌍을 폅니다(해시태그 카드와 같은 약속).
  const [openAsk, setOpenAsk] = useState(null);
  const openInitRef = useRef(false);

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

  function editAsk(index, field, value) {
    dirtyRef.current = true;
    setAnswers((prev) => editQmarkAsk(prev, index, field, value));
  }
  function editThought(value) {
    dirtyRef.current = true;
    setAnswers((prev) => ({ ...prev, thought: value }));
  }
  function togglePick(key) {
    if (locked) return;
    dirtyRef.current = true;
    setAnswers((prev) => toggleQmarkPick(prev, key));
  }
  useEffect(() => {
    if (!loaded || openInitRef.current) return;
    openInitRef.current = true;
    const i = answers.asks.findIndex((x) => !(x.question.trim() && x.reason.trim()));
    setOpenAsk(i >= 0 ? i : null);
  }, [loaded, answers.asks]);
  const picked = answers.picks.length;
  const askDone = qmarkQuestionDone(answers);
  const thoughtDone = qmarkThoughtDone(answers);
  const done = qmarkDone(answers);
  const askCount = answers.asks.filter((x) => x.question.trim() || x.reason.trim()).length;

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
            {done
              ? "완성"
              : `물음표 ${askCount}개${askDone ? " ✓" : ""} · 고른 물음 ${picked} / ${QMARK_MIN_PICKS} · 나의 생각 ${thoughtDone ? "✓" : "–"}`}
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
              합니다(종이책 여백 · 포스트잇). 여기서는 그 가운데 중요한 것을 적습니다. */}
          <p className="qmark-guide">
            <span className={`qmark-guide-step${askDone ? " done" : ""}`}>
              <b>①</b> 읽으며 궁금한 곳에 <b className="qmark-q">?</b>를 붙이고, 중요한 물음과 그 이유를 적어요
            </span>
            <span className="qmark-guide-arrow" aria-hidden="true">→</span>
            <span className={`qmark-guide-step${picked >= QMARK_MIN_PICKS ? " done" : ""}`}>
              <b>②</b> {QMARK_PROMPTS.length}개의 체크리스트에서 <b>{QMARK_MIN_PICKS}개 이상</b> 선택하세요
            </span>
            <span className="qmark-guide-arrow" aria-hidden="true">→</span>
            <span className={`qmark-guide-step${thoughtDone ? " done" : ""}`}>
              <b>③</b> 체크한 물음을 길잡이로 나의 생각을 정리해요
            </span>
          </p>

          <div className="qmark-form">
            <section className={`qmark-sec qmark-sec--ask${askDone ? " filled" : ""}`}>
              <h2 className="qmark-sec-title">
                <span className="qmark-badge" aria-hidden="true">?</span>
                나의 물음표
                <em title="여백에 적은 물음 가운데 중요하다고 생각하는 물음">여백에 적은 물음 가운데 중요하다고 생각하는 물음</em>
                <b className="qmark-count">
                  {askCount} / {QMARK_ASK_COUNT}
                </b>
              </h2>
              {/* 쌍마다 접었다 폅니다 — 펼친 것은 하나. 접힌 줄에는 번호 · 궁금증
                  한 줄 · 상태만 서서, 여러 개를 적어도 목록이 한눈에 듭니다.
                  머리줄 전체가 여닫는 단추입니다. 칸은 늘 다섯이라 더하고
                  빼는 단추가 없습니다. */}
              <ol className="qmark-asks">
                {answers.asks.map((x, i) => {
                  const q = x.question.trim();
                  const r = x.reason.trim();
                  const filled = q && r;
                  const open = openAsk === i;
                  const state = filled ? "완성" : q || r ? "쓰는 중" : "비어 있음";
                  return (
                    <li key={i} className={`qmark-ask${filled ? " filled" : ""}${open ? " open" : ""}`}>
                      <div className="qmark-ask-head">
                        <button
                          type="button"
                          className="qmark-ask-toggle"
                          onClick={() => setOpenAsk(open ? null : i)}
                          aria-expanded={open}
                          aria-controls={`qmark-ask-body-${i}`}
                        >
                          <svg className="qmark-ask-caret" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                            <path d="M4 2.5 L8 6 L4 9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="qmark-ask-no">물음표 {i + 1}</span>
                          {!open && (
                            <span className={`qmark-ask-peek${q ? "" : " empty"}`}>
                              {q || "아직 궁금증을 적지 않았어요"}
                            </span>
                          )}
                          <span className={`qmark-ask-state${filled ? " done" : q || r ? " doing" : ""}`}>{state}</span>
                        </button>
                      </div>
                      {open && (
                        <div className="qmark-ask-body" id={`qmark-ask-body-${i}`}>
                          <label className="qmark-field">
                            <span className="qmark-field-lab">궁금증</span>
                            <textarea
                              id={`qmark-ask-${i}`}
                              rows={2}
                              value={x.question}
                              onChange={(e) => editAsk(i, "question", e.target.value)}
                              placeholder={i === 0 ? "예: 주인공은 왜 끝까지 사실을 말하지 않았을까?" : "또 하나의 궁금증"}
                              maxLength={QMARK_TEXT_MAX}
                              disabled={locked}
                            />
                          </label>
                          <label className="qmark-field">
                            <span className="qmark-field-lab">이유는</span>
                            <textarea
                              rows={3}
                              value={x.reason}
                              onChange={(e) => editAsk(i, "reason", e.target.value)}
                              placeholder="이 물음이 궁금했던 까닭 · 중요하다고 생각한 까닭"
                              maxLength={QMARK_TEXT_MAX}
                              disabled={locked}
                            />
                          </label>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>

            <section className={`qmark-sec qmark-sec--pick${picked >= QMARK_MIN_PICKS ? " filled" : ""}`}>
              <h2 className="qmark-sec-title">
                <span className="qmark-badge qmark-badge--think" aria-hidden="true">✓</span>
                물음 고르기
                <em>{QMARK_MIN_PICKS}개 이상 체크</em>
                <b className={`qmark-count${picked >= QMARK_MIN_PICKS ? " full" : ""}`}>
                  {picked} / {QMARK_MIN_PICKS}
                </b>
              </h2>
              <ul className="qmark-prompts">
                {QMARK_PROMPTS.map((p) => {
                  const on = answers.picks.includes(p.key);
                  return (
                    <li key={p.key} className={`qmark-prompt${on ? " on" : ""}`}>
                      <label className="qmark-check">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => togglePick(p.key)}
                          disabled={locked}
                        />
                        <span className="qmark-check-text">{p.text}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          {/* 나의 생각 — 두 열 아래 **따로 선 한 줄**(선생님 요청). 두 열 가운데
              어느 쪽에도 속하지 않는 마무리 자리라 가로를 다 씁니다. 체크한
              물음을 칸 위에 한 줄씩 되풀이해 무엇을 길잡이로 쓰는지 보입니다. */}
          <section className={`qmark-sec qmark-sec--think${thoughtDone ? " filled" : ""}`}>
            <h2 className="qmark-sec-title">
              <span className="qmark-badge qmark-badge--think" aria-hidden="true">✎</span>
              나의 생각 정리
              <em>체크한 물음에 대한 내 생각</em>
            </h2>
            {picked > 0 ? (
              <ul className="qmark-picked">
                {QMARK_PROMPTS.filter((p) => answers.picks.includes(p.key)).map((p) => (
                  <li key={p.key}>{p.text}</li>
                ))}
              </ul>
            ) : (
              <p className="qmark-picked-empty">위에서 물음을 {QMARK_MIN_PICKS}개 이상 체크해 주세요.</p>
            )}
            <textarea
              className="qmark-thought"
              rows={10}
              value={answers.thought}
              onChange={(e) => editThought(e.target.value)}
              placeholder="체크한 물음을 떠올리며, 이 책을 읽고 알게 된 것 · 달라진 생각을 이어서 적어 보세요"
              maxLength={QMARK_THOUGHT_MAX}
              disabled={locked}
              aria-label="나의 생각 정리"
            />
          </section>
        </div>
      )}

    </main>
  );
}
