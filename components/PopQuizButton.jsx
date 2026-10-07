"use client";

// =============================================================
// 돌발 퀴즈 — 상단바의 메모지 단추 (손들기 자리를 이어받음)
// -------------------------------------------------------------
// 학생: **늘 보입니다**(지난 퀴즈를 보는 입구라서 — 선생님 요청).
//   불은 셋 중 하나(lib/popQuiz.js의 studentQuizLight).
//     빨강 — 퀴즈가 열려 있는데 아직 안 보냄
//     초록 — 반송됨(고쳐 다시 보낼 차례)
//     없음 — 보냄 · 과일 받음 · 열린 퀴즈 없음
//   새 퀴즈가 오면 **처음 한 번만** 창이 저절로 열립니다(이 기기에서 본
//   퀴즈 id를 적어 둠). 반송은 초록 불로만 알립니다(선생님 요청).
// 교사: 반을 골랐으면 섭니다. 불은 '확인 전인 답이 있다'(빨강). 누르면 관리 창.
//
// 읽는 것: 열린 퀴즈(`open == true` 한 질의) + 학생은 그 퀴즈의 내 답 한 장,
// 교사는 그 퀴즈의 답 전부. 지난 목록은 창을 열 때만 읽습니다.
// =============================================================
import { useEffect, useState } from "react";
import {
  subscribeMyPopQuizAnswer,
  subscribeOpenPopQuiz,
  subscribePopQuizAnswers,
} from "@/lib/store";
import { shouldAutoOpenQuiz, studentQuizLight } from "@/lib/popQuiz";
import PopQuizStudentModal from "./PopQuizStudentModal";
import PopQuizTeacherModal from "./PopQuizTeacherModal";
import { IconQuizMemo } from "./StatusIcons";

const seenKey = (classId, uid) => `popquiz_seen:${classId}:${uid}`;
function readSeen(classId, uid) {
  try { return localStorage.getItem(seenKey(classId, uid)); } catch { return null; }
}
function writeSeen(classId, uid, id) {
  try { localStorage.setItem(seenKey(classId, uid), id); } catch { /* 막힌 저장소 — 다음에 또 열릴 뿐 */ }
}

export default function PopQuizButton({ classId, user, isTeacher = false, board = null }) {
  const uid = user?.uid ?? null;
  const [quiz, setQuiz] = useState(null);
  const [quizLoaded, setQuizLoaded] = useState(false);
  // 학생: 내 답 — { for: 퀴즈 id, answer }(어느 퀴즈의 답인지 함께 들어
  // '아직 안 왔다'와 '안 보냈다'를 가릅니다 — 첫 답 전에 창을 열지 않게).
  const [mine, setMine] = useState({ for: null, answer: null });
  const [answers, setAnswers] = useState([]); // 교사: 열린 퀴즈의 답
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuiz(null);
    setQuizLoaded(false);
    if (!classId || !uid) return;
    return subscribeOpenPopQuiz(classId, (q) => { setQuiz(q); setQuizLoaded(true); });
  }, [classId, uid]);

  const quizId = quiz?.id ?? null;
  useEffect(() => {
    if (isTeacher || !classId || !uid || !quizId) { setMine({ for: null, answer: null }); return; }
    return subscribeMyPopQuizAnswer(classId, quizId, uid, (a) => setMine({ for: quizId, answer: a }));
  }, [isTeacher, classId, uid, quizId]);
  useEffect(() => {
    if (!isTeacher || !classId || !quizId) { setAnswers([]); return; }
    return subscribePopQuizAnswers(classId, quizId, setAnswers);
  }, [isTeacher, classId, quizId]);

  const answer = mine.for === quizId ? mine.answer : null;
  const answerLoaded = !quizId || mine.for === quizId;

  // 처음 한 번만 저절로 — 내 답이 도착한 뒤에 판정합니다(안 그러면 이미 보낸
  // 학생에게도 새로 고칠 때마다 한 번 뜹니다).
  useEffect(() => {
    if (isTeacher || !classId || !uid || !quizLoaded || !answerLoaded || !quiz) return;
    if (shouldAutoOpenQuiz(quiz, answer, readSeen(classId, uid))) {
      writeSeen(classId, uid, quiz.id);
      setOpen(true);
    }
  }, [isTeacher, classId, uid, quizLoaded, answerLoaded, quiz, answer]);

  // 창을 열면 지금 퀴즈는 '본 것' — 닫았다 새로 고쳐도 다시 안 뜹니다.
  useEffect(() => {
    if (open && !isTeacher && quizId && classId && uid) writeSeen(classId, uid, quizId);
  }, [open, isTeacher, quizId, classId, uid]);

  if (!classId || !uid) return null;

  const pending = isTeacher ? answers.filter((a) => a.status === "submitted").length : 0;
  const light = isTeacher ? (pending > 0 ? "red" : null) : studentQuizLight(quiz, answer);
  const label = isTeacher
    ? quiz
      ? `돌발 퀴즈 — 진행 중 ‘${quiz.title}’${pending ? ` · 확인 전 답 ${pending}개` : ""}`
      : "돌발 퀴즈 — 보내기 · 지난 퀴즈"
    : light === "red"
      ? "돌발 퀴즈가 왔어요 — 눌러서 답하기"
      : light === "green"
        ? "선생님이 답을 돌려보냈어요 — 눌러서 고쳐 보내기"
        : "돌발 퀴즈 — 지난 퀴즈 보기";

  return (
    <>
      <button
        type="button"
        className={`pq-btn${light ? " on" : ""}`}
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
      >
        <IconQuizMemo size={24} />
        {light && (
          <span className={`pq-btn-dot${light === "green" ? " is-green" : ""}`} aria-hidden="true" />
        )}
      </button>
      {open && (isTeacher ? (
        <PopQuizTeacherModal classId={classId} board={board} onClose={() => setOpen(false)} />
      ) : (
        <PopQuizStudentModal
          classId={classId}
          user={user}
          quiz={quiz}
          answer={answer}
          onClose={() => setOpen(false)}
        />
      ))}
    </>
  );
}
