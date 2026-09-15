"use client";

// =============================================================
// 수업 노트 한 장 — **고치는** 코넬 2단
// -------------------------------------------------------------
// `CornellNoteSheet`(읽기 전용)와 **같은 껍데기·같은 격자**를 쓰고 글이
// 있던 자리만 입력칸으로 바뀝니다. 그래서 '고치기'를 눌러도 보던 배치가
// 그대로 남고, 왼쪽 단서와 오른쪽 필기를 나란히 보며 고칩니다.
//
// **읽기 전용 시트를 고쳐 쓰지 않습니다.** 그 한 장은 다섯 곳이 함께 쓰는데
// (교사 열람 · 노트 크게 보기 · 리포트 · 서랍의 피드백 알림 · 서랍의 지난
// 노트) 거기에 입력칸을 들이면 나머지 넷이 함께 흔들립니다. 대신 CSS를
// 나눠 써서 두 장이 같은 모양으로 섭니다(`.cornell-sheet--edit`).
//
// 값은 위(부르는 쪽)가 들고 있습니다 — 저장·날짜 넘기기가 거기서 일어나므로
// 이 조각은 그리기만 합니다.
//
// [하이라이트는 안 그립니다]
// 고치는 동안에는 선생님이 짚어 둔 자리를 칠하지 않습니다. 글자가 바뀌는
// 중이라 자리가 매 글자 어긋나고, 덮개는 글자 위에 덧그리는 것이라
// 입력칸 안으로는 따라 들어갈 수도 없습니다. 대신 위에 안내 한 줄을 답니다.
// =============================================================
import { Fragment } from "react";
import RichTextEditor from "./RichTextEditor";
import { richHtml } from "@/lib/html";
import { CORNELL_LIMITS } from "@/lib/store";
import { CORNELL_BLOCK_MAX, blockEmpty } from "@/lib/cornell";

// 필기 칸 서식 — 서랍의 NOTE_TOOLS와 **같은 다섯**이어야 합니다.
// 같은 글을 고치는 자리라 툴바가 다르면 다른 도구로 보입니다.
const NOTE_TOOLS = [
  "bold",
  "underline",
  "insertUnorderedList",
  "insertOrderedList",
  "codeBlock",
];

export default function CornellNoteEditSheet({
  date,
  // 선생님 한 마디 — **읽기 전용으로 그대로 답니다.** 고치러 오는 까닭의
  // 태반이 그 글이라, 고치는 동안 사라지면 무엇을 고치라고 했는지 보려고
  // 창을 한 번 나갔다 와야 합니다. 학생이 못 고치는 칸이라 입력칸이 아닙니다.
  feedback = "",
  topic,
  blocks,
  summary,
  // 필기 에디터는 비제어라 initialHtml을 **마운트 때 한 번만** 봅니다.
  // 날짜를 넘기면 이 번호가 바뀌어야 새 노트의 글이 칸에 들어옵니다.
  loadSeq = 0,
  onTopic,
  onBlock,
  onAddBlock,
  onRemoveBlock,
  onSummary,
}) {
  return (
    <article className="cornell-sheet cornell-sheet--edit">
      <header className="cornell-sheet-topic">
        <input
          className="cornell-edit-topic"
          type="text"
          value={topic}
          onChange={(e) => onTopic(e.target.value.slice(0, 200))}
          placeholder="제목 — 무엇에 대한 수업이었나요"
          aria-label="제목"
        />
        <time dateTime={date}>{date}</time>
      </header>

      <div className="cornell-sheet-grid">
        <div className="cornell-sheet-cue cornell-sheet-th">단서 · 핵심 질문</div>
        <div className="cornell-sheet-notes cornell-sheet-th">필기</div>

        {/* 두 칸은 **격자의 직계 자식**이어야 합니다 — 한 겹 싸면 200px 칸에
            둘 다 들어가 2단이 무너집니다(읽기 전용 시트도 Fragment입니다). */}
        {blocks.map((b, i) => (
          <Fragment key={b.id}>
            <section className="cornell-sheet-cue">
              <textarea
                className="cornell-edit-cue"
                value={b.cue}
                onChange={(e) =>
                  onBlock(b.id, { cue: e.target.value.slice(0, CORNELL_LIMITS.cue) })
                }
                placeholder="이 부분을 떠올릴 낱말이나 물음"
                aria-label={`${i + 1}번째 단서`}
              />
              {/* 줄을 지우는 단추는 단서 칸 아래 — 왼쪽 칸이 좁아 오른쪽
                  필기 칸에 두면 어느 줄의 것인지 흐려집니다. */}
              {blocks.length > 1 && (
                <button
                  type="button"
                  className="cornell-edit-del"
                  onClick={() => onRemoveBlock(b.id)}
                  title="이 핵심 질문 줄 지우기"
                >
                  이 줄 지우기
                </button>
              )}
            </section>
            <section className="cornell-sheet-notes">
              <RichTextEditor
                key={`edit-${date}-${loadSeq}-${b.id}`}
                className="cornell-edit-rte"
                tools={NOTE_TOOLS}
                initialHtml={richHtml(b.notes ?? "")}
                onChange={(html) => onBlock(b.id, { notes: html })}
                placeholder="들은 것, 칠판에 적힌 것, 떠오른 것"
              />
            </section>
          </Fragment>
        ))}
      </div>

      <div className="cornell-edit-add">
        <button
          type="button"
          onClick={onAddBlock}
          disabled={blocks.length >= CORNELL_BLOCK_MAX || blockEmpty(blocks[blocks.length - 1])}
          title={
            blocks.length >= CORNELL_BLOCK_MAX
              ? `한 장에 ${CORNELL_BLOCK_MAX}개까지 담을 수 있어요`
              : "새 주제로 넘어갈 때 눌러 한 줄 더하기"
          }
        >
          ＋ 다음 핵심 질문
        </button>
      </div>

      <section className="cornell-sheet-summary">
        <h4>내 말로 요약</h4>
        <textarea
          className="cornell-edit-summary"
          value={summary}
          onChange={(e) => onSummary(e.target.value.slice(0, CORNELL_LIMITS.summary))}
          placeholder="오늘 배운 것을 한 문장으로 적어 보세요"
          aria-label="내 말로 요약"
        />
      </section>

      {String(feedback ?? "").trim() && (
        <section className="cornell-sheet-feedback">
          <span className="cornell-feedback-tag">선생님</span>
          <p>{String(feedback).trim()}</p>
        </section>
      )}
    </article>
  );
}
