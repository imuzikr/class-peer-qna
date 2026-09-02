"use client";

// =============================================================
// 배움의 끝자리 — L·S (교사 대시보드)
// -------------------------------------------------------------
// KWLS 네 칸 가운데 **읽은 뒤에 쓰는 두 칸**만 봅니다.
//
// [왜 L·S만인가] K·W는 읽기 **전**에 쓰는 칸이고, 그 값은 수업 중에 씁니다 —
// W는 이미 공부방 'KWLS 차트' 패널의 'W 모음'이 그 일을 하고 있고(수업에서
// 다룰 질문 고르기), K는 혼자 놓고 보면 교사가 할 일이 없습니다(같은 학생의
// L과 짝지어야 뜻이 생기는데 그건 개인 리포트의 몫입니다).
// 대시보드는 수업이 **끝난 뒤** 여는 화면이라, 여기서 답할 물음은 둘입니다 —
// 오늘 것이 남았나(L), 다음에 무엇을 할까(S).
//
// [이 패널의 요점은 S 모음] 학생이 '그래도 더 알고 싶은 것'에 적은 문장은
// 다음 차시 도입에 그대로 쓸 재료입니다. 지금까지는 그걸 읽으려면 학생을
// 한 명씩 눌러야 했습니다(StudentKwlPanel). 오늘의 S가 다음 수업의 W가
// 되는 흐름을 한 화면에서 잇는 것이 이 칸이 있는 이유입니다.
//
// [안 하는 것] 낱말 빈도·워드클라우드는 두지 않습니다. 한국어는 조사 때문에
// '물이/물은/물을'이 전부 다른 낱말로 잡혀, 형태소 분석기 없이는 셀수록
// 틀립니다. 자유 서술에 이해도 점수를 매기지도 않습니다 — 정밀해 보이기만
// 하고 근거가 없어, 이 앱의 다른 칸들이 지켜 온 '숫자 하나로 뭉뚱그리지
// 않기'와도 어긋납니다.
//
// [두 갈래가 섞여 있습니다] kwl 컬렉션에는 공부방 하루 성찰(문서 ID
// uid_classId_date)과 책방 KWLS 활동(uid_classId_act_활동id + activityId·
// topic)이 함께 들어옵니다. 성격이 달라 섞어 세되 어디서 온 것인지는
// 표시합니다 — 책방에서 온 줄에는 주제어를 배지로 답니다.
//
// [구독하지 않습니다] classKwl은 대시보드가 이미 받아 둔 배열입니다.
// 그대로 받아 쓰므로 읽기가 한 건도 늘지 않습니다.
// =============================================================
import { useMemo, useState } from "react";
import { kwlsAnswersFromEntry } from "@/lib/kwls";
import { toDate } from "@/lib/store";

const WEEKS = 4;
const DAY = 24 * 60 * 60 * 1000;
// S 모음에 한 번에 세울 수 있는 최대 줄 — 넘으면 '더 보기'로 폅니다.
const SHOW = 12;
// 이 글자 수 아래면 '한 줄짜리'로 봅니다. 점수가 아니라 다시 물어볼
// 목록을 뽑는 기준이라, 넉넉하게 잡아 놓치는 쪽보다 걸리는 쪽을 택합니다.
const THIN_LEN = 12;

