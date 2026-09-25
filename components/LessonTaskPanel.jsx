"use client";

// =============================================================
// 수업 노트 서랍의 '오늘의 활동' 탭 — 선생님이 보낸 활동을 학생이 쓰는 자리
// -------------------------------------------------------------
// 교사가 수업 모드에서 활동을 보내면(반 문서의 `task`) 서랍에 이 탭이
// 서고, 학생이 여기서 답을 씁니다. 쓴 것은 그 프로젝트의 **자기 개인 카드**
// 로 들어갑니다 — 공부방에서 쓰던 그 카드 그대로라, 수업이 끝난 뒤 공부방에
// 가면 이어서 고칠 수 있습니다.
//
// [왜 서랍인가 — 덮지 않습니다]
// 수업 중에는 뒤에 선생님 화면이 있습니다. 활동을 모달로 덮으면 학생이 답을
// 쓰는 동안 물음이 안 보이고, 선생님이 슬라이드를 넘겨도 모릅니다. 서랍은
// 발표 화면을 그만큼 좁힐 뿐이라 둘이 나란히 섭니다.
//
// [쓰는 칸이 곧 이 탭입니다]
// 한때는 '작성하기'를 눌러 큰 창을 열게 했습니다(공부방 카드와 같은 방식).
// 한 번에 활동 하나만 내려오므로 서랍 한 칸이 답 하나에 넉넉하고, 큰 창은
// 발표 화면을 덮어 쓰는 동안 선생님 화면이 안 보였습니다. 지금은 탭을 열면
// 곧바로 쓰는 칸입니다 — 누르는 단계가 없고 발표 화면이 계속 보입니다.
//
// [저장은 자동입니다]
// 손이 멎으면 조용히 저장하고, 탭을 옮기거나 화면을 벗어날 때 한 번 더
// 씁니다. **저장할 곳은 글자를 칠 때 붙들어 둡니다** — 쓰는 사이에 선생님이
// 다음 활동을 보낼 수 있어('다들 1번 다 썼지? 이제 2번'), 그때 화면의
// 자리로 저장하면 1번에 쓰던 글이 2번 칸에 들어갑니다.
//
// [서랍에는 학생이 쓸 수 있는 것이 다 있고, 보내기는 그중 하나로 눈을 맞춥니다]
// **열린 활동이 모두 섭니다** — 보낸 것은 펼쳐지고, 앞서 열어 둔 것은 한 줄로
// 접혀 위에 있다가 누르면 그 자리에서 펴집니다(책방 곁텍스트와 같은 모양).
// 한때 보낸 활동 하나만 그렸는데, 그러면 앞서 쓴 것을 수업 중에 고치려면
// 공부방으로 건너가야 했습니다. 잠긴 활동은 깔지 않습니다 — 학생이 아직 쓰면
// 안 되는 자리입니다.
//
// [수업 밖에서도 — '프로젝트 활동']
// 파이썬 실행기와 연계된 프로젝트에서 학생이 활동 칸의 '파이썬 실행기' 단추를
// 누르면 이 칸이 같은 모습으로 열립니다(`task.local` — CornellNoteDrawer의
// '프로젝트 활동' 절). 그때는 선생님이 보낸 것이 아니므로 머리말이 '오늘의
// 활동'이 아니라 '프로젝트 활동'이고, 방송 점을 달지 않습니다.
//
// [읽는 문서]
// 프로젝트 1건(`fetchStudyBoard`) + 내 카드 **구독** 1건(`subscribeStudyCard`).
// 반 문서는 상단바가 이미 구독하고 있어 그대로 받아 씁니다(새 구독 없음).
// 카드를 한 번만 읽던 것을 구독으로 바꾼 까닭: 프로젝트 화면에서는 서랍 뒤에
// **같은 카드가 열려 있습니다.** 한 번 읽은 옛 내용으로 카드 전체를 다시 짜
// 쓰면, 카드 화면에서 방금 고친 다른 칸이 옛 값으로 되돌아갑니다. 지금은
// 칸마다 '아직 저장 안 한 글이 있나'를 보고, 없는 칸만 서버 값을 들입니다
// (StudyMyActivityCard가 밖에서 온 값을 칸 단위로 들이는 것과 같은 생각).
// **보낸 활동이 바뀌면 프로젝트를 다시 읽습니다**(1건) — 교사는 보내면서 그
// 활동을 여는데, 같은 프로젝트의 다음 활동을 보내면 프로젝트 id는 그대로라
// 처음 읽기가 다시 돌지 않습니다. 그러면 학생 화면이 방금 연 활동을 아직
// 잠긴 것으로 알고 '선생님이 이 활동을 열어 주면 쓸 수 있어요'에서 멈춥니다
// (실제로 그랬습니다 — 책방 쪽에서 겪은 그 함정과 같습니다).
// 카드는 구독이라 따로 다시 읽지 않습니다. 쓰는 중인 칸은 서버 값이 와도
// 안 들입니다 — 덮어쓰면 방금 친 글자가 날아갑니다.
//
// [모둠 프로젝트는 못 씁니다]
// 규칙이 학생의 카드 **생성**을 막습니다(모둠 카드는 교사가 만들어 둡니다).
// 그래서 아직 카드가 없는 학생은 저장에 실패하는데, 써 보고서야 알게 하지
// 않으려고 화면에서 미리 막고 까닭을 적습니다.
// =============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchStudyBoard,
  subscribeStudyCard,
  addStudyCard,
  updateStudyCard,
} from "@/lib/store";
import {
  parseActivitySections,
  buildActivityHtml,
  isActivityLocked,
} from "@/lib/activities";
import { sanitizeHtml, stripHtml, htmlHasImage, richHtml } from "@/lib/html";
import RichTextEditor from "./RichTextEditor";
import { runPython, stopPython } from "@/lib/pyRun";
import { outputTextOf, pyResultHtml } from "@/lib/pyShare";

