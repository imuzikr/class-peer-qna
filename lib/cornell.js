// =============================================================
// 수업 노트(코넬) — '덩어리' 모델
// -------------------------------------------------------------
// 한 장이 '단서 한 칸 · 필기 한 칸'이던 것을 **덩어리 목록**으로 넓힙니다.
// 덩어리 하나 = 단서 한 칸 + 필기 한 칸이고, 화면에서는 그 둘이 한 줄(행)로
// 나란히 섭니다.
//
// [왜 바꿨나]
// 학생이 실제로 적는 자리는 오른쪽 서랍인데, 폭이 380px이라 단서·필기·요약이
// 세로로 쌓여 있었습니다. 쓰는 동안에는 '이 단서를 저 필기 옆에 둔다'는
// 감각이 아예 없고, 2단은 나중에 크게 보기·리포트·인쇄에서만 나타납니다.
// 그래서 펴 보면 왼쪽 물음과 오른쪽 필기가 서로 어긋나 있었습니다.
//
// [수업 중에 미리 나누지 않습니다]
// 코넬 노트의 본래 쓰임은 '수업 중엔 필기만, 끝나고 단서를 단다'입니다.
// 그래서 처음에는 덩어리가 하나뿐이라 지금까지처럼 죽 쓰고, 주제가 바뀔 때
// 학생이 '＋ 다음 덩어리'로 한 줄을 더합니다. 칸은 글만큼 늘어나므로 분량이
// 갇히지 않습니다.
//
// [옛 노트는 그대로 읽힙니다]
// `blocks`가 없으면 `cue`/`notes` 두 칸을 **한 덩어리짜리**로 봅니다.
// 자료를 옮기는 일이 없습니다.
//
// [legacy 거울]
// 저장할 때 `blocks`와 함께 `cue`/`notes`를 이어 붙여 그대로 남깁니다.
//  · 보안 규칙이 그 두 칸의 길이를 검사합니다(규칙을 안 건드려도 됩니다).
//  · 아직 덩어리를 모르는 자리(잔디 히트맵의 '세 칸 채움' 같은 셈)가
//    지금처럼 굴러갑니다.
// 진짜 값은 `blocks`이고 저 둘은 거울입니다 — 읽는 쪽은 blocksOf를 쓰세요.
// =============================================================
import { stripHtml } from "./html";

// 한 장에 담을 수 있는 덩어리 수. 한 차시 노트라 이 정도면 넉넉합니다.
export const CORNELL_BLOCK_MAX = 20;

let seq = 0;
export function newBlockId() {
  seq += 1;
  return `b${Date.now().toString(36)}${seq}`;
}

export function emptyBlock() {
  return { id: newBlockId(), cue: "", notes: "" };
}

// 문서 → 덩어리 목록. **읽는 자리는 모두 이것을 거칩니다.**
export function blocksOf(note) {
  const raw = Array.isArray(note?.blocks) ? note.blocks : null;
  if (raw && raw.length > 0) {
    return raw.slice(0, CORNELL_BLOCK_MAX).map((b, i) => ({
      // id가 없는 옛 저장분도 자리 번호로 안정된 열쇠를 갖습니다
      id: String(b?.id || `b${i}`),
      cue: String(b?.cue ?? ""),
      notes: String(b?.notes ?? ""),
    }));
  }
  // 덩어리가 생기기 전의 노트 — 두 칸을 한 덩어리로 봅니다.
  return [{ id: "b0", cue: String(note?.cue ?? ""), notes: String(note?.notes ?? "") }];
}

export function blockEmpty(b) {
  return !String(b?.cue ?? "").trim() && !stripHtml(String(b?.notes ?? "")).trim();
}

// 빈 덩어리는 저장하지 않습니다 — '＋'를 눌러 두고 안 쓴 줄이 남으면
// 다음에 펴 볼 때 빈 행이 늘어서 있습니다.
export function usedBlocks(blocks = []) {
  return blocks.filter((b) => !blockEmpty(b));
}

// legacy 거울 — 위 설명 참고
export function flattenBlocks(blocks = []) {
  const used = usedBlocks(blocks);
  return {
    cue: used.map((b) => String(b.cue ?? "").trim()).filter(Boolean).join("\n"),
    // 덩어리마다 <div>로 감싸 잇습니다 — 그냥 이으면 앞 덩어리 끝 글자와
    // 다음 덩어리 첫 글자가 한 줄로 붙습니다(에디터가 감싸는 태그 없이
    // 글자만 내놓는 경우가 있습니다). DIV는 허용 태그입니다(lib/html.js).
    notes: used
      .map((b) => String(b.notes ?? ""))
      .filter((h) => stripHtml(h).trim())
      .map((h) => `<div>${h}</div>`)
      .join(""),
  };
}