function entryDate(e) {
  if (e.date) return String(e.date);
  const d = toDate(e.createdAt ?? e.updatedAt);
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function entryTime(e) {
  const d = toDate(e.createdAt ?? e.updatedAt);
  if (d && !Number.isNaN(d.getTime())) return d.getTime();
  // 시각이 없으면 날짜만으로 — 정렬에만 쓰므로 자정으로 두면 충분합니다.
  const t = new Date(`${entryDate(e)}T00:00:00`).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export default function KwlOutcome({ kwl = [], roster = [], loaded = false }) {
  const [openAll, setOpenAll] = useState(false);

  const stat = useMemo(() => {
    const from = Date.now() - WEEKS * 7 * DAY;
    const who = new Map(
      roster.map((s) => [
        s.uid ?? s.id,
        { name: s.realName || s.name || "이름 미설정", studentId: s.studentId ?? null },
      ])
    );

    // 최근 4주 + 명단 안 학생 것만. 명단 밖(전학 등)은 이름을 붙일 수 없어
    // 목록에 세워도 교사가 누구인지 알 수 없습니다.
    const rows = kwl
      .filter((e) => who.has(e.userId) && entryTime(e) >= from)
      .map((e) => {
        const a = kwlsAnswersFromEntry(e);
        return {
          id: e.id ?? `${e.userId}_${entryDate(e)}`,
          uid: e.userId,
          date: entryDate(e),
          at: entryTime(e),
          learned: String(a.learned ?? "").trim(),
          still: String(a.still ?? "").trim(),
          // 책방 KWLS 활동이면 activityId가 붙어 옵니다(공부방 하루 성찰엔 없음)
          fromBooks: !!e.activityId,
          topic: String(e.topic ?? "").trim(),
          ...(who.get(e.userId) ?? {}),
        };
      });

    const wroteL = new Set(rows.filter((r) => r.learned).map((r) => r.uid));
    const wroteS = new Set(rows.filter((r) => r.still).map((r) => r.uid));
    const touched = new Set(rows.map((r) => r.uid));

    const byStudentId = (a, b) =>
      String(a.studentId || a.name).localeCompare(String(b.studentId || b.name), "ko", {
        numeric: true,
      });

    // ② L은 썼는데 S가 빈 학생 — '배웠다'로 끝나고 더 궁금한 게 없는 상태.
    // 잘 이해한 경우일 수도, 더 파고들 자리를 못 본 경우일 수도 있어
    // 교사가 한 번 확인할 대상입니다(둘을 자동으로 가를 수는 없습니다).
    const closed = [...wroteL]
      .filter((uid) => !wroteS.has(uid))
      .map((uid) => ({ uid, ...(who.get(uid) ?? {}) }))
      .sort(byStudentId);

    // ④ 최근 4주에 L·S를 하나도 안 쓴 학생
    const silent = roster
      .map((s) => ({ uid: s.uid ?? s.id, ...(who.get(s.uid ?? s.id) ?? {}) }))
      .filter((s) => !wroteL.has(s.uid) && !wroteS.has(s.uid))
      .sort(byStudentId);

    // ③ S 모음 — 최신순. 이 패널의 요점입니다.
    const stills = rows.filter((r) => r.still).sort((a, b) => b.at - a.at);

    // ⑤ 한 줄짜리 L — 다시 물어볼 목록
    const thinL = rows
      .filter((r) => r.learned && r.learned.length <= THIN_LEN)
      .sort((a, b) => b.at - a.at);

    return {
      size: roster.length,
      days: new Set(rows.map((r) => r.date).filter(Boolean)).size,
      lCount: wroteL.size,
      sCount: wroteS.size,
      touched: touched.size,
      closed,
      silent,
      stills,
      thinL,
      booksCount: rows.filter((r) => r.fromBooks).length,
    };
  }, [kwl, roster]);

  if (!loaded || stat.size === 0) return null;

  const names = (list, max = 10) =>
    list.slice(0, max).map((p) => p.name).join(" · ") +
    (list.length > max ? ` 외 ${list.length - max}명` : "");

  const shown = openAll ? stat.stills : stat.stills.slice(0, SHOW);

  return (
    <section className="admin-chart-panel kout">
      <div className="admin-panel-head">
        <h2>🔍 배움의 끝자리</h2>
        <span>최근 {WEEKS}주 · L·S만</span>
      </div>

      <p className="kout-lead">
        {stat.touched === 0 ? (
          <>최근 {WEEKS}주에 쓴 KWLS 기록이 없어요.</>
        ) : (
          <>
            수업 <strong>{stat.days}일</strong> · 알게 된 것(L){" "}
            <strong>{stat.lCount}명</strong> · 더 알고 싶은 것(S){" "}
            <strong>{stat.sCount}명</strong>
            <span className="kout-of"> / {stat.size}명 중</span>
            {/* 어디서 온 기록이 섞였는지 — 성격이 다른 두 갈래라 밝혀 둡니다 */}
            {stat.booksCount > 0 && (
              <span className="kout-src"> · 그중 책방 활동 {stat.booksCount}건</span>
            )}
          </>
        )}
      </p>

      {/* ③ S 모음 — 다음 수업의 W가 될 재료. 이 패널의 요점이라 맨 위입니다. */}
      {stat.stills.length > 0 && (
        <div className="kout-block">
          <p className="kout-block-title">
            🌱 더 알고 싶은 것 <b>{stat.stills.length}</b>
            <em>다음 수업 도입에 그대로 쓸 수 있어요</em>
          </p>
          <ul className="kout-still-list">
            {shown.map((r) => (
              <li key={r.id} className="kout-still">
                <span className="kout-still-text">{r.still}</span>
                <span className="kout-still-meta">
                  {r.name}
                  {/* 책방에서 온 것만 표시합니다 — 공부방 하루 성찰이 기본이라
                      거기에까지 배지를 달면 줄마다 배지가 붙어 시끄럽습니다. */}
                  {r.fromBooks && (
                    <span className="kout-badge" title="책방 KWLS 활동에서 쓴 기록">
                      📖 책방{r.topic ? ` · ${r.topic}` : ""}
                    </span>
                  )}
                  <span className="kout-date">{r.date}</span>
                </span>
              </li>
            ))}
          </ul>
          {stat.stills.length > SHOW && (
            <button
              type="button"
              className="btn-ghost kout-more"
              onClick={() => setOpenAll((v) => !v)}
            >
              {openAll ? "접기" : `나머지 ${stat.stills.length - SHOW}개 더 보기`}
            </button>
          )}
        </div>
      )}

      {/* ② L은 썼는데 S가 빈 학생 */}
      {stat.closed.length > 0 && (
        <p className="kout-note">
          <strong>알게 된 것만 쓰고 더 궁금한 건 안 쓴 학생 {stat.closed.length}명</strong>
          <span className="kout-note-names">{names(stat.closed)}</span>
          <em className="kout-note-why">
            잘 이해해서일 수도, 더 파고들 자리를 못 봐서일 수도 있어요 — 한 번
            물어볼 만한 학생들입니다.
          </em>
        </p>
      )}

      {/* ⑤ 한 줄짜리 L — 점수가 아니라 다시 물어볼 목록 */}
      {stat.thinL.length > 0 && (
        <div className="kout-block">
          <p className="kout-block-title">
            ✏️ 한 줄로 끝난 ‘알게 된 것’ <b>{stat.thinL.length}</b>
            <em>무엇을 알게 됐는지 다시 물어보면 좋아요</em>
          </p>
          <ul className="kout-thin-list">
            {stat.thinL.slice(0, SHOW).map((r) => (
              <li key={`thin-${r.id}`}>
                <span className="kout-thin-text">“{r.learned}”</span>
                <span className="kout-still-meta">
                  {r.name}
                  {r.fromBooks && <span className="kout-badge">📖 책방</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ④ 아무것도 안 쓴 학생 */}
      {stat.silent.length > 0 && (
        <p className="kout-note kout-note--silent">
          <strong>최근 {WEEKS}주에 L·S를 한 번도 안 쓴 학생 {stat.silent.length}명</strong>
          <span className="kout-note-names">{names(stat.silent, 12)}</span>
        </p>
      )}
    </section>
  );
}
