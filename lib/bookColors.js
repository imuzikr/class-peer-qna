// =============================================================
// 모둠원 색 — 판에서 '누가 넣은 낱말인지' 색으로 구분하기 위한 팔레트
// -------------------------------------------------------------
// 색은 모둠에 배정된 순서(members 배열의 자리)로 정합니다.
//  · 한 모둠 안에서 서로 겹치지 않고,
//  · 문서에 색을 따로 저장하지 않아 기존 활동도 그대로 색이 붙습니다.
// (모둠을 다시 구성하거나 학생이 나갔다 들어오면 자리가 바뀌어 색도 바뀝니다
//  — 같은 판을 보는 동안에는 바뀌지 않으므로 수업 중 혼동은 없습니다)
// =============================================================

// 배경이 연해 낱말 글씨가 잘 읽히는 색만 골랐습니다.
export const MEMBER_COLORS = [
  { bg: "#fbe3d0", border: "#e2a06d", text: "#8a4a1e" }, // 주황
  { bg: "#d8efdf", border: "#8cc79f", text: "#1f6b3c" }, // 초록
  { bg: "#d9e6f7", border: "#8fb3de", text: "#27507f" }, // 파랑
  { bg: "#f4e0ef", border: "#d69ac8", text: "#7a3468" }, // 보라
  { bg: "#fbf0cc", border: "#dcc270", text: "#7a6015" }, // 노랑
  { bg: "#d7eef0", border: "#84c3c8", text: "#1d5f64" }, // 청록
  { bg: "#f6dcdc", border: "#dd9a9a", text: "#8a3535" }, // 분홍
  { bg: "#e3e1f5", border: "#a9a4d9", text: "#454083" }, // 남보라
];

// 아직 모둠에 없는 사람(또는 탈퇴한 학생)이 남긴 낱말용 — 눈에 튀지 않는 회색
export const UNKNOWN_MEMBER_COLOR = { bg: "#eceae7", border: "#c9c5c0", text: "#5f5a55" };

// ── 줄 색 — '학생별 진행'처럼 사람이 죽 늘어서는 목록용 ──────────
// 개별 활동은 판 하나가 곧 학생 한 명이라, 위의 '모둠 안 자리' 색을 쓰면
// 모두가 첫 번째 색(주황) 하나로만 칠해집니다. 그래서 목록에서는 모둠이
// 아니라 '줄 번호'로 색을 정합니다.
//
// 반이 25~30명이라 사람마다 다른 색을 주면 서로 구분이 안 될 만큼 비슷한
// 색이 생깁니다. 눈으로 확실히 갈리는 10가지만 두고 그 뒤로는 되풀이합니다
// (11번째 학생은 1번과 같은 색 — 붙어 있는 줄끼리만 다르면 충분합니다).
export const ROW_COLORS = [
  { bg: "#fbe3d0", border: "#dd7548", text: "#8a4a1e" }, // 주황
  { bg: "#fbeecb", border: "#dfa22c", text: "#7d5811" }, // 귤빛
  { bg: "#f6f2c8", border: "#bfb02a", text: "#6b6110" }, // 겨자
  { bg: "#e2f0d0", border: "#77ad46", text: "#3d6320" }, // 연두
  { bg: "#d3eee1", border: "#2ea37c", text: "#175c44" }, // 초록
  { bg: "#d2eef2", border: "#2c9fb5", text: "#155a68" }, // 청록
  { bg: "#d8e7f8", border: "#3d8bcd", text: "#1f4e77" }, // 하늘
  { bg: "#dedcf7", border: "#5a63cf", text: "#2f3480" }, // 파랑보라
  { bg: "#eeddf4", border: "#9a55bb", text: "#5b2c72" }, // 보라
  { bg: "#f9dbe4", border: "#d24c76", text: "#7e2843" }, // 자주
];

export function rowColor(index) {
  return ROW_COLORS[((index % ROW_COLORS.length) + ROW_COLORS.length) % ROW_COLORS.length];
}

// 모둠 안에서 이 학생이 몇 번째 자리인지 (-1이면 구성원이 아님)
export function memberSeat(group, uid) {
  if (!uid) return -1;
  const members = group?.members ?? [];
  const at = members.findIndex((m) => m?.uid === uid);
  if (at >= 0) return at;
  // 예전 문서엔 members 없이 memberUids만 있을 수 있습니다
  return (group?.memberUids ?? []).indexOf(uid);
}

export function memberColor(group, uid) {
  const seat = memberSeat(group, uid);
  if (seat < 0) return UNKNOWN_MEMBER_COLOR;
  return MEMBER_COLORS[seat % MEMBER_COLORS.length];
}

// 판 위쪽 범례에 쓸 [{ uid, name, color }] — 모둠 배정 순서 그대로
export function memberLegend(group) {
  const members = group?.members ?? [];
  if (members.length > 0) {
    return members.map((m, i) => ({
      uid: m.uid,
      name: m.name || "이름 미설정",
      color: MEMBER_COLORS[i % MEMBER_COLORS.length],
    }));
  }
  return (group?.memberUids ?? []).map((uid, i) => ({
    uid,
    name: uid,
    color: MEMBER_COLORS[i % MEMBER_COLORS.length],
  }));
}
