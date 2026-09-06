// =============================================================
// 한국어 조사 고르기
// -------------------------------------------------------------
// 이/가, 을/를, 은/는처럼 앞 글자의 받침에 따라 달라지는 조사를, 화면에
// 조립되는 문장에 그대로 붙이면 '구름가·제목를'처럼 어색해집니다.
// 값이 학생 입력이나 항목 이름에서 오기 때문에 미리 정해 둘 수 없어,
// 붙이는 시점에 마지막 글자를 보고 고릅니다.
// =============================================================

// 한글 음절은 (초성×21 + 중성)×28 + 종성 구조로 배열돼 있어,
// '가'(0xAC00)를 뺀 값을 28로 나눈 나머지가 0이면 받침이 없습니다.
// 한글이 아닌 말(영문·숫자)이나 빈 문자열은 어느 쪽인지 정할 수 없어
// '이(가)'처럼 둘 다 보여 줍니다.
export function withJosa(word, afterBatchim, afterVowel) {
  const text = String(word ?? "");
  if (!text) return `${afterBatchim}(${afterVowel})`;
  const code = text.charCodeAt(text.length - 1);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) {
    return `${text}${afterBatchim}(${afterVowel})`;
  }
  return `${text}${(code - 0xac00) % 28 !== 0 ? afterBatchim : afterVowel}`;
}

// ── 첫소리(초성) 뽑기 ────────────────────────────────────────
// 닿소리 채우기가 '낱말이 어느 자음 칸으로 가는가'를 정하는 데 씁니다.
// 위 조사 고르기와 같은 셈에서 나옵니다 — 음절 코드가
// (초성×21 + 중성)×28 + 종성 이므로, '가'(0xAC00)를 뺀 값을 588(=21×28)로
// 나눈 몫이 곧 초성 차례입니다.
const CHOSEONG = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

// 첫 글자의 초성 한 자를 냅니다. 한글로 시작하지 않으면 빈 문자열 —
// 무엇으로 칠지 정할 수 없다는 뜻이라, 부르는 쪽이 그 사실을 알려 줍니다.
export function initialJamoOf(text) {
  const ch = String(text ?? "").trim().charAt(0);
  if (!ch) return "";
  const code = ch.charCodeAt(0);
  // 완성형 음절 '가'~'힣'
  if (code >= 0xac00 && code <= 0xd7a3) return CHOSEONG[Math.floor((code - 0xac00) / 588)];
  // 낱자로 적은 경우(ㄱ·ㅎ 등) — 호환 자모 영역. 겹받침 자모(ㄳ·ㄵ…)도 이
  // 범위에 있지만 초성이 될 수 없어, 칸을 고르는 쪽에서 걸러집니다.
  if (code >= 0x3131 && code <= 0x314e) return ch;
  return "";
}

// 자주 쓰는 짝들
export const eunNeun = (w) => withJosa(w, "은", "는");
export const iGa = (w) => withJosa(w, "이", "가");
export const eulReul = (w) => withJosa(w, "을", "를");
