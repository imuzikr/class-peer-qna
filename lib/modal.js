// =============================================================
// 모달 배경 클릭으로 닫기 — 단, "누른 지점"과 "뗀 지점"이 모두 배경일 때만.
// -------------------------------------------------------------
// click 이벤트는 mousedown/mouseup의 공통 조상에서 발생하므로,
// 입력창 안에서 누르고(모달 내부) 배경에서 떼면(텍스트 드래그 선택)
// 배경의 onClick이 실행되어 모달이 닫히는 문제가 있습니다.
// mousedown이 배경 자신에서 시작됐을 때만 닫도록 해 이를 방지합니다.
//
// 사용:  <div className="modal-backdrop" {...backdropClose(onClose)}>
//   내부 .modal 은 기존처럼 onClick={(e)=>e.stopPropagation()} 유지.
//
// [Esc로 닫기 — 같은 한 줄이 맡습니다]
// 모달 마흔여 개 가운데 Esc로 닫히는 것이 열댓 개뿐이었습니다(출석 관리 ·
// 질문 상세도 안 닫혔습니다). 저마다 keydown을 걸게 하는 대신, 배경에 이미
// 붙어 있는 이 한 줄이 배경을 등록하고 **창 하나에 건 처리기가 맨 위 모달만**
// 닫습니다. 모달이 겹쳐 있으면(수업 관리 위의 편집 창) 위의 것만 닫힙니다.
//
// **Esc를 스스로 다루는 곳은 `e.preventDefault()`를 부르세요** — 공통 처리가
// 그것을 보고 비켜 갑니다(달력만 먼저 닫기 · 고치던 칸 취소 · 팝오버 닫기).
// 처리기는 다른 처리기가 모두 돈 **뒤에** 판정하므로(setTimeout 0) 등록
// 차례와 상관없습니다. 이 처리를 아예 안 받으려면 `{ esc: false }`.
//
// **창 안에 글이 든 칸이 하나라도 있으면 닫지 않습니다.** 글을 적는 창
// (질문·답변·메모·프로젝트 만들기)이 많아, Esc 한 번에 쓰던 것이 날아가면
// 되돌릴 길이 없습니다. 초점이 있는 칸만 보면 안 됩니다 — 질문 창은 제목
// 칸이 비어도 본문에 글이 있을 수 있습니다. 그래서 이미 값이 채워진 편집
// 창(프로필·원본 편집)은 Esc로 닫히지 않는데, 그것이 안전한 쪽입니다
// (예전에도 안 닫혔습니다). 한글을 조합하는 중의 Esc도 그대로 둡니다.
// 칸이 아닌 곳에 쓰는 창(그림판)은 `{ esc: false }`로 뺍니다.
//
// [Ctrl(⌘)+A는 맨 위 모달 안만 고릅니다]
// 브라우저의 '모두 선택'은 모달이 떠 있어도 **페이지 전체**를 고릅니다 — 뒤에
// 깔린 공부방 화면·서랍까지 파랗게 칠해져, 창 안의 코드와 결과만 복사하려던
// 것이 한꺼번에 딸려 옵니다(실제 신고). 맨 위 모달이 있으면 그 창의 내용만
// 고르게 바꿉니다. 판정은 Esc와 **같은** `topBackdrop`을 씁니다(등록 안 한
// `.modal-backdrop`도 포함 — 선택은 닫는 일과 달리 해가 없습니다).
//   · **글자 칸 안에서는 손대지 않습니다**(입력칸·여러 줄 칸·서식 에디터·
//     코드 칸). 거기서는 '그 칸의 글 모두'가 맞는 뜻이고 브라우저가 이미
//     그렇게 합니다.
//   · 한글 입력 중에는 `e.key`가 'ㅁ'으로 올 수 있어 `e.code`('KeyA')도 봅니다.
// =============================================================
const closers = new Map(); // 배경 요소 → onClose (등록된 것만)
let installed = false;

