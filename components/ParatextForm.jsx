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
import TopicAskModal from "./TopicAskModal";
import { backdropClose } from "@/lib/modal";
import {
  PARATEXT_SECTIONS,
  PARATEXT_SECTION_COUNT,
  emptyParatextAnswers,
  isSectionDone,
  isSectionStarted,
  isSectionLocked,
  paratextDoneCount,
  safeBookUrl,
} from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";
import GroupMatesRow from "./GroupMatesRow";
import GroupJoinRow from "./GroupJoinRow";
import { isGroupedActivity, useBookGroups, myBookGroup, groupMembers } from "@/lib/bookGroups";

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

  // 모둠으로 진행하는 활동이면 내 모둠원을 이름 칩으로 보여 줍니다.
  // 글은 각자 한 장 그대로 — 모둠은 '누구와 함께 보는가'만 정합니다.
  const grouped = isGroupedActivity(activity);
  const groups = useBookGroups(activity.id, grouped);
  const myGroup = myBookGroup(groups, user?.uid);
  const mates = groupMembers(myGroup);
  // '자유 구성'인데 아직 모둠에 안 들었으면 고르는 줄을 대신 둡니다.
  const needsJoin = grouped && !myGroup && activity.groupMode === "free";

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
          {/* 아직 제 책을 안 적었을 때만 — 제목 줄에 '활동 목록'과 나란히
              둡니다. 둘째 줄에 있을 때는 배지처럼 생겨서 눌러야 하는 것인지
              알기 어려웠고, 학생이 활동에 들어와 가장 먼저 할 일이라
              제목 줄이 제자리입니다. 적고 나면 그 값은 둘째 줄 배지가
              보여 주므로 이 버튼은 사라집니다. */}
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
        {/* 둘째 줄에 아무것도 없을 수 있습니다 — 주제어를 안 정한 채 잠긴
            활동에서 학생이 제 책을 적기 전이면 배지도 없습니다.
            빈 줄이 남으면 제목 아래가 괜히 벌어져, 내용이 있을 때만 그립니다. */}
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

      {/* 우리 모둠 — 내가 쓰는 칸 바로 위에. 모둠으로 묶여도 글은 각자
          한 장이라, 이 줄이 없으면 모둠이 있는지조차 알 수 없습니다. */}
      {needsJoin ? (
        <GroupJoinRow
          activity={activity}
          groups={groups}
          user={user}
          maxPerGroup={activity.maxPerGroup ?? 6}
        />
      ) : (
        <GroupMatesRow group={myGroup} members={mates} meUid={user?.uid} />
      )}

      {!loaded ? (
        <p className="empty-note">불러오는 중이에요…</p>
      ) : (
        <div className="paratext-grid">
          {PARATEXT_SECTIONS.map((s, i) => {
            const doneFlag = isSectionDone(s, answers);
            const state = doneFlag ? "done" : isSectionStarted(s, answers) ? "doing" : "empty";
            const preview = sectionPreview(s, answers);
            // 아직 안 열린 단계 — 숨기지 않고 잠급니다. CATAPULT는 순서 자체가
            // 배우는 내용이라 앞으로 뭐가 오는지 보이는 편이 낫습니다.
            // 이미 쓴 답이 있으면 그대로 보여 줍니다(교사가 다시 닫았을 때
            // 지워진 것처럼 보이면 안 됩니다).
            const stepLocked = isSectionLocked(activity, s.key);
            return (
              <button
                key={s.key}
                type="button"
                className={`paratext-card ${state}${stepLocked ? " step-locked" : ""}`}
                onClick={() => setOpenIndex(i)}
                title={stepLocked ? "선생님이 아직 열지 않은 단계예요" : undefined}
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
                ) : stepLocked ? (
                  <span className="paratext-preview empty">
                    <IconLock size={13} /> 선생님이 열어 주면 쓸 수 있어요
                  </span>
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
          /* 활동 전체가 잠겼거나, 아직 안 열린 단계면 읽기 전용입니다 */
          locked={locked || isSectionLocked(activity, openSection.key)}
          stepLocked={!locked && isSectionLocked(activity, openSection.key)}
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

// 항목 하나를 크게 써 넣는 모달 — 이전/다음으로 닫지 않고 옮겨 다닙니다.
function SectionModal({ section, index, total, answers, locked, stepLocked = false, status, onChange, onPrev, onNext, onClose }) {
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
          {/* '아직 안 연 단계'와 '활동 전체 잠김'은 학생이 할 일이 다릅니다 —
              앞은 기다리면 되고, 뒤는 이 활동이 끝난 것입니다. */}
          {stepLocked ? (
            <span className="paratext-saved locked">
              <IconLock size={14} /> 선생님이 열어 주면 쓸 수 있어요
            </span>
          ) : locked ? (
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
