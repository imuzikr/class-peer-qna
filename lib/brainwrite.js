// =============================================================
// 브레인 라이팅 — 셈 (순수 함수, tests/unit/brainwrite.test.mjs)
// -------------------------------------------------------------
// 모둠원마다 세로 칸(컬럼) 하나. 컬럼 맨 위는 그 주인이고, 그 아래로
// 모둠원이 **학번순으로 주인 다음부터 돌아가며** 한 줄씩 잇습니다.
// 5명 모둠이면 컬럼 5개 × 줄 5개 — 저마다 다섯 컬럼에 한 줄씩 씁니다.
//
// 글은 bookActivities/{aId}/groups/{gId}/bwNotes/{주인uid}_{쓴사람uid}
//   { ownerUid, writerUid, writerName, text, updatedAt }
// 한 사람이 한 컬럼에 한 줄 — 문서 id가 그것을 못 박습니다.
// =============================================================

export const BW_TEXT_MAX = 1000;     // 규칙과 같아야 합니다
export const BW_PROMPT_MAX = 200;    // 교사의 질문

export function bwNoteId(ownerUid, writerUid) {
  return `${ownerUid}_${writerUid}`;
}

// 모둠원을 학번순으로(학번이 없으면 이름순 — 뒤로)
export function sortMembers(members) {
  return [...(members ?? [])]
    .filter((m) => m?.uid)
    .sort((a, b) => {
      const sa = String(a.studentId ?? "");
      const sb = String(b.studentId ?? "");
      if (sa && sb && sa !== sb) return sa.localeCompare(sb, "ko", { numeric: true });
      if (sa && !sb) return -1;
      if (!sa && sb) return 1;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko");
    });
}

// 한 컬럼의 줄 차례 — 주인이 첫 줄, 그 뒤로 학번순을 돌아가며.
// 주인이 모둠에 없으면(빠진 학생) 학번순 그대로.
export function columnOrder(members, ownerUid) {
  const list = sortMembers(members);
  const at = list.findIndex((m) => m.uid === ownerUid);
  if (at <= 0) return list;
  return [...list.slice(at), ...list.slice(0, at)];
}

// 글 문서 목록 → { [주인]: { [쓴사람]: 문서 } }
export function notesByColumn(notes) {
  const out = {};
  for (const n of notes ?? []) {
    if (!n?.ownerUid || !n?.writerUid) continue;
    (out[n.ownerUid] ??= {})[n.writerUid] = n;
  }
  return out;
}

export function hasText(note) {
  return String(note?.text ?? "").trim().length > 0;
}

// 컬럼 하나의 줄들 — [{ member, note, filled }]
export function columnRows(members, ownerUid, byColumn) {
  const col = byColumn?.[ownerUid] ?? {};
  return columnOrder(members, ownerUid).map((m) => {
    const note = col[m.uid] ?? null;
    return { member: m, note, filled: hasText(note) };
  });
}

// 이 학생이 이 컬럼에서 쓸 차례가 왔나 — 바로 앞 줄이 채워졌나.
// (첫 줄은 늘 차례. 앞 사람이 안 썼어도 쓰는 것은 막지 않고 안내만 합니다.)
export function previousRow(members, ownerUid, writerUid, byColumn) {
  const rows = columnRows(members, ownerUid, byColumn);
  const i = rows.findIndex((r) => r.member.uid === writerUid);
  return i > 0 ? rows[i - 1] : null;
}

// 한 학생의 진행 — 모둠의 컬럼마다 내가 썼나(학번순 컬럼 차례).
// [{ owner, done }]
export function writerProgress(members, writerUid, byColumn) {
  return sortMembers(members).map((owner) => ({
    owner,
    done: hasText(byColumn?.[owner.uid]?.[writerUid]),
  }));
}

// 한 학생이 쓴 글자 수(모든 컬럼)
export function writerChars(writerUid, notes) {
  let n = 0;
  for (const x of notes ?? []) {
    if (x?.writerUid === writerUid) n += String(x.text ?? "").trim().length;
  }
  return n;
}

// 이 줄을 지금 쓸 수 있나 — 첫 줄(주인)은 늘, 그 밖은 **바로 앞 줄이 채워졌을
// 때만**(선생님 요청). 이미 써 둔 줄은 앞 사람이 나중에 지워도 계속 고칩니다.
export function rowWritable(rows, index) {
  if (index <= 0) return true;
  const me = rows[index];
  return !!(me?.filled || rows[index - 1]?.filled);
}

// 한 학생이 '몇 번째로 이어 쓰는' 칸들 — k = 0이면 제 칸(첫 줄), k = 1이면
// 바로 앞 친구의 칸(두 번째 줄) … 전광판의 줄이 이 k입니다.
// [{ k, owner, done, ready }] — ready는 앞 줄이 채워져 내 차례가 왔다는 뜻.
export function writerSlots(members, writerUid, byColumn) {
  const list = sortMembers(members);
  const n = list.length;
  const at = list.findIndex((m) => m.uid === writerUid);
  if (at < 0) return [];
  return list.map((_, k) => {
    const owner = list[(at - k + n) % n];
    const rows = columnRows(list, owner.uid, byColumn);
    return {
      k,
      owner,
      done: !!rows[k]?.filled,
      ready: k === 0 || !!rows[k - 1]?.filled,
    };
  });
}
