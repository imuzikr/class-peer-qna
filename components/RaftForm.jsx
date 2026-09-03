"use client";

// =============================================================
// RAFT 글쓰기 — 학생 입력 화면 (개인 활동)
// -------------------------------------------------------------
// 위쪽 네 열에 역할·청중·형식·주제를 정하고, 아래 넓은 칸에 그대로 글을 씁니다.
// 항목이 넷뿐이라 곁텍스트 읽기처럼 모달을 거치지 않고 화면에서 바로 씁니다.
//
// 네 요소를 정하면 머리말 아래에 '나는 …가 되어, …에게, … 형식으로, …에 대해
// 씁니다' 문장이 만들어집니다 — 무엇을 쓸지 스스로 확인하고 시작하도록.
//
// 저장은 자동입니다(입력을 멈추면 조용히 저장).
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  subscribeMyParatextEntry,
  saveParatextEntry,
  saveParatextTopic,
  subscribeMyPeerReviews,
  subscribeReceivedPeerReviews,
} from "@/lib/store";
import TopicAskModal from "./TopicAskModal";
import {
  RAFT_COLUMNS,
  RAFT_COLUMN_COUNT,
  RAFT_FORMATS,
  RAFT_WRITING,
  emptyRaftAnswers,
  raftPlanCount,
  raftPlanDone,
  raftSentence,
  raftWritingChars,
} from "@/lib/raft";
import { safeBookUrl } from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";
import GroupMatesRow from "./GroupMatesRow";
import GroupJoinRow from "./GroupJoinRow";
import PeerReviewModal, { PeerReviewList } from "./PeerReviewModal";
import { isGroupedActivity, useBookGroups, myBookGroup, groupMembers } from "@/lib/bookGroups";

const SAVE_DELAY = 900; // ms — 이만큼 입력이 없으면 저장

