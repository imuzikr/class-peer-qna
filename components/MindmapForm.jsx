"use client";

// =============================================================
// 마인드맵 — 학생 화면 (개인 활동)
// -------------------------------------------------------------
// 활동을 열면 먼저 '내 마인드맵' 카드가 보이고, 그 카드를 누르면 자기
// 판으로 들어갑니다. 판에서는 방사형·계층형 가운데 하나를 고르고 가지를
// 붙여 나갑니다.
//
// 저장은 자동입니다(입력을 멈추면 조용히 저장).
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeMyParatextEntry, saveParatextEntry, saveParatextTopic } from "@/lib/store";
import TopicAskModal from "./TopicAskModal";
import {
  MINDMAP_LAYOUTS,
  ROOT_ID,
  branchCount,
  emptyMindmap,
  maxDepth,
  normalizeMindmap,
  withRadialPositions,
} from "@/lib/mindmap";
import { safeBookUrl } from "@/lib/paratext";
import MindmapCanvas from "./MindmapCanvas";
import { IconBook, IconLock } from "./StatusIcons";

const SAVE_DELAY = 900; // ms — 이만큼 입력이 없으면 저장

export default function MindmapForm({ activity, user, onBack }) {
  const [map, setMap] = useState(() => emptyMindmap(activity.topic));
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false); // 내 카드를 눌러 판으로 들어왔는지
  const [selectedId, setSelectedId] = useState(ROOT_ID);
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  // 내가 적은 주제어 — 교사가 활동에 주제어를 넣지 않았을 때 씁니다.
  // 다루는 주제가 학생마다 다를 수 있어, 그때는 각자 적습니다
  // (곁텍스트 읽기와 같은 방식 — 같은 entries/{uid}.topic 자리를 씁니다).
  const [myTopic, setMyTopic] = useState("");
  const [topicAsk, setTopicAsk] = useState(false); // 물어보는 창이 떠 있는지
  // 내가 고친 뒤로는 서버 값이 와도 덮어쓰지 않습니다(편집 중 그림이 튀는 것 방지)
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);

  const locked = !!activity.locked;
  const bookUrl = safeBookUrl(activity.bookUrl);

  useEffect(() => {
    return subscribeMyParatextEntry(activity.id, user?.uid, (entry) => {
      if (!dirtyRef.current) {
        // 한가운데 낱말은 교사가 정한 주제어, 없으면 내가 적은 것으로 시작합니다
        setMap(normalizeMindmap(entry?.answers, (activity.topic ?? "").trim() || (entry?.topic ?? "")));
      }
      setMyTopic(entry?.topic ?? "");
      setLoaded(true);
    });
  }, [activity.id, user?.uid, activity.topic]);

  // 활동에도 없고 내가 적은 것도 없으면 한 번 물어봅니다 — 무엇에 대한
  // 마인드맵인지 정하지 않은 채 가지를 뻗기 시작하지 않도록. 닫으면 다시
  // 뜨지 않고, 배지를 눌러 언제든 적을 수 있습니다.
  const askedRef = useRef(false);
  useEffect(() => {
    if (!loaded || locked || askedRef.current) return;
    if ((activity.topic ?? "").trim() || myTopic.trim()) return;
    askedRef.current = true;
    setTopicAsk(true);
  }, [loaded, locked, activity.topic, myTopic]);

  // 화면에 쓸 주제어 — 교사가 정해 둔 것이 있으면 그것이 먼저입니다.
  const shownTopic = (activity.topic ?? "").trim() || myTopic.trim();
  const canEditTopic = !(activity.topic ?? "").trim() && !locked;

  async function saveTopic(next) {
    const text = String(next ?? "").trim();
    setMyTopic(text);
    setTopicAsk(false);
    if (!text) return;
    await saveParatextTopic(activity.id, user, text);
    // 아직 한가운데를 손대지 않았으면 방금 적은 주제어로 채워 줍니다 —
    // 마인드맵은 그 낱말에서 가지가 뻗어 나가는 그림이라, 비어 있으면
    // 무엇에 대한 것인지 없는 채로 시작하게 됩니다.
    //
    // '손대지 않았다'의 기준에 "주제"도 넣습니다. 주제어 없이 시작하면
    // emptyMindmap이 한가운데를 그 글자로 채워 두거든요(lib/mindmap.js) —
    // 빈 칸만 보고 판정하면 이 자리가 영영 안 채워집니다.
    setMap((prev) => {
      const root = prev?.nodes?.[0];
      const untouched = !root?.text?.trim() || root.text.trim() === "주제";
      if (!root || !untouched) return prev;
      dirtyRef.current = true;
      return { ...prev, nodes: prev.nodes.map((n, i) => (i === 0 ? { ...n, text } : n)) };
    });
  }

  useEffect(() => {
    if (!dirtyRef.current || locked) return;
    clearTimeout(timerRef.current);
    setStatus("saving");
    timerRef.current = setTimeout(async () => {
      try {
        await saveParatextEntry(activity.id, user, map);
        setStatus("saved");
      } catch {
        setStatus("idle");
      }
    }, SAVE_DELAY);
    return () => clearTimeout(timerRef.current);
  }, [map, activity.id, user, locked]);

  function edit(next) {
    dirtyRef.current = true;
    setMap(next);
  }

  function pickLayout(key) {
    if (key === map.layout) return;
    // 계층형으로만 만들다 방사형으로 오면 자리가 없어 모두 겹칩니다.
    // 자리 없는 노드에만 방사형 자리를 채워 준 뒤 형태를 바꿉니다.
    edit(key === "radial" ? withRadialPositions({ ...map, layout: key }) : { ...map, layout: key });
  }

  const branches = useMemo(() => branchCount(map), [map]);
  const depth = useMemo(() => maxDepth(map), [map]);
  const layoutKo = MINDMAP_LAYOUTS.find((l) => l.key === map.layout)?.ko ?? "방사형";

  return (
    <main className="books-main mindmap-main">
      <div className="books-head">
        {/* 교사 화면(MindmapBoard)과 같은 짜임 — 제목 줄에 돌아가는 길,
            둘째 줄에 딸림 정보(주제어) */}
        <div className="books-head-title">
          <h1 className="book-group-title">{activity.title}</h1>
          {open ? (
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              ← 내 카드
            </button>
          ) : (
            <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
          )}
          {/* 아직 제 주제를 안 적었을 때만 — 곁텍스트 읽기와 같은 자리·같은
              모양입니다(네 활동의 학생 화면이 여기서 갈리면 안 됩니다).
              카드를 펼쳐 본 상태(open)에서는 감춥니다 — 그때 이 줄의 버튼은
              '← 내 카드'라 돌아가는 길이 먼저입니다. */}
          {!open && !shownTopic && canEditTopic && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setTopicAsk(true)}
              title="무엇을 다루고 있는지 적어 주세요 — 내 카드에 표시됩니다"
            >
              도서명/주제 적기
            </button>
          )}
        </div>
        {/* 둘째 줄은 적어 둔 주제어나 도서 링크가 있을 때만 — 빈 줄이 남으면
            제목 아래가 괜히 벌어집니다. */}
        {(shownTopic || (bookUrl && !open)) && (
        <div className="books-head-row">
          <div className="books-head-main">
            {/* 적어 둔 주제어 — 눌러서 고칠 수 있습니다. */}
            {shownTopic &&
              (canEditTopic ? (
                <button
                  type="button"
                  className="book-group-topic book-topic-edit"
                  onClick={() => setTopicAsk(true)}
                  title="눌러서 주제 고치기"
                >
                  {shownTopic}
                </button>
              ) : (
                <span className="book-group-topic">{shownTopic}</span>
              ))}
          </div>
          {bookUrl && !open && (
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
            {layoutKo} · 가지 {branches}개 · {depth}단계
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
          <IconLock size={15} /> 지금은 잠겨 있어 고칠 수 없어요. 만든 마인드맵은 그대로 남아 있습니다.
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
      ) : !open ? (
        /* ── 내 카드 — 눌러서 내 판으로 ── */
        <div className="paratext-card-grid mindmap-own-grid">
          <button
            type="button"
            className={`paratext-student-card mindmap-own-card${branches > 0 ? " done" : " none"}`}
            onClick={() => setOpen(true)}
          >
            <span className="paratext-student-head">
              <strong>내 마인드맵</strong>
              <span className="mindmap-layout-tag">{layoutKo}</span>
            </span>
            <span className="mindmap-own-topic">{map.nodes[0]?.text || shownTopic}</span>
            <span className="paratext-student-meta">
              {branches === 0
                ? "아직 가지가 없어요 — 눌러서 시작하기"
                : `가지 ${branches}개 · ${depth}단계`}
            </span>
          </button>
        </div>
      ) : (
        <>
          <div className="mindmap-toolbar">
            <div className="book-seg mindmap-layout-seg">
              {MINDMAP_LAYOUTS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  className={`book-seg-btn${map.layout === l.key ? " active" : ""}`}
                  onClick={() => pickLayout(l.key)}
                  disabled={locked}
                  title={l.hint}
                >
                  {l.ko}
                </button>
              ))}
            </div>
            <span className="mindmap-layout-hint">
              {MINDMAP_LAYOUTS.find((l) => l.key === map.layout)?.hint}
            </span>
          </div>

          <MindmapCanvas
            map={map}
            onChange={locked ? null : edit}
            selectedId={selectedId}
            onSelect={setSelectedId}
            fitKey={activity.id}
          />
        </>
      )}
    </main>
  );
}
