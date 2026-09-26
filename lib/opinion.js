// =============================================================
// 내 생각은요... — 영역 · 메모지의 모양과 셈 (순수 함수)
// -------------------------------------------------------------
// 교사가 판을 2~4개 영역으로 나누고(예: 찬성 · 반대), 학생은 포스트잇 같은
// 메모지에 제 생각을 적어 영역 위에 붙입니다. 메모는 반 전체가 서로 읽습니다.
//
//   활동 문서   bookActivities/{id}         .zones = [{ key, name }] (2~4개)
//                                          .prompt = 함께 생각할 물음(선택)
//   메모 한 장  bookActivities/{id}/opinionNotes/{noteId}
//               { authorId, authorName, studentId, text, zone, x, y, color, … }
//
// [자리는 영역 안의 비율] x·y는 0~1이고 **그 영역 안에서** 메모지의 왼쪽 위가
// 어디쯤인가입니다(0 = 왼쪽/위 끝, 1 = 메모지가 오른쪽/아래 끝에 닿는 자리).
// 화면 폭이 달라도(교실 칠판 · 노트북 · 크롬북) 같은 영역의 같은 쯤에 섭니다.
// 픽셀로 적으면 넓은 화면에서 붙인 메모가 좁은 화면에서 영역 밖으로 나갑니다.
//
// [영역은 key로 짚습니다] 이름('찬성')으로 짚으면 교사가 이름을 고치는 순간
// 메모가 갈 곳을 잃습니다. key는 만들 때 한 번 정하고 바꾸지 않습니다.
//
// 이 파일은 Firebase를 모릅니다 — 단위 시험(tests/unit/opinion.test.mjs)이
// 그대로 읽습니다.
// =============================================================

export const OPINION_ZONE_MIN = 2;
export const OPINION_ZONE_MAX = 4;
export const OPINION_ZONE_NAME_MAX = 12;
// 규칙(firestore.rules의 opinionNotes)과 **같은 값**이어야 합니다 — 한쪽만
// 늘리면 화면은 받아 주는데 저장이 거부됩니다.
export const OPINION_TEXT_MAX = 500;
export const OPINION_PROMPT_MAX = 80;

// 만들기 창이 처음 채워 두는 영역 — 가장 흔한 '찬성 · 반대'.
export const DEFAULT_OPINION_ZONES = ["찬성", "반대"];

// 파스텔 메모지 — 따뜻한 쪽(버터·복숭아·딸기우유)을 앞에, 산뜻한 쪽(민트·
// 하늘·라벤더)을 뒤에 둡니다. `ink`는 이름표·테두리처럼 한 톤 짙은 자리에
// 씁니다. 글자는 모두 같은 먹빛이라 어느 색 위에서도 읽힙니다(대비 10:1 이상).
export const OPINION_COLORS = [
  { key: "butter", name: "버터", bg: "#fff4b8", ink: "#b8962e" },
  { key: "peach", name: "복숭아", bg: "#ffdcc8", ink: "#c7784e" },
  { key: "pink", name: "딸기우유", bg: "#ffd9e4", ink: "#c46a86" },
  { key: "mint", name: "민트", bg: "#d4f2e3", ink: "#4f9a79" },
  { key: "sky", name: "하늘", bg: "#d7eaff", ink: "#5a8cc4" },
  { key: "lavender", name: "라벤더", bg: "#e7defb", ink: "#8a74c4" },
];
const COLOR_BY_KEY = new Map(OPINION_COLORS.map((c) => [c.key, c]));

export function opinionColor(key) {
  return COLOR_BY_KEY.get(key) ?? OPINION_COLORS[0];
}

