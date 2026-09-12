"use client";

// =============================================================
// 수업 노트 서랍의 '오늘의 활동' 탭 — 곁텍스트 읽기 한 단계
// -------------------------------------------------------------
// 교사가 수업 모드에서 독서 활동의 단계 하나를 내보내면(반 문서의 `task`에
// `kind: 'book'`) 이 칸이 섭니다. 학생이 쓴 답은 **책방에서 쓰던 그 자리**
// (`bookActivities/{id}/entries/{uid}`)로 들어가므로, 수업이 끝난 뒤 책방에서
// 이어 쓰면 그대로 있습니다.
//
// [공부방 활동 칸과 다른 점]
// 공부방 카드는 활동들이 한 덩어리 글로 저장되어 **몇 번째 자리인지**로
// 짚어야 했습니다(활동 이름이 바뀌면 앞뒤가 끌려오던 그 함정). 여기는 답이
// 단계마다 **제 이름표를 달고** 저장되고, 여덟 단계는 lib/paratext.js에 못
// 박혀 있어 이름이 바뀌거나 순서가 움직이지 않습니다. 그래서 자리를 맞추는
// 고민이 아예 없습니다.
//
// [한 단계 = 칸 여러 개일 수 있습니다]
// 제목 단계는 다섯 칸, 목차는 세 칸, 머리말은 두 칸입니다. 한 단계를 보내면
// 그 단계의 칸이 **한꺼번에** 섭니다 — 칸 하나씩 보내면 선생님이 같은 단계를
// 다섯 번 보내야 합니다.
//
// [읽는 문서]
// 활동 1건 + 내 기록 1건. 단계가 바뀔 때만 다시 읽습니다.
// =============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBookActivity, fetchMyBookEntry, saveParatextEntry } from "@/lib/store";
import { PARATEXT_SECTIONS, isSectionLocked } from "@/lib/paratext";

const SAVE_DELAY = 1500;

export default function LessonParatextPanel({ task, user, onType }) {
  const [activity, setActivity] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  const [error, setError] = useState("");

  const actId = task?.activityId ?? "";
  const sectionKey = task?.sectionKey ?? "";
  const section = PARATEXT_SECTIONS.find((s) => s.key === sectionKey) ?? null;
  const stepNo = PARATEXT_SECTIONS.findIndex((s) => s.key === sectionKey) + 1;

  // 활동과 내 기록을 한 번씩 읽습니다. 보내진 것이 바뀌면 다시.
  useEffect(() => {
    if (!actId || !user?.uid) { setLoaded(true); return undefined; }
    let alive = true;
    setLoaded(false);
    setError("");
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

  const locked = activity?.locked === true;
  const stepLocked = activity && section ? isSectionLocked(activity, section.key) : false;
  const canWrite = !!activity && !!section && !locked && !stepLocked;

  const timerRef = useRef(null);
  // 아직 저장 안 된 답 — **어느 활동의 것인지 함께** 붙들어 둡니다.
  // 학생이 쓰는 사이에 선생님이 다음 단계를 보낼 수 있어, 저장하는 순간의
  // 활동으로 쓰면 엉뚱한 곳에 들어갑니다. 단계는 답이 이름표를 달고 있어
  // 섞이지 않지만, 활동이 갈리면 문서 자체가 다릅니다.
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
  if (!activity || !section) {
    return <p className="cornell-empty">오늘의 활동을 찾지 못했어요.</p>;
  }

  return (
    <div className="ltask">
      <section className="ltask-head">
        <span className="ltask-tag">오늘의 활동 · {stepNo}단계</span>
        <strong className="ltask-name">{section.ko}</strong>
        <span className="ltask-board">{activity.title || activity.topic || ""}</span>
        <p className="ltask-guide">{section.prompt}</p>
      </section>

      {locked ? (
        <p className="ltask-blocked">선생님이 이 활동을 마무리해서 지금은 쓸 수 없어요.</p>
      ) : stepLocked ? (
        <p className="ltask-blocked">선생님이 이 단계를 열어 주면 쓸 수 있어요.</p>
      ) : null}

      {/* 칸은 책방 화면과 **같은 클래스**를 씁니다 — 같은 활동을 두 화면에서
          다른 모습으로 쓰면 학생이 두 번 익혀야 합니다. */}
      <div className="paratext-fields">
        {section.fields.map((f, i) => (
          <label key={f.key} className="paratext-field">
            {f.label && (
              <span>
                {f.label}
                {f.optional && <em className="book-optional">선택</em>}
              </span>
            )}
            {/* 서랍은 세로로 구르므로 칸 높이는 최소만 잡습니다 — 한 단계에
                칸이 다섯인 곳(제목)에서 칸마다 넉넉히 잡으면 한 화면에 하나도
                안 들어옵니다. 글이 길어지면 스크롤로 씁니다. */}
            <textarea
              rows={Math.max(f.lines, 2)}
              value={answers[f.key] ?? ""}
              onChange={(e) => edit(f.key, e.target.value)}
              placeholder={f.placeholder}
              disabled={!canWrite}
              autoFocus={i === 0 && canWrite}
            />
          </label>
        ))}
      </div>

      {canWrite && (
        <p className="ltask-status">
          {status === "saving"
            ? "저장 중…"
            : status === "saved"
              ? "저장됨"
              : "쓰는 대로 저장돼요"}
        </p>
      )}

      <p className="ltask-note">
        쓴 내용은 책방의 그 활동에 저장돼요 — 수업이 끝난 뒤에도 이어서 쓸 수 있어요.
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
