"use client";

// =============================================================
// 활동보기 — 지금 내보낸 활동에 학생들이 쓴 답을 한 명씩
// -------------------------------------------------------------
// 수업 중 자리표(LessonSeatPanel)의 탭 하나입니다. 활동을 내보내 놓고
// '누가 뭐라고 썼나'를 보려면 지금까지는 공부방으로 건너가 모아보기를 열어야
// 했는데, 그러면 슬라이드도 자리표도 화면에서 사라졌습니다.
//
// [모아보기(StudyActivityWall)를 그대로 안 쓴 까닭]
// 그 화면은 정렬·띄우기·실명 펼치기·과일까지 담은 큰 모달입니다. 여기는
// 자리표 옆 반 칸짜리 자리라, 하는 일을 하나로 줄였습니다 — **이전/다음으로
// 한 명씩 읽기**. 크게 견주어 볼 일이면 지금처럼 모아보기를 엽니다.
//
// [읽는 문서가 하나도 안 늡니다]
// 수업 화면이 이미 구독해 둔 학생 카드(subscribeStudyCards)를 그대로 받습니다.
//
// [책방 활동은 여기 안 옵니다]
// 곁텍스트·RAFT의 답은 `bookActivities/{id}/entries/{uid}`에 있어 이 화면이
// 구독하지 않는 자리입니다. 그때는 어디서 보는지만 한 줄 적어 둡니다 —
// 빈 화면을 띄우면 '고장'으로 보입니다.
//
// [차례는 학번순 — 반 전체입니다]
// 안 쓴 학생을 빼면 '누가 아직 안 썼나'가 이 화면에서 사라집니다. 자리표·
// 출석부와 같은 기준(학번순)이라 이름으로 짚기도 쉽습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { matchActivitySections } from "@/lib/activities";
import { sanitizeHtml, stripHtml, htmlHasImage } from "@/lib/html";

export default function LessonAnswerPanel({
  task = null,          // 반 문서의 task — 없으면 '내보낸 것이 없음'
  taskActIndex = null,  // 이 프로젝트에서 몇 번째 활동인가(다른 프로젝트면 null)
  boardActs = [],       // 이 프로젝트의 활동 이름들
  cards = [],           // 이 프로젝트의 학생 카드 — 이미 구독해 둔 것
  roster = [],          // 반 명단(학번순)
}) {
  const [at, setAt] = useState(0);

  const byAuthor = useMemo(() => {
    const map = new Map();
    cards.forEach((c) => { if (c?.authorId) map.set(c.authorId, c); });
    return map;
  }, [cards]);

  // 한 줄이 학생 한 명 — 명단이 기준입니다(카드가 없는 학생도 자리를 지킵니다).
  // 교사 '안내' 카드는 authorId가 명단에 없어 여기 섞이지 않습니다.
  const rows = useMemo(() => {
    if (taskActIndex == null) return [];
    return roster.map((s) => {
      const card = byAuthor.get(s.uid) ?? null;
      // 읽기만 하는 화면이라 제목으로도 짝지어 주는 matchActivitySections를
      // 씁니다 — 교사가 활동 이름을 바꿔도 학생이 쓴 답을 그대로 잡습니다.
      // (자리를 정해 **쓰는** 곳에서는 쓰지 않습니다 — lib/activities.js 주석)
      const sec = card ? matchActivitySections(card, boardActs)[taskActIndex] : null;
      const html = sec?.content ?? "";
      return {
        uid: s.uid,
        name: s.name,
        studentId: s.studentId ?? null,
        emoji: s.emoji ?? "🙂",
        html,
        chars: stripHtml(html).trim().length,
        hasImage: htmlHasImage(html),
      };
    });
  }, [roster, byAuthor, boardActs, taskActIndex]);

  // 활동이 바뀌면 처음부터 — 앞 활동에서 보던 자리에 그대로 서 있으면
  // 무엇을 보는 중인지 어긋납니다. 명단이 줄어도 범위를 넘지 않게 함께 봅니다.
  useEffect(() => { setAt(0); }, [taskActIndex, task?.activityId, task?.at]);
  const safeAt = rows.length ? Math.min(at, rows.length - 1) : 0;
  const cur = rows[safeAt] ?? null;
  const written = rows.filter((r) => r.chars > 0 || r.hasImage).length;

  if (!task) {
    return (
      <p className="lesson-note-empty">
        지금 내보낸 활동이 없어요 — 왼쪽 ‘학생에게 내보내기’에서 활동을 누르면
        여기에 학생들의 답이 섭니다.
      </p>
    );
  }
  if (task.kind === "book") {
    return (
      <p className="lesson-note-empty">
        독서 활동의 답은 책방 화면에서 봐 주세요 — 그 활동을 열면 학생 목록과
        진행 패널이 함께 있습니다.
      </p>
    );
  }
  if (taskActIndex == null) {
    return (
      <p className="lesson-note-empty">
        다른 프로젝트의 활동을 내보내는 중이라 여기서는 답을 볼 수 없어요.
      </p>
    );
  }
  if (rows.length === 0) {
    return <p className="lesson-note-empty">이 반에 입장한 학생이 없어요.</p>;
  }

  const actName = String(boardActs[taskActIndex] ?? "").trim();
  const named = actName && actName !== `활동 ${taskActIndex + 1}`;

  return (
    <div className="lesson-ans">
      <div className="lesson-ans-head">
        <span className="lesson-ans-tag">활동 {taskActIndex + 1}</span>
        {named && <span className="lesson-ans-name">{actName}</span>}
        <span className="lesson-ans-sum">
          쓴 사람 {written} / {rows.length}
        </span>
      </div>

      {/* 이전/다음 — 이 패널 안에서만 움직입니다. 방향키를 걸지 않는 것은
          수업 화면의 ← →가 이미 슬라이드를 넘기기 때문입니다(한 번 눌러
          슬라이드와 학생이 함께 넘어가면 어느 쪽을 넘긴 것인지 알 수 없습니다). */}
      <div className="lesson-ans-nav">
        <button
          type="button"
          className="lesson-ans-arrow"
          onClick={() => setAt(Math.max(0, safeAt - 1))}
          disabled={safeAt === 0}
          aria-label="이전 학생"
          title="이전 학생"
        >
          ‹
        </button>
        <span className="lesson-ans-who">
          <b>{cur?.name}</b>
          {cur?.studentId && <em>{cur.studentId}</em>}
        </span>
        <span className="lesson-ans-pos">
          {safeAt + 1} / {rows.length}
        </span>
        <button
          type="button"
          className="lesson-ans-arrow"
          onClick={() => setAt(Math.min(rows.length - 1, safeAt + 1))}
          disabled={safeAt >= rows.length - 1}
          aria-label="다음 학생"
          title="다음 학생"
        >
          ›
        </button>
      </div>

      {/* 본문은 `.study-card-content` — 코드 블록·글머리 기호 서식이 걸린
          선택자입니다(globals.css의 공용 규칙). 새 클래스를 지으면 학생이
          서랍에서 쓴 코드 블록이 여기서만 밋밋한 글로 보입니다. */}
      <div className="lesson-ans-body">
        {cur && (cur.chars > 0 || cur.hasImage) ? (
          <div
            className="study-card-content"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(cur.html) }}
          />
        ) : (
          <p className="lesson-ans-empty">아직 안 썼어요.</p>
        )}
      </div>
    </div>
  );
}