const SAVE_DELAY = 1500;

// 서식은 수업 노트 필기 칸(CornellNoteDrawer의 NOTE_TOOLS)과 **같아야**
// 합니다 — 한 서랍 안에서 탭만 바꿔 오가는 자리라 툴바가 서로 다르면 다른
// 도구로 보입니다.
//
// [코드 블록이 여기 있는 까닭]
// 이 칸이 저장되는 곳은 결국 공부방의 내 카드이고(buildActivityHtml), 그
// 카드를 크게 쓰는 창은 처음부터 툴바 전체를 써 코드 블록이 있었습니다.
// 여기만 빠져 있어, 수업 중에 서랍으로 답한 코드는 밋밋한 글이 되고 나중에
// 공부방에서 열어 고쳐야 검은 블록이 되었습니다. 정화기가 `PRE`를 허용하고
// (lib/html.js) 섹션을 되읽는 parseActivitySections도 그대로 통과시키므로
// **저장 규칙도 자료 모양도 안 건드립니다**.
// 서랍이 380px이라 코드가 가로로 넘칠 수 있는데, 공용 코드 블록 규칙에
// `overflow-x: auto`가 이미 있어 그 칸만 옆으로 구릅니다.
const TASK_TOOLS = [
  "bold",
  "underline",
  "insertUnorderedList",
  "insertOrderedList",
  "codeBlock",
];

// 한 줄 미리보기 — 접힌 활동에 '무엇을 썼는지' 남깁니다.
function peek(html) {
  const text = stripHtml(html ?? "").replace(/\s+/g, " ").trim();
  if (text) return text;
  return htmlHasImage(html) ? "(그림)" : "";
}

// '결과 붙이기'로 넣어 둔 **출력** 블록인가.
// **돌릴 코드를 고를 때 이것을 건너뛰어야 합니다.** 안 그러면 결과를 한 번
// 붙인 뒤로는 '마지막 블록'이 늘 출력 블록이라, 입력값 칸에 값을 치고 실행을
// 누르는 순간(커서가 에디터 밖으로 나간 그 순간) 제 코드가 아니라 지난
// 출력을 돌립니다 — 실제로 그렇게 났습니다.
function isResultPre(pre) {
  if (!pre) return false;
  if (pre.classList?.contains("py-result")) return true;
  // 표시가 붙기 전에 저장된 카드 — 이름줄로 가려 봅니다(학생이 그 글자를
  // 고쳤으면 못 가리지만, 그때는 커서 쪽 판정이 대개 맞습니다).
  const prev = pre.previousElementSibling;
  return prev?.tagName === "P" && (prev.textContent ?? "").trim() === "실행 결과";
}

// ── 돌릴 코드 고르기 ──
// **커서가 든 코드 블록**, 커서가 그 칸 밖이면 **마지막 코드 블록**입니다.
// 한 칸에 코드 블록을 여럿 둘 수 있어(고쳐 가며 여러 벌) 규칙이 하나
// 필요한데, '지금 손이 가 있는 것'이 가장 덜 놀랍고 그다음이 '방금 적은
// 것'입니다. 실행 단추는 `onMouseDown`에서 기본 동작을 막아 **커서가 안
// 풀립니다**(툴바 단추가 서식을 걸 때 쓰는 그 방법).
function pickCodeEl(area) {
  if (!area) return null;
  let node = window.getSelection()?.anchorNode;
  while (node && node !== area) {
    if (node.nodeName === "PRE" && area.contains(node)) return node;
    node = node.parentNode;
  }
  // 커서가 이 칸 밖이면(입력값 칸에 값을 치는 중 등) **마지막 코드 블록**.
  const all = [...area.querySelectorAll("pre")].filter((el) => !isResultPre(el));
  return all.length ? all[all.length - 1] : null;
}