// 영역 목록을 늘 2~4개의 { key, name }으로 — 빈 이름은 'A 영역'처럼 채웁니다.
// 옛 값이나 빈 값이 와도 화면이 깨지지 않게 여기 한 곳에서 손질합니다.
export function normalizeZones(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const z of list) {
    if (out.length >= OPINION_ZONE_MAX) break;
    const key = typeof z?.key === "string" && z.key ? z.key : `z${out.length + 1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = String(z?.name ?? "").trim().slice(0, OPINION_ZONE_NAME_MAX);
    out.push({ key, name: name || `${"ABCD"[out.length]} 영역` });
  }
  while (out.length < OPINION_ZONE_MIN) {
    let n = out.length + 1;
    while (seen.has(`z${n}`)) n += 1;
    seen.add(`z${n}`);
    out.push({ key: `z${n}`, name: `${"ABCD"[out.length]} 영역` });
  }
  return out;
}

// 만들기 창의 이름 목록 → 저장할 영역(key는 z1·z2… 차례로).
export function zonesFromNames(names) {
  return normalizeZones((names ?? []).map((name, i) => ({ key: `z${i + 1}`, name })));
}

// 이름만 고칠 때 — key는 그대로 두어 이미 붙은 메모가 제 영역에 남습니다.
// 개수는 바꾸지 않습니다(영역을 없애면 거기 붙은 메모가 갈 곳이 없습니다).
export function renameZones(zones, names) {
  return normalizeZones(zones).map((z, i) => ({
    key: z.key,
    name: String(names?.[i] ?? z.name).trim().slice(0, OPINION_ZONE_NAME_MAX) || z.name,
  }));
}

export const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

// 메모가 가리키는 영역이 이제 없으면(옛 자료 등) 첫 영역으로 봅니다 —
// 메모가 화면에서 사라지는 것보다 낫습니다.
export function zoneOfNote(note, zones) {
  const list = normalizeZones(zones);
  return list.some((z) => z.key === note?.zone) ? note.zone : list[0].key;
}

// 새 메모를 붙일 자리 — 그 영역에 이미 붙은 메모 수만큼 계단식으로 내려
// 겹치지 않게 놓습니다. 영역 하나에 열 장을 넘기면 처음 자리로 돌아와
// 옆으로 한 칸 비킵니다(자리를 옮기는 것은 학생 몫입니다).
export function nextNoteSpot(countInZone = 0) {
  const n = Math.max(0, Math.floor(countInZone) || 0);
  const row = n % 6;
  const lap = Math.floor(n / 6);
  return {
    x: clamp01(0.08 + (lap % 4) * 0.28 + (row % 2) * 0.1),
    y: clamp01(0.04 + row * 0.18),
  };
}

// 끌어 놓은 자리(판 안의 픽셀)를 영역 + 영역 안의 비율로 바꿉니다.
//   px, py   메모지 왼쪽 위의 판 좌표(px)
//   boardW   판의 폭 · zoneH 영역 몸통의 높이 · noteW/noteH 메모지 크기
// 영역은 폭을 똑같이 나눠 가진 세로 칸들입니다(CSS의 격자와 같은 셈).
// 어느 영역인지는 **메모지의 가운데**가 있는 칸으로 정합니다 — 왼쪽 끝으로
// 정하면 경계를 살짝 넘긴 메모가 절반 넘게 옆 칸에 걸쳐 있는데도 안 옮겨집니다.
export function placeFromPixels({ px, py, boardW, zoneH, noteW, noteH, zones }) {
  const list = normalizeZones(zones);
  const n = list.length;
  const colW = boardW / n;
  const cx = px + noteW / 2;
  const idx = Math.min(n - 1, Math.max(0, Math.floor(cx / colW)));
  const left = px - idx * colW;
  const spanX = Math.max(1, colW - noteW);
  const spanY = Math.max(1, zoneH - noteH);
  return {
    zone: list[idx].key,
    x: clamp01(left / spanX),
    y: clamp01(py / spanY),
  };
}

// 영역 + 비율 → 판 안의 픽셀(메모지 왼쪽 위). placeFromPixels의 거꿀셈.
export function pixelsFromPlace({ zone, x, y, boardW, zoneH, noteW, noteH, zones }) {
  const list = normalizeZones(zones);
  const n = list.length;
  const colW = boardW / n;
  const idx = Math.max(0, list.findIndex((z) => z.key === zone));
  return {
    left: idx * colW + clamp01(x) * Math.max(0, colW - noteW),
    top: clamp01(y) * Math.max(0, zoneH - noteH),
  };
}

// 메모지 오른쪽 위의 이름표 — '30105 홍길동'. 학번이 없으면 이름만,
// 교사가 붙인 메모는 '선생님'.
export function noteAuthorLabel(note) {
  if (note?.byTeacher) return "선생님";
  const sid = String(note?.studentId ?? "").trim();
  const name = String(note?.authorName ?? "").trim() || "이름 없음";
  return sid ? `${sid} ${name}` : name;
}

// 메모마다 살짝 다른 기울기(-2.4°~2.4°) — 포스트잇이 손으로 붙인 것처럼.
// id로 정해 두어 다시 그려도 같은 각도입니다(난수면 구독이 올 때마다 흔들립니다).
export function noteTilt(id) {
  const s = String(id ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (((Math.abs(h) % 49) - 24) / 10);
}

// 겹쳐 그릴 차례 — 가장 최근에 붙이거나 옮긴 것이 위로.
// 방금 쓴 메모는 서버 시각이 오기 전 null이라 '지금'(맨 위)으로 봅니다
// (0으로 보면 맨 아래로 깔렸다가 시각이 오면 튀어 오릅니다).
export function noteStackTime(note) {
  const t = note?.movedAt ?? note?.createdAt;
  if (t == null) return Number.POSITIVE_INFINITY;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (t instanceof Date) return t.getTime();
  if (typeof t === "number") return t;
  const v = new Date(t).getTime();
  return Number.isFinite(v) ? v : 0;
}

// 영역별 메모 수와 쓴 학생 수(교사 머리말) — 이미 받아 둔 메모로만 셉니다.
export function opinionStats(notes, zones) {
  const list = normalizeZones(zones);
  const byZone = new Map(list.map((z) => [z.key, 0]));
  const writers = new Set();
  for (const n of notes ?? []) {
    const z = zoneOfNote(n, list);
    byZone.set(z, (byZone.get(z) ?? 0) + 1);
    if (!n.byTeacher && n.authorId) writers.add(n.authorId);
  }
  return { byZone, writers };
}
