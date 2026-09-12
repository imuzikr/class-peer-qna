"use client";

// =============================================================
// 수업 메모 (교사 전용) — 수업 중에 짧게 적어 두는 곳
// -------------------------------------------------------------
// 누가기록(studentNotes)과 다릅니다. 그쪽은 '학생 한 명에 대한 기록'이라
// 학생을 먼저 고르고 들어가야 합니다. 수업 중에 떠오르는 것들은 대개
// 특정 학생의 일이 아니라 그 시간에 대한 것입니다 — "3번 활동 설명이
// 길었다", "다음엔 예시를 먼저" 같은 것들이요. 그걸 적을 자리가 없어
// 수업이 끝나면 사라졌습니다.
//
// 그래서 이 화면은 쓰는 칸이 먼저입니다. 지난 메모는 모달 안에 펼치지 않고
// **옆 패널**로 내보냅니다 — 수업 중에 여는 화면이라 쓰기까지 한 번에 닿아야
// 하고, 목록이 아래에 펼쳐지면 그만큼 쓰는 칸이 화면 위로 밀립니다.
//
// [반 버튼 줄 — 여기서 고른 반이 곧 '메모가 들어갈 반'입니다]
// 쓰는 칸 아래에 내가 맡은 반이 버튼으로 섭니다. 누르면 (ㄱ) 그 반의 지난
// 메모가 오른쪽 패널로 나오고, (ㄴ) **앞으로 적는 메모가 그 반에 저장됩니다.**
//
// 예전에는 이 줄이 '보기'만 했고 저장은 늘 화면이 열려 있던 반(페이지의
// classId)으로 갔습니다. 그래서 옆 반 메모를 펴 놓고 적으면 그 글이 엉뚱한
// 반에 들어갔습니다 — 화면에는 옆 반 이름만 보이는 채로요. 지금은 고른 반
// 하나가 '보는 반'이자 '쓰는 반'이라, 창 제목이 늘 저장될 곳을 말합니다.
//
// 예전에는 '지난 메모' 드롭다운 하나였고 그것은 늘 **지금 이 반**의
// 것이었습니다 — 옆 반 메모를 보려면 캘린더를 켜고 날짜를 짚어 들어가는
// 길뿐이었는데, 대개 찾는 것은 '그 반에 뭘 적어 뒀더라'이지 '9월 3일에 뭘
// 적었더라'가 아닙니다.
//
// 차례는 **이름순**입니다 — 지금 이 반이라고 앞으로 올리지 않습니다. 올리면
// 반을 옮길 때마다 줄이 통째로 다시 짜여 어제 누르던 반이 매번 다른 자리에
// 있습니다. 어느 반에 쓰는 중인지는 자리가 아니라 `.mine`(테두리)이 말합니다.
//
// 보관된 반은 규칙(ownsClassEditable)이 쓰기를 막으므로, 그 반을 고르면
// 저장을 잠그고 까닭을 밝힙니다 — 눌러 보고서야 실패를 알게 하지 않으려고요.
//
// 버튼에는 건수를 안 적습니다. 그걸 적으려면 반마다 메모를 미리 읽어야
// 하는데(반이 서넛이면 그만큼 리스너), 이 화면은 쓰러 여는 곳입니다.
// 건수는 패널을 열었을 때 그 머리말에 있습니다.
//
// 학생은 이 메모를 읽지 못합니다(firestore.rules).
//
// [서식]
// 메모는 대개 여러 갈래를 늘어놓게 됩니다("설명이 길었다 / 다음엔 예시부터").
// 그래서 굵게·밑줄·글머리 기호·번호 목록·**체크 목록**만 붙여 두었습니다
// (RichTextEditor의 tools). 나머지(기울임·코드 블록)는 수업 메모에서 쓸 일이
// 없어 뺐습니다.
//
// 체크 줄은 목록 안에서 글머리 기호 줄과 **섞어 쓸 수 있습니다**(표시가 <ul>이
// 아니라 <li>에 붙습니다 — lib/html.js). 네모는 **읽는 자리에서 바로** 켜고
// 끕니다(패널·달력) — 할 일을
// 적어 두고 나중에 지우는 자리라, 켜려고 '수정'으로 들어갔다 나오게 하면
// 뜻이 없습니다. 켜면 그 메모 문서를 그 자리에서 고쳐 씁니다.
//
// 저장되는 값은 HTML 문자열입니다. 서식이 붙기 전에 적은 메모는 순수
// 텍스트로 남아 있어, 읽을 때 richHtml()이 둘을 함께 다룹니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import RichTextEditor from "./RichTextEditor";
import { IconMyPost } from "./StatusIcons";
import {
  looksLikeHtml,
  richHtml,
  stripHtml,
  toggleChecklistItem,
  checklistIndexOf,
  hitCheckBox,
  CHECK_ITEM_SELECTOR,
} from "@/lib/html";
import {
  subscribeLessonMemos,
  LESSON_MEMO_CALENDAR,
  subscribeClasses,
  addLessonMemo,
  updateLessonMemo,
  deleteLessonMemo,
  lessonMemoDate,
  lessonMemoProgress,
  lessonMemoPages,
  LESSON_TOPIC_MAX,
  LESSON_PAGE_MAX,
  todayDateKey,
  formatTime,
} from "@/lib/store";

// 규칙(firestore.rules)과 같은 값. 서식이 붙은 뒤로는 태그까지 이 길이에
// 들어가므로, 예전처럼 잘라 내지 않고 넘으면 저장을 막고 알려 줍니다 —
// HTML을 가운데서 자르면 태그가 끊겨 글이 망가집니다.
const MAX_LEN = 2000;

// 진도 줄 — `조건문 · p.112~119`. 지난 메모 패널과 달력이 함께 씁니다.
// 주제와 페이지를 **다른 짙기로** 둡니다: 훑을 때 눈이 짚는 것은 주제이고,
// 페이지는 그 옆의 딸림값입니다.
function MemoProgressLine({ memo }) {
  const prog = lessonMemoProgress(memo);
  if (!prog) return null;
  return (
    <p className="memo-prog-line">
      {prog.topic && <b>{prog.topic}</b>}
      {prog.pages && <span>{prog.pages}</span>}
    </p>
  );
}

// 진도 세 칸 — 주제 · 시작 페이지 · 마지막 페이지.
// **쓰는 칸과 고치는 폼 둘(지난 메모 · 달력)이 같은 것을 씁니다** — 세 곳에
// 따로 적으면 칸을 하나 더할 때 한 곳을 빠뜨립니다.
//
// 페이지는 **한 묶음 안에 칸 둘**입니다(`페이지 [112] ~ [119]`). 칸마다
// '시작 페이지'·'마지막 페이지' 이름표를 세우면 좁은 패널에서 이름표가
// 글자 칸보다 넓어집니다 — 대신 가운데 물결이 어느 쪽이 시작인지 말하고,
// 이름은 placeholder·title·aria-label로 남깁니다.
// **한쪽만 적어도 되고 둘 다 비어도 됩니다** — '112쪽부터'만 아는 날도,
// '119쪽까지'만 정해 둔 날도 있습니다.
function ProgressFields({ topic, from, to, onTopic, onFrom, onTo }) {
  return (
    <div className="memo-prog-row">
      <label className="memo-prog-field">
        <span>주제</span>
        <input
          type="text"
          value={topic}
          onChange={(e) => onTopic(e.target.value)}
          placeholder="조건문"
          maxLength={LESSON_TOPIC_MAX}
        />
      </label>
      <div className="memo-prog-field memo-prog-pages">
        <span>페이지</span>
        <input
          type="text"
          value={from}
          onChange={(e) => onFrom(e.target.value)}
          placeholder="112"
          title="시작 페이지 — 비워 둬도 됩니다"
          aria-label="시작 페이지"
          maxLength={LESSON_PAGE_MAX}
        />
        <em aria-hidden="true">~</em>
        <input
          type="text"
          value={to}
          onChange={(e) => onTo(e.target.value)}
          placeholder="119"
          title="마지막 페이지 — 비워 둬도 됩니다"
          aria-label="마지막 페이지"
          maxLength={LESSON_PAGE_MAX}
        />
      </div>
    </div>
  );
}