export function backdropClose(onClose, { esc = true } = {}) {
  installSelectAll();
  if (esc) installEsc();
  return {
    // 렌더마다 새 함수라 React가 null → 요소로 다시 부릅니다(싸고, 늘 최신 onClose).
    ref: esc
      ? (el) => {
          if (el) closers.set(el, onClose);
          else for (const k of closers.keys()) if (!k.isConnected) closers.delete(k);
        }
      : undefined,
    onMouseDown: (e) => {
      if (e.target === e.currentTarget) e.currentTarget.dataset.downSelf = "1";
      else if (e.currentTarget.dataset.downSelf) delete e.currentTarget.dataset.downSelf;
    },
    onClick: (e) => {
      if (e.target === e.currentTarget && e.currentTarget.dataset.downSelf === "1") {
        delete e.currentTarget.dataset.downSelf;
        onClose();
      }
    },
  };
}

// 창 안에 쓰던 글이 있나 — 글자 칸 · 여러 줄 칸 · 서식 에디터
const TEXT_TYPES = ["text", "search", "url", "email", "tel", "number", "password"];
function hasDraft(root) {
  for (const el of root.querySelectorAll("textarea, input, [contenteditable='true'], [contenteditable='']")) {
    if (el.disabled || el.readOnly || !isShown(el)) continue;
    if (el.tagName === "TEXTAREA") {
      if (el.value.trim()) return true;
    } else if (el.tagName === "INPUT") {
      if (TEXT_TYPES.includes((el.type || "text").toLowerCase()) && el.value.trim()) return true;
    } else if (el.textContent.trim()) {
      return true;
    }
  }
  return false;
}

function isShown(el) {
  return el.isConnected && el.getClientRects().length > 0;
}

// b가 a보다 위에 있나 — 안에 든 것이 위, 아니면 z-index, 같으면 문서에서 뒤의 것
function isAbove(b, a) {
  if (a.contains(b)) return true;
  if (b.contains(a)) return false;
  const za = parseInt(getComputedStyle(a).zIndex, 10) || 0;
  const zb = parseInt(getComputedStyle(b).zIndex, 10) || 0;
  if (za !== zb) return zb > za;
  return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

// 맨 위 배경 — 이 줄로 등록한 것과 등록 안 한 `.modal-backdrop`을 함께 봅니다.
// 맨 위가 등록 안 한 것이면(제 Esc를 따로 다루는 창) 공통 처리는 손대지 않습니다.
function topBackdrop() {
  const all = new Set(document.querySelectorAll(".modal-backdrop"));
  for (const el of closers.keys()) all.add(el);
  let top = null;
  for (const el of all) {
    if (!isShown(el)) continue;
    if (!top || isAbove(el, top)) top = el;
  }
  return top;
}

function installEsc() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.isComposing) return;
    // 다른 처리기가 다 돈 뒤에 판정합니다 — 그중 누가 preventDefault를 불렀으면 비켜 갑니다.
    setTimeout(() => {
      if (e.defaultPrevented) return;
      const top = topBackdrop();
      const close = top && closers.get(top);
      if (close && !hasDraft(top)) close();
    }, 0);
  });
}

// ── Ctrl(⌘)+A → 맨 위 모달의 내용만 ──
let selectAllInstalled = false;

function isTextField(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") return TEXT_TYPES.includes((el.type || "text").toLowerCase());
  return false;
}

function installSelectAll() {
  if (selectAllInstalled || typeof window === "undefined") return;
  selectAllInstalled = true;
  window.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.isComposing) return;
    if (e.code !== "KeyA" && String(e.key).toLowerCase() !== "a") return;
    if (e.defaultPrevented || isTextField(document.activeElement)) return;
    const top = topBackdrop();
    if (!top) return;
    // 창 본체(.modal)를 고릅니다 — 배경까지 고르면 반투명 막이 함께 칠해집니다.
    const box = top.querySelector(".modal") ?? top.firstElementChild ?? top;
    e.preventDefault();
    const range = document.createRange();
    range.selectNodeContents(box);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
}
