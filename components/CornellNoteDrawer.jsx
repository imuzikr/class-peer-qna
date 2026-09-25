"use client";

// =============================================================
// 수업 노트 서랍 (학생 전용) — 화면 오른쪽에서 꺼내 쓰는 코넬 노트
// -------------------------------------------------------------
// 학생이 스스로 공부하려고 남기는 기록입니다. 그래서 **방송과 상관없이
// 언제나** 열립니다 — 선생님이 슬라이드를 띄운 중이든, 설명하려고 잠깐
// 멈춘 사이든, 수업이 아예 없는 시간이든.
//
// [왜 오버레이 안이 아니라 밖인가]
// 발표 오버레이(PresentationOverlay)는 방송 문서가 사라지는 순간 통째로
// 언마운트됩니다. 그런데 LessonMode는 '종료'뿐 아니라 '일시정지'에도 그
// 문서를 지웁니다 — 선생님이 잠깐 멈출 때마다 오버레이가 사라진다는 뜻입니다.
// 서랍을 그 안에 두면 한 차시에 몇 번씩 사라졌다 나타나고, 그때마다 학생은
// 쓰던 자리를 잃습니다. 그래서 TopNav에서 오버레이와 형제로, 방송 조건과
// 무관하게 그립니다.
//
// [코넬 노트를 세로로 쌓는 이유]
// 본래 코넬 노트는 왼쪽 좁은 단서 칸 + 오른쪽 넓은 필기 칸 + 아래 요약의
// 2단입니다. 서랍은 380px뿐이라 좌우로 가르면 양쪽 다 못 씁니다. 여기서는
// 세로로 쌓아 순서(단서 → 필기 → 요약)만 지키고, 진짜 2단은 나중에 복습
// 화면에서 펼칩니다.
//
// 저장은 자동입니다. 2초 동안 입력이 없으면 조용히 저장하고, 서랍이
// 닫히거나 화면을 벗어날 때 한 번 더 저장합니다 — 방송이 꺼지며 화면이
// 바뀌어도 쓰던 글이 날아가지 않게.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  subscribeMyCornellNote,
  saveCornellNote,
  fetchMyRecentCornellNotes,
  fetchBoardHandouts,
  markCornellFeedbackSeen,
  isCornellFeedbackUnread,
  todayDateKey,
  CORNELL_LIMITS,
  CORNELL_RECENT_DAYS,
} from "@/lib/store";
import RichTextEditor from "./RichTextEditor";
import CornellNoteSheet from "./CornellNoteSheet";
import LessonTaskPanel from "./LessonTaskPanel";
import LessonBookTaskPanel from "./LessonBookTaskPanel";
import {
  blocksOf,
  emptyBlock,
  flattenBlocks,
  usedBlocks,
  blockEmpty,
  CORNELL_BLOCK_MAX,
} from "@/lib/cornell";
import CornellNoteViewerModal from "./CornellNoteViewerModal";
import { richHtml, stripHtml } from "@/lib/html";
import { IconRecord } from "./StatusIcons";
import { onOpenProjectTask } from "@/lib/projectTask";

const SAVE_DELAY = 2000; // ms — 이만큼 입력이 없으면 저장
const OPEN_KEY = "cornell-drawer-open";
// 날개를 펼 수 없는 폭 — 서랍이 아래에서 올라오는 시트로 바뀌는 그 폭입니다
// (globals.css의 `@media (max-width: 760px)`와 **같은 값이어야** 합니다).
const NARROW_Q = "(max-width: 760px)";
// 미끄러지는 길이 — globals.css의 `--cornell-slide`와 **같은 값이어야** 합니다.
// 닫을 때 서랍을 그만큼 더 그려 두었다가 걷어 내는 데 씁니다. 짧게 잡으면
// 다 미끄러지기 전에 사라지고, 길게 잡으면 다 닫힌 자리에 빈 서랍이 남습니다.
const SLIDE_MS = 250;

// 필기 칸에 붙이는 서식 — 수업 메모와 같은 넷에 **코드 블록**을 더한 다섯.
// 활동 탭(LessonTaskPanel의 TASK_TOOLS)과 같아야 합니다 — 한 서랍 안에서
// 탭만 바꿔 오가는 자리라 툴바가 서로 다르면 다른 도구로 보입니다.
const NOTE_TOOLS = [
  "bold",
  "underline",
  "insertUnorderedList",
  "insertOrderedList",
  "codeBlock",
];

