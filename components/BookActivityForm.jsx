"use client";

// =============================================================
// 독서 활동 만들기 (교사 전용)
// -------------------------------------------------------------
// 활동 종류를 먼저 고르면 그에 필요한 항목만 남습니다.
//  · 닿소리 채우기 — 모둠이 함께 판을 채웁니다. 모둠 구성 방식을 정합니다.
//  · 곁텍스트 읽기 / RAFT 글쓰기 — 혼자 쓰지만 **모둠으로 묶을 수 있습니다**
//      (글은 각자 한 장 그대로, 모둠은 화면의 흐름과 동료 평가의 범위).
//      도서 정보 주소와 모둠 설정을 둘 다 받습니다.
//  · KWLS로 성찰하기 / 마인드맵 — 혼자 하는 활동. 모둠 설정이 없습니다.
//
// 모둠 방식의 기본값은 **반의 기본 모둠**입니다(있을 때). 수업이 대체로 늘
// 같은 모둠으로 돌아가는데 활동마다 다시 짜면 같은 일을 되풀이하게 됩니다.
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useState } from "react";
import { safeBookUrl } from "@/lib/paratext";
import { BOOK_STUDENT_TOPIC_TYPES } from "@/lib/store";

const TYPES = [
  { key: "consonant", label: "닿소리 채우기", desc: "모둠이 함께 자음 칸을 낱말로 채웁니다", defaultTitle: "닿소리 채우기" },
  { key: "paratext", label: "곁텍스트 읽기", desc: "표지·제목·목차를 보고 혼자 내용을 짐작합니다", defaultTitle: "곁텍스트 읽기" },
  { key: "raft", label: "RAFT 글쓰기", desc: "역할·청중·형식·주제를 정해 읽은 뒤 글을 씁니다", defaultTitle: "RAFT 글쓰기" },
  { key: "kwls", label: "KWLS로 성찰하기", desc: "읽기 전 아는 것·궁금한 것, 읽은 뒤 알게 된 것을 적습니다", defaultTitle: "KWLS로 성찰하기" },
  { key: "mindmap", label: "마인드맵", desc: "주제에서 가지를 뻗어 생각을 방사형·계층형으로 펼칩니다", defaultTitle: "마인드맵" },
];
// 모둠을 정하는 일은 **세 번의 물음**입니다. 한 줄에 다섯 갈래를 늘어놓았더니
// '기본 모둠'과 '활동 모둠'이 나란히 있어 무엇이 무엇인지 알기 어려웠습니다.
// 이제 묻는 차례대로 갈라 둡니다.
//
//   ① 모둠으로 할까, 혼자 할까              (모둠 활동 / 개별 활동)
//   ② 모둠이면 — 반의 기본 모둠 그대로 쓸까, 이 활동만의 모둠을 짤까
//   ③ 이 활동만의 모둠이면 — 어떻게 짤까     (교사 배정 / 무작위 / 학생이 고르기)
//
// 저장되는 값(groupMode)은 지금까지와 같은 다섯 가지입니다 —
// solo · base · teacher · random · free. 묻는 방법만 바뀝니다.
const TEMP_MODES = [
  {
    key: "teacher",
    label: "교사 배정",
    note: "빈 모둠만 만들어 두고, 만든 뒤 '모둠 구성'에서 명단을 짭니다(기본 모둠 불러오기도 거기 있어요).",
  },
  {
    key: "random",
    label: "무작위",
    note: "만들 때 지금 반 명단을 섞어 고르게 나눕니다. 만든 뒤 '모둠 구성'에서 손볼 수 있어요.",
  },
  {
    key: "free",
    label: "학생이 고르기",
    note: "빈 모둠만 만들어 두면 학생이 직접 골라 들어갑니다.",
  },
];
const GROUP_COUNTS = [3, 4, 5, 6, 7];

