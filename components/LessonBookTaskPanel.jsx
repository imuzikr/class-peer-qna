"use client";

// =============================================================
// 수업 노트 서랍의 '오늘의 활동' 탭 — 책방 독서 활동
// -------------------------------------------------------------
// 교사가 수업 모드에서 독서 활동의 한 칸을 내보내면(반 문서의 `task`에
// `kind: 'book'`) 이 칸이 섭니다. 지금 다루는 것은 둘입니다.
//
//   곁텍스트 읽기 — 여덟 단계 중 하나
//   RAFT 글쓰기   — 역할·청중·형식·주제 중 하나, 또는 글쓰기
//
// 쓴 답은 **책방에서 쓰던 그 자리**(`bookActivities/{id}/entries/{uid}`)로
// 들어갑니다. 두 활동이 저장 함수까지 같은 것을 써서, 여기서 갈리는 것은
// '무엇을 그리나'뿐입니다.
//
// [서랍에는 학생이 쓸 수 있는 것이 다 있고, 보내기는 그중 하나로 눈을 맞춥니다]
// 한때 보낸 칸 하나만 그렸는데, 그러면 앞서 쓴 것을 수업 중에 고칠 수 없고
// (책방으로 건너가야 합니다) RAFT는 '나는 …가 되어 …에게 씁니다' 문장이
// 채워지는 과정도 안 보였습니다. 지금은 이렇습니다.
//
//   RAFT   — 네 칸이 늘 다 섭니다. 원래 잠금이 없는 활동이라 학생은 언제나
//            넷 다 쓸 수 있고, 보낸 칸만 도드라지며 커서가 갑니다. 글쓰기는
//            칸이 커서 따로 보냅니다(그때는 문장 + 글칸).
//   곁텍스트 — **선생님이 연 단계만** 보입니다. 안 연 단계는 학생이 쓰면 안
//            되는 자리라 서랍에 깔 수 없습니다. 보낸 단계가 펼쳐지고 나머지
//            열린 단계는 접혀 있다가 누르면 펴집니다.
//
// [읽는 문서]
// 활동 1건 + 내 기록 1건. 내보낸 것이 바뀔 때만 다시 읽습니다. 앞 칸을
// 함께 그리는 데 드는 읽기는 **없습니다** — 답이 한 문서에 다 들어 있습니다.
// =============================================================
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchBookActivity, fetchMyBookEntry, saveParatextEntry } from "@/lib/store";
import { PARATEXT_SECTIONS, isSectionLocked } from "@/lib/paratext";
import {
  RAFT_COLUMNS,
  RAFT_FORMATS,
  RAFT_WRITING,
  raftSentence,
  raftPlanDone,
} from "@/lib/raft";

const SAVE_DELAY = 1500;

// 한 줄 미리보기 — 접힌 단계에 '무엇을 썼는지' 남깁니다.
function peek(answers, fields) {
  for (const f of fields) {
    const v = String(answers?.[f.key] ?? "").trim();
    if (v) return v.replace(/\s+/g, " ");
  }
  return "";
}