// 고치기 폼에 넣을 페이지 두 칸. 옛 메모는 `pages` 한 칸에 '112~119'처럼
// 적혀 있어 `lessonMemoPages`가 갈라 줍니다 — 고쳐 저장하면 그때 두 칸으로
// 옮겨 갑니다(자료를 미리 옮기는 일이 없습니다).
function pageEdits(memo) {
  const { from, to } = lessonMemoPages(memo);
  return { pageFrom: from, pageTo: to };
}

// 서식만 있고 글자는 없는 상태('<div><br></div>')를 빈 메모로 봅니다.
function memoEmpty(html) {
  return !stripHtml(html).trim();
}

// 한 줄 미리보기 — 태그를 뺀 글자만. 옛 메모는 그대로가 이미 글자입니다.
function memoPreview(value) {
  const s = String(value ?? "");
  return looksLikeHtml(s) ? stripHtml(s) : s;
}

// 수업 메모에 붙이는 서식 — 글머리 기호·번호 목록·굵게·밑줄까지만
const MEMO_TOOLS = [
  "bold",
  "underline",
  "insertUnorderedList",
  "insertOrderedList",
  "checkList",
];

export default function LessonMemoModal({ classId, className = "", user, onClose }) {
  const [text, setText] = useState(""); // HTML 문자열
  // 에디터는 비제어 컴포넌트라 값을 비우려면 다시 마운트해야 합니다
  // (RichTextEditor는 initialHtml을 마운트 때 한 번만 봅니다).
  const [writeKey, setWriteKey] = useState(0);
  // 이 메모가 '어느 수업의 일'인가 — 수업이 끝난 뒤 떠올라 적는 일이 잦아
  // 쓴 시각만으로는 언제 일인지 알 수 없습니다(누가기록과 같은 방식).
  const [date, setDate] = useState(() => todayDateKey());
  const [memos, setMemos] = useState([]);
  const [busy, setBusy] = useState(false);
  // 오른쪽 패널 — null(없음) | "class"(한 반의 지난 메모) | "calendar"
  // 둘은 같은 자리에 서므로 한 번에 하나만 엽니다.
  const [historyView, setHistoryView] = useState(null);
  const [historyClassId, setHistoryClassId] = useState(classId);
  // 이 메모가 들어갈 반 — 아래 버튼 줄에서 고른 반입니다. 처음에는 화면이
  // 열려 있던 반이고, 다른 반을 누르면 그리로 옮겨 갑니다.
  const [writeClassId, setWriteClassId] = useState(classId);
  // 내가 맡은 반 — 버튼 줄에 이름을 세우는 데 씁니다(캘린더도 함께 씁니다).
  // 반 문서는 몇 개뿐이라 늘 구독해도 가볍습니다. 무거운 것은 반마다의
  // '메모'라, 그쪽은 지금도 필요할 때만 읽습니다(아래 두 구독).
  const [myClasses, setMyClasses] = useState([]);
  const [otherMemos, setOtherMemos] = useState({});

  // ── 진도 칸 ────────────────────────────────────────────────
  // 수업 메모는 진도만 적는 자리가 아닙니다('오늘 3모둠 분위기가…'). 그래서
  // 주제·페이지 두 칸을 늘 띄우지 않고 **켤 때만** 내놓습니다. 진도가 아닌
  // 메모를 적을 때 쓸모없는 빈 칸 둘을 보지 않게.
  // 켜 둔 상태는 기억합니다 — 진도를 적는 선생님은 차시마다 적으므로, 열
  // 때마다 다시 누르게 하면 그 자체가 일이 됩니다(자리표 '선생님 보기'를
  // localStorage에 기억하는 것과 같은 생각).
  const [progressOn, setProgressOn] = useState(false);
  const [topic, setTopic] = useState("");
  const [pageFrom, setPageFrom] = useState("");
  const [pageTo, setPageTo] = useState("");

  useEffect(() => {
    try {
      setProgressOn(localStorage.getItem("memo_progress_on") === "1");
    } catch { /* 사생활 보호 모드 등 — 꺼진 채로 시작합니다 */ }
  }, []);
  function toggleProgress() {
    setProgressOn((v) => {
      const next = !v;
      try { localStorage.setItem("memo_progress_on", next ? "1" : "0"); } catch {}
      return next;
    });
  }

  useEffect(() => {
    if (!classId) { setMemos([]); return; }
    return subscribeLessonMemos(classId, setMemos);
  }, [classId]);

  // 페이지에서 반을 바꾸면 옆 패널도 따라갑니다 — 안 그러면 쓰는 칸은 새 반인데
  // 옆에는 앞 반의 지난 메모가 남아, 지금 어느 반을 보는 중인지 어긋납니다.
  useEffect(() => {
    setHistoryClassId(classId);
    setWriteClassId(classId);
  }, [classId]);

  useEffect(() => {
    return subscribeClasses((list) =>
      setMyClasses(list.filter((c) => c.createdBy === user?.uid))
    );
  }, [user?.uid]);

  // [캘린더 보기를 켤 때만 다른 반의 메모까지 읽습니다]
  // 이 모달은 '지금 이 반'의 맥락에서 열리지만, 달력은 성격이 다릅니다 —
  // 하루에 여러 반 수업이 들어 있어, 9월 1일을 눌렀는데 한 반 것만 나오면
  // 그날을 되짚는 데 쓸 수가 없습니다. 그래서 달력에서는 내가 맡은 반을
  // 모두 모아 보여 주고 메모마다 어느 반인지 붙입니다.
  //
  // 쓰기 화면(기본)에서는 지금처럼 이 반 하나만 구독합니다. 반이 서너 개인
  // 교사가 달력을 열 때만 그만큼 리스너가 늘고, 규칙상 내가 맡은 반만
  // 읽히므로(ownsClass) 남의 반은 애초에 걸리지 않습니다.
  const calendarOn = historyView === "calendar";

  // 반 목록은 구독이 갱신될 때마다 새 배열로 오므로, 실제로 반이 바뀐
  // 때만 다시 걸도록 id 문자열을 열쇠로 씁니다(ConsonantDashboard와 같은 방식).
  const otherClassIds = myClasses.map((c) => c.id).filter((id) => id !== classId);
  const otherKey = otherClassIds.join(",");
  useEffect(() => {
    if (!calendarOn || !otherKey) { setOtherMemos({}); return; }
    // 여기만 **50건**입니다(`LESSON_MEMO_CALENDAR`). 한 반을 펼쳐 보는
    // 자리는 200건이지만, 달력은 켜는 순간 맡은 반 수만큼 리스너가 걸려
    // 그 값을 그대로 쓰면 한 번에 1,200건을 읽습니다. 달력이 답하는 물음은
    // '그날 수업이 있었나'라 최근 것만으로 충분합니다.
    const unsubs = otherKey.split(",").map((cid) =>
      subscribeLessonMemos(
        cid,
        (list) => setOtherMemos((prev) => ({ ...prev, [cid]: list })),
        LESSON_MEMO_CALENDAR
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [calendarOn, otherKey]);

  // 달력에 깔 메모 — 이 반 + 내 다른 반. 반 이름을 미리 붙여 둡니다.
  const nameOfClass = useMemo(() => {
    const map = new Map(myClasses.map((c) => [c.id, c.name]));
    if (classId) map.set(classId, className || map.get(classId) || "이 반");
    return (cid) => map.get(cid) ?? "";
  }, [myClasses, classId, className]);

  // 보관된 반은 규칙(ownsClassEditable)이 쓰기를 막습니다. 달력에서 그 반을
  // 골랐을 때 입력칸을 내주면 저장을 눌러야 실패를 알게 되므로 미리 가립니다.
  const archivedClassIds = useMemo(
    () => new Set(myClasses.filter((c) => c.archived).map((c) => c.id)),
    [myClasses]
  );

  // ── 반 버튼 줄 ─────────────────────────────────────
  // 차례는 **이름순**입니다(`localeCompare("ko", { numeric: true })`).
  // 한때 만든 차례였는데, 같은 이름으로 시작하는 반들이 만든 날에 따라
  // 흩어졌습니다 — '인공지능 기초 A · J · B'처럼요. 교사는 이 줄을 이름으로
  // 훑으므로 A·B·J로 나란히 서야 눈이 한 번에 짚습니다. 숫자도 함께 봐서
  // '1반 · 2반 · 10반'이 제대로 섭니다(글자순이면 10반이 2반 앞에 옵니다).
  //
  // `subscribeClasses`가 매겨 주는 차례(`sortByClassOrder`)는 쓰지 않습니다 —
  // 그것은 '반 관리하기에서 끌어 정한 값'이 있는 반을 앞세우고 없는 반을 뒤로
  // 미뤄, 한 번도 안 끈 반이 이름과 상관없이 맨 끝에 섭니다.
  //
  // **지금 이 반을 맨 앞으로 올리지 않습니다.** 올려 두면 반을 옮길 때마다
  // 줄이 통째로 다시 짜여, 어제 누르던 반이 매번 다른 자리에 있습니다(책방
  // 활동 목록을 만든 차례로 되돌린 것과 같은 이유). 어느 반에 쓰는 중인지는
  // 자리가 아니라 `.mine`(테두리)이 말합니다.
  //
  // 반 목록이 아직 안 왔어도 이 반 하나는 서 있어야 하므로, 없으면 손수
  // 만들어 붙입니다(곧 제 자리를 찾아 들어갑니다).
  const memoClasses = useMemo(() => {
    const list = myClasses.map((c) => ({
      id: c.id,
      // 지금 이 반의 이름은 페이지가 준 것을 앞세웁니다(구독보다 먼저 옵니다)
      name: (c.id === classId ? className : "") || c.name || "반 이름 없음",
      archived: !!c.archived,
    }));
    if (classId && !list.some((c) => c.id === classId)) {
      list.push({ id: classId, name: className || "이 반", archived: false });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));
  }, [myClasses, classId, className]);

  // 고른 반의 지난 메모. 지금 이 반이면 **이미 구독 중인 것을 그대로** 씁니다
  // — 같은 컬렉션에 리스너를 둘 걸 이유가 없습니다.
  //
  // null은 '없다'가 아니라 '아직 안 왔다'입니다(CLAUDE.md의 그 함정) — 빈
  // 배열로 두면 반을 바꾼 순간 '메모가 없어요'가 한 번 스칩니다.
  const [pickedMemos, setPickedMemos] = useState(null);
  const classPanelOn = historyView === "class";
  const otherPanelClassId =
    classPanelOn && historyClassId && historyClassId !== classId ? historyClassId : null;
  useEffect(() => {
    setPickedMemos(null);
    if (!otherPanelClassId) return;
    return subscribeLessonMemos(otherPanelClassId, setPickedMemos);
  }, [otherPanelClassId]);
  const panelMemos = otherPanelClassId ? pickedMemos : memos;

  // 반 버튼 — 고른 반이 **쓰는 반이자 보는 반**입니다. 패널만 여닫는 것과
  // 달리 쓰는 반은 토글하지 않습니다: 같은 반을 다시 눌러 패널을 닫아도
  // 저장될 곳은 그대로입니다(닫는 동작이 '어디에 쓸지'를 흔들면 안 됩니다).
  function pickClassFor(cid) {
    setWriteClassId(cid);
    if (classPanelOn && historyClassId === cid) { setHistoryView(null); return; }
    setHistoryClassId(cid);
    setHistoryView("class");
  }

  const calendarMemos = useMemo(() => {
    const rows = memos.map((m) => ({ ...m, classId }));
    for (const [cid, list] of Object.entries(otherMemos)) {
      for (const m of list) rows.push({ ...m, classId: cid });
    }
    return rows;
  }, [memos, otherMemos, classId]);

  // 날짜 → 그날 메모들. 같은 날이면 이 반 것이 먼저, 그다음 반 이름순.
  const byDate = useMemo(() => {
    const map = new Map();
    for (const m of calendarMemos) {
      const key = lessonMemoDate(m);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.classId !== b.classId) {
          if (a.classId === classId) return -1;
          if (b.classId === classId) return 1;
          return nameOfClass(a.classId).localeCompare(nameOfClass(b.classId));
        }
        return 0;
      });
    }
    return map;
  }, [calendarMemos, classId, nameOfClass]);

  const tooLong = text.length > MAX_LEN;
  // 지금 고른 반의 이름과 '적을 수 있는 반인가'
  const writeClassName =
    memoClasses.find((c) => c.id === writeClassId)?.name || className || "";
  const writeArchived = archivedClassIds.has(writeClassId);
  const canWrite = !!writeClassId && !writeArchived;

  // 저장이 막힌 까닭 — 없으면 `null`이고 그 줄에 아무것도 안 그립니다.
  // 눌러 보고서야 실패를 알게 하지 않으려고 미리 적어 두는 자리입니다.
  const blockReason = writeArchived
    ? "보관된 반이라 메모를 적을 수 없어요 — 다른 반을 골라 주세요"
    : tooLong
      ? `서식을 포함해 ${text.length}자 — ${MAX_LEN}자까지 저장돼요`
      : // 주제·페이지만 채우고 저장할 수는 없습니다 — 보안 규칙이 본문을
        // 요구합니다.
        (topic.trim() || pageFrom.trim() || pageTo.trim()) && memoEmpty(text)
        ? "수업 내용도 한 줄 적어야 저장돼요"
        : null;

  async function handleSave() {
    const body = text.trim();
    if (memoEmpty(body) || tooLong || busy || !canWrite) return;
    setBusy(true);
    try {
      await addLessonMemo(writeClassId, user, body, date, { topic, pageFrom, pageTo });
      setText("");
      setTopic("");
      setPageFrom("");
      setPageTo("");
      setWriteKey((k) => k + 1); // 쓴 것을 지우려면 에디터를 다시 세웁니다
      // 날짜는 오늘로 되돌립니다 — 지난 수업 것을 하나 적고 나서 다음 메모가
      // 그 날짜에 눌러앉아 있으면 알아채기 어렵습니다.
      setDate(todayDateKey());
      // 방금 적은 것이 목록에 들어가는 것을 보여 줍니다 — 저장됐는지
      // 따로 확인하러 가지 않아도 되게. 달력을 보던 중이면 그대로 둡니다
      // (그 날짜의 건수가 바로 늘어 저장된 것이 거기서도 보입니다).
      if (historyView !== "calendar") {
        setHistoryClassId(writeClassId);
        setHistoryView("class");
      }
    } finally {
      setBusy(false);
    }
  }

  // Ctrl/⌘+Enter로 저장은 에디터가 처리합니다(onSend) — 앱의 다른
  // 입력칸과 같은 약속입니다.

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      {/* 모달과 옆 패널(지난 메모·달력)을 한 줄로 묶습니다 — 목록이나 달력을
          모달 안에 쌓으니 세로로 너무 길어져(달력 하나가 250px), 쓰는 칸이
          화면 위로 밀려났습니다. 파이썬 실행 패널(.py-panel)과 같은 방식으로
          옆에서 미끄러져 나옵니다. */}
      <div className="memo-modal-row">
      <div
        className="modal modal-lesson-memo"
        role="dialog"
        aria-modal="true"
        aria-label="수업 메모"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 className="head-icon">
            <IconMyPost size={20} /> 수업 메모
            {/* 여기 적히는 반이 곧 **저장될 반**입니다(아래 버튼 줄에서
                고른 반). 화면이 열려 있던 반이 아니라서, 옆 반을 골라 두고
                적을 때 어디로 가는지 제목 한 줄로 알 수 있어야 합니다. */}
            {writeClassName && <span className="notes-student">{writeClassName}</span>}
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="notes-date-row memo-date-row">
          <span>날짜</span>
          <input
            type="date"
            className="notes-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={todayDateKey()}
          />
        </div>

        {progressOn && (
          <ProgressFields
            topic={topic}
            from={pageFrom}
            to={pageTo}
            onTopic={setTopic}
            onFrom={setPageFrom}
            onTo={setPageTo}
          />
        )}

        <RichTextEditor
          key={writeKey}
          className="memo-rte"
          tools={MEMO_TOOLS}
          autoFocus
          onChange={setText}
          onSend={handleSave}
          sendDisabled={busy || memoEmpty(text) || tooLong}
          placeholder="수업 중 기억해 둘 것을 적어 주세요. 학생에게는 보이지 않아요."
        />

        {/* 쓰는 칸 바로 아래 줄 — 왼쪽 끝에 '진도', 오른쪽 끝에 '저장'.
            진도는 **쓰는 칸을 늘리는 단추**라 그 칸 옆에 있어야 합니다
            (반 고르는 줄에 뒀을 때는 '캘린더 보기' 옆이라 옆 패널을 여는
            단추처럼 보였습니다).
            **평소에는 이 줄에 글자가 없습니다.** 한때 'Ctrl+Enter로도
            저장돼요'가 늘 떠 있었는데, 한 번 읽으면 그만인 말이 창을 열
            때마다 자리를 차지했습니다. 그 자리는 이제 **저장이 막혔을 때
            그 까닭만** 씁니다 — 늘 있는 글이 아니라야 떴을 때 눈에 띕니다. */}
        <div className="memo-foot">
          <button
            type="button"
            className={`memo-cal-btn memo-prog-toggle${progressOn ? " on" : ""}`}
            onClick={toggleProgress}
            aria-pressed={progressOn}
            title={
              progressOn
                ? "주제·페이지 칸을 접습니다"
                : "수업 진도를 함께 적습니다 (주제 · 페이지)"
            }
          >
            진도
          </button>
          {blockReason && (
            <span className={`memo-hint${tooLong || writeArchived ? " over" : ""}`}>
              {blockReason}
            </span>
          )}
          <button
            type="button"
            className="btn-primary memo-save"
            onClick={handleSave}
            disabled={busy || memoEmpty(text) || tooLong || !canWrite}
            title={
              writeClassName ? `‘${writeClassName}’에 저장합니다` : undefined
            }
          >
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>

        {/* 지난 메모 — 반 버튼 줄입니다. 누르면 그 반의 목록이 옆 패널로
            나옵니다(모달 안에 펼치지 않는 까닭은 파일 맨 위 설명 참고). */}
        <div className="memo-history">
          <div className="memo-history-head">
            {/* 이름을 '지난 메모'에서 바꿨습니다 — 이 줄은 이제 보기만
                하는 자리가 아니라 '어느 반에 적을까'를 고르는 자리입니다. */}
            <span className="memo-history-label">반 고르기</span>
            <span className="memo-head-btns">
              {/* 달력은 옆 패널을 엽니다 — 지난 메모 패널과 같은 자리라
                  한 번에 하나만 열립니다. 켤 때만 다른 반의 메모까지
                  읽습니다(위 구독 참고).
                  '진도'는 쓰는 칸 아래 줄로 옮겼습니다 — 그 단추가 늘리는
                  것이 쓰는 칸이라, 여기 두면 옆 패널을 여는 단추로 읽힙니다. */}
              <button
                type="button"
                className={`memo-cal-btn${calendarOn ? " on" : ""}`}
                onClick={() => setHistoryView((v) => (v === "calendar" ? null : "calendar"))}
                aria-pressed={calendarOn}
                aria-expanded={calendarOn}
                title="메모가 있는 날짜를 달력에서 봅니다 — 내가 맡은 반을 모두 모아서"
              >
                캘린더 보기
              </button>
            </span>
          </div>

          <div className="memo-class-row">
            {memoClasses.map((c) => {
              const on = classPanelOn && historyClassId === c.id;
              const label = c.name || "반 이름 없음";
              return (
                <button
                  key={c.id}
                  type="button"
                  className={[
                    "memo-class-btn",
                    on && "on",
                    // `.mine`은 '지금 어느 반에 쓰는 중인가'입니다 — 화면이
                    // 열려 있던 반이 아니라 여기서 고른 반.
                    c.id === writeClassId && "mine",
                    c.archived && "archived",
                  ].filter(Boolean).join(" ")}
                  onClick={() => pickClassFor(c.id)}
                  aria-pressed={on}
                  aria-expanded={on}
                  title={
                    c.archived
                      ? `${label} — 보관된 반이라 지난 메모만 볼 수 있어요`
                      : `${label}에 메모를 적고, 지난 메모를 봅니다`
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 옆 패널 — 지난 메모와 달력이 같은 자리에 섭니다(한 번에 하나) */}
      {classPanelOn && (
        <MemoClassPanel
          classId={historyClassId}
          name={nameOfClass(historyClassId) || "반 이름 없음"}
          memos={panelMemos}
          readOnly={archivedClassIds.has(historyClassId)}
          onClose={() => setHistoryView(null)}
        />
      )}

      {calendarOn && (
        <MemoCalendarPanel
          byDate={byDate}
          nameOfClass={nameOfClass}
          archivedClassIds={archivedClassIds}
          /* 달력에서 '또렷하게' 칠할 반도 지금 고른 반입니다 — 창 제목과
             버튼 줄이 가리키는 반과 달력이 어긋나면 안 됩니다. */
          currentClassId={writeClassId}
          user={user}
          onClose={() => setHistoryView(null)}
        />
      )}
      </div>
    </div>
  );
}

// ── 표 얼굴 ────────────────────────────────────────────
// 같은 목록을 **날짜 · 주제 · 페이지 · 내용** 네 열로 봅니다. 목록 얼굴이
// 이미 이 넷을 다 보여 주므로 표가 새로 주는 것은 **열 정렬** 하나입니다 —
// 페이지가 세로로 줄을 서면 '지난 시간 119까지 했으니 오늘은 120부터'를 눈으로
// 한 번에 잇습니다. 카드 목록은 주제 길이에 따라 페이지가 매 줄 다른 자리에
// 있어 그걸 못 합니다.
//
// **읽는 문서가 늘지 않습니다** — 패널이 이미 받아 둔 배열을 다시 펴는 것뿐
// 입니다(책방 '전체 보기'의 격자 / 낱말 구름과 같은 생각).
//
// [차례가 목록과 반대입니다]
// 목록은 최신순인데(`sortLessonMemos`) 표는 **오래된 것이 위**입니다. 표에서
// 보려는 것은 학기 흐름이라 위에서 아래로 시간이 흘러야 페이지가 이어집니다.
// 이미 날짜·시각 두 겹으로 정렬된 배열이라 **뒤집기만 하면** 두 겹이 그대로
// 오름차순이 됩니다(정렬을 다시 짜면 두 얼굴의 차례가 어긋날 자리가 생깁니다).
//
// [내용은 한 줄 미리보기입니다]
// 메모 본문은 목록·체크 줄이 든 HTML이라 칸에 그대로 넣으면 행 높이가
// 제각각이 되어, 표의 값인 줄 맞춤이 무너집니다. 그래서 표는 **훑는 얼굴**이고
// 손대는 일(체크·수정·삭제)은 목록 얼굴에 둡니다 — 행을 누르면 목록으로
// 돌아가 그 메모를 짚어 줍니다.
function MemoProgressTable({ memos, onPickRow }) {
  // 이미 '날짜 내림차순 → 같은 날이면 시각 내림차순'으로 정렬된 배열이라
  // 뒤집으면 두 겹이 그대로 오름차순이 됩니다.
  const rows = useMemo(() => [...memos].reverse(), [memos]);

  return (
    <div className="memo-table-wrap">
      <table className="memo-table">
        {/* 폭을 못 박습니다(`table-layout: fixed`와 짝) — 내용에 맡기면 주제가
            긴 행 하나 때문에 페이지 열이 밀려, 줄을 맞추려고 만든 표에서
            정작 페이지가 세로로 안 섭니다. */}
        <colgroup>
          <col className="memo-col-date" />
          <col className="memo-col-topic" />
          <col className="memo-col-pages" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">날짜</th>
            <th scope="col">주제</th>
            <th scope="col">페이지</th>
            <th scope="col">내용</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const prog = lessonMemoProgress(m);
            return (
              <tr
                key={m.id}
                /* `role="button"`을 주지 마세요 — 행이 표에서 빠져나와,
                   읽어 주는 기기에서 '몇 행 몇 열'이 사라집니다. 행은 행인
                   채로 두고 누를 수만 있게 합니다. */
                tabIndex={0}
                onClick={() => onPickRow(m.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPickRow(m.id);
                  }
                }}
                title="목록에서 이 메모를 봅니다"
              >
                <td className="memo-td-date">{lessonMemoDate(m)}</td>
                {/* 진도를 안 적은 메모는 두 칸이 빕니다. 아주 빈 칸으로 두면
                    표가 고장 난 것처럼 보여 옅은 붙임표를 둡니다. */}
                <td className="memo-td-topic">
                  {prog?.topic || <span className="memo-td-none">–</span>}
                </td>
                <td className="memo-td-pages">
                  {prog?.pages || <span className="memo-td-none">–</span>}
                </td>
                <td className="memo-td-text">{memoPreview(m.text)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 한 반의 지난 메모 패널 ──────────────────────────────
// 예전에 모달 안에 펼치던 목록 그대로입니다(.memo-list·.memo-item) — 자리만
// 옆 패널로 옮겼습니다. 고치고 지우는 것도 여기서 합니다.
//
// **memos === null은 '없다'가 아니라 '아직 안 왔다'입니다.** 빈 배열과 갈라
// 두지 않으면 반을 바꿀 때마다 '아직 적어 둔 메모가 없어요'가 한 번 스칩니다
// (CLAUDE.md '아직 모름과 없음을 가릅니다'와 같은 함정).
function MemoClassPanel({ classId, name, memos, readOnly, onClose }) {
  const [editing, setEditing] = useState(null); // { id, text, date, topic, pageFrom, pageTo }
  const [confirmDelete, setConfirmDelete] = useState(null); // memoId
  // '진도 보기' — 주제·페이지를 적어 둔 메모만 남깁니다. 한 반의 목록에는
  // 그날그날의 메모('3모둠 분위기가…')와 진도가 섞여 있어, 학기 흐름을
  // 훑으려면 눈으로 걸러 내야 했습니다.
  const [progOnly, setProgOnly] = useState(false);
  // 목록 / 표 — 같은 자료를 보는 방법만 바뀝니다(읽는 문서는 그대로).
  const [view, setView] = useState("list");
  // 표에서 행을 누르면 목록으로 돌아가 그 메모를 짚어 줍니다.
  // 같은 행을 다시 눌러도 다시 짚이도록 번호를 함께 듭니다 — 같은 값이면
  // 상태가 안 바뀌어 타이머가 다시 안 걸립니다(책방 `.consonant-cell.flash`와
  // 같은 함정).
  const [focus, setFocus] = useState(null); // { id, n }
  const focusRef = useRef(null);
  const seqRef = useRef(0);

  // 반을 바꾸면 고치던 것·지우려던 것을 놓습니다 — 앞 반의 메모 id를 든 채로
  // 저장을 누르면 이 반에 없는 문서를 고치게 됩니다. 짚어 둔 것도 함께
  // 놓습니다(앞 반의 메모 id라 이 반에는 없습니다).
  // **거르기와 보는 방법은 그대로 둡니다** — 교사가 이 둘을 고르는 까닭이
  // '반마다 진도가 어디까지 나갔나'를 훑는 것이라, 반을 옮길 때마다 되돌아가면
  // 매번 다시 눌러야 합니다.
  useEffect(() => {
    setEditing(null);
    setConfirmDelete(null);
    setFocus(null);
  }, [classId]);

  // 짚은 메모로 데려다 줍니다. 표에서 목록으로 건너온 참이라 그 메모가
  // 목록 한참 아래에 있을 수 있습니다.
  useEffect(() => {
    if (!focus || view !== "list") return;
    focusRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => setFocus(null), 1600);
    return () => clearTimeout(t);
  }, [focus, view]);

  function pickRow(id) {
    seqRef.current += 1;
    setView("list");
    setFocus({ id, n: seqRef.current });
  }

  // 판정은 `lessonMemoProgress` 한 곳을 그대로 씁니다 — 목록에 진도 줄을
  // 그리는 기준과 거르는 기준이 다르면, 걸러 낸 목록에 줄이 없는 메모가
  // 섞이거나 그 반대가 됩니다.
  const shown = memos === null
    ? null
    : progOnly
      ? memos.filter((m) => lessonMemoProgress(m))
      : memos;

  async function handleEditSave() {
    const body = editing?.text.trim() ?? "";
    if (memoEmpty(body) || body.length > MAX_LEN) return;
    await updateLessonMemo(classId, editing.id, body, editing.date, {
      topic: editing.topic,
      pageFrom: editing.pageFrom,
      pageTo: editing.pageTo,
    });
    setEditing(null);
  }

  async function handleDelete(memoId) {
    await deleteLessonMemo(classId, memoId);
    setConfirmDelete(null);
  }

  // 체크 목록의 네모 — 누르면 그 자리에서 켜고 끄고 저장합니다.
  // 저장된 HTML의 몇 번째 항목인지로 찾습니다(화면에 그린 것과 저장된 것이
  // 같은 차례라, 글이 길어도 어긋나지 않습니다).
  async function onCheck(e, memo) {
    if (readOnly) return;
    const li = e.target.closest?.(CHECK_ITEM_SELECTOR);
    if (!li || !hitCheckBox(li, e.clientX)) return; // 글자를 누른 것
    const index = checklistIndexOf(e.currentTarget, li);
    if (index < 0) return;
    li.classList.toggle("done"); // 눈에 먼저 — 저장을 기다리지 않게
    await updateLessonMemo(
      classId,
      memo.id,
      toggleChecklistItem(richHtml(memo.text), index),
      lessonMemoDate(memo)
    );
  }

  return (
    <aside
      /* 표 얼굴에서만 패널이 넓어집니다 — 네 열을 320px에 넣으면 내용 열에
         한글 예닐곱 자밖에 안 들어가, 그 열을 두려고 만든 표가 빈 열을
         하나 갖게 됩니다(실측: 320 − 안쪽 여백 32 = 288px). */
      className={`memo-side-panel memo-class-panel${view === "table" ? " memo-side-panel--wide" : ""}`}
      onClick={(e) => e.stopPropagation()}
      aria-label={`${name} 지난 메모`}
    >
      <div className="memo-side-panel-head">
        <h4>
          {name}
          {/* 건수는 여기에만 있습니다 — 버튼 줄에 적으려면 반마다 메모를
              미리 읽어야 합니다(파일 맨 위 설명 참고).
              거르는 중이면 **보이는 만큼**을 셉니다. 전체 건수를 그대로 두면
              목록에 넉 줄인데 머리에는 '12건'이라 적혀 고장으로 보입니다. */}
          {shown?.length > 0 && <em className="memo-panel-count">{shown.length}건</em>}
        </h4>
        <button type="button" className="btn-close" onClick={onClose} aria-label="지난 메모 닫기">×</button>
      </div>

      {/* 머리줄 **아래 제 줄**입니다 — 노트 크게 보기 창(.cornell-view-tabs)과
          같은 자리. 반 이름·건수·알약·거르기·×를 한 줄에 넣으면 좁은 얼굴
          (320px)에서 350px이 필요해 넘칩니다(실측). 넓은 표 얼굴에 맞춰 한
          줄로 두면 목록 얼굴에서만 깨지므로, 두 얼굴 모두에서 버티는 쪽으로
          갈라 둡니다. */}
      <div className="memo-panel-tools">
        {/* 목록 / 표 — '다른 화면으로 간다'가 아니라 '같은 것을 달리 본다'라
            책방 전체 보기(격자 / 낱말 구름)와 같은 알약을 씁니다.
            **캘린더 보기 옆이 아니라 여기**인 까닭: 표는 한 반 것이어야 뜻이
            있는데, 저 줄에 두면 어느 반의 표인지가 흐립니다(캘린더는 여러 반을
            모으는 화면이라 반 맥락이 없어도 됩니다). 이 패널은 그 자체가 한
            반이라 그 물음이 아예 안 생깁니다. */}
        <div className="dash-view-tabs memo-view-tabs" role="tablist" aria-label="보는 방법">
          <button
            type="button"
            role="tab"
            aria-selected={view === "list"}
            className={`dash-view-tab${view === "list" ? " on" : ""}`}
            onClick={() => setView("list")}
            title="메모를 한 건씩 펼쳐 봅니다 — 고치고 지우는 것도 여기서"
          >
            목록
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "table"}
            className={`dash-view-tab${view === "table" ? " on" : ""}`}
            onClick={() => setView("table")}
            title="날짜 · 주제 · 페이지 · 내용 네 열로 훑습니다"
          >
            표
          </button>
        </div>
        {/* 진도 보기 — 새로 읽는 문서가 없습니다. 이미 받아 둔 목록에서
            주제·페이지가 있는 것만 골라 그립니다. 두 얼굴에 함께 걸립니다 —
            표에서 켜면 그것이 곧 '진도 표'입니다. */}
        <button
          type="button"
          className={`memo-prog-filter${progOnly ? " on" : ""}`}
          onClick={() => setProgOnly((v) => !v)}
          aria-pressed={progOnly}
          title={
            progOnly
              ? "메모까지 모두 봅니다"
              : "주제·페이지를 적어 둔 메모만 봅니다"
          }
        >
          진도 보기
        </button>
      </div>

      <div className="memo-side-panel-body">
        {readOnly && <p className="memo-cal-readonly">보관된 반이라 고치거나 지울 수 없어요.</p>}

        {shown === null ? (
          <p className="memo-empty">불러오는 중이에요…</p>
        ) : shown.length === 0 ? (
          /* 걸러서 빈 것과 원래 빈 것은 다른 말입니다 — '없어요'만 적으면
             단추를 켜 둔 줄 모르고 메모가 사라졌다고 읽습니다. */
          <p className="memo-empty">
            {progOnly
              ? "진도를 적어 둔 메모가 없어요."
              : "아직 적어 둔 메모가 없어요."}
          </p>
        ) : view === "table" ? (
          <MemoProgressTable memos={shown} onPickRow={pickRow} />
        ) : (
          <ul className="memo-list">
            {shown.map((m) => (
              <li
                key={m.id}
                /* 표에서 건너온 메모를 잠깐 짚어 줍니다 — 목록 한참 아래에
                   있을 수 있어, 데려다 놓기만 하면 어느 것이었는지 모릅니다. */
                ref={focus?.id === m.id ? focusRef : null}
                className={`memo-item${focus?.id === m.id ? " flash" : ""}`}
              >
                {editing?.id === m.id ? (
                  <>
                    <label className="notes-date-row">
                      <span>날짜</span>
                      <input
                        type="date"
                        className="notes-date"
                        value={editing.date}
                        onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                        max={todayDateKey()}
                      />
                    </label>
                    {/* 진도 칸은 고칠 때 **늘 보여 줍니다** — 쓰는 칸과 달리
                        여기는 이미 있는 값을 고치러 온 자리라, 접어 두면
                        주제가 적힌 메모인지 아닌지 열어 봐야 압니다. */}
                    <ProgressFields
                      topic={editing.topic}
                      from={editing.pageFrom}
                      to={editing.pageTo}
                      onTopic={(v) => setEditing({ ...editing, topic: v })}
                      onFrom={(v) => setEditing({ ...editing, pageFrom: v })}
                      onTo={(v) => setEditing({ ...editing, pageTo: v })}
                    />
                    <RichTextEditor
                      key={m.id}
                      className="memo-rte memo-rte--sm"
                      tools={MEMO_TOOLS}
                      small
                      initialHtml={richHtml(m.text)}
                      onChange={(html) => setEditing((prev) => (prev ? { ...prev, text: html } : prev))}
                      onSend={handleEditSave}
                      sendDisabled={memoEmpty(editing.text) || editing.text.length > MAX_LEN}
                    />
                    <div className="memo-item-actions memo-edit-actions">
                      <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
                        취소
                      </button>
                      <button
                        type="button"
                        className="btn-primary memo-save"
                        onClick={handleEditSave}
                        disabled={memoEmpty(editing.text) || editing.text.length > MAX_LEN}
                      >
                        저장
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="memo-item-head">
                      <span className="memo-item-time">
                        <b className="memo-item-date">{lessonMemoDate(m)}</b>
                        {/* 쓴 시각도 남깁니다 — 같은 날 여러 번 적을 때
                            순서를 알아볼 수 있어야 합니다 */}
                        <span className="memo-item-clock">{formatTime(m.createdAt)}</span>
                      </span>
                      {!readOnly && (
                        <span className="memo-item-actions">
                          <button
                            type="button"
                            className="memo-mini-btn"
                            onClick={() =>
                              setEditing({
                                id: m.id,
                                text: m.text,
                                date: lessonMemoDate(m),
                                topic: m.topic ?? "",
                                // 옛 메모는 '112~119' 한 칸이라 갈라 읽습니다
                                ...pageEdits(m),
                              })
                            }
                          >
                            수정
                          </button>
                          {confirmDelete === m.id ? (
                            <>
                              <button
                                type="button"
                                className="memo-mini-btn danger"
                                onClick={() => handleDelete(m.id)}
                              >
                                정말 지울까요?
                              </button>
                              <button
                                type="button"
                                className="memo-mini-btn"
                                onClick={() => setConfirmDelete(null)}
                              >
                                취소
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="memo-mini-btn"
                              onClick={() => setConfirmDelete(m.id)}
                            >
                              삭제
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                    {/* 진도 줄 — 주제·페이지를 적은 메모에만 섭니다.
                        진도 칸이 없는 예전 메모는 아무것도 안 그립니다
                        (`lessonMemoProgress`가 null을 돌려줍니다). */}
                    <MemoProgressLine memo={m} />
                    {/* 서식이 붙기 전 메모는 순수 텍스트라 richHtml이
                        줄바꿈만 살려 내보냅니다(lib/html.js).
                        체크 목록의 네모는 **여기서** 켜고 끕니다 — 할 일을
                        적어 두고 나중에 지우는 자리가 이 목록이라, 켜려고
                        '수정'으로 들어갔다 나오게 하면 뜻이 없습니다. */}
                    <div
                      className="memo-item-text"
                      onClick={(e) => onCheck(e, m)}
                      dangerouslySetInnerHTML={{ __html: richHtml(m.text) }}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

// ── 메모 달력 ──────────────────────────────────────────
// 출석부 달력(StudyAttendanceModal)과 같은 짜임·같은 CSS를 씁니다. 교사가
// 이미 그 모양에 익숙하고, 격자·요일 머리·달 넘기기를 다시 만들 이유가
// 없습니다. 다른 점은 칸에 채우는 값뿐입니다 — 출석은 '몇 명 왔나',
// 여기는 '메모 몇 건'.
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function toDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftMonth(cursor, delta) {
  const m = cursor.month + delta;
  if (m < 0) return { year: cursor.year - 1, month: 11 };
  if (m > 11) return { year: cursor.year + 1, month: 0 };
  return { year: cursor.year, month: m };
}

function formatDateLabel(dateKey) {
  if (!dateKey) return "";
  const [y, m, d] = String(dateKey).split("-");
  return `${y}.${m}.${d}`;
}

function MemoCalendarPanel({ byDate, nameOfClass, archivedClassIds, currentClassId, user, onClose }) {
  // 처음 여는 달 — 가장 최근 메모가 있는 달. 오늘로 열면 방학이나 주말에
  // 열었을 때 빈 달이 나옵니다.
  const [cursor, setCursor] = useState(() => {
    const anchor = [...byDate.keys()].sort().at(-1) || todayDateKey();
    const [y, m] = anchor.split("-").map(Number);
    return { year: y, month: m - 1 };
  });
  // 날짜 → 반 → 메모, 세 걸음입니다. 하루에 여러 반 수업이 들어 있어
  // 날짜만으로는 어느 시간 이야기인지 갈리지 않습니다.
  const [picked, setPicked] = useState("");        // 고른 날짜
  const [pickedClass, setPickedClass] = useState(""); // 고른 반
  const [pickedMemo, setPickedMemo] = useState("");   // 펼친 메모
  // 고른 반의 그날 메모를 여기서 바로 적고 고칩니다 — 달력에서 지난 수업을
  // 되짚다가 "아, 이것도 적어 둘걸" 하는 자리가 여기입니다. 그때 모달로
  // 돌아가 날짜와 반을 다시 맞추게 하면 하던 일이 끊깁니다.
  const [draft, setDraft] = useState("");
  const [draftKey, setDraftKey] = useState(0); // 저장 뒤 에디터를 비우려고
  const [editingId, setEditingId] = useState("");
  const [editText, setEditText] = useState("");
  const [editProg, setEditProg] = useState({ topic: "", pageFrom: "", pageTo: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 반을 고르면 달력을 접습니다 — 그 반의 메모를 읽고 적는 자리가 되므로,
  // 좁은 패널에서 달력이 250px을 차지하고 있을 이유가 없습니다.
  const calendarOpen = !pickedClass;

  function pickDate(key) {
    setPicked((prev) => (prev === key ? "" : key));
    setPickedClass("");
    resetWrite();
  }

  function pickClass(cid) {
    setPickedClass(cid);
    resetWrite();
  }

  function resetWrite() {
    setPickedMemo("");
    setDraft("");
    setEditingId("");
    setEditText("");
    setError("");
  }

  const readOnly = archivedClassIds?.has(pickedClass) ?? false;

  async function saveNew() {
    const body = draft.trim();
    if (memoEmpty(body) || body.length > MAX_LEN || busy || !picked || !pickedClass) return;
    setBusy(true);
    setError("");
    try {
      await addLessonMemo(pickedClass, user, body, picked);
      setDraft("");
      setDraftKey((k) => k + 1);
    } catch (e) {
      setError(`저장하지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setBusy(false);
    }
  }

  // 체크 목록의 네모 — 펼친 메모에서 바로 켜고 끕니다(패널과 같은 방식).
  async function onCheck(e, memo) {
    if (readOnly || busy) return;
    const li = e.target.closest?.(CHECK_ITEM_SELECTOR);
    if (!li || !hitCheckBox(li, e.clientX)) return;
    const index = checklistIndexOf(e.currentTarget, li);
    if (index < 0) return;
    li.classList.toggle("done");
    await updateLessonMemo(
      pickedClass,
      memo.id,
      toggleChecklistItem(richHtml(memo.text), index),
      picked
    ).catch(() => {});
  }

  async function saveEdit() {
    const body = editText.trim();
    if (memoEmpty(body) || body.length > MAX_LEN || busy) return;
    setBusy(true);
    setError("");
    try {
      // 날짜는 그대로 둡니다 — 달력에서 고른 그 날짜의 메모라, 여기서
      // 날짜를 바꾸면 방금 보던 목록에서 사라져 어디로 갔는지 알 수 없습니다.
      await updateLessonMemo(pickedClass, editingId, body, picked, editProg);
      setEditingId("");
      setEditText("");
      setEditProg({ topic: "", pageFrom: "", pageTo: "" });
    } catch (e) {
      setError(`저장하지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setBusy(false);
    }
  }

  const today = todayDateKey();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const startWeekday = new Date(cursor.year, cursor.month, 1).getDay();
  const cells = Array.from({ length: startWeekday }, () => null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1)
  );

  const dayMemos = picked ? byDate.get(picked) ?? [] : [];

  // 그날 수업이 있던 반들 — 순서는 byDate에서 이미 이 반이 먼저로 정렬돼 있습니다.
  const dayClasses = [];
  for (const m of dayMemos) {
    const found = dayClasses.find((c) => c.id === m.classId);
    if (found) found.count += 1;
    else dayClasses.push({ id: m.classId, count: 1 });
  }

  const classMemos = pickedClass ? dayMemos.filter((m) => m.classId === pickedClass) : [];

  return (
    <aside className="memo-side-panel memo-cal-panel" onClick={(e) => e.stopPropagation()} aria-label="수업 메모 캘린더">
      <div className="memo-side-panel-head">
        <h4>캘린더</h4>
        <button type="button" className="btn-close" onClick={onClose} aria-label="캘린더 닫기">×</button>
      </div>

      <div className="memo-side-panel-body">
        {calendarOpen && (
        <div className="study-attendance-calendar">
          <div className="study-cal-head">
            <button type="button" onClick={() => setCursor((c) => shiftMonth(c, -1))} aria-label="이전 달">‹</button>
            <span>{cursor.year}년 {cursor.month + 1}월</span>
            <button type="button" onClick={() => setCursor((c) => shiftMonth(c, 1))} aria-label="다음 달">›</button>
          </div>
          <div className="study-cal-weekdays" aria-hidden="true">
            {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="study-cal-grid">
            {cells.map((d, i) => {
              if (d === null) {
                return <span key={`blank${i}`} className="study-cal-cell study-cal-cell--blank" />;
              }
              const key = toDateKey(cursor.year, cursor.month, d);
              const list = byDate.get(key) ?? [];
              const has = list.length > 0;
              // 이 반 메모가 있는 날은 또렷하게 — 모달을 연 맥락이 이 반이라,
              // 다른 반 메모만 있는 날과 같아 보이면 헷갈립니다.
              const mine = list.some((m) => m.classId === currentClassId);
              const cls = [
                "study-cal-cell",
                has && "has-record",
                has && !mine && "memo-cal-other",
                key === picked && "selected",
                key === today && "today",
              ].filter(Boolean).join(" ");
              return (
                <button
                  key={key}
                  type="button"
                  className={cls}
                  onClick={() => pickDate(key)}
                  disabled={!has}
                  title={has ? `메모 ${list.length}건` : undefined}
                >
                  {/* 건수는 **적지 않습니다** — 이 달력이 답하는 물음은
                      '어느 날에 적어 뒀나' 하나이고, 그건 칸 색이 이미
                      말합니다. 날짜 아래 작은 숫자를 더 두면 한 칸에 숫자가
                      둘이라 어느 것이 날짜인지 한 번 더 보게 됩니다.
                      몇 건인지는 툴팁에 그대로 있습니다. */}
                  <span className="study-cal-day">{d}</span>
                </button>
              );
            })}
          </div>
        </div>
        )}

        {!picked ? (
          <p className="memo-cal-hint">
            {byDate.size === 0
              ? "아직 적어 둔 메모가 없어요."
              : "메모가 있는 날짜를 눌러 보세요."}
          </p>
        ) : !pickedClass ? (
          /* 두 번째 걸음 — 그날 수업이 있던 반 */
          <div className="memo-cal-step">
            <p className="memo-cal-step-head">{formatDateLabel(picked)}</p>
            <ul className="memo-cal-picks">
              {dayClasses.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`memo-cal-pick${c.id === currentClassId ? " mine" : ""}`}
                    onClick={() => setPickedClass(c.id)}
                  >
                    <span className="memo-cal-pick-name">{nameOfClass(c.id) || "반 이름 없음"}</span>
                    <span className="memo-cal-pick-count">{c.count}건</span>
                    <span className="memo-cal-pick-caret" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          /* 세 번째 걸음 — 그 반의 그날 메모. 달력은 접혔습니다.
             읽기만 하는 자리가 아니라 여기서 바로 적고 고칩니다. */
          <div className="memo-cal-step memo-cal-step--open">
            <div className="memo-cal-step-head memo-cal-step-back">
              <button type="button" className="memo-cal-back" onClick={() => pickClass("")}>
                ‹ 반 목록
              </button>
              <span className="memo-cal-step-where">
                {formatDateLabel(picked)} · {nameOfClass(pickedClass)}
              </span>
            </div>

            {/* 이 날짜·이 반으로 한 건 더 — 달력에서 지난 수업을 되짚다가
                떠오른 것을 그 자리에서 적습니다. 날짜와 반은 지금 보고 있는
                그것이라 따로 고를 것이 없습니다. */}
            {readOnly ? (
              <p className="memo-cal-readonly">보관된 반이라 메모를 더할 수 없어요.</p>
            ) : (
              <div className="memo-cal-write">
                <RichTextEditor
                  key={`draft${draftKey}`}
                  className="memo-rte memo-rte--sm"
                  tools={MEMO_TOOLS}
                  small
                  onChange={setDraft}
                  onSend={saveNew}
                  sendDisabled={busy || memoEmpty(draft) || draft.length > MAX_LEN}
                  placeholder={`${formatDateLabel(picked)} 수업에 적어 둘 것`}
                />
                <div className="memo-cal-write-foot">
                  <button
                    type="button"
                    className="btn-primary memo-save"
                    onClick={saveNew}
                    disabled={busy || memoEmpty(draft) || draft.length > MAX_LEN}
                  >
                    {busy ? "저장 중…" : "저장"}
                  </button>
                </div>
              </div>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}

            <ul className="memo-cal-picks">
              {classMemos.map((m) => {
                if (editingId === m.id) {
                  return (
                    <li key={m.id} className="memo-cal-editing">
                      {/* 진도 칸 — 지난 메모 패널의 고치는 폼과 같습니다.
                          고칠 때는 늘 보여 줍니다(이미 있는 값을 고치러 온
                          자리라 접어 두면 열어 봐야 압니다). */}
                      <ProgressFields
                        topic={editProg.topic}
                        from={editProg.pageFrom}
                        to={editProg.pageTo}
                        onTopic={(v) => setEditProg((p) => ({ ...p, topic: v }))}
                        onFrom={(v) => setEditProg((p) => ({ ...p, pageFrom: v }))}
                        onTo={(v) => setEditProg((p) => ({ ...p, pageTo: v }))}
                      />
                      <RichTextEditor
                        key={m.id}
                        className="memo-rte memo-rte--sm"
                        tools={MEMO_TOOLS}
                        small
                        initialHtml={richHtml(m.text)}
                        onChange={setEditText}
                        onSend={saveEdit}
                        sendDisabled={busy || memoEmpty(editText) || editText.length > MAX_LEN}
                      />
                      <div className="memo-item-actions memo-edit-actions">
                        <button type="button" className="btn-ghost" onClick={() => setEditingId("")}>
                          취소
                        </button>
                        <button
                          type="button"
                          className="btn-primary memo-save"
                          onClick={saveEdit}
                          disabled={busy || memoEmpty(editText) || editText.length > MAX_LEN}
                        >
                          저장
                        </button>
                      </div>
                    </li>
                  );
                }
                const open = pickedMemo === m.id;
                return (
                  /* 펼친 본문은 버튼 밖에 둡니다 — 서식이 붙은 뒤로는 여기에
                     목록(ul/ol)이 들어오는데, 버튼 안에는 넣을 수 없는
                     것들입니다. 접혀 있을 때의 한 줄 미리보기는 태그를 뺀
                     글자만 씁니다. */
                  <li key={m.id} className={`memo-cal-row${open ? " open" : ""}`}>
                    <button
                      type="button"
                      className={`memo-cal-pick memo-cal-memo${open ? " open" : ""}`}
                      onClick={() => setPickedMemo(open ? "" : m.id)}
                      aria-expanded={open}
                    >
                      <span className="memo-item-clock">{formatTime(m.createdAt)}</span>
                      {!open && (
                        <span className="memo-cal-memo-text clamp">{memoPreview(m.text)}</span>
                      )}
                    </button>
                    {!readOnly && (
                      <button
                        type="button"
                        className="memo-mini-btn memo-cal-edit"
                        onClick={() => {
                          setEditingId(m.id);
                          setEditText(m.text);
                          setEditProg({ topic: m.topic ?? "", ...pageEdits(m) });
                          setPickedMemo("");
                        }}
                      >
                        수정
                      </button>
                    )}
                    {open && <MemoProgressLine memo={m} />}
                    {open && (
                      <div
                        className="memo-cal-memo-body"
                        onClick={(e) => onCheck(e, m)}
                        dangerouslySetInnerHTML={{ __html: richHtml(m.text) }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}
