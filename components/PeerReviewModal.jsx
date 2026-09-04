"use client";

// =============================================================
// 동료 평가 — 모둠 친구의 발표를 듣고 한 마디 (학생)
// -------------------------------------------------------------
// 왼쪽에 모둠원 이름, 오른쪽에 그 친구에게 쓰는 칸입니다. 발표를 들으며
// 이름을 눌러 옮겨 다닙니다 — 발표가 이어지는 동안 창을 여닫지 않게.
//
// 한 친구에게 한 장만 쓰고 그 장을 고쳐 씁니다. 이미 쓴 친구의 이름에는
// 점이 붙어, 누구를 아직 안 썼는지 이름줄만 보고 압니다.
//
// 무엇을 쓸지 막막하지 않도록 세 갈래를 적어 둡니다(감상 · 질문 · 평가).
// 칸을 셋으로 나누지는 않았습니다 — 나누면 세 칸을 다 채워야 할 것 같아
// 한 줄도 못 쓰는 학생이 생깁니다. 안내만 하고 칸은 하나입니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import RichTextEditor from "./RichTextEditor";
import { savePeerReview, deletePeerReview, peerReviewId } from "@/lib/store";
import { richHtml, stripHtml } from "@/lib/html";
import { MEMBER_COLORS } from "@/lib/bookColors";
import { IconLock } from "./StatusIcons";

const HINTS = [
  { key: "감상", text: "어떤 점이 좋았나요? 인상 깊은 대목은?" },
  { key: "질문", text: "더 듣고 싶은 것, 궁금한 것은?" },
  { key: "평가", text: "더 나아지려면 무엇을 보태면 좋을까요?" },
];

export default function PeerReviewModal({
  activity,
  group,
  members = [],   // 모둠원 (나 포함)
  user,
  myReviews = [], // 내가 쓴 것 (fromUid == 나)
  initialUid = null,
  locked = false, // 교사가 잠갔거나 활동이 잠긴 상태
  onClose,
}) {
  const mates = useMemo(
    () => members.filter((m) => m?.uid && m.uid !== user?.uid),
    [members, user?.uid]
  );
  const [pickedUid, setPickedUid] = useState(initialUid ?? mates[0]?.uid ?? null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFor, setSavedFor] = useState(null); // 방금 저장한 대상 uid

  const written = useMemo(() => {
    const map = new Map();
    myReviews.forEach((r) => map.set(r.toUid, r));
    return map;
  }, [myReviews]);

  const picked = mates.find((m) => m.uid === pickedUid) ?? null;
  const existing = pickedUid ? written.get(pickedUid) ?? null : null;

  // 사람을 바꾸면 그 친구에게 쓴 글을 불러옵니다(에디터는 initialHtml을
  // 처음 한 번만 읽으므로, key로 갈아 끼워 다시 만듭니다).
  useEffect(() => {
    setDraft(existing?.html ?? "");
    setSavedFor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedUid]);

  const empty = !stripHtml(draft).trim();

  async function save() {
    if (!picked || empty || locked || saving) return;
    setSaving(true);
    try {
      await savePeerReview(activity.id, user, {
        toUid: picked.uid,
        toName: picked.name ?? "",
        groupId: group?.id,
        html: draft,
      });
      setSavedFor(picked.uid);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!picked || !existing || locked || saving) return;
    setSaving(true);
    try {
      await deletePeerReview(activity.id, picked.uid, user.uid);
      setDraft("");
      setSavedFor(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal peer-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>
            동료 평가
            <span className="peer-head-group">
              {group?.groupName || `${group?.groupIndex ?? ""}모둠`}
            </span>
          </h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {mates.length === 0 ? (
          <p className="empty-note">모둠에 아직 다른 친구가 없어요.</p>
        ) : (
          <div className="peer-body">
            {/* 누구에게 쓸지 — 발표를 들으며 이름을 눌러 옮겨 다닙니다 */}
            <div className="peer-people">
              {mates.map((m, i) => {
                const color = MEMBER_COLORS[
                  (members.findIndex((x) => x.uid === m.uid) + MEMBER_COLORS.length) %
                    MEMBER_COLORS.length
                ];
                const on = m.uid === pickedUid;
                return (
                  <button
                    key={m.uid}
                    type="button"
                    className={`peer-person${on ? " on" : ""}`}
                    style={on ? { borderColor: color.border, background: color.bg, color: color.text } : undefined}
                    onClick={() => setPickedUid(m.uid)}
                  >
                    <span>{m.name || "이름 미설정"}</span>
                    {/* 이미 쓴 친구 — 누구를 아직 안 썼는지 한눈에 */}
                    {written.has(m.uid) && <i className="peer-done-dot" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            <div className="peer-write">
              <p className="peer-hints">
                {HINTS.map((h) => (
                  <span key={h.key}>
                    <b>{h.key}</b> {h.text}
                  </span>
                ))}
              </p>

              {locked ? (
                <>
                  <p className="book-locked-note">
                    <IconLock size={15} /> 지금은 동료 평가가 잠겨 있어요. 쓴 것은 그대로 남아 있습니다.
                  </p>
                  {existing ? (
                    <div
                      className="peer-read"
                      dangerouslySetInnerHTML={{ __html: richHtml(existing.html) }}
                    />
                  ) : (
                    <p className="empty-note">이 친구에게는 아직 쓰지 않았어요.</p>
                  )}
                </>
              ) : (
                <RichTextEditor
                  key={pickedUid ?? "none"}
                  className="peer-editor"
                  initialHtml={existing?.html ?? ""}
                  onChange={(html) => {
                    setDraft(html);
                    setSavedFor(null);
                  }}
                  placeholder={`${picked?.name ?? "친구"}에게 한 마디 — 들으며 떠오른 것을 적어 보세요`}
                  /* 간단한 서식만 — 발표를 들으며 쓰는 자리라 도구가 많으면
                     쓰는 일보다 고르는 일이 커집니다. */
                  tools={["bold", "underline", "insertUnorderedList"]}
                />
              )}

              <div className="peer-actions">
                {existing && !locked && (
                  <button type="button" className="btn-ghost peer-del" onClick={remove}>
                    지우기
                  </button>
                )}
                <span className="peer-state">
                  {savedFor === pickedUid
                    ? "저장했어요"
                    : existing
                      ? "고쳐 쓰는 중"
                      : ""}
                </span>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={save}
                  disabled={empty || locked || saving}
                >
                  {saving ? "저장 중…" : existing ? "고쳐 쓰기" : "저장"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 받은 코멘트 목록 — 학생 화면 아래와 교사의 학생 상세에서 같이 씁니다.
export function PeerReviewList({ reviews = [], title = "친구들이 남긴 한 마디" }) {
  if (reviews.length === 0) return null;
  return (
    // id — 모둠 줄의 '받은 한 마디'가 여기로 데려다 줍니다(글이 길어
    // 스스로 찾아 내려가기 어렵습니다)
    <section className="peer-received" id="peer-received">
      <h4>{title}</h4>
      <div className="peer-received-list">
        {reviews.map((r) => (
          <article key={r.id ?? peerReviewId(r.toUid, r.fromUid)} className="peer-card">
            <header>{r.fromName || "친구"}</header>
            <div dangerouslySetInnerHTML={{ __html: richHtml(r.html) }} />
          </article>
        ))}
      </div>
    </section>
  );
}