export default function LessonBookTaskPanel({ task, user, onType }) {
  const [activity, setActivity] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  const [error, setError] = useState("");
  // 접힌 단계 중 학생이 펴 둔 것(곁텍스트) — 보낸 단계는 늘 펼쳐집니다.
  const [openKeys, setOpenKeys] = useState(() => new Set());

  const actId = task?.activityId ?? "";
  const sectionKey = task?.sectionKey ?? "";

  useEffect(() => {
    if (!actId || !user?.uid) { setLoaded(true); return undefined; }
    let alive = true;
    setLoaded(false);
    setError("");
    setOpenKeys(new Set());
    (async () => {
      try {
        const [a, e] = await Promise.all([
          fetchBookActivity(actId),
          fetchMyBookEntry(actId, user.uid),
        ]);
        if (!alive) return;
        setActivity(a);
        setAnswers(e?.answers ?? {});
      } catch (e) {
        if (alive) setError(`활동을 불러오지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [actId, user?.uid]);

  // 보낸 칸이 바뀌면 **활동 문서를 다시 읽습니다**(1건).
  // 교사는 보내면서 그 단계를 여는데, 같은 활동의 다음 단계를 보내면 위
  // 효과는 다시 안 돕니다(활동이 그대로라서). 그러면 학생 화면은 방금 연
  // 단계를 아직 잠긴 것으로 알고 '선생님이 이 단계를 열어 주면 쓸 수 있어요'를
  // 띄운 채 멈춥니다(실제로 그랬습니다). 답(entry)은 다시 읽지 않습니다 —
  // 지금 화면에 든 것이 더 새것이고, 덮어쓰면 방금 친 글자가 날아갑니다.
  // 활동이 통째로 바뀐 경우는 위 효과가 이미 읽으므로 여기서는 건너뜁니다
  // (안 그러면 활동을 바꿀 때마다 같은 문서를 두 번 읽습니다).
  const readActIdRef = useRef("");
  useEffect(() => {
    setOpenKeys(new Set());
    if (!actId) return undefined;
    const sameActivity = readActIdRef.current === actId;
    readActIdRef.current = actId;
    if (!sameActivity) return undefined;
    let alive = true;
    fetchBookActivity(actId)
      .then((a) => { if (alive && a) setActivity(a); })
      .catch(() => {});
    return () => { alive = false; };
  }, [actId, sectionKey]);

  const kind = activity?.type ?? "";
  const locked = activity?.locked === true;

  // 곁텍스트 — 선생님이 연 단계만. 안 연 것은 서랍에 깔지 않습니다.
  const openSections = useMemo(
    () =>
      activity && kind === "paratext"
        ? PARATEXT_SECTIONS.filter((s) => !isSectionLocked(activity, s.key))
        : [],
    [activity, kind]
  );
  // 보낸 단계가 아직 안 열렸을 때(교사가 보내면서 열지만, 그 사이 다시 잠근
  // 경우) — 화면이 빈 채로 있지 않게 까닭을 적습니다.
  const stepLocked =
    kind === "paratext" && activity ? isSectionLocked(activity, sectionKey) : false;
  const canWrite = !!activity && !locked && !stepLocked;

  const timerRef = useRef(null);
  // 아직 저장 안 된 답 — **어느 활동의 것인지 함께** 붙들어 둡니다. 쓰는
  // 사이에 선생님이 다른 활동을 보내면 문서 자체가 달라지기 때문입니다.
  const pendingRef = useRef(null); // { actId, answers }

  const save = useCallback(async () => {
    clearTimeout(timerRef.current);
    const p = pendingRef.current;
    if (!p || !user?.uid) return;
    pendingRef.current = null;
    setStatus("saving");
    try {
      await saveParatextEntry(p.actId, user, p.answers);
      setStatus(pendingRef.current ? "idle" : "saved");
    } catch (e) {
      setStatus("idle");
      setError(`저장하지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    }
  }, [user]);

  function edit(fieldKey, value) {
    if (!canWrite) return;
    setAnswers((prev) => {
      const next = { ...prev, [fieldKey]: value };
      pendingRef.current = { actId, answers: next };
      return next;
    });
    setStatus("idle");
    onType?.();
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { save(); }, SAVE_DELAY);
  }

  // 보내진 것이 바뀌거나 탭을 떠날 때 남은 것을 씁니다. 이 정리는 **바뀌기
  // 전에** 돌아, 붙들어 둔 원래 활동으로 저장됩니다.
  useEffect(() => () => { save(); }, [actId, save]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") save(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
    };
  }, [save]);

  if (!loaded) return <p className="cornell-empty">활동을 불러오는 중이에요…</p>;
  if (!activity) return <p className="cornell-empty">오늘의 활동을 찾지 못했어요.</p>;

  const actName = activity.title || activity.topic || "";

  // ── 칸 하나 ───────────────────────────────────────────────
  // **컴포넌트가 아니라 그리는 함수입니다.** 이 안에 컴포넌트를 만들어 두면
  // 렌더마다 새것이 되어 React가 칸을 지웠다 다시 만들고, 글자를 칠 때마다
  // 커서를 잃습니다. 아래 두 몸통(ParatextBody·RaftBody)도 같은 이유로
  // `<X />`가 아니라 `X()`로 부릅니다.
  // `after`는 그 칸 **바로 아래**에 붙는 것(형식 칩 줄). 라벨 안이 아니라
  // 형제로 두는 것은, 라벨 안의 단추를 누르면 브라우저가 그 라벨의 글자 칸으로
  // 초점을 옮기려 들기 때문입니다.
  function field(f, on, after = null) {
    return (
      <Fragment key={f.key}>
        <label className={`paratext-field${on ? " ltask-field--on" : ""}`}>
          {f.label && (
            <span>
              {f.label}
              {f.optional && <em className="book-optional">선택</em>}
            </span>
          )}
          {/* 서랍은 세로로 구르므로 칸 높이는 최소만 잡습니다 — 칸이 다섯인
              단계(제목)에서 넉넉히 잡으면 한 화면에 하나도 안 들어옵니다. */}
          <textarea
            rows={f.rows ?? Math.max(f.lines ?? 2, 2)}
            value={answers[f.key] ?? ""}
            onChange={(e) => edit(f.key, e.target.value)}
            placeholder={f.placeholder}
            disabled={!canWrite}
            autoFocus={on && canWrite}
          />
        </label>
        {after}
      </Fragment>
    );
  }

  return (
    <div className="ltask">
      {kind === "raft" ? (
        raftBody()
      ) : kind === "paratext" ? (
        paratextBody()
      ) : (
        <p className="ltask-blocked">이 활동은 아직 서랍에서 쓸 수 없어요.</p>
      )}

      {canWrite && (
        <p className="ltask-status">
          {status === "saving" ? "저장 중…" : status === "saved" ? "저장됨" : "쓰는 대로 저장돼요"}
        </p>
      )}
      <p className="ltask-note">
        쓴 내용은 책방의 그 활동에 저장돼요 — 수업이 끝난 뒤에도 이어서 쓸 수 있어요.
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );

  // ── 곁텍스트 읽기 ─────────────────────────────────────────
  function paratextBody() {
    const current = PARATEXT_SECTIONS.find((s) => s.key === sectionKey) ?? null;
    const stepNo = PARATEXT_SECTIONS.findIndex((s) => s.key === sectionKey) + 1;
    return (
      <>
        <section className="ltask-head">
          <span className="ltask-tag">오늘의 활동 · {stepNo}단계</span>
          {/* 이름은 아래 단계 줄이 말합니다 — 그 줄이 안 서는 때(잠김)에만
              여기에 적습니다. 둘 다 적으면 같은 말이 두 줄입니다. */}
          {(locked || stepLocked) && (
            <strong className="ltask-name">{current?.ko ?? "단계"}</strong>
          )}
          <span className="ltask-board">{actName}</span>
          {current?.prompt && <p className="ltask-guide">{current.prompt}</p>}
        </section>

        {locked ? (
          <p className="ltask-blocked">선생님이 이 활동을 마무리해서 지금은 쓸 수 없어요.</p>
        ) : stepLocked ? (
          <p className="ltask-blocked">선생님이 이 단계를 열어 주면 쓸 수 있어요.</p>
        ) : null}

        {/* 열린 단계만 차례대로. 보낸 것은 펼치고 나머지는 접습니다 —
            누르면 그 자리에서 펴져 앞서 쓴 것을 고칠 수 있습니다. */}
        {openSections.map((s) => {
          const on = s.key === sectionKey;
          const open = on || openKeys.has(s.key);
          const no = PARATEXT_SECTIONS.findIndex((x) => x.key === s.key) + 1;
          const text = peek(answers, s.fields);
          return (
            <section key={s.key} className={`ltask-step${on ? " on" : ""}`}>
              {/* 단계마다 이름 줄이 섭니다 — 없으면 어느 단계의 칸인지 알 수
                  없습니다(접힌 줄 바로 아래 선 칸이 그 줄의 것처럼 보였습니다).
                  보낸 단계는 늘 펼쳐지므로 누를 수 없는 줄이고, 나머지는 이
                  줄로 **펴고 접습니다** — 편 것을 다시 못 접으면 하나씩 펴
                  볼수록 서랍이 길어지기만 합니다. */}
              {on ? (
                <div className="ltask-fold open now">
                  <span className="ltask-fold-no">{no}</span>
                  <span className="ltask-fold-name">{s.ko}</span>
                  <span className="broadcast-live-dot" aria-hidden="true" />
                </div>
              ) : (
                <button
                  type="button"
                  className={`ltask-fold${open ? " open" : ""}`}
                  onClick={() =>
                    setOpenKeys((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.key)) next.delete(s.key);
                      else next.add(s.key);
                      return next;
                    })
                  }
                  title={open ? "눌러서 접기" : "눌러서 펴고 고치기"}
                >
                  <span className="ltask-fold-no">{no}</span>
                  <span className="ltask-fold-name">{s.ko}</span>
                  {/* 편 상태에서는 글이 바로 아래 있으므로 미리보기를 안 답니다 */}
                  {!open && (
                    <span className={`ltask-fold-peek${text ? "" : " empty"}`}>
                      {text || "아직 안 썼어요"}
                    </span>
                  )}
                  <span className="ltask-fold-caret" aria-hidden="true">▸</span>
                </button>
              )}
              {open && (
                <div className="paratext-fields">
                  {s.fields.map((f) => field(f, on && f === s.fields[0]))}
                </div>
              )}
            </section>
          );
        })}
        {openSections.length === 0 && !locked && (
          <p className="ltask-blocked">선생님이 단계를 열어 주면 쓸 수 있어요.</p>
        )}
      </>
    );
  }

  // ── RAFT 글쓰기 ───────────────────────────────────────────
  function raftBody() {
    const writingOn = sectionKey === RAFT_WRITING.key;
    const col = RAFT_COLUMNS.find((c) => c.key === sectionKey) ?? null;
    return (
      <>
        <section className="ltask-head">
          <span className="ltask-tag">오늘의 활동</span>
          <strong className="ltask-name">{writingOn ? RAFT_WRITING.ko : col?.ko ?? "RAFT"}</strong>
          <span className="ltask-board">{actName}</span>
          <p className="ltask-guide">{writingOn ? RAFT_WRITING.prompt : col?.prompt ?? ""}</p>
        </section>

        {locked && (
          <p className="ltask-blocked">선생님이 이 활동을 마무리해서 지금은 쓸 수 없어요.</p>
        )}

        {/* 정한 것이 한 문장으로 — 칸을 채울 때마다 밑줄이 메워집니다.
            책방 화면과 같은 자리·같은 모습입니다. */}
        <p className={`raft-sentence${raftPlanDone(answers) ? " done" : ""}`}>
          {raftSentence(answers)}
        </p>

        {writingOn ? (
          // 글쓰기만 따로 — 칸이 커서 네 칸과 함께 두면 서랍이 너무 길어집니다.
          // 정한 넷은 위 문장이 말해 줍니다.
          <div className="paratext-fields">
            {field({ ...RAFT_WRITING, rows: 12, label: RAFT_WRITING.ko }, true)}
          </div>
        ) : (
          <>
            {/* 네 칸이 늘 다 섭니다 — RAFT에는 단계 잠금이 없어 학생은 언제나
                넷 다 쓸 수 있고, 보낸 칸만 도드라집니다. */}
            <div className="paratext-fields">
              {RAFT_COLUMNS.map((c) =>
                field(
                  {
                    key: c.key,
                    label: `${c.letter}. ${c.ko} — ${c.prompt}`,
                    placeholder: c.placeholder,
                    rows: 2,
                  },
                  c.key === sectionKey,
                  // 형식은 학생이 가장 떠올리기 어려워하는 칸이라, 책방 화면처럼
                  // 자주 쓰는 것을 눌러 넣게 둡니다. **그 칸 바로 아래**에 —
                  // 네 칸을 다 지나 맨 밑에 두면 무엇을 고르는 칩인지 알 수
                  // 없습니다(책방 화면도 형식 칸 아래입니다).
                  //
                  // **어느 칸이 나가 있든 늘 섭니다.** 한때 형식을 보냈을 때만
                  // 그렸는데, 형식을 정한 뒤 선생님이 주제를 보내면 칩이
                  // 사라져 다른 형식으로 바꿀 길이 없어졌습니다. 고른 뒤에도
                  // 그대로 두어 눌러서 바꿀 수 있게 합니다.
                  c.key === "format" && canWrite ? (
                    <div className="raft-chips ltask-chips">
                      {RAFT_FORMATS.map((f) => (
                        <button
                          key={f}
                          type="button"
                          className={`raft-chip${answers.format === f ? " on" : ""}`}
                          onClick={() => edit("format", f)}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  ) : null
                )
              )}
            </div>
          </>
        )}
      </>
    );
  }
}