// input()을 쓰는 코드인가 — 쓰면 입력값 칸이 뜹니다.
// 서랍이 380px이라 그 칸을 늘 세워 두면 그만큼 쓰는 자리가 줄어듭니다.
const USES_INPUT = /\binput\s*\(/;

// 이 칸의 **코드 블록**에 input()이 있나 — 입력값 칸을 띄울지 정합니다.
// -------------------------------------------------------------
// **글자를 칠 때마다 도는 판정**이라 DOMParser를 쓰지 않고 문자열로 훑습니다
// (코드 블록은 `<pre>`로만 저장되므로 이 정도로 충분하고, 26명이 동시에 치는
// 자리라 한 번이 싼 편이 낫습니다).
// 코드 블록 **안만** 봅니다 — 설명 글에 'input()으로 값을 받아요'라고 적어도
// 칸이 뜨면 안 됩니다. 붙여 둔 실행 결과 블록도 뺍니다(거기 찍힌 지난 출력에
// 그 글자가 남아 있을 수 있습니다).
function codeUsesInput(html) {
  const s = String(html ?? "");
  const re = /<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi;
  let m;
  while ((m = re.exec(s))) {
    if (/py-result/.test(m[1])) continue;
    if (USES_INPUT.test(m[2])) return true;
  }
  return false;
}

// 줄 전체에 **공통으로** 있는 들여쓰기를 걷어 냅니다(파이썬 textwrap.dedent).
// -------------------------------------------------------------
// 코드 블록은 빈 채로 만들면 공백 한 칸으로 시작합니다(빈 <code>에 커서를 둘
// 수 없어서). 지금은 커서를 그 앞에 두어 새로 쓰는 코드에는 안 붙지만,
// **이미 저장된 카드에는 그 칸이 첫 줄 앞에 남아 있습니다** — 그대로 돌리면
// IndentationError입니다. 공통 들여쓰기만 걷으므로 줄 사이의 상대 들여쓰기는
// 그대로고, 통째로 한 단 들여 써 둔 코드도 함께 살아납니다.
function dedent(code) {
  const lines = String(code ?? "").split("\n");
  const used = lines.filter((l) => l.trim());
  if (used.length === 0) return String(code ?? "");
  const min = Math.min(...used.map((l) => (l.match(/^[ \t]*/) ?? [""])[0].length));
  return min > 0 ? lines.map((l) => l.slice(min)).join("\n") : String(code ?? "");
}

export default function LessonTaskPanel({ task, user, onType }) {
  const [board, setBoard] = useState(null);
  const [card, setCard] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  const [error, setError] = useState("");
  // 접힌 활동 중 학생이 펴 둔 것 — 보낸 활동은 늘 펼쳐집니다.
  const [openIdx, setOpenIdx] = useState(() => new Set());

  const boardId = task?.boardId ?? "";
  const idx = task?.actIndex ?? 0;
  const local = !!task?.local; // 수업 밖 — 학생이 스스로 연 '프로젝트 활동'
  const tagWord = local ? "프로젝트 활동" : "오늘의 활동";

  // 칸마다 에디터가 지금 담고 있는 글 — 서버 값이 이것과 다를 때만 갈아
  // 끼웁니다(ver를 올려 다시 마운트). 저장한 값은 **쓰기 전에** 되읽은
  // 모양으로 적어 둡니다 — 쓰는 순간 구독이 곧바로 돌아오므로(지연 보정),
  // 그 뒤에 적으면 방금 쓴 것을 '밖에서 온 값'으로 보고 커서가 튑니다.
  const shownRef = useRef({});
  const [ver, setVer] = useState({});
  // 아직 저장 안 된 글 — 아래 '자동 저장' 참고(구독 콜백이 봐야 해서 위에 둡니다)
  const pendingRef = useRef(null);

  // 프로젝트는 한 번 읽습니다.
  const [boardLoaded, setBoardLoaded] = useState(false);
  useEffect(() => {
    if (!boardId || !user?.uid) { setBoardLoaded(true); return undefined; }
    let alive = true;
    setBoardLoaded(false);
    setError("");
    fetchStudyBoard(boardId)
      .then((b) => { if (alive) setBoard(b); })
      .catch((e) => {
        if (alive) setError(`활동을 불러오지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
      })
      .finally(() => { if (alive) setBoardLoaded(true); });
    return () => { alive = false; };
  }, [boardId, user?.uid]);

  // 내 카드는 **구독**합니다(머리 주석 '읽는 문서'). 쓰는 중인 칸(아직 저장
  // 안 한 글이 있는 칸)은 서버 값이 와도 안 들입니다.
  const [cardLoaded, setCardLoaded] = useState(false);
  useEffect(() => {
    if (!boardId || !user?.uid) { setCardLoaded(true); return undefined; }
    setCardLoaded(false);
    shownRef.current = {};
    setVer({});
    let first = true; // 첫 답은 에디터가 그것으로 처음 그려지므로 견줄 것이 없습니다
    return subscribeStudyCard(boardId, user.uid, (c) => {
      const incoming = c ? parseActivitySections(c.content) : [];
      const drafts =
        pendingRef.current?.t?.boardId === boardId ? pendingRef.current.drafts : {};
      const bump = [];
      incoming.forEach((s, i) => {
        if (Object.prototype.hasOwnProperty.call(drafts, i)) return;
        const now = s?.content ?? "";
        // 처음 본 칸은 빈 칸으로 그려져 있었습니다(카드가 아직 없었거나 그
        // 칸이 없던 카드) — 그 사이 밖에서 채워졌으면 들여야 합니다.
        const had = i in shownRef.current ? shownRef.current[i] : "";
        if (!first && had !== now) bump.push(i);
        shownRef.current[i] = now;
      });
      first = false;
      if (bump.length) {
        setVer((prev) => {
          const next = { ...prev };
          bump.forEach((i) => { next[i] = (next[i] ?? 0) + 1; });
          return next;
        });
      }
      setCard(c);
      setCardLoaded(true);
    });
  }, [boardId, user?.uid]);

  const loaded = boardLoaded && cardLoaded;

  // 보낸 활동이 바뀌면(또는 같은 활동을 다시 열면) **프로젝트만** 다시
  // 읽습니다(잠금이 방금 열렸을 수 있어서). 프로젝트 자체가 바뀐 경우는 위
  // 효과가 이미 읽으므로 비켜 줍니다.
  const readBoardIdRef = useRef("");
  useEffect(() => {
    const first = readBoardIdRef.current !== boardId;
    readBoardIdRef.current = boardId;
    if (first || !boardId) return undefined;
    let alive = true;
    fetchStudyBoard(boardId)
      .then((b) => { if (alive && b) setBoard(b); })
      .catch(() => {});
    return () => { alive = false; };
  }, [boardId, idx, task?.at]);

  // 수업 밖에서 연 칸은 **누른 활동에 커서를 둡니다** — 단추를 누른 뜻이
  // '여기에 코드를 쓰겠다'라서요. 수업 중에는 안 합니다(선생님이 보낼 때마다
  // 스물몇 명의 커서를 옮기면 다른 칸에 쓰던 학생의 손이 끊깁니다).
  const rootRef = useRef(null);
  useEffect(() => {
    if (!local || !loaded) return undefined;
    const t = setTimeout(() => {
      rootRef.current?.querySelector(".ltask-step.on .rte-area")?.focus();
    }, 300); // 서랍이 미끄러져 들어온 뒤에
    return () => clearTimeout(t);
  }, [local, loaded, idx, task?.at]);

  const acts = Array.isArray(board?.activities) ? board.activities : [];
  // 탭 머리의 '오늘의 활동 N'이 이미 차례를 말하므로, 이름이 기본값
  // ('활동 N')뿐이면 같은 말을 두 번 적지 않습니다.
  const actName = String(acts[idx] ?? "").trim();
  const showName = !!actName && actName !== `활동 ${idx + 1}`;
  const locked = board ? isActivityLocked(board, idx) : false;
  const isGroup = board?.type === "group";
  const canWrite = !!board && !locked && !isGroup;

  // 카드에서 활동 칸들을 떠 옵니다. 자리(index)로 읽고 자리로 씁니다 —
  // 제목으로 짝지으면 학생이 카드에서 활동 제목을 고쳤을 때 엉뚱한 칸을
  // 집습니다(파이썬 실행기의 '보내기'에서 실제로 겪은 일).
  const secs = card ? parseActivitySections(card.content) : [];
  const mine = secs[idx]?.content ?? "";
  const written = !!(stripHtml(mine).trim() || htmlHasImage(mine));
  // 서랍에 깔 활동 — **열린 것만**. 잠긴 것은 학생이 아직 쓰면 안 되는
  // 자리라 접어서도 두지 않습니다.
  const openActs = acts
    .map((name, i) => ({ name, i }))
    .filter(({ i }) => board && !isActivityLocked(board, i));

  const timerRef = useRef(null);
  // 아직 저장 안 된 글 — { t: 쓸 곳, drafts: { 활동자리: 쓴 글 } }.
  // **글자를 칠 때 쓸 곳을 함께 붙들어 둡니다** — 쓰는 사이에 선생님이 다음
  // 활동을 보낼 수 있어, 저장하는 순간의 자리로 쓰면 글이 옆 칸에 들어갑니다.
  // 자리를 **맵으로** 모으는 것은 칸이 여럿 펼쳐질 수 있기 때문입니다 — 한
  // 자리만 들고 있으면 접힌 것을 펴서 고친 글이 다음 저장에 덮입니다.
  // (`pendingRef`는 구독 콜백이 봐야 해서 위에서 만듭니다.)

  const loadedRef = useRef(null);
  loadedRef.current = {
    boardId,
    acts,
    secs,
    cardId: card?.id ?? null,
    isGroup,
  };

  // 저장 — 카드 전체를 다시 짜서 씁니다. **다른 활동 칸은 그대로 옮겨
  // 담습니다**(카드가 한 문서라 이 칸만 따로 쓸 수 없습니다).
  const save = useCallback(async () => {
    clearTimeout(timerRef.current);
    const p = pendingRef.current;
    if (!p || !user?.uid) return;
    pendingRef.current = null;
    const { t, drafts } = p;
    if (!t?.boardId || t.isGroup) return;
    // 다른 칸은 **지금 구독으로 든 카드**에서 옮겨 담습니다. 글자를 칠 때
    // 붙들어 둔 카드(t.secs)를 쓰면, 그 사이 카드 화면에서 고친 칸이 옛
    // 값으로 되돌아갑니다. 프로젝트가 갈렸으면 붙들어 둔 것 그대로.
    const now = loadedRef.current;
    const same = now?.boardId === t.boardId;
    const secsNow = same ? now.secs : t.secs;
    const cardId = same ? now.cardId : t.cardId;
    const titles = t.acts.map((a, i) => secsNow[i]?.title || a);
    const contents = t.acts.map((_, i) =>
      Object.prototype.hasOwnProperty.call(drafts, i) ? drafts[i] : secsNow[i]?.content ?? ""
    );
    const html = buildActivityHtml(titles, contents);
    // 쓰기 **전에** 적어 둡니다 — 구독이 곧바로 돌아와도 제 글로 알아봅니다
    // (위 shownRef 주석).
    if (same) {
      const back = parseActivitySections(html);
      Object.keys(drafts).forEach((k) => {
        shownRef.current[k] = back[k]?.content ?? "";
      });
    }
    setStatus("saving");
    try {
      if (cardId) {
        await updateStudyCard(t.boardId, cardId, { content: html });
      } else {
        await addStudyCard(user, t.boardId, { content: html });
      }
      // 쓰는 사이에 또 고쳤으면 '저장됨'이 아닙니다 — 곧 다시 저장됩니다.
      setStatus(pendingRef.current ? "idle" : "saved");
    } catch (e) {
      setStatus("idle");
      setError(`저장하지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    }
  }, [user]);

  // 자동 저장 — 손이 멎으면. 어느 칸에 쓴 것인지 함께 담습니다.
  function onDraft(i, html) {
    const t = loadedRef.current;
    if (!t?.boardId || t.isGroup) return;
    const prev = pendingRef.current;
    const drafts =
      prev && prev.t.boardId === t.boardId ? { ...prev.drafts } : {};
    drafts[i] = html;
    pendingRef.current = { t, drafts };
    setStatus("idle");
    onType?.();
    // `input(`을 치는 즉시 입력값 칸이 뜨고, 지우면 사라집니다.
    // 값이 안 바뀌면 **같은 Set을 그대로 돌려주어** 글자마다 다시 그리지
    // 않습니다(이 함수는 키를 누를 때마다 돕니다).
    setInputActs((prev) => {
      const has = codeUsesInput(html);
      if (has === prev.has(i)) return prev;
      const next = new Set(prev);
      if (has) next.add(i);
      else next.delete(i);
      return next;
    });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { save(); }, SAVE_DELAY);
  }

  // ── 파이썬 실행 ──
  // 코드 블록에 짠 것을 **그 자리에서** 돌려 보고, 원하면 결과를 칸에 붙입니다.
  // 엔진은 `lib/pyRun.js` — 실행기와 **워커 한 벌을 나눠 씁니다**(두 벌이
  // 뜨면 Pyodide가 두 번 올라갑니다). **화면을 여는 것만으로는 안 만듭니다** —
  // 처음 ▶ 실행을 누를 때 비로소 10MB 남짓을 받아 옵니다.
  const [runAt, setRunAt] = useState(null);   // 결과를 보여 줄 활동 자리
  const [runLines, setRunLines] = useState([]);
  const [running, setRunning] = useState(false);
  // 입력값 칸을 띄울 활동 자리 — **코드에 `input(`을 치는 즉시** 켜집니다.
  // 예전에는 ▶ 실행을 한 번 눌러야 비로소 떴는데, 그 첫 누름은 아무것도
  // 돌리지 않고 '아래 칸에 적고 다시 누르세요'만 말하는 헛걸음이었습니다.
  // 값을 미리 적어 두는 방식이라는 것을 **코드를 치는 동안** 알려 주는 편이
  // 낫습니다(그래야 실행이 늘 실행입니다).
  const [inputActs, setInputActs] = useState(() => new Set());
  // 입력값은 **활동 자리마다 따로** 둡니다. 칸이 여럿 펼쳐질 수 있어(열린
  // 활동이 다 섭니다) 하나로 두면 한 칸에 친 값이 옆 칸 상자에도 그대로
  // 나타나고, 돌릴 때 남의 값이 딸려 갑니다.
  const [stdins, setStdins] = useState({});
  // 지금 출력 칸의 결과를 낸 코드 — 고쳐 놓고 다시 안 돌린 채 붙이면
  // 바뀐 코드에 지난 결과가 따라붙습니다(lib/pyShare.js의 그 함정).
  const ranCodeRef = useRef("");

  const addRunLine = useCallback((type, text) => {
    setRunLines((prev) => [...prev, { type, text }]);
  }, []);

  function runCode(i, stepEl) {
    if (running) return;
    const area = stepEl?.querySelector(".rte-area");
    const el = pickCodeEl(area);
    const code = String(el?.textContent ?? "").replace(/\s+$/, "");
    setRunAt(i);
    if (!code.trim()) {
      setRunLines([{ type: "info", text: "돌릴 코드 블록이 없어요 — 툴바의 </> 로 코드 블록을 만들어 주세요." }]);
      return;
    }
    setRunLines([]);
    // 견줄 때는 칸에 있는 그대로(`code`), 돌릴 때는 공통 들여쓰기를 걷은 것.
    ranCodeRef.current = code;
    // **누르면 늘 돌아갑니다.** 입력값 칸은 코드를 치는 동안 이미 떠 있으므로
    // '먼저 적고 다시 누르세요'로 한 번 되돌릴 이유가 없습니다. 칸을 비워 둔
    // 채 돌리면 파이썬이 EOFError로 알려 주고(그 칸이 화면에 보입니다),
    // 커서가 칸 밖이라 코드 블록을 못 짚는 경우는 `pickCodeEl`이 맡습니다.
    const how = runPython({
      code: dedent(code),
      stdin: stdins[i] ?? "",
      onLine: addRunLine,
      onDone: (result) => {
        if (result) addRunLine("result", result);
        setRunning(false);
      },
      onError: (err) => { addRunLine("err", err); setRunning(false); },
      onTimeout: (ms) => {
        addRunLine("err", `⏱ ${ms / 1000}초를 넘겨 멈췄어요. (무한 루프인지 확인해 보세요)`);
        setRunning(false);
      },
    });
    if (how === "busy") {
      setRunLines([{ type: "info", text: "다른 칸에서 파이썬이 돌고 있어요 — 끝나면 다시 눌러 주세요." }]);
      return;
    }
    if (how === "fresh") {
      addRunLine("info", "파이썬을 불러오는 중이에요… (처음 한 번만, 조금 걸려요)");
    }
    setRunning(true);
  }

  // 결과 붙이기 — 돌린 코드 블록 **바로 뒤에** 넣고 칸에 알립니다.
  // 저장은 지금까지대로 자동입니다('제출' 단추가 아닙니다 — 이 앱에 제출
  // 상태는 없고, 교사는 전광판·활동보기로 누가 썼는지 봅니다).
  function attachResult(i, stepEl) {
    const area = stepEl?.querySelector(".rte-area");
    const el = pickCodeEl(area);
    const out = outputTextOf(runLines);
    const html = pyResultHtml(out);
    if (!area || !el || !html) return;
    // **지금 코드가 낸 결과일 때만** 붙입니다. 고쳐 놓고 다시 안 돌린 채
    // 붙이면 바뀐 코드에 지난 결과가 따라붙어, 두 달 뒤 복습할 때 짝이
    // 안 맞는 기록이 됩니다(실행기의 '활동으로 보내기'와 같은 판정).
    const now = String(el.textContent ?? "").replace(/\s+$/, "");
    if (now !== ranCodeRef.current) {
      setRunLines((prev) => [
        ...prev,
        { type: "info", text: "코드가 바뀌었어요 — 다시 실행한 뒤에 붙여 주세요." },
      ]);
      return;
    }
    const box = document.createElement("div");
    box.innerHTML = html;
    const frag = document.createDocumentFragment();
    while (box.firstChild) frag.appendChild(box.firstChild);
    el.after(frag);
    onDraft(i, area.innerHTML);
  }

  // 프로젝트가 바뀌거나 탭을 떠날 때 남은 것을 씁니다. 이 정리는 **바뀌기
  // 전에** 돌아, 붙들어 둔 원래 카드로 저장됩니다.
  useEffect(() => () => { save(); }, [boardId, save]);

  // 프로젝트가 바뀌면 출력 칸과 입력값을 비웁니다 — 앞 활동의 결과가 남아
  // 있으면 새 활동의 코드가 낸 것처럼 보이고, 입력값도 남의 것이 됩니다.
  useEffect(() => {
    setRunAt(null);
    setRunLines([]);
    setStdins({});
    ranCodeRef.current = "";
  }, [boardId]);

  // **이미 저장돼 있던 코드**에도 입력값 칸이 떠 있어야 합니다 — 어제 쓰다 만
  // 활동을 오늘 다시 열었을 때, 한 글자 칠 때까지 칸이 없으면 '없는 기능'으로
  // 보입니다. 카드를 받아 올 때와 저장 뒤에 한 번씩 훑습니다(`card.content`가
  // 곧 그 두 순간입니다 — 글자마다 도는 것이 아닙니다).
  useEffect(() => {
    const secsNow = card ? parseActivitySections(card.content) : [];
    const next = new Set();
    secsNow.forEach((s, i) => { if (codeUsesInput(s?.content)) next.add(i); });
    // 아직 저장 안 된 글에서 켜 둔 자리는 지키고, 저장된 것만 더합니다.
    setInputActs((prev) => {
      const merged = new Set(prev);
      let changed = false;
      next.forEach((i) => { if (!merged.has(i)) { merged.add(i); changed = true; } });
      return changed ? merged : prev;
    });
  }, [card?.content, card?.id]);

  // 화면을 벗어나거나 탭을 닫을 때 마지막으로 한 번 더
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") save(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
    };
  }, [save]);

  if (!loaded) return <p className="cornell-empty">활동을 불러오는 중이에요…</p>;
  if (!board) {
    return <p className="cornell-empty">{tagWord}을 찾지 못했어요.</p>;
  }

  return (
    <div className="ltask" ref={rootRef}>
      <section className="ltask-head">
        <span className="ltask-tag">{tagWord} {idx + 1}</span>
        {/* 이름은 아래 활동 줄이 말합니다 — 그 줄이 안 서는 때(잠김·모둠)
            에만 여기에 적습니다. 둘 다 적으면 같은 말이 두 줄입니다. */}
        {showName && (locked || isGroup) && (
          <strong className="ltask-name">{actName}</strong>
        )}
        <span className="ltask-board">{board.title ?? ""}</span>
        {board.description && <p className="ltask-guide">{board.description}</p>}
      </section>

      {/* 쓸 수 없는 경우는 미리 막고 까닭을 적습니다 — 써 보고서야 알게
          하지 않으려고요. 규칙이 어차피 막는 자리입니다. */}
      {isGroup ? (
        <p className="ltask-blocked">
          모둠 프로젝트는 여기서 쓸 수 없어요 — 공부방에서 모둠 카드로 써 주세요.
        </p>
      ) : locked ? (
        <p className="ltask-blocked">선생님이 이 활동을 열어 주면 쓸 수 있어요.</p>
      ) : null}

      {/* 잠겼거나 모둠이면 읽기만 — 지금까지 쓴 것은 그대로 보입니다. */}
      {!canWrite && written && (
        <div
          className="study-card-content ltask-read"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(mine) }}
        />
      )}

      {/* 열린 활동이 모두 섭니다 — 보낸 것은 펼치고 나머지는 접어서.
          누르면 그 자리에서 펴져 앞서 쓴 것을 고칠 수 있습니다(책방
          곁텍스트와 같은 모양). */}
      {!isGroup &&
        openActs.map(({ name, i }) => {
          const on = i === idx;
          const open = on || openIdx.has(i);
          const text = secs[i]?.content ?? "";
          const label = String(name ?? "").trim() || `활동 ${i + 1}`;
          const line = peek(text);
          return (
            <section key={i} className={`ltask-step${on ? " on" : ""}`}>
              {/* 칸마다 이름 줄이 섭니다 — 없으면 어느 칸의 글쓰기인지
                  알 수 없습니다(접힌 줄 바로 아래 선 칸이 그 줄의 것처럼
                  보였습니다). 보낸 활동은 늘 펼쳐지므로 누를 수 없는 줄이고,
                  나머지는 이 줄로 **펴고 접습니다** — 편 것을 다시 못 접으면
                  하나씩 펴 볼수록 서랍이 길어지기만 합니다. */}
              {on ? (
                <div className="ltask-fold open now">
                  <span className="ltask-fold-no">{i + 1}</span>
                  <span className="ltask-fold-name">{label}</span>
                  {/* 방송 점은 선생님이 보낸 것에만 — 스스로 연 칸은 방송이 아닙니다 */}
                  {!local && <span className="broadcast-live-dot" aria-hidden="true" />}
                </div>
              ) : (
                <button
                  type="button"
                  className={`ltask-fold${open ? " open" : ""}`}
                  onClick={() => {
                    // 접기 전에 남은 글을 씁니다 — 접으면 쓰던 칸이 사라지고,
                    // 곧바로 다시 펴면 아직 저장 안 된 글이 없는 셈이 됩니다.
                    if (open) save();
                    setOpenIdx((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    });
                  }}
                  title={open ? "눌러서 접기" : "눌러서 펴고 고치기"}
                >
                  <span className="ltask-fold-no">{i + 1}</span>
                  <span className="ltask-fold-name">{label}</span>
                  {/* 편 상태에서는 글이 바로 아래 있으므로 미리보기를 안 답니다 */}
                  {!open && (
                    <span className={`ltask-fold-peek${line ? "" : " empty"}`}>
                      {line || "아직 안 썼어요"}
                    </span>
                  )}
                  <span className="ltask-fold-caret" aria-hidden="true">▸</span>
                </button>
              )}
              {/* 쓰는 칸 — 에디터는 비제어라 마운트 때 한 번만 읽습니다.
                  프로젝트가 바뀌면 열쇠가 바뀌어 그 칸의 글로 갈아 끼웁니다.
                  밖(카드 화면)에서 이 칸이 고쳐지면 ver가 올라 새 글로
                  다시 그립니다 — 쓰는 중인 칸은 올리지 않습니다. */}
              {open && (
                <>
                <RichTextEditor
                  key={`ltask-${boardId}-${i}-${ver[i] ?? 0}`}
                  className="ltask-rte"
                  tools={TASK_TOOLS}
                  initialHtml={richHtml(text)}
                  onChange={(html) => onDraft(i, html)}
                  placeholder="여기에 답을 써 주세요."
                />

                {/* 입력값 — **실행 줄보다 위**입니다. 코드를 치는 동안
                    이미 떠 있는 칸이라, 채우고 나서 ▶ 실행을 누르는 차례가
                    되어야 합니다(아래에 두면 누르고 나서야 눈에 띕니다).
                    **코드에 `input(`이 보이는 즉시** 뜹니다(치는 동안
                    켜지고, 지우면 사라집니다). 늘 세워 두지 않는 까닭은 서랍이
                    380px이라 그만큼 쓰는 자리가 줄어들기 때문입니다.
                    파이썬은 브라우저 안에서 한 번에 도는 것이라 실행 도중에
                    키보드를 기다릴 수 없어, 값을 **미리** 적어 둡니다 —
                    한 줄이 `input()` 한 번입니다. */}
                {inputActs.has(i) && (
                  <label className="ltask-stdin">
                    <span>입력값 <em>한 줄에 하나씩 — 실행 전에 미리</em></span>
                    <textarea
                      rows={2}
                      value={stdins[i] ?? ""}
                      onChange={(e) =>
                        setStdins((prev) => ({ ...prev, [i]: e.target.value }))
                      }
                      placeholder={"홍길동\n7"}
                    />
                  </label>
                )}

                {/* ── 파이썬 실행 줄 ──
                    코드 블록에 짠 것을 그 자리에서 돌려 보고, 원하면 결과를
                    칸에 붙입니다. **칸마다 한 줄**이라 어느 코드를 돌리는
                    것인지 헷갈리지 않습니다(출력은 마지막으로 돌린 칸에만).
                    **수업 노트 필기 칸에는 이 줄이 없습니다** — 노트는 들은
                    것을 받아 적는 자리고, 짜서 돌려 보는 일은 활동에서 합니다. */}
                <div className="ltask-run">
                  <button
                    type="button"
                    className="ltask-run-btn"
                    // 커서를 지키려고 기본 동작을 막습니다 — 안 그러면 코드
                    // 블록 안에 있던 커서가 풀려 늘 '마지막 블록'만 돌아갑니다.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => runCode(i, e.currentTarget.closest(".ltask-step"))}
                    disabled={running}
                    title="커서가 든 코드 블록을 돌려 봅니다 (없으면 마지막 블록)"
                  >
                    {running && runAt === i ? "실행 중…" : "▶ 실행"}
                  </button>
                  {running && runAt === i && (
                    <button
                      type="button"
                      className="ltask-run-stop"
                      onClick={() => { stopPython(); setRunning(false); addRunLine("info", "⏹ 멈췄어요."); }}
                    >
                      ⏹ 중단
                    </button>
                  )}
                  {/* 결과 붙이기 — **지금 코드가 낸 결과일 때만** 켜집니다.
                      고쳐 놓고 다시 안 돌린 채 붙이면 바뀐 코드에 지난 결과가
                      따라붙습니다(실행기의 '활동으로 보내기'와 같은 판정). */}
                  {runAt === i && !running && outputTextOf(runLines) && (
                    <button
                      type="button"
                      className="ltask-run-attach"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => attachResult(i, e.currentTarget.closest(".ltask-step"))}
                      title="실행 결과를 코드 아래에 붙여 둡니다 — 그대로 저장돼요"
                    >
                      결과 붙이기
                    </button>
                  )}
                </div>

                {runAt === i && runLines.length > 0 && (
                  <div className="ltask-out" aria-live="polite">
                    {runLines.map((l, n) => (
                      <span key={n} className={`ltask-out-line ltask-out-line--${l.type}`}>
                        {l.text}
                      </span>
                    ))}
                  </div>
                )}
                </>
              )}
            </section>
          );
        })}

      {/* 저장 알림은 쓸 칸이 하나라도 있을 때. 잠긴 활동을 보냈어도 앞서
          열린 활동은 쓸 수 있으므로 `canWrite`만 보지 않습니다. */}
      {!isGroup && openActs.length > 0 && (
        <p className="ltask-status">
          {status === "saving"
            ? "저장 중…"
            : status === "saved"
              ? "저장됨"
              : "쓰는 대로 저장돼요"}
        </p>
      )}

      <p className="ltask-note">
        {local
          ? "쓴 내용은 이 프로젝트의 내 카드에 곧바로 저장돼요."
          : "쓴 내용은 공부방의 내 카드에 저장돼요 — 수업이 끝난 뒤에도 이어서 쓸 수 있어요."}
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