export default function CornellNoteDrawer({
  classId,
  user,
  lessonTitle = "",
  // 수업 모드에서 방송이 알려 주는 '연결한 프로젝트'.
  // 제목은 이 이름으로 채우고, 그 프로젝트의 학습 자료를 노트에 걸어 둡니다.
  boardId = "",
  boardTitle = "",
  onOpenChange = null, // 열림 상태를 위로 — 발표 화면이 그만큼 좁아집니다
  onType = null,       // 타이핑 신호 — 전광판의 ✍️ 표시로 이어집니다
  // 선생님이 내보낸 활동(반 문서의 `task`). 있으면 탭이 서고, 새로 내보낸
  // 것이면 서랍이 저절로 열립니다. 상단바가 이미 구독해 둔 값을 받습니다.
  task: classTask = null,
}) {
  const [open, setOpen] = useState(false);
  // ── '프로젝트 활동' — 수업 밖에서 학생이 스스로 연 활동 칸 ──
  // 파이썬 실행기와 연계된 프로젝트에서 활동 칸의 '파이썬 실행기' 단추를
  // 누르면(lib/projectTask.js) 이 서랍이 열리고 그 활동 칸이 섭니다. 수업 중
  // '오늘의 활동'과 **같은 칸**(LessonTaskPanel)이라 코드 블록·▶ 실행·결과
  // 붙이기가 그대로이고, 쓴 것은 그 프로젝트의 내 카드에 곧바로 저장됩니다.
  // - **단추를 눌렀을 때만** 섭니다. 연계된 프로젝트에 들어가기만 해도 서랍이
  //   열리면 코드를 안 쓰는 날에도 매번 닫아야 합니다.
  // - **선생님이 새로 보내면 그것이 이깁니다** — 아래 '활동이 새로 도착했을
  //   때'가 이 값을 비웁니다('새 활동이 오면 그 활동으로'와 같은 규칙).
  // - **서랍을 닫으면 비웁니다.** 단추로 연 것이라, 손잡이로 다시 열면 노트로
  //   돌아옵니다(선생님이 보낸 활동은 닫아도 남습니다 — 오늘 것이라서요).
  const [projTask, setProjTask] = useState(null);
  const task = projTask ?? classTask;
  const taskWord = task?.local ? "프로젝트 활동" : "오늘의 활동";
  useEffect(
    () =>
      onOpenProjectTask(({ boardId, actIndex }) => {
        setProjTask({ kind: "study", boardId, actIndex, at: Date.now(), local: true });
        setPanes(new Set(["task"]));
        setOpen(true);
        try { localStorage.setItem(OPEN_KEY, "1"); } catch {}
      }),
    []
  );
  // 펼친 칸 — 'note'(수업 노트) · 'task'(오늘의 활동). **둘 다 켤 수 있습니다**
  // (날개 펴기). 활동이 없는 날에는 탭 줄을 아예 안 그립니다(지금까지와 같은
  // 모습) — 누를 수 없는 탭이 늘 서 있으면 '왜 안 눌리지'를 매번 겪습니다.
  const [panes, setPanes] = useState(() => new Set(["note"]));
  // 760px 아래에서는 서랍이 아래에서 올라오는 시트라 날개를 펼 자리가
  // 없습니다. 이 값은 **보여 줄 칸을 고르는 데만** 쓰고 `panes`는 그대로
  // 두어, 다시 넓히면 펴 두었던 그대로 돌아옵니다.
  const [narrow, setNarrow] = useState(false);
  // 여닫는 동안의 두 값 — 아래 '미끄러지며 여닫기' 절 참고.
  // `rendered`는 서랍을 아직 그려 두는가, `slidIn`은 자리에 와 있는가.
  const [rendered, setRendered] = useState(false);
  const [slidIn, setSlidIn] = useState(false);
  // 접히는 중이라 잠깐 더 그려 두는 칸('note' · 'task')
  const [linger, setLinger] = useState(() => new Set());
  const shownRef = useRef({ note: false, task: false });
  const handleRef = useRef(null); // 닫을 때 초점을 되돌릴 곳
  const [viewerOpen, setViewerOpen] = useState(false); // 크게 보기 창
  const [note, setNote] = useState(null);        // 서버에서 온 문서
  const [loaded, setLoaded] = useState(false);
  // 제목(주제) — 코넬 노트 맨 위 칸. 문서에는 lessonTitle로 저장합니다
  // (새 필드를 늘리지 않으려고요 — 방송 제목을 받아 두던 그 자리입니다).
  const [topic, setTopic] = useState("");
  // 그날 프로젝트의 학습 자료(이름 + 링크). 노트에 함께 저장됩니다.
  const [handouts, setHandouts] = useState([]);
  // 덩어리 목록 — 하나가 '단서 한 칸 + 필기 한 칸'입니다(lib/cornell.js).
  // 처음에는 하나뿐이라 지금까지처럼 죽 쓰고, 주제가 바뀔 때 학생이 더합니다.
  const [blocks, setBlocks] = useState(() => [emptyBlock()]);
  // 서버 값을 새로 받아들일 때마다 하나씩 — 필기 에디터는 비제어라
  // initialHtml을 **마운트 때 한 번만** 봅니다. 이 번호를 열쇠에 섞어야
  // 서버에서 온 글이 화면에 들어옵니다.
  const [loadSeq, setLoadSeq] = useState(0);
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState("idle");  // idle | saving | saved
  // 아직 저장 안 된 편집이 있는지 — 머리말의 '저장' 단추가 이걸 보고 삽니다.
  // (아래 dirtyRef와 다릅니다: ref는 '한 번이라도 손댔나'라 저장 뒤에도 켜진
  //  채로 둡니다 — 서버 값이 내 글자를 덮어쓰지 못하게 하는 빗장이라서요)
  const [dirty, setDirty] = useState(false);
  const [date] = useState(() => todayDateKey());
  // 최근 14일치 — '안 읽은 선생님 한 마디'와 '지난 노트' 목록에 씁니다
  const [recent, setRecent] = useState([]);
  const [seenNow, setSeenNow] = useState(() => new Set()); // 이번에 읽은 것
  const [openAlert, setOpenAlert] = useState(null); // 맨 위 알림에서 펼친 노트
  const [openPast, setOpenPast] = useState(null);   // 아래 지난 노트에서 펼친 것

  // 내가 고친 뒤로는 서버 값이 와도 덮어쓰지 않습니다(입력 중 글자가 튀는 것 방지)
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);
  // 저장 함수가 항상 '지금 값'을 보도록 — 언마운트·창 닫기 때 쓰는 마지막
  // 저장은 오래된 클로저를 잡기 쉬워서, 값을 ref에 함께 들고 있습니다.
  const latestRef = useRef({ blocks: [], summary: "", lessonTitle: "" });
  // 저장에는 **쓴 덩어리만** 보냅니다. 빈 줄을 남기면 다음에 펴 볼 때
  // 빈 행이 늘어서 있습니다. cue/notes는 legacy 거울입니다(lib/cornell.js).
  latestRef.current = {
    ...flattenBlocks(blocks),
    blocks: usedBlocks(blocks),
    summary,
    lessonTitle: topic,
    materials: handouts,
  };

  // 접힘 상태는 기억해 둡니다 — 수업마다 다시 여는 수고를 덜려고요
  useEffect(() => {
    try {
      if (localStorage.getItem(OPEN_KEY) === "1") setOpen(true);
    } catch {}
  }, []);
  function toggle() {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, next ? "1" : "0"); } catch {}
    // 닫을 때는 쓰던 것을 곧바로 저장합니다.
    // (setOpen의 갱신 함수 안에서 부르지 않습니다 — 개발 모드에서 그 함수가
    //  두 번 불려 저장도 두 번 나갑니다)
    // 닫을 때는 곧바로 저장합니다. flush가 아니라 runSave인 이유: 서랍은
    // 닫혀도 그대로 붙어 있어(open만 false) 단추 상태가 이어집니다.
    if (!next) {
      runSave();
      // **닫으면 손잡이로 초점을 되돌립니다.** 미끄러지는 250ms 동안 서랍은
      // 아직 DOM에 있는데 `aria-hidden`이라, 초점이 그 안(머리말의 × 등)에
      // 남아 있으면 읽어 주는 기기에서 '없는 것'에 초점이 놓입니다. 키보드로
      // 쓰는 사람에게도 사라진 단추보다 손잡이가 다음에 누를 자리입니다.
      handleRef.current?.focus();
    }
  }

  // 창 폭 — 날개를 펼 수 있는 폭인지. CSS의 시트 전환과 같은 값을 봅니다.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(NARROW_Q);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // ── 어느 칸을 그릴 것인가 ──
  // 좁은 화면에서는 하나만 남기는데, 남기는 쪽은 **활동**입니다 — 수업 중에
  // 지금 내려온 것이 더 급하고, 노트는 탭을 눌러 언제든 돌아갑니다(글은
  // 자동 저장이라 어느 쪽을 남겨도 날아가지 않습니다).
  const hasTask = !!task;
  const showTask = hasTask && panes.has("task");
  // 활동이 없는 날에는 탭 줄이 없고 노트 하나뿐입니다 — `panes`가 무엇이든.
  const wantNote = !hasTask || panes.has("note");
  const showNote = wantNote && !(narrow && showTask);
  // 날개를 편 상태 — 서랍이 두 칸 폭으로 벌어집니다.
  const wide = showTask && showNote;

  useEffect(() => { onOpenChange?.(open, wide); }, [open, wide, onOpenChange]);

  // ── 미끄러지며 여닫기 ──────────────────────────────────────────
  // `rendered`는 '아직 그려 두는가', `slidIn`은 '자리에 와 있는가'입니다.
  // 둘을 가르는 까닭: 닫을 때 곧바로 걷어 내면 미끄러질 것이 없어져 그냥
  // 사라지고, 열 때 처음부터 제자리에 그려 두면 브라우저가 시작값을 못 봐
  // 전환이 아예 안 돕니다.
  useEffect(() => {
    if (!open) {
      setSlidIn(false);
      // 프로젝트 활동은 **다 미끄러져 나간 뒤에** 비웁니다 — 곧바로 비우면
      // 나가는 동안 칸이 먼저 사라집니다(위 '프로젝트 활동' 절).
      const t = setTimeout(() => {
        setRendered(false);
        setProjTask(null);
      }, SLIDE_MS);
      return () => clearTimeout(t);
    }
    setRendered(true);
    // **다음 프레임에** 켭니다. 같은 프레임에 붙이면 브라우저가 '화면 밖'을
    // 한 번도 그리지 않고 곧바로 끝 모습으로 넘어갑니다(전환 없음).
    // 두 번 기다리는 것은 첫 프레임에 갓 붙은 요소의 기본값이 아직 잡히지
    // 않을 때가 있어서입니다 — 한 번만으로는 이따금 건너뜁니다.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setSlidIn(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [open]);

  // 접히는 칸은 **미끄러지는 동안 그대로 그려 둡니다.** 곧바로 감추면 글이
  // 먼저 사라지고 빈 자리만 뒤늦게 줄어들어, 한 동작이 둘로 보입니다.
  // 좁은 화면은 뺍니다 — 거기서는 칸이 폭을 나눠 가지므로(위 CSS) 두 칸이
  // 잠깐 함께 그려지면 반씩 줄었다 돌아오는 것이 그대로 보입니다.
  useEffect(() => {
    const prev = shownRef.current;
    shownRef.current = { note: showNote, task: showTask };
    if (narrow) return undefined;
    const gone = [];
    if (prev.note && !showNote) gone.push("note");
    if (prev.task && !showTask) gone.push("task");
    if (gone.length === 0) return undefined;
    setLinger(new Set(gone));
    const t = setTimeout(() => setLinger(new Set()), SLIDE_MS);
    return () => clearTimeout(t);
  }, [showNote, showTask, narrow]);

  // 그릴 것인가 — '켜져 있다' 또는 '접히는 중이다'
  const drawNote = showNote || linger.has("note");
  const drawTask = showTask || linger.has("task");

  // 탭은 '하나 고르기'가 아니라 **켜기/끄기**입니다. 마지막 한 칸은 끌 수
  // 없습니다 — 둘 다 꺼지면 빈 서랍이 남습니다.
  function togglePane(key) {
    setPanes((prev) => {
      if (narrow) return new Set([key]); // 좁은 화면 — 한 번에 하나만
      if (!prev.has(key)) return new Set(prev).add(key);
      if (prev.size <= 1) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  // ── 활동이 새로 도착했을 때 ──
  // 그 순간의 뜻이 '지금 이걸 쓰세요'라, 서랍이 닫혀 있으면 열고 **활동 칸만**
  // 켭니다. 폭이 380px 그대로라, 수업 중에 스물몇 대의 화면이 동시에
  // 벌어지지 않습니다 — 필기가 필요한 학생은 노트 탭을 더 눌러 날개를 폅니다.
  // 같은 활동을 두 번 보낼 수도 있어 `boardId`·`actIndex`가 아니라
  // **보낸 시각**을 견줍니다.
  // **선생님이 보낸 것만** 봅니다 — 학생이 스스로 연 프로젝트 활동은 위에서
  // 따로 엽니다. 새로 보낸 것이 오면 스스로 연 칸을 걷고 그것으로 갑니다.
  const seenTaskRef = useRef(0);
  useEffect(() => {
    if (!classTask?.at || classTask.at <= seenTaskRef.current) return;
    seenTaskRef.current = classTask.at;
    setProjTask(null);
    setPanes(new Set(["task"]));
    setOpen(true);
    try { localStorage.setItem(OPEN_KEY, "1"); } catch {}
  }, [classTask?.at]);

  // 활동이 내려가면 노트로 돌아옵니다 — 빈 탭에 남아 있을 이유가 없습니다.
  useEffect(() => { if (!task) setPanes(new Set(["note"])); }, [task]);

  useEffect(() => {
    if (!classId || !user?.uid) { setLoaded(true); return; }
    return subscribeMyCornellNote(classId, user.uid, date, (doc) => {
      setNote(doc);
      if (!dirtyRef.current) {
        setTopic(doc?.lessonTitle ?? "");
        setBlocks(blocksOf(doc));
        setSummary(doc?.summary ?? "");
        setLoadSeq((n) => n + 1);
      }
      setLoaded(true);
    });
  }, [classId, user?.uid, date]);

  // 최근 14일치를 한 번 훑습니다(짧게 캐시되어 화면을 옮겨도 다시 안 읽습니다).
  // 오늘 것은 위 구독이 실시간으로 보고 있으므로, 여기서는 '지난 것'만 씁니다.
  useEffect(() => {
    if (!classId || !user?.uid) { setRecent([]); return; }
    let alive = true;
    fetchMyRecentCornellNotes(classId, user.uid)
      .then((list) => { if (alive) setRecent(list); })
      .catch(() => {});
    return () => { alive = false; };
  }, [classId, user?.uid, date]);

  // 제목 기본값 — **프로젝트 이름**이 있으면 그것을 먼저 쓰고, 없으면 수업
  // 자료 제목으로 갈음합니다. 아직 아무것도 안 적었을 때만 채워 넣고, 학생이
  // 한 번이라도 손대면(dirtyRef) 다시 건드리지 않습니다 — 제목의 주인은
  // 학생입니다.
  const autoTitle = boardTitle || lessonTitle;
  useEffect(() => {
    if (dirtyRef.current || !loaded) return;
    if (topic || !autoTitle) return;
    if (note?.lessonTitle) return;
    setTopic(autoTitle);
  }, [autoTitle, topic, loaded, note?.lessonTitle]);

  // 그 프로젝트의 학습 자료를 한 번 읽어 노트에 걸어 둡니다(문서 1건).
  // 이미 저장된 노트에 자료가 있으면 그것을 그대로 두어, 나중에 교사가
  // 프로젝트에서 자료를 바꿔도 그날 노트에 걸린 것은 흔들리지 않습니다.
  useEffect(() => {
    if (!boardId) return;
    let alive = true;
    fetchBoardHandouts(boardId)
      .then((list) => {
        if (!alive || list.length === 0) return;
        setHandouts((prev) => (prev.length > 0 ? prev : list));
        // 자료가 새로 생긴 경우에만 저장을 한 번 밀어 줍니다(빈 노트는 그대로).
        if ((note?.materials ?? []).length === 0 && (note || dirtyRef.current)) {
          editSeqRef.current += 1;
          setDirty(true);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [boardId, note?.id]);

  // 이미 저장된 노트에 자료가 있으면 그것을 씁니다
  useEffect(() => {
    const saved = note?.materials;
    if (Array.isArray(saved) && saved.length > 0) setHandouts(saved);
  }, [note?.id, note?.materials]);

  // 읽음 도장 — 노트 문서에 적습니다. 기기를 바꿔도 배지가 되살아나지 않게.
  const markSeen = useCallback(
    (noteDate, noteId) => {
      setSeenNow((prev) => (prev.has(noteId) ? prev : new Set(prev).add(noteId)));
      markCornellFeedbackSeen(classId, user?.uid, noteDate).catch(() => {});
    },
    [classId, user?.uid]
  );

  // 오늘 것은 위 구독이 실시간으로 보고 있으므로 그쪽 값을 앞세웁니다
  // (선생님이 지금 막 쓴 한 마디는 캐시에 아직 없습니다).
  const merged = useMemo(() => {
    const map = new Map(recent.map((n) => [n.id, n]));
    if (note?.id) map.set(note.id, note);
    return [...map.values()].sort((a, b) =>
      String(b.date ?? "").localeCompare(String(a.date ?? ""))
    );
  }, [recent, note]);

  // 서랍을 열면 그 자리에서 한 마디가 다 보입니다 — 그 순간 읽은 것으로 봅니다.
  // (줄마다 눌러야 읽음이 되면, 안 누른 것 때문에 배지가 계속 남습니다)
  useEffect(() => {
    if (!open) return;
    merged.forEach((n) => {
      if (isCornellFeedbackUnread(n) && !seenNow.has(n.id)) markSeen(n.date, n.id);
    });
  }, [open, merged, seenNow, markSeen]);

  // 저장 한 곳 — 자동(2초 멎으면)도, 손으로 누르는 것도 여기로 옵니다.
  // -------------------------------------------------------------
  // `status`는 **서버에 실제로 쓰는 동안만** 'saving'입니다. 예전에는 글자를
  // 치는 순간 'saving'으로 바꿔 놓고 저장은 2초 뒤에 했는데, 그 2초 내내
  // 단추가 잠겨 정작 누르고 싶을 때 못 눌렀습니다 — 단추를 둔 뜻이 사라집니다.
  //
  // seq(편집 번호)를 세는 이유: 쓰는 사이(await)에 또 고칠 수 있습니다.
  // 그때 '저장됨'으로 바꿔 버리면 아직 안 넘어간 글자가 저장된 것처럼 보입니다.
  // 저장을 시작할 때의 번호와 끝났을 때의 번호가 같을 때만 '저장됨'입니다.
  const editSeqRef = useRef(0);
  const savedSeqRef = useRef(0);

  const runSave = useCallback(async () => {
    if (!classId || !user?.uid) return;
    if (editSeqRef.current === savedSeqRef.current) return; // 바뀐 게 없음
    clearTimeout(timerRef.current);
    const seq = editSeqRef.current;
    setStatus("saving");
    try {
      await saveCornellNote(classId, user, date, latestRef.current);
      savedSeqRef.current = seq;
      if (editSeqRef.current === seq) {
        setDirty(false);
        setStatus("saved");
      } else {
        setStatus("idle"); // 저장하는 사이에 또 고쳤음 — 곧 다시 저장됩니다
      }
    } catch {
      setStatus("idle");
    }
  }, [classId, user, date, lessonTitle]);

  // 화면을 벗어날 때 쓰는 마지막 저장 — 언마운트 중일 수 있어 상태는 안 건드립니다
  const flush = useCallback(() => {
    if (editSeqRef.current === savedSeqRef.current || !classId || !user?.uid) return;
    clearTimeout(timerRef.current);
    savedSeqRef.current = editSeqRef.current;
    saveCornellNote(classId, user, date, latestRef.current).catch(() => {});
  }, [classId, user, date, lessonTitle]);

  // 자동 저장 — 입력이 멎으면. 여기서는 상태를 미리 바꾸지 않습니다
  // (그 사이 단추는 '저장'인 채로 살아 있어야 합니다).
  useEffect(() => {
    if (editSeqRef.current === savedSeqRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(runSave, SAVE_DELAY);
    return () => clearTimeout(timerRef.current);
  }, [topic, blocks, summary, runSave]);

  // 화면을 벗어나거나 탭을 닫을 때 마지막으로 한 번 더
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  // Esc는 서랍만 닫습니다 — 발표 오버레이는 학생이 닫을 수 없어야 합니다.
  // 위에 뜬 창이 있으면 그쪽이 먼저 Esc를 씁니다(같은 window에 걸린
  // 리스너끼리는 stopPropagation이 안 통해, 여기서 아예 비켜 줍니다 —
  // 안 그러면 Esc 한 번에 창과 서랍이 함께 닫힙니다).
  useEffect(() => {
    if (!open || viewerOpen) return;
    function onKey(e) {
      if (e.key !== "Escape") return;
      // 페이지에 창이 떠 있으면 그 창의 Esc입니다 — 공부방 카드의 '크게 쓰기'
      // 창이 서랍 위로 뜨는 경우가 있습니다(프로젝트 활동을 연 채로 칸을
      // 누를 때). 이 리스너는 캡처 단계라 여기서 멈추면 창이 Esc를 못 받습니다.
      if (document.querySelector(".modal-backdrop")) return;
      e.stopPropagation();
      toggle();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  function edit(setter) {
    return (v) => {
      touch();
      setter(v);
    };
  }

  // 고쳤다는 표시 — 자동 저장·'저장' 단추·전광판의 ✍️가 이걸 봅니다
  function touch() {
    dirtyRef.current = true;
    editSeqRef.current += 1;
    setDirty(true);
    onType?.();
  }

  function editBlock(id, patch) {
    touch();
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function addBlock() {
    touch();
    setBlocks((prev) =>
      prev.length >= CORNELL_BLOCK_MAX ? prev : [...prev, emptyBlock()]
    );
  }

  // 마지막 한 줄은 남깁니다 — 덩어리가 0개면 쓸 자리가 사라집니다.
  function removeBlock(id) {
    touch();
    setBlocks((prev) => (prev.length <= 1 ? prev : prev.filter((b) => b.id !== id)));
  }

  if (!classId || !user?.uid) return null;

  // 손잡이 점 — '오늘 뭔가 적었나'. 덩어리 어느 칸이든 글이 있으면 켭니다.
  const filled = usedBlocks(blocks).length + (summary.trim() ? 1 : 0);
  const feedback = String(note?.feedback ?? "").trim();

  // 손잡이 배지 — 아직 안 본 한 마디의 수
  const unreadCount = merged.filter(
    (n) => isCornellFeedbackUnread(n) && !seenNow.has(n.id)
  ).length;
  // 맨 위 알림 — **이번에 새로 온** 한 마디만. 예전에 읽은 것까지 여기 두면
  // 알림이 아니라 목록이 되어, 정작 새 것이 묻힙니다(그건 아래 '지난 노트'가
  // 합니다). seenNow를 함께 보는 이유: 서랍을 연 순간 읽음 처리가 되므로,
  // 그것만으로 거르면 뜨자마자 사라져 읽을 새가 없습니다.
  const arrivedFeedback = merged.filter(
    (n) =>
      n.date !== date &&
      String(n.feedback ?? "").trim() &&
      (isCornellFeedbackUnread(n) || seenNow.has(n.id))
  );
  const openAlertNote = arrivedFeedback.find((n) => n.id === openAlert) ?? null;

  // 아래 '지난 노트' — 최근 14일 전부. 배지를 세려고 이미 받아 둔 것이라
  // 여기 늘어놓는 데 읽기가 1건도 늘지 않습니다.
  const pastNotes = merged.filter((n) => n.date !== date);
  const openPastNote = pastNotes.find((n) => n.id === openPast) ?? null;

  return (
    <>
      {/* 손잡이 — **열려 있을 때도 남깁니다.** 열면 서랍 왼쪽 가장자리로
          옮겨 붙어 그대로 '닫기'가 됩니다. 여닫는 자리가 늘 같은 곳이라야
          손이 기억합니다. 예전에는 열리는 순간 사라져, 닫는 길이 머리말의
          ×와 Esc뿐이었습니다.
          바깥을 눌러 닫지는 않습니다 — 수업 중에 슬라이드를 한 번 볼 때마다
          닫혀 쓰던 흐름이 끊깁니다(글은 자동 저장이라 날아가진 않지만). */}
      {/* [모습은 `slidIn`, 뜻은 `open`]
          손잡이가 서 있는 자리는 서랍 가장자리라, **서랍이 움직이기
          시작하는 바로 그 순간** 함께 움직여야 둘이 붙어 다닙니다.
          `open`으로 걸면 한 프레임 앞서 출발합니다 — 그 값은 렌더에서
          바뀌는데 서랍의 `slidIn`은 그 뒤 effect에서 바뀌기 때문입니다
          (실측: 여는 동안 손잡이가 서랍 모서리보다 최대 100px 앞섬).
          그래서 자리·화살표·배지는 `slidIn`을 보고, 읽어 주는 기기에
          전하는 값(`aria-expanded`·이름)은 그대로 `open`을 봅니다. */}
      <button
        type="button"
        ref={handleRef}
        className={`cornell-handle${slidIn ? " open" : ""}${
          slidIn && wide ? " wide" : ""
        }${!slidIn && unreadCount > 0 ? " has-feedback" : ""}`}
        onClick={toggle}
        title={
          open
            ? "수업 노트 닫기 (Esc)"
            : task
              ? "오늘의 활동이 있어요 — 눌러서 쓰기"
              : unreadCount > 0
                ? `선생님이 한 마디를 남겼어요 (${unreadCount}개)`
                : "수업 노트 — 눌러서 필기해요"
        }
        aria-label={
          open
            ? "수업 노트 닫기"
            : unreadCount > 0
              ? `수업 노트 열기 — 안 읽은 선생님 한 마디 ${unreadCount}개`
              : "수업 노트 열기"
        }
        aria-expanded={open}
      >
        {/* 여는 쪽인지 닫는 쪽인지 — 화살표 방향으로만 알립니다.
            글자를 '닫기'로 바꾸면 같은 자리의 같은 것으로 안 보입니다. */}
        <span className="cornell-handle-caret" aria-hidden="true">
          {slidIn ? "›" : "‹"}
        </span>
        <span className="cornell-handle-label">수업 노트</span>
        {/* 숫자가 있으면 숫자를, 없으면 '오늘 쓴 게 있다'는 점만.
            열려 있으면 둘 다 뺍니다 — 안이 이미 다 보입니다.
            활동이 왔다는 표시는 따로 두지 않습니다 — 올 때 서랍이 저절로
            열리므로 손잡이에 뜰 새가 없고, 세로쓰기 손잡이에서는 글자가
            한 자만 보여 무슨 말인지 알 수 없었습니다. */}
        {slidIn ? null : unreadCount > 0 ? (
          <span className="cornell-handle-badge">{unreadCount}</span>
        ) : filled > 0 ? (
          <span className="cornell-handle-dot" aria-hidden="true" />
        ) : null}
      </button>

      {/* 닫은 뒤에도 **미끄러지는 동안은 그대로 그려 둡니다**(`rendered`).
          곧바로 걷어 내면 미끄러질 것이 없어져 그냥 사라집니다.
          `aria-hidden`을 함께 두는 까닭: 눈에는 화면 밖으로 나갔는데 읽어
          주는 기기에는 250ms 동안 그대로 남아 있으면 안 됩니다. */}
      {rendered && (
        <aside
          className={`cornell-drawer${slidIn ? " shown" : ""}${
            wide ? " wide" : ""
          }`}
          aria-label="수업 노트"
          aria-hidden={!open}
        >
          <header className="cornell-head">
            <strong className="head-icon"><IconRecord size={18} /> 수업 노트</strong>
            <span className="cornell-date">{date}</span>
            <button
              type="button"
              className="cornell-close"
              onClick={toggle}
              aria-label="닫기"
              title="닫기 (Esc)"
            >
              ×
            </button>
          </header>

          {/* 탭 — 활동이 내보내졌을 때만. 평소에는 지금까지와 똑같이
              노트 하나이고 이 줄이 아예 없습니다.

              **이 줄만 켜기/끄기입니다.** 같은 모양(.dash-view-tabs)을 쓰는
              다른 두 곳(닿소리 '전체 보기' · 노트 크게 보기)은 '하나 고르기'라,
              여기서 동시 선택이 되게 하면 같은 생김새가 화면마다 다르게
              움직입니다. 그래서 눌린 것이 분명히 보이는 제 모양을 씁니다
              (role도 tab이 아니라 aria-pressed입니다 — 하는 일이 다릅니다). */}
          {task && (
            <div className="cornell-tabrow" role="group" aria-label="펼칠 칸 고르기">
              <button
                type="button"
                className={`cornell-tab${showNote ? " on" : ""}`}
                aria-pressed={showNote}
                onClick={() => togglePane("note")}
                title={
                  narrow
                    ? "수업 노트 보기 (좁은 화면에서는 한 번에 하나만 열려요)"
                    : showNote && !wide
                      ? "한 칸은 열려 있어야 해요"
                      : showNote
                        ? "수업 노트 접기"
                        : "수업 노트도 함께 펼치기"
                }
              >
                <span className="cornell-tab-mark" aria-hidden="true">
                  {showNote ? "✓" : ""}
                </span>
                수업 노트
              </button>
              <button
                type="button"
                className={`cornell-tab${showTask ? " on" : ""}`}
                aria-pressed={showTask}
                onClick={() => togglePane("task")}
                title={
                  narrow
                    ? `${taskWord} 보기 (좁은 화면에서는 한 번에 하나만 열려요)`
                    : showTask && !wide
                      ? "한 칸은 열려 있어야 해요"
                      : showTask
                        ? `${taskWord} 접기`
                        : `${taskWord}도 함께 펼치기`
                }
              >
                <span className="cornell-tab-mark" aria-hidden="true">
                  {showTask ? "✓" : ""}
                </span>
                {taskWord}
              </button>
            </div>
          )}

          {/* 두 칸을 함께 그려 두고 **감춰만 둡니다**(KWLS 노트 탭과 같은
              방식). 탭을 오갈 때마다 지웠다 만들면 그때마다 프로젝트와 카드를
              다시 읽고, 쓰던 칸도 새로 마운트되어 커서가 튑니다.

              [노트가 왼쪽, 활동이 오른쪽인 까닭]
              서랍의 오른쪽 끝은 화면 가장자리에 붙박이라, 날개를 펴면 새로
              생기는 자리는 **왼쪽**입니다. 활동이 내려와 오른쪽 380px을
              차지한 채로 노트를 더 펴면, 노트가 왼쪽에 붙고 쓰던 활동 칸은
              제자리에 그대로 남습니다. 탭 줄의 차례도 이 왼→오와 같습니다. */}
          <div className={`cornell-panes${wide ? " wide" : ""}`}>
            <section className="cornell-pane" hidden={!drawNote}>
          {!loaded ? (
            <div className="cornell-body">
              <p className="cornell-empty">불러오는 중이에요…</p>
            </div>
          ) : (
            <>
            <div className="cornell-body">
              {/* 지난 노트에 달린 한 마디 — 선생님은 수업이 끝난 뒤에 쓰므로
                  대부분 '어제 것'입니다. 여기가 없으면 학생은 리포트에
                  들어가 그 날짜를 펼쳐 봐야만 알게 됩니다.
                  줄을 누르면 그날 노트를 이 안에서 펼쳐 봅니다 — 무엇에
                  대한 말인지 보려고 화면을 옮기지 않아도 되게. */}
              {arrivedFeedback.length > 0 && (
                <div className="cornell-newfb">
                  <span className="cornell-newfb-tag">
                    지난 노트에 선생님 한 마디
                  </span>
                  {arrivedFeedback.map((n) => (
                    <div key={n.id} className="cornell-newfb-row">
                      <button
                        type="button"
                        className={`cornell-newfb-item${openAlert === n.id ? " open" : ""}`}
                        onClick={() => setOpenAlert(openAlert === n.id ? null : n.id)}
                        aria-expanded={openAlert === n.id}
                      >
                        {/* 서랍이 좁아 연도는 뺍니다 — 14일치라 헷갈릴 일이 없습니다 */}
                        <time dateTime={n.date}>{String(n.date ?? "").slice(5)}</time>
                        <span className="cornell-newfb-text">{n.feedback}</span>
                        <span className="cornell-newfb-caret" aria-hidden="true">
                          {openAlert === n.id ? "▾" : "▸"}
                        </span>
                      </button>
                      {/* 펼친 노트는 **누른 줄 바로 아래**에. 목록 끝에 붙이면
                          어느 줄에 대한 것인지 알 수 없습니다. */}
                      {openAlertNote?.id === n.id && (
                        <CornellNoteSheet note={openAlertNote} showFeedback={false} />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 선생님이 남긴 한 마디 — 오늘 것은 제자리에 */}
              {feedback && (
                <div className="cornell-feedback">
                  <span className="cornell-feedback-tag">선생님</span>
                  <p>{feedback}</p>
                </div>
              )}

              {/* 오늘 수업 자료 — 선생님이 프로젝트에 올려 둔 파일을 노트에
                  걸어 둡니다. 두 달 뒤에 "그 자료가 어느 프로젝트였지" 하고
                  찾아 헤매지 않게, 그날 노트에서 바로 닿습니다.
                  자료가 없는 수업에는 이 줄이 아예 없습니다. */}
              {handouts.length > 0 && (
                <section className="cornell-handouts">
                  <span className="cornell-handouts-tag">📎 오늘 수업 자료</span>
                  {handouts.map((m, i) => (
                    <a
                      key={`${m.url}_${i}`}
                      className="cornell-handout"
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      title={m.name}
                    >
                      {m.kind === "image" ? "🖼" : "📄"} {m.name}
                    </a>
                  ))}
                </section>
              )}

              {/* 제목 — 코넬 노트의 맨 윗줄. 이게 없으면 나중에 펴 봤을 때
                  단서·필기만 있어 무슨 수업이었는지 알 수 없습니다.
                  선생님이 방송에 적어 둔 수업 제목이 있으면 미리 채워 두되,
                  고치는 것은 학생의 몫입니다. */}
              <section className="cornell-zone cornell-zone--topic">
                <label htmlFor="cornell-topic">
                  <b>제목</b>
                  <em>오늘 수업은 무엇에 대한 것이었나요</em>
                </label>
                <input
                  id="cornell-topic"
                  type="text"
                  value={topic}
                  onChange={(e) => edit(setTopic)(e.target.value.slice(0, 200))}
                  placeholder="예) 디지털 기술과 사회 변화"
                />
              </section>

              {/* 덩어리 — 하나가 '단서 한 칸 + 필기 한 칸'입니다. 서랍은
                  폭이 380px이라 둘을 위아래로 쌓지만, 한 덩어리로 묶여 있어
                  나중에 2단으로 펴 볼 때 왼쪽 물음과 오른쪽 필기가 어긋나지
                  않습니다(그것이 이 모양을 만든 까닭입니다).
                  수업 중에 미리 나누지 않습니다 — 처음엔 하나뿐이라 죽 쓰고,
                  주제가 바뀔 때 아래 '＋ 다음 핵심 질문'으로 한 줄을 더합니다.
                  ('덩어리'는 코드 안에서만 쓰는 말입니다 — 학생 화면에는
                   '핵심 질문'으로 적습니다.) */}
              {blocks.map((b, i) => (
                <section key={b.id} className="cornell-block">
                  <div className="cornell-block-head">
                    <span className="cornell-block-no">{i + 1}</span>
                    {blocks.length > 1 && (
                      <button
                        type="button"
                        className="cornell-block-del"
                        onClick={() => removeBlock(b.id)}
                        title="이 핵심 질문 지우기"
                        aria-label={`${i + 1}번째 핵심 질문 지우기`}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <div className="cornell-zone cornell-zone--cue">
                    <label htmlFor={`cornell-cue-${b.id}`}>
                      <b>단서 · 핵심 질문</b>
                      <em>이 부분을 떠올릴 낱말이나 물음</em>
                    </label>
                    <textarea
                      id={`cornell-cue-${b.id}`}
                      rows={2}
                      value={b.cue}
                      onChange={(e) =>
                        editBlock(b.id, { cue: e.target.value.slice(0, CORNELL_LIMITS.cue) })
                      }
                      placeholder="예) 사물인터넷은 왜 필요할까?"
                    />
                  </div>

                  <div className="cornell-zone cornell-zone--notes">
                    <label>
                      <b>필기</b>
                      <em>수업에서 들은 것을 그대로</em>
                    </label>
                    <RichTextEditor
                      key={`cornell-${date}-${loadSeq}-${b.id}`}
                      className="cornell-rte"
                      tools={NOTE_TOOLS}
                      initialHtml={richHtml(b.notes ?? "")}
                      onChange={(html) => editBlock(b.id, { notes: html })}
                      placeholder="들은 것, 칠판에 적힌 것, 떠오른 것"
                    />
                  </div>
                </section>
              ))}

              {/* 덩어리 더하기 — 주제가 바뀌는 순간에 누릅니다.
                  빈 줄을 또 만들지 않게, 마지막 줄이 비어 있으면 잠급니다. */}
              <button
                type="button"
                className="cornell-block-add"
                onClick={addBlock}
                disabled={blocks.length >= CORNELL_BLOCK_MAX || blockEmpty(blocks[blocks.length - 1])}
                title={
                  blocks.length >= CORNELL_BLOCK_MAX
                    ? `한 장에 ${CORNELL_BLOCK_MAX}개까지 담을 수 있어요`
                    : "새 주제로 넘어갈 때 눌러 한 줄 더하기"
                }
              >
                ＋ 다음 핵심 질문
              </button>

              <section className="cornell-zone cornell-zone--summary">
                <label htmlFor="cornell-summary">
                  <b>내 말로 요약</b>
                  <em>수업 끝에 한두 줄로</em>
                </label>
                <textarea
                  id="cornell-summary"
                  rows={3}
                  value={summary}
                  onChange={(e) => edit(setSummary)(e.target.value.slice(0, CORNELL_LIMITS.summary))}
                  placeholder="오늘 배운 것을 한 문장으로 적어 보세요"
                />
              </section>

              {/* 몰래 보는 것이 아니라 알고 쓰는 것이 되도록 — 피드백이
                  온다는 걸 알고 쓰는 글은 성격이 달라집니다. */}
              <p className="cornell-note-hint">
                선생님이 수업 뒤에 읽고 피드백을 줄 수 있어요.
              </p>

              {/* 지난 노트 — 배지를 세려고 이미 받아 둔 최근 14일치라
                  여기 늘어놓는 데 읽기가 1건도 늘지 않습니다. 오늘 것을 쓰다
                  "저번에 뭐라고 적었더라" 할 때 화면을 옮기지 않게 하는 자리라,
                  쓰는 칸 **아래**에 둡니다(위에 두면 매번 지나쳐 스크롤해야
                  합니다). 더 옛것은 리포트로 갑니다. */}
              {pastNotes.length > 0 && (
                <section className="cornell-past">
                  <div className="cornell-past-head">
                    <b>지난 노트</b>
                    <span>
                      최근 {CORNELL_RECENT_DAYS}일 · {pastNotes.length}장
                    </span>
                  </div>
                  {pastNotes.map((n) => {
                    const hasFb = !!String(n.feedback ?? "").trim();
                    const preview =
                      String(n.lessonTitle ?? "").trim() ||
                      stripHtml(n.notes ?? "") ||
                      String(n.cue ?? "").trim() ||
                      "수업";
                    return (
                      <div key={n.id} className="cornell-past-row">
                        <button
                          type="button"
                          className={`cornell-past-item${openPast === n.id ? " open" : ""}`}
                          onClick={() => setOpenPast(openPast === n.id ? null : n.id)}
                          aria-expanded={openPast === n.id}
                        >
                          <time dateTime={n.date}>{String(n.date ?? "").slice(5)}</time>
                          <span className="cornell-past-title">{preview}</span>
                          {hasFb && (
                            <span className="cornell-past-fb" title="선생님 한 마디가 있어요">
                              💬
                            </span>
                          )}
                          <span className="cornell-past-caret" aria-hidden="true">
                            {openPast === n.id ? "▾" : "▸"}
                          </span>
                        </button>
                        {openPastNote?.id === n.id && <CornellNoteSheet note={openPastNote} />}
                      </div>
                    );
                  })}
                </section>
              )}

              {/* 14일보다 옛것과, 코넬 2단을 넓게 펴 보는 것은 여기서.
                  예전에는 리포트로 화면을 옮겼는데, 수업 중에는 부담이 큽니다
                  (방송이 떠 있고 쓰던 노트도 두고 가야 합니다). 그 자리에서
                  한가운데에 크게 폅니다. 열기 전에 쓰던 것을 저장합니다. */}
              <button
                type="button"
                className="cornell-past-link"
                onClick={() => {
                  flush();
                  setViewerOpen(true);
                }}
              >
                노트 전체 보기 →
              </button>
            </div>

            {/* 저장은 자동입니다(2초). 그래도 단추를 둡니다 — 자리를 뜰 때
                '눌러서 끝냈다'는 감각이 필요하고, 기다리는 2초가 불안한 것도
                자연스러운 일입니다.
                자리는 **노트 칸 맨 아래 고정 줄**입니다. 머리말에 뒀을 때는
                요약을 다 쓰고 손이 화면 꼭대기까지 올라가야 했고, 본문 안(요약
                칸 바로 아래)에 뒀을 때는 노트가 길어지면 스크롤 밖으로
                밀렸습니다. 여기는 쓰는 칸 아래이면서 늘 보입니다.
                **서랍이 아니라 노트 칸 안입니다** — 날개를 펴면 옆에 활동
                칸이 함께 서는데, 서랍 바닥에 두면 그 단추가 어느 칸을
                저장하는지 흐려집니다(활동은 제 칸이 알아서 자동 저장합니다).
                같은 이유로 이름도 '노트 저장'입니다.
                **글자는 고정하고 색만 바뀝니다**(활성 주황 / 비활성 회색).
                저장·저장 중…·저장됨으로 휙휙 바뀌면 눈이 자꾸 그리로 끌리고,
                잠깐 스치는 '저장 중…'은 오류처럼 보입니다. */}
            <footer className="cornell-foot">
              <button
                type="button"
                className={`cornell-save${dirty ? " on" : ""}`}
                onClick={runSave}
                disabled={!dirty || status === "saving"}
                title={
                  dirty ? "지금 저장 — 안 눌러도 2초 뒤 저절로 저장돼요" : "저장할 것이 없어요"
                }
              >
                노트 저장
              </button>
            </footer>
            </>
          )}
            </section>

            {task && (
              <section className="cornell-pane" hidden={!drawTask}>
                <div className="cornell-body">
                  {/* 공부방 활동과 책방 단계는 저장되는 자리가 아예 달라
                      (카드 한 장 ↔ 그 활동의 내 기록) 칸을 따로 둡니다. 같은
                      껍데기에 억지로 담으면 어느 쪽 규칙을 따르는지 흐려집니다. */}
                  {task.kind === "book" ? (
                    <LessonBookTaskPanel task={task} user={user} onType={onType} />
                  ) : (
                    <LessonTaskPanel task={task} user={user} onType={onType} />
                  )}
                </div>
              </section>
            )}
          </div>
        </aside>
      )}

      {/* 크게 보기 — 서랍(z-index 3001) **위**에 뜨도록 배경에 따로 z를
          줍니다(보통 모달은 100이라 서랍 밑에 깔립니다). 서랍 안이 아니라
          형제로 그려, 서랍이 다시 그려져도 창이 흔들리지 않습니다. */}
      {viewerOpen && (
        <CornellNoteViewerModal
          classId={classId}
          user={user}
          initialNotes={merged}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}
