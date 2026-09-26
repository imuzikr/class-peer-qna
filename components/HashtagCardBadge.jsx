"use client";

// =============================================================
// 책방 활동 카드의 '새 댓글 n' — 여섯 개의 해시태그 · 학생 화면만
// -------------------------------------------------------------
// 내 해시태그 기록(문서 1건)과 거기 달린 댓글(postUid == 나)만 구독합니다. 해시태그
// 활동 카드에만, 학생에게만 달리므로 읽기는 그 활동 수만큼입니다.
// 알림 벨에 넣지 않은 까닭: 알림함은 본인만 쓰게 잠가 둔 자리라 학생끼리
// 서로의 알림함에 쓰려면 규칙이나 서버 함수가 하나 더 필요합니다.
// =============================================================
import { useEffect, useState } from "react";
import { subscribeMyHashtagPost, subscribeHashtagComments } from "@/lib/store";
import { newCommentCount } from "@/lib/hashtag";

export default function HashtagCardBadge({ activityId, uid }) {
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  useEffect(() => subscribeMyHashtagPost(activityId, uid, setPost), [activityId, uid]);
  useEffect(
    () => subscribeHashtagComments(activityId, setComments, { postUid: uid }),
    [activityId, uid]
  );
  const n = post ? newCommentCount(comments, uid, post.seenCommentsAt ?? null) : 0;
  if (n === 0) return null;
  return <span className="ht-card-new">새 댓글 {n}개</span>;
}
