"use client";

// =============================================================
// 반 전체에게 메일 — 제목·본문을 여기서 쓰고 선생님 메일 앱으로 넘깁니다
// -------------------------------------------------------------
// 앱이 메일을 부치지는 않습니다. 받는 사람·제목·본문을 채운 채로 선생님의
// 메일 앱(Gmail 등)을 열어 줄 뿐이고, 마지막 '보내기'는 선생님이 누릅니다.
//
// [왜 앱이 직접 안 보내나]
// 메일 발송은 Firebase가 해 주지 않아 외부 발송 서비스(SendGrid 등)를 붙여야
// 하고, 가입·API 키·발신 도메인 인증·함수 배포가 따라옵니다. 게다가 그렇게
// 보내면 발신자가 앱 주소가 되어 학생이 답장해도 아무도 못 봅니다.
// 이 방식은 준비할 것이 없고, 무엇보다 선생님 본인 주소로 나가서 답장이
// 선생님께 옵니다.
//
// [받는 사람은 숨은참조(BCC)]
// 학생 주소가 서로에게 보이면 안 됩니다. 받는 사람 칸에는 선생님 자신을
// 넣어 사본을 남기고, 학생은 전원 BCC로 넣습니다.
//
// [본문 길이 한계 — 이 화면의 가장 큰 제약]
// mailto 링크는 주소창 하나에 모든 내용을 싣는 방식이라 길이 제한이 있습니다
// (환경에 따라 2000자 안팎에서 잘림). 게다가 한글은 URL에서 한 글자가 9자를
// 차지해, 28명 기준 본문은 한글 110자 남짓이 한계입니다. 그래서 길어지면
// 본문을 클립보드에 복사해 두고 메일 앱은 제목·수신자만 채운 채로 엽니다 —
// 선생님은 붙여넣기 한 번만 하면 됩니다. 조용히 잘리는 것보다 낫습니다.
// =============================================================
import { useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";

// 안전하게 볼 mailto 전체 길이 — 환경마다 다르지만 2048자 근처에서 잘리는
// 곳이 있어 여유를 둡니다.
const URL_SAFE_LIMIT = 1800;

export default function ClassMailModal({
  roster = [],
  className = "",
  teacherEmail = "",
  onClose,
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [flash, setFlash] = useState("");

  // 이메일이 없는 학생은 보낼 수가 없습니다 — 몇 명이 빠지는지 밝혀 둡니다.
  const withMail = useMemo(() => roster.filter((s) => s.email), [roster]);
  const missing = roster.length - withMail.length;
  const bcc = useMemo(() => withMail.map((s) => s.email).join(","), [withMail]);

  const mailtoLen =
    encodeURIComponent(bcc).length +
    encodeURIComponent(subject).length +
    encodeURIComponent(body).length;
  const tooLong = mailtoLen > URL_SAFE_LIMIT;

  function say(msg) {
    setFlash(msg);
    setTimeout(() => setFlash(""), 3500);
  }

  async function copy(text, msg) {
    try {
      await navigator.clipboard.writeText(text);
      say(msg);
      return true;
    } catch {
      say("복사하지 못했어요. 아래 내용을 직접 선택해 복사해 주세요.");
      return false;
    }
  }

  // 메일 앱 열기 — 본문이 길면 본문만 빼고 열고, 대신 클립보드에 담아 둡니다.
  async function openMail() {
    const parts = [`bcc=${encodeURIComponent(bcc)}`];
    if (subject.trim()) parts.push(`subject=${encodeURIComponent(subject)}`);

    if (tooLong) {
      const ok = await copy(body, "본문이 길어 클립보드에 복사했어요. 메일 창에서 붙여넣기(Ctrl+V) 해 주세요.");
      if (!ok) return;
    } else if (body.trim()) {
      parts.push(`body=${encodeURIComponent(body)}`);
    }

    // 받는 사람 칸에는 선생님 자신 — 사본이 남고, 수신자가 비어 있어 거부하는
    // 메일 앱도 있습니다.
    window.location.href = `mailto:${encodeURIComponent(teacherEmail)}?${parts.join("&")}`;
  }

  const ready = withMail.length > 0;

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal classmail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="classmail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="classmail-title">
            📧 반 전체에게 메일
            {className && <span className="classmail-class">{className}</span>}
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <p className="classmail-note">
          선생님 메일 앱이 열리면서 받는 사람과 내용이 채워집니다.
          <b> 보내기는 메일 앱에서 직접</b> 눌러 주세요 — 선생님 주소로 나가고
          학생 답장도 선생님께 옵니다.
        </p>

        <div className="classmail-to">
          <span className="classmail-to-count">
            받는 사람 <b>{withMail.length}</b>명
          </span>
          <span className="classmail-to-hint">숨은참조(BCC) — 학생끼리 주소가 보이지 않아요</span>
          {missing > 0 && (
            <span className="classmail-to-warn">
              이메일이 없는 학생 {missing}명은 빠집니다
            </span>
          )}
        </div>

        {!ready ? (
          <p className="form-error" role="alert">
            이메일이 등록된 학생이 없어요. ‘반 관리하기’에서 학생 정보를 확인해 주세요.
          </p>
        ) : (
          <>
            <label className="classmail-field">
              <span>제목</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="예) 내일 수업 준비물 안내"
                maxLength={120}
              />
            </label>

            <label className="classmail-field">
              <span>본문</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="학생들에게 전할 내용을 적어 주세요."
                rows={8}
              />
            </label>

            {/* 길이 경고 — 조용히 잘리지 않게 미리 알려 줍니다 */}
            {tooLong && (
              <p className="classmail-longnote">
                본문이 길어서 메일 앱에 바로 못 싣습니다. <b>‘메일 앱 열기’를 누르면
                본문을 클립보드에 복사</b>해 두니, 열린 메일 창에서 붙여넣기(Ctrl+V) 해 주세요.
              </p>
            )}

            <div className="classmail-actions">
              <button type="button" className="classmail-copy" onClick={() => copy(bcc, `주소 ${withMail.length}개를 복사했어요.`)}>
                주소만 복사
              </button>
              <button type="button" className="classmail-send" onClick={openMail}>
                메일 앱 열기
              </button>
            </div>

            {flash && <p className="classmail-flash" role="status">{flash}</p>}
          </>
        )}
      </div>
    </div>
  );
}
