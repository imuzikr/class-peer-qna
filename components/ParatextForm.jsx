"use client";

// =============================================================
// 곁텍스트 읽기 — 학생 입력 화면 (개인 활동)
// -------------------------------------------------------------
// 본문을 읽기 전에 표지·책날개·제목·목차·머리말·참고문헌·그림만 훑어보고
// 책의 내용을 미리 짐작해 적습니다. 항목은 lib/paratext.js가 정합니다.
//
// 카드를 누르면 그 항목만 크게 쓸 수 있는 모달이 열립니다 — 여덟 항목을
// 한 화면에 늘어놓고 좁은 칸에 쓰게 하는 대신, 한 번에 하나씩 편하게
// 쓰도록 한 선택입니다. 모달 안에서 이전/다음으로 항목을 옮겨 다닐 수 있어
// 닫았다 다시 여는 수고가 없습니다.
//
// 저장은 '자동'입니다 — 마지막 입력에서 잠시 손을 떼면 조용히 저장하고,
// 모달 안에 저장 상태만 알려 줍니다. 수업 중에 저장 버튼을 못 눌러
// 글이 날아가는 일이 없도록 한 선택입니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeMyParatextEntry, saveParatextEntry, saveParatextTopic } from "@/lib/store";
import { backdropClose } from "@/lib/modal";
import {
  PARATEXT_SECTIONS,
  PARATEXT_SECTION_COUNT,
  emptyParatextAnswers,
  isSectionDone,
  isSectionStarted,
  paratextDoneCount,
  safeBookUrl,
} from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";

const SAVE_DELAY = 900; // ms — 이만큼 입력이 없으면 저장

// 카드에 보일 짧은 미리보기 — 이 항목에 쓴 글을 이어 붙여 한두 줄로.
function sectionPreview(section, answers) {
  const text = section.fields
    .map((f) => String(answers[f.key] ?? "").trim())
    .filter(Boolean)
    .join(" · ");
  return text;
}