// '기본 모둠 그대로'를 골랐을 때의 안내 — 몇 개를 가져오는지, 없으면 어떻게
// 하는지. 이름만으로는 '기본'과 '이 활동만의 모둠'이 어떻게 다른지 모릅니다.
function baseNote(baseGroupCount) {
  return baseGroupCount > 0
    ? `반의 기본 모둠 ${baseGroupCount}개를 그대로 가져옵니다 — 이름·명단까지. 이 활동에서만 고쳐도 기본 모둠은 그대로예요.`
    : "아직 반에 기본 모둠이 없어요. 공부방의 '멋진 순간' 자리표에서 모둠을 먼저 짜거나, ‘이 활동만의 모둠’으로 바꿔 주세요.";
}

// 모둠으로 진행할 수 있는 종류
const GROUPABLE = ["consonant", "paratext", "raft"];

// "햇살, 바람, 나무" → ["햇살","바람","나무"] (빈 항목은 버림)
function parseNames(raw) {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export default function BookActivityForm({
  onSave,
  onClose,
  initialType = "consonant",
  fixedType = false,
  // 반에 이미 짜 둔 기본 모둠이 몇 개인지 — '기본 모둠'을 골랐을 때
  // 몇 개를 가져오는지 미리 알려 주려고 받습니다(없으면 그 자리에서 안내).
  baseGroupCount = 0,
}) {
  const initial = TYPES.find((t) => t.key === initialType) ?? TYPES[0];
  const [type, setType] = useState(initial.key);
  const [title, setTitle] = useState(initial.defaultTitle);
  const [topic, setTopic] = useState("");
  const [bookUrl, setBookUrl] = useState("");
  // 모둠 설정은 세 갈래로 나눠 갖고 있다가 저장할 때 하나로 합칩니다.
  // **기본은 '모둠 활동 + 반의 기본 모둠'** — 수업이 대체로 늘 같은 모둠으로
  // 돌아가는데 활동마다 다시 짜면 같은 일을 되풀이하게 됩니다.
  const [groupWork, setGroupWork] = useState(true);       // ① 모둠으로 할까
  const [useBaseGroups, setUseBaseGroups] = useState(true); // ② 기본 모둠 그대로
  const [tempMode, setTempMode] = useState("teacher");     // ③ 임시 모둠 짜는 법
  const [groupCount, setGroupCount] = useState(4);
  const [maxPerGroup, setMaxPerGroup] = useState(6);
  const [namesRaw, setNamesRaw] = useState("");
  const [warning, setWarning] = useState(null); // 이름 개수 불일치 안내
  const [saving, setSaving] = useState(false);

  const names = parseNames(namesRaw);
  // 학생이 눌러볼 도서 정보 주소를 받는 종류 — 혼자 읽고 쓰는 활동들입니다.
  const hasBookUrl = ["paratext", "raft", "kwls", "mindmap"].includes(type);
  // 모둠으로 진행할 수 있는 종류. 곁텍스트·RAFT도 모둠이 되지만 **글은
  // 학생마다 한 장 그대로**입니다 — 모둠이 정하는 것은 '누구와 함께 보는가'
  // (화면의 흐름과 동료 평가의 범위)입니다.
  const canGroup = GROUPABLE.includes(type);
  // 세 갈래를 저장하는 한 값으로 합칩니다(지금까지와 같은 다섯 가지).
  const groupMode = !canGroup || !groupWork ? "solo" : useBaseGroups ? "base" : tempMode;
  // '개별 활동' — 닿소리는 학생마다 판을 하나씩 깔고, 곁텍스트·RAFT는
  // 지금까지처럼 각자 자기 문서에만 씁니다. 어느 쪽이든 모둠 수·이름이
  // 필요 없어 그 칸을 감춥니다.
  const perStudent = canGroup && groupMode === "solo";
  // '기본 모둠'은 모둠 수·이름을 반에서 그대로 가져오므로 여기서 정할 것이
  // 없습니다(고르게 두면 '4개로 정했는데 5개가 생겼다'가 됩니다).
  const fromBase = canGroup && groupMode === "base";
  // 주소를 적었는데 열 수 없는 형태면 만들기 전에 알려 줍니다.
  const urlBad = bookUrl.trim().length > 0 && !safeBookUrl(bookUrl);

  // 종류를 바꾸면 활동 이름도 따라갑니다 — 단, 교사가 직접 고친 이름은 지키기
  function pickType(next) {
    setType(next);
    const from = TYPES.find((t) => t.key === type);
    if (title.trim() === "" || title === from?.defaultTitle) {
      setTitle(TYPES.find((t) => t.key === next)?.defaultTitle ?? title);
    }
    // 종류를 바꾸면 모둠 설정도 기본값(모둠 활동 + 기본 모둠)으로 돌아갑니다.
    // 다른 활동을 만들겠다는 뜻이라, 앞 종류에서 고른 것을 끌고 오면 놀랍습니다.
    setGroupWork(true);
    setUseBaseGroups(true);
  }

  // 주제어를 비워 둘 수 있는 활동 — '학생이 자기 자리에서 직접 적을 길'이
  // 있는 것들입니다. 읽는 책이 저마다 다를 수 있는 활동이라 교사가 하나로
  // 정하지 못하는 경우가 있습니다.
  //  · 닿소리 '개별 활동' — 판 한가운데를 두 번 눌러 적습니다
  //  · 곁텍스트 읽기·RAFT — 활동을 열면 한 번 물어보고, 머리말 배지로 고칩니다
  // 그 길이 없는 종류(KWLS·마인드맵)는 비워 두면 무엇을 하는 활동인지 아무도
  // 알 수 없으므로 그대로 필수입니다(어느 종류가 여기 드는지와 그 이유는
  // lib/store.js의 BOOK_STUDENT_TOPIC_TYPES에 적어 두었습니다).
  const topicRequired = !perStudent && !BOOK_STUDENT_TOPIC_TYPES.includes(type);

  async function handleSubmit(e) {
    e.preventDefault();
    if ((topicRequired && !topic.trim()) || saving || urlBad) return;

    // 이름을 적었는데 모둠 수와 개수가 다르면 만들지 않고 알려 줍니다.
    // (개별 활동은 모둠 이름을 쓰지 않으므로 이 검사를 건너뜁니다)
    if (canGroup && !perStudent && !fromBase && names.length > 0 && names.length !== groupCount) {
      setWarning(
        `모둠은 ${groupCount}개인데 이름은 ${names.length}개를 적으셨어요.\n` +
          `개수를 맞추거나, 이름을 비우면 '1모둠·2모둠…'으로 자동으로 붙습니다.`
      );
      return;
    }

    setSaving(true);
    try {
      await onSave({
        type,
        title,
        topic,
        bookUrl: hasBookUrl ? bookUrl.trim() : "",
        groupMode,
        groupCount,
        maxPerGroup,
        groupNames: perStudent || fromBase ? [] : names,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <form className="modal book-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-head">
          <h3>독서 활동 만들기</h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {/* 창을 가로로 넓게 쓰고 두 칸으로 나눕니다 — 왼쪽은 '무엇을 할까'
            (활동 종류), 오른쪽은 '어떻게 할까'(이름·주제어·모둠). 예전에는
            전부 한 줄로 쌓아 창이 세로로 길어졌고, 스크롤을 내리면 위에서
            고른 종류가 화면 밖으로 나가 무엇을 만드는 중인지 안 보였습니다. */}
        <div className="book-form-cols">
        {!fixedType && (
          <div className="book-form-side">
            <div className="book-field">
              <span>활동 종류</span>
              <div className="book-type-seg">
                {TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`book-type-btn${type === t.key ? " active" : ""}`}
                    onClick={() => pickType(t.key)}
                    aria-pressed={type === t.key}
                  >
                    <strong>{t.label}</strong>
                    <em>{t.desc}</em>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="book-form-main">
        <div className="book-field-row">
          <label className="book-field">
            <span>활동 이름</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={40}
            />
          </label>
          <label className="book-field">
            <span>
              주제어 · 도서명
              {!topicRequired && <em className="book-optional">선택</em>}
            </span>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={topicRequired ? "예: 어린 왕자" : "비워 두면 학생이 직접 적어요"}
              maxLength={30}
              autoFocus
            />
          </label>
        </div>

        {/* 혼자 읽고 쓰는 활동에는 학생이 눌러볼 도서 정보 주소를 받습니다.
            곁텍스트·RAFT는 이 칸과 모둠 설정을 **둘 다** 씁니다 — 모둠으로
            묶여도 읽는 책은 그대로라서요. */}
        {hasBookUrl && (
          <label className="book-field">
            <span>
              도서 정보 사이트 <em className="book-optional">선택</em>
            </span>
            {/* type="url"이 아니라 text입니다 — 'www.yes24.com/…'처럼 앞에
                https://를 안 붙이고 적는 경우가 많은데, type="url"이면 브라우저가
                제출 자체를 막아 버립니다. 대신 safeBookUrl이 검사하고 채워 줍니다. */}
            <input
              type="text"
              inputMode="url"
              value={bookUrl}
              onChange={(e) => setBookUrl(e.target.value)}
              placeholder="예: www.yes24.com/product/goods/..."
            />
            <em className="book-help">
              {urlBad
                ? "열 수 없는 주소예요. http:// 또는 https:// 로 시작하는 주소를 넣어 주세요."
                : "넣어 두면 학생 화면에 ‘도서 정보’ 버튼이 생겨 새 탭으로 열립니다."}
            </em>
          </label>
        )}

        {canGroup && (
          <>
            {/* ①② 한 줄에 나란히 — '모둠으로 할까'와 '어떤 모둠으로 할까'는
                이어지는 물음이라 함께 보여야 답하기 쉽습니다. */}
            <div className="book-field-row">
              {/* ① 모둠으로 할까, 혼자 할까 */}
              <div className="book-field">
                <span>진행 방식</span>
                <div className="book-seg">
                  <button
                    type="button"
                    className={`book-seg-btn${groupWork ? " active" : ""}`}
                    onClick={() => setGroupWork(true)}
                    aria-pressed={groupWork}
                  >
                    모둠 활동
                  </button>
                  <button
                    type="button"
                    className={`book-seg-btn${!groupWork ? " active" : ""}`}
                    onClick={() => setGroupWork(false)}
                    aria-pressed={!groupWork}
                  >
                    개별 활동
                  </button>
                </div>
              </div>

              {/* ② 모둠이면 — 반의 기본 모둠 그대로 쓸까, 이 활동만의 모둠을 짤까 */}
              {groupWork && (
                <div className="book-field">
                  <span>모둠 구성</span>
                  <div className="book-seg">
                    <button
                      type="button"
                      className={`book-seg-btn${useBaseGroups ? " active" : ""}`}
                      onClick={() => setUseBaseGroups(true)}
                      aria-pressed={useBaseGroups}
                    >
                      기본 모둠 그대로
                    </button>
                    <button
                      type="button"
                      className={`book-seg-btn${!useBaseGroups ? " active" : ""}`}
                      onClick={() => setUseBaseGroups(false)}
                      aria-pressed={!useBaseGroups}
                    >
                      이 활동만의 모둠
                    </button>
                  </div>
                </div>
              )}
            </div>

            {perStudent && type !== "consonant" ? (
              /* 곁텍스트·RAFT의 '개별 활동' — 지금까지 해 오던 그 모습입니다.
                 판을 깔지 않고 각자 자기 문서에만 씁니다. */
              <p className="book-help book-solo-note">
                모둠 없이 <strong>학생마다 혼자</strong> 씁니다(지금까지와 같아요).
                모둠으로 묶으면 글은 그대로 각자 한 장이고,
                <strong> 화면에서 모둠원이 함께 보입니다</strong> — 교사 화면은
                모둠으로 좁혀 볼 수 있고, RAFT는 모둠 안에서 동료 평가를 할 수 있어요.
              </p>
            ) : perStudent ? (
              <p className="book-help book-solo-note">
                모둠을 만들지 않고 <strong>학생마다 판을 하나씩</strong> 만듭니다.
                낱말은 본인과 선생님에게만 보이고, ‘전체 보기’에서 반 전체를 한 번에 볼 수 있어요.
                <br />
                주제어를 비워 두면 학생이 자기 판 한가운데를 두 번 눌러 직접 적습니다
                (읽는 책이 저마다 다를 때).
              </p>
            ) : fromBase ? (
              <p className="book-help book-solo-note">{baseNote(baseGroupCount)}</p>
            ) : (
            <>
            {/* ③ 이 활동만의 모둠이면 — 어떻게 짤까 · 몇 모둠으로 할까.
                이 두 물음은 늘 함께 뜹니다(③이 뜨는 조건 = 이 자리) — 한 줄에
                놓아 창이 세로로 늘어나지 않게 합니다. */}
            <div className="book-field-row">
              <div className="book-field">
                <span>모둠 짜는 방법</span>
                <div className="book-seg">
                  {TEMP_MODES.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      className={`book-seg-btn${tempMode === m.key ? " active" : ""}`}
                      onClick={() => setTempMode(m.key)}
                      aria-pressed={tempMode === m.key}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="book-field">
                <span>모둠 수</span>
                {/* 숫자 한 자라 좁게 — 넓은 버튼과 같은 크기로 두면 이 줄만
                    혼자 길어져 옆 칸(모둠 짜는 방법)이 접힙니다. */}
                <div className="book-seg book-seg--tight">
                  {GROUP_COUNTS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`book-seg-btn${groupCount === n ? " active" : ""}`}
                      onClick={() => setGroupCount(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 모둠 이름 · 모둠당 최대 — '학생이 고르기'일 때만 뒤 칸이 붙습니다.
                위 줄(짜는 방법 · 모둠 수)에 끼우면 그 줄이 세 칸이 되어 버튼
                줄이 두 줄로 접힙니다. */}
            <div className="book-field-row">
              <label className="book-field">
                <span>
                  모둠 이름 <em className="book-optional">선택</em>
                  {names.length > 0 && (
                    <b className={names.length === groupCount ? "book-cnt ok" : "book-cnt bad"}>
                      {names.length} / {groupCount}
                    </b>
                  )}
                </span>
                <input
                  type="text"
                  value={namesRaw}
                  onChange={(e) => setNamesRaw(e.target.value)}
                  placeholder="쉼표로 구분 — 예: 햇살, 바람, 나무, 별빛"
                />
              </label>
              {tempMode === "free" && (
                <div className="book-field book-field--narrow">
                  <span>모둠당 최대</span>
                  <select value={maxPerGroup} onChange={(e) => setMaxPerGroup(Number(e.target.value))}>
                    {[3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>{n}명</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <p className="book-help">
              {TEMP_MODES.find((m) => m.key === tempMode)?.note ?? ""}
            </p>
            </>
            )}
          </>
        )}
        </div>{/* .book-form-main */}
        </div>{/* .book-form-cols */}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button
            type="submit"
            className="btn-primary"
            /* 기본 모둠이 없는데 '기본 모둠'으로 만들면 빈 모둠만 생겨
               '활동 모둠'과 같아집니다 — 그 자리에서 막고 안내합니다. */
            disabled={
              (topicRequired && !topic.trim()) ||
              saving ||
              urlBad ||
              (fromBase && baseGroupCount === 0)
            }
          >
            {saving
              ? "만드는 중…"
              : !canGroup || perStudent
                ? "학생별 활동으로 만들기"
                : fromBase
                  ? baseGroupCount > 0
                    ? `기본 모둠 ${baseGroupCount}개로 만들기`
                    : "기본 모둠으로 만들기"
                  : `모둠 ${groupCount}개와 함께 만들기`}
          </button>
        </div>

        {warning && (
          <div className="modal-backdrop confirm-backdrop" onClick={() => setWarning(null)}>
            <div
              className="confirm-modal"
              role="alertdialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="confirm-icon-wrap">
                <span className="confirm-icon" aria-hidden="true">⚠️</span>
              </div>
              <h3 className="confirm-title">모둠 수와 이름 개수가 달라요</h3>
              <p className="confirm-desc">{warning}</p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="confirm-confirm"
                  onClick={() => setWarning(null)}
                  autoFocus
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
