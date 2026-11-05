// =============================================================
// '한 눈에 보기' 통째로 방송하기 — 꾸러미 짓기 (순수 함수)
// -------------------------------------------------------------
// 한 눈에 보기 창의 '수업 시작'은 영역 하나가 아니라 **창 전체**(한 학생이 쓴
// 모든 영역)를 학급 화면에 띄웁니다(선생님 요청, 2026-11-05 — KWLS를 K · W ·
// L · S 따로 띄우지 말고 한 번에). 방송 문서(broadcasts/{classId})에 실려 가는
// 값이라 React 조각 없이 글자 · 숫자만 담습니다. 학생 화면(PresentationOverlay)이
// mode "overview"를 보고 같은 카드(EntryOverviewCards)로 그립니다.
//
// 방송 대상의 영역 열쇠는 OVERVIEW_CAST_KEY 하나로 못 박습니다 — 보드의 영역
// 열쇠(know · writing …)와 겹치지 않아, 영역별 '수업 시작'과 '수업 화면 창'이
// 이 방송을 제 것으로 오해하지 않습니다.
// =============================================================

export const OVERVIEW_CAST_KEY = "__overview";
const MAX_SECTIONS = 12;
const MAX_FIELDS = 12;
const MAX_TEXT = 6000;

const str = (v, max) => String(v ?? "").slice(0, max);

export function cleanOverviewSections(sections = []) {
  return (Array.isArray(sections) ? sections : []).slice(0, MAX_SECTIONS).map((s) => ({
    key: str(s?.key, 40),
    letter: str(s?.letter, 4),
    label: str(s?.label, 80),
    labelEn: str(s?.labelEn, 80),
    prompt: str(s?.prompt, 400),
    columns: s?.columns === 2 ? 2 : 1,
    wide: !!s?.wide,
    fields: (Array.isArray(s?.fields) ? s.fields : []).slice(0, MAX_FIELDS).map((f) => ({
      label: str(f?.label, 80),
      text: str(f?.text, MAX_TEXT),
    })),
  }));
}

// card: { uid, name, studentId, entry? }
export function buildOverviewCast({ activityTitle = "", card, sections, summary = "", lead = null, gridCols = 2, peers = null }) {
  return {
    mode: "overview",
    activityTitle: str(activityTitle, 120),
    writerName: str(card?.name, 40),
    studentId: str(card?.studentId, 20),
    topic: str(card?.entry?.topic, 80),
    summary: str(summary, 80),
    lead: lead?.text ? { text: str(lead.text, 400), done: !!lead.done } : null,
    gridCols: gridCols === 4 ? 4 : 2,
    sections: cleanOverviewSections(sections),
    ...(Array.isArray(peers) ? { peers: peers.slice(0, 12) } : {}),
  };
}