export default function ParatextForm({ activity, user, onBack }) {
  const [answers, setAnswers] = useState(emptyParatextAnswers);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  const [openIndex, setOpenIndex] = useState(null); // 모달로 연 항목 (PARATEXT_SECTIONS 인덱스)
  // 내가 적은 주제어(도서명) — 교사가 활동에 주제어를 넣지 않았을 때 씁니다.
  // 읽는 책이 학생마다 다를 수 있어, 그때는 각자 적습니다.
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
        setAnswers({ ...emptyParatextAnswers(), ...(entry?.answers ?? {}) });
      }
      setMyTopic(entry?.topic ?? "");
      setLoaded(true);
    });
  }, [activity.id, user?.uid]);

  // 활동에도 없고 내가 적은 것도 없으면 한 번 물어봅니다 — 무엇을 읽고 쓰는
  // 건지 모른 채 여덟 칸을 채우기 시작하지 않도록. 닫으면 다시 뜨지 않고,
  // 배지를 눌러 언제든 적을 수 있습니다(닫을 길을 막지 않습니다).
  const askedRef = useRef(false);
  useEffect(() => {
    if (!loaded || locked || askedRef.current) return;
    if ((activity.topic ?? "").trim() || myTopic.trim()) return;
    askedRef.current = true;
    setTopicAsk(true);
  }, [loaded, locked, activity.topic, myTopic]);

  // 화면에 쓸 주제어 — 교사가 정해 둔 것이 있으면 그것이 먼저입니다.
  // (반 전체가 같은 책을 읽는 활동에서 학생이 제 것으로 바꿔 부르면 안 됩니다)
  const shownTopic = (activity.topic ?? "").trim() || myTopic.trim();
  const canEditTopic = !(activity.topic ?? "").trim() && !locked;

  async function saveTopic(next) {
    const text = String(next ?? "").trim();
    setMyTopic(text);
    setTopicAsk(false);
    if (text) await saveParatextTopic(activity.id, user, text);
  }

  // 입력이 멈추면 저장 — 타자 한 글자마다 쓰지 않도록 잠깐 모았다 보냅니다.
  useEffect(() => {
    if (!dirtyRef.current || locked) return;
    clearTimeout(timerRef.current);
    setStatus("saving");
    timerRef.current = setTimeout(async () => {
      try {
        await saveParatextEntry(activity.id, user, answers);
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

  const done = useMemo(() => paratextDoneCount(answers), [answers]);
  const openSection = openIndex != null ? PARATEXT_SECTIONS[openIndex] : null;

  return (
    <main className="books-main paratext-main">
      <div className="books-head">
        {/* 교사 화면(ParatextBoard)과 같은 짜임 — 제목 줄에 돌아가는 길,
            둘째 줄에 딸림 정보(도서명·주제) */}
        <div className="books-head-title">
          <h1 className="book-group-title">{activity.title}</h1>
          <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
        </div>
        {/* 둘째 줄에 아무것도 없을 수 있습니다 — 주제어를 안 정한 채 잠긴
            활동에서 학생이 제 책을 적기 전이면 배지도 적기 버튼도 없습니다.
            빈 줄이 남으면 제목 아래가 괜히 벌어져, 내용이 있을 때만 그립니다. */}
        {(shownTopic || canEditTopic || bookUrl) && (
        <div className="books-head-row">
          <div className="books-head-main">
            {shownTopic ? (
              canEditTopic ? (
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
              )
            ) : (
              canEditTopic && (
                <button
                  type="button"
                  className="book-group-topic book-topic-edit is-empty"
                  onClick={() => setTopicAsk(true)}
                >
                  ＋ 도서명·주제 적기
                </button>
              )
            )}
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
            {done} / {PARATEXT_SECTION_COUNT}칸
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

      <p className="books-intro">
        아직 본문은 읽지 마세요. 표지·제목·목차처럼 <b>본문을 둘러싼 것</b>만 보고
        어떤 책일지 짐작해 적어 봅니다. 카드를 누르면 크게 써 볼 수 있어요.
      </p>

      {!loaded ? (
        <p className="empty-note">불러오는 중이에요…</p>
      ) : (
        <div className="paratext-grid">
          {PARATEXT_SECTIONS.map((s, i) => {
            const doneFlag = isSectionDone(s, answers);
            const state = doneFlag ? "done" : isSectionStarted(s, answers) ? "doing" : "empty";
            const preview = sectionPreview(s, answers);
            return (
              <button
                key={s.key}
                type="button"
                className={`paratext-card ${state}`}
                onClick={() => setOpenIndex(i)}
              >
                <span className="paratext-card-head">
                  <span className="paratext-letter" aria-hidden="true">{s.letter}</span>
                  <span className="paratext-card-title">
                    <strong>{s.ko}</strong>
                    <em>{s.en}</em>
                  </span>
                  <span className="paratext-step">{i + 1}/{PARATEXT_SECTION_COUNT}</span>
                </span>
                <span className="paratext-prompt">{s.prompt}</span>
                {preview ? (
                  <span className="paratext-preview">{preview}</span>
                ) : (
                  <span className="paratext-preview empty">아직 쓰지 않았어요 — 눌러서 써 보세요</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {openSection && (
        <SectionModal
          section={openSection}
          index={openIndex}
          total={PARATEXT_SECTION_COUNT}
          answers={answers}
          locked={locked}
          status={status}
          onChange={edit}
          onPrev={openIndex > 0 ? () => setOpenIndex(openIndex - 1) : null}
          onNext={openIndex < PARATEXT_SECTION_COUNT - 1 ? () => setOpenIndex(openIndex + 1) : null}
          onClose={() => setOpenIndex(null)}
        />
      )}

      {topicAsk && (
        <TopicAskModal
          initial={myTopic}
          onSave={saveTopic}
          onClose={() => setTopicAsk(false)}
        />
      )}
    </main>
  );
}

// 무엇을 읽고 있나 — 교사가 활동에 주제어를 넣지 않았을 때 학생이 적습니다.
// 닫을 수 있게 둡니다: 아직 책을 못 정했을 수도 있고, 막아 두면 여덟 칸을
// 아예 열지 못하게 됩니다. 나중에 배지를 눌러 적으면 됩니다.
function TopicAskModal({ initial, onSave, onClose }) {
  const [text, setText] = useState(initial ?? "");
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  function submit(e) {
    e.preventDefault();
    // 조합 중인 한글은 state에 늦게 들어오므로 입력칸의 실제 값을 씁니다
    onSave(inputRef.current?.value ?? text);
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <form
        className="modal modal-topic-ask"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>무슨 책을 읽고 있나요?</h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <p className="modal-topic-note">
          도서명이나 오늘의 주제를 적어 주세요. 내 카드에 표시됩니다.
        </p>
        <input
          ref={inputRef}
          type="text"
          className="modal-topic-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="예) 어린 왕자"
          maxLength={40}
          aria-label="도서명 또는 주제"
        />
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>나중에</button>
          <button type="submit" className="btn-primary">저장</button>
        </div>
      </form>
    </div>
  );
}

// 항목 하나를 크게 써 넣는 모달 — 이전/다음으로 닫지 않고 옮겨 다닙니다.
function SectionModal({ section, index, total, answers, locked, status, onChange, onPrev, onNext, onClose }) {
  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal paratext-write-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>
            <span className="paratext-letter" aria-hidden="true">{section.letter}</span>
            <span className="paratext-card-title">
              <strong>{section.ko}</strong>
              <em>{section.en}</em>
            </span>
          </h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="paratext-write-meta">
          <span className="paratext-step">{index + 1}/{total}</span>
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

        <p className="paratext-prompt">
          {section.prompt}
          {section.hint && <em className="paratext-hint">{section.hint}</em>}
        </p>

        <div className="paratext-fields">
          {section.fields.map((f, i) => (
            <label key={f.key} className="paratext-field">
              {f.label && (
                <span>
                  {f.label}
                  {f.optional && <em className="book-optional">선택</em>}
                </span>
              )}
              <textarea
                rows={Math.max(f.lines + 2, 5)}
                value={answers[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
                placeholder={f.placeholder}
                disabled={locked}
                autoFocus={i === 0}
              />
            </label>
          ))}
        </div>

        <div className="paratext-write-nav">
          <button type="button" className="btn-ghost" onClick={onPrev} disabled={!onPrev}>
            ← 이전 항목
          </button>
          <button type="button" className="btn-primary" onClick={onNext ?? onClose}>
            {onNext ? "다음 항목 →" : "마치기"}
          </button>
        </div>
      </div>
    </div>
  );
}