export default function RaftForm({ activity, user, onBack }) {
  const [answers, setAnswers] = useState(emptyRaftAnswers);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  // 내가 적은 주제어(도서명) — 교사가 활동에 주제어를 넣지 않았을 때 씁니다.
  // 읽고 쓰는 책이 학생마다 다를 수 있어, 그때는 각자 적습니다
  // (곁텍스트 읽기와 같은 방식 — 같은 entries/{uid}.topic 자리를 씁니다).
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

  // 동료 평가 — 모둠이 있을 때만. 교사가 잠그면(peerReviewLocked) 읽기만.
  const peerLocked = activity.peerReviewLocked === true || locked;
  const [peerOpen, setPeerOpen] = useState(null); // null | { uid } — 열 때 고를 사람
  const [myReviews, setMyReviews] = useState([]);
  const [gotReviews, setGotReviews] = useState([]);
  useEffect(() => {
    if (!grouped || !user?.uid) { setMyReviews([]); setGotReviews([]); return undefined; }
    const a = subscribeMyPeerReviews(activity.id, user.uid, setMyReviews);
    const b = subscribeReceivedPeerReviews(activity.id, user.uid, setGotReviews);
    return () => { a(); b(); };
  }, [grouped, activity.id, user?.uid]);

  useEffect(() => {
    return subscribeMyParatextEntry(activity.id, user?.uid, (entry) => {
      if (!dirtyRef.current) {
        setAnswers({ ...emptyRaftAnswers(), ...(entry?.answers ?? {}) });
      }
      setMyTopic(entry?.topic ?? "");
      setLoaded(true);
    });
  }, [activity.id, user?.uid]);

  // 활동에도 없고 내가 적은 것도 없으면 한 번 물어봅니다 — 무엇을 읽고 쓰는
  // 건지 모른 채 역할·청중을 정하기 시작하지 않도록. 닫으면 다시 뜨지 않고,
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

  const planCount = useMemo(() => raftPlanCount(answers), [answers]);
  const planDone = planCount === RAFT_COLUMN_COUNT;
  const chars = raftWritingChars(answers);

  return (
    <main className="books-main raft-main">
      <div className="books-head">
        {/* 교사 화면(RaftBoard)과 같은 짜임 — 제목 줄에 돌아가는 길,
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
        {/* 둘째 줄에 아무것도 없을 수 있습니다 — 주제어를 안 정한 채 잠긴
            활동에서 학생이 제 책을 적기 전이면 배지도 없습니다. */}
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
            {planCount} / {RAFT_COLUMN_COUNT}칸 · {chars}자
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

      {!loaded ? (
        <p className="empty-note">불러오는 중이에요…</p>
      ) : (
        <>
          {/* 우리 모둠 — 내가 쓰는 칸 바로 위에 둡니다. 모둠으로 묶여도 글은
              각자 한 장이라, 이 줄이 없으면 학생 화면에서는 모둠이 있는지조차
              알 수 없습니다. */}
          {needsJoin ? (
            <GroupJoinRow
              activity={activity}
              groups={groups}
              user={user}
              maxPerGroup={activity.maxPerGroup ?? 6}
            />
          ) : (
            <GroupMatesRow
              group={myGroup}
              members={mates}
              meUid={user?.uid}
              /* 이름을 누르면 그 친구에게 바로 — 발표를 들으며 쓰는 흐름 */
              onPick={mates.length > 1 ? (m) => setPeerOpen({ uid: m.uid }) : null}
              actions={
                mates.length > 1 && (
                  <button
                    type="button"
                    className="btn-ghost peer-open-btn"
                    onClick={() => setPeerOpen({ uid: null })}
                  >
                    ✍️ 동료 평가
                    {myReviews.length > 0 && <em>{myReviews.length}</em>}
                  </button>
                )
              }
            />
          )}

          {/* 정한 네 요소를 한 문장으로 — 무엇을 쓸지 스스로 확인하고 시작하게 */}
          <p className={`raft-sentence${planDone ? " done" : ""}`}>
            {raftSentence(answers)}
          </p>

          <div className="raft-grid">
            {RAFT_COLUMNS.map((c) => (
              <section
                key={c.key}
                className={`raft-col${String(answers[c.key] ?? "").trim() ? " filled" : ""}`}
              >
                <header className="raft-col-head">
                  <span className="paratext-letter" aria-hidden="true">{c.letter}</span>
                  <span className="paratext-card-title">
                    <strong>{c.ko}</strong>
                    <em>{c.en}</em>
                  </span>
                </header>
                <p className="raft-col-prompt">
                  {c.prompt}
                  {c.hint && <em className="paratext-hint">{c.hint}</em>}
                </p>
                <textarea
                  rows={3}
                  value={answers[c.key] ?? ""}
                  onChange={(e) => edit(c.key, e.target.value)}
                  placeholder={c.placeholder}
                  disabled={locked}
                />
                {/* 형식만 자주 쓰는 것을 눌러 넣을 수 있게 */}
                {c.key === "format" && !locked && (
                  <div className="raft-chips">
                    {RAFT_FORMATS.map((f) => (
                      <button
                        key={f}
                        type="button"
                        className={`raft-chip${answers.format === f ? " on" : ""}`}
                        onClick={() => edit("format", f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          <section className="raft-write">
            <header className="raft-write-head">
              <strong>{RAFT_WRITING.ko}</strong>
              <span className="raft-write-count">{chars}자</span>
            </header>
            <p className="raft-col-prompt">
              {planDone
                ? RAFT_WRITING.prompt
                : "먼저 위 네 칸을 정하면 무엇을 쓸지 뚜렷해집니다."}
            </p>
            <textarea
              rows={14}
              value={answers[RAFT_WRITING.key] ?? ""}
              onChange={(e) => edit(RAFT_WRITING.key, e.target.value)}
              placeholder={RAFT_WRITING.placeholder}
              disabled={locked}
            />
          </section>
        </>
      )}

      {/* 친구들이 내게 남긴 한 마디 — 내가 쓴 글 아래에 둡니다.
          규칙이 '받은 사람과 쓴 사람과 교사'에게만 열어 두어, 남의 평가는
          여기 오지 않습니다. */}
      {grouped && <PeerReviewList reviews={gotReviews} />}

      {peerOpen && myGroup && (
        <PeerReviewModal
          activity={activity}
          group={myGroup}
          members={mates}
          user={user}
          myReviews={myReviews}
          initialUid={peerOpen.uid}
          locked={peerLocked}
          onClose={() => setPeerOpen(null)}
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
