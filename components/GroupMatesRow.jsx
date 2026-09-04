"use client";

// =============================================================
// 우리 모둠 명단 줄 (학생 화면) — 곁텍스트 읽기·RAFT 글쓰기 공용
// -------------------------------------------------------------
// 자기가 쓰는 칸 바로 위에 모둠원 이름을 칩으로 늘어놓습니다. 모둠으로
// 묶여도 글은 각자 한 장이라, 이 줄이 없으면 학생 화면에서는 모둠이
// 있는지조차 알 수 없습니다.
//
// 색은 닿소리 판의 이름표와 같은 팔레트(모둠 안 자리 순서)입니다 — 같은
// 모둠을 두 화면에서 봐도 같은 색이라야 '우리 모둠'으로 읽힙니다.
//
// onPick을 주면 칩이 단추가 됩니다(동료 평가 — 친구 이름을 눌러 코멘트).
// 안 주면 그냥 이름표입니다.
// =============================================================
import { MEMBER_COLORS } from "@/lib/bookColors";
import { IconGroup } from "./StatusIcons";

export default function GroupMatesRow({
  group,
  members = [],
  meUid = null,
  onPick = null,
  hint = null,
  // 오른쪽 끝에 붙일 것(동료 평가 버튼 등)
  actions = null,
}) {
  if (!group || members.length === 0) return null;
  const title = group.groupName || `${group.groupIndex}모둠`;

  return (
    <div className="mates-row">
      <span className="mates-label"><IconGroup size={15} /> {title}</span>
      <div className="mates-chips">
        {members.map((m, i) => {
          const color = MEMBER_COLORS[i % MEMBER_COLORS.length];
          const me = m.uid === meUid;
          const style = {
            background: color.bg,
            borderColor: color.border,
            color: color.text,
          };
          // 나 자신에게는 코멘트를 쓰지 않습니다 — 동료 평가니까요.
          if (!onPick || me) {
            return (
              <span key={m.uid} className={`mates-chip${me ? " me" : ""}`} style={style}>
                {m.name || "이름 미설정"}
                {me && <em>나</em>}
              </span>
            );
          }
          return (
            <button
              key={m.uid}
              type="button"
              className="mates-chip mates-chip--pick"
              style={style}
              onClick={() => onPick(m)}
              title={`${m.name}에게 한 마디 쓰기`}
            >
              {m.name || "이름 미설정"}
            </button>
          );
        })}
      </div>
      {hint && <span className="mates-hint">{hint}</span>}
      {actions}
    </div>
  );
}
