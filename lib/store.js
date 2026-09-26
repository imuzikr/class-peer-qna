// =============================================================
// 데이터 레이어 (Firestore ↔ 데모 모드 자동 전환)
// -------------------------------------------------------------
// 화면(컴포넌트)은 이 파일의 함수만 호출합니다.
// - Firebase 설정이 완료되면 → Firestore에 실시간 저장/구독
// - 설정 전이면              → 브라우저 메모리에 임시 저장(데모 모드)
//
// [Firestore 데이터 구조] — 사용자별 구분을 위해 모든 문서에
// authorId(uid)를 저장합니다. 나중에 인증을 붙이면 이 값만
// 실제 로그인 유저의 uid로 바뀝니다.
//
//   questions (컬렉션)
//     └ { title, content, keyword, authorId, authorName,
//         authorEmoji, authorRealName,
//         answerCount, meTooIds, createdAt }
//        · meTooIds: "나도 궁금해요"를 누른 사용자 uid 배열.
//          uid가 이미 있으면 추가되지 않으므로 1인 1회가 보장되고,
//          배열 길이가 곧 클릭 수가 됩니다.
//        · authorName은 익명 닉네임, authorRealName은 실제 이름.
//          실명은 관리자(교사)가 프로필을 클릭할 때만 화면에 보입니다.
//       └ answers (하위 컬렉션)
//           └ { content, authorId, authorName, createdAt }
//   notices (컬렉션)
//     └ { title, content, authorId, authorName, createdAt }
// =============================================================
//
// [파일 나누기] 한 파일이 7천 줄을 넘어 lib/data/ 아래 영역별 파일로
// 나눴습니다. 이 파일은 **다시 내보내기만** 합니다 — 화면은 지금까지처럼
// `import { … } from "@/lib/store"`로 씁니다. 새 함수는 알맞은 영역 파일에
// 두고 **여기 목록에도 한 줄 더하세요**(안 더하면 화면에서 안 보입니다).
// 영역 파일끼리 나눠 쓰는 비공개 도우미는 일부러 여기 올리지 않습니다.
// =============================================================

// 날짜·시각 순수 함수(lib/dates.js) — 예전부터 여기서 가져가던 이름
export { toDate, todayDateKey, formatTime, formatClockMs, formatStampMs } from "./dates";
// 자리 수(lib/seats.js)
export { STUDY_SEAT_COUNT } from "./seats";

export { DEFAULT_KEYWORDS, KEYWORDS } from "./data/shared";
export {
  subscribeKeywords, addKeyword, renameKeyword, deleteKeyword, reorderKeywords,
} from "./data/keywords";
export {
  subscribeQuestions, subscribeMyQuestions, subscribeQuestionsByKeywords, addQuestion,
  updateQuestion, deleteQuestion, setQuestionPinned, setQuestionResolved,
  setQuestionResolvedLater, addReflection, setUnderstoodAnswer, setMeToo, subscribeAnswers,
  addAnswer, updateAnswer, deleteAnswer, setAnswerReaction, subscribeNotices, addNotice,
  deleteNotice, subscribeQuestionsByAuthors, subscribeMyAnswerEvents, fetchAnswerCounts,
} from "./data/questions";
export {
  fetchClass, MARQUEE_MAX, MARQUEE_TEXT_MAX, marqueeOf, setAppMarquee, subscribeAppMarquee,
  subscribeClass, subscribeClasses, setClassPyTarget, setClassTask, classTaskOf,
  fetchStudyBoard, reorderClasses, addClass, renameClass, startClassAttendance,
  stopClassAttendance, archiveClass, unarchiveClass, regenerateJoinCode,
  subscribeJoinCodes, findClassByCode, joinClass, ensureClassIdSynced,
  fetchClassRosterProfiles, fetchStudentClassIds, addStudentToClass,
  removeStudentFromClass, subscribeMyMemberships, deleteClass,
} from "./data/classes";
export {
  subscribeStudyBoards, fetchTrashedStudyBoards, subscribeStudyCards,
  subscribeMyGroupCards, composeStudyGroups, fetchStudyCardsOnce, subscribeStudyCard,
  subscribeMyStudyCards, subscribeCardsForBoards, addStudyBoard, ensureDefaultStudyBoard,
  reorderStudyBoards, duplicateStudyBoard, subscribeMyStudyTemplates, addStudyTemplate,
  deleteStudyTemplate, startStudyTemplateInClass, createStudyProjectInClass,
  updateStudyTemplate, syncTemplateActivities, syncTemplateLinks, updateStudyBoard,
  deleteStudyBoard, restoreStudyBoard, purgeStudyBoard, addStudyCard, updateStudyCard,
  CARD_REACTION_FIELDS, setCardReaction, deleteStudyCard,
} from "./data/study";
export {
  REWARD_STAR, REWARD_MAX, subscribeClassMembers, subscribeAllRewards,
  subscribeRewardsForClasses, subscribeClassRewards, subscribeStudentRewardTotal,
  subscribeMyClassRewardCount, setStudentReward, addStudentReward,
  subscribeStudentRewardEvents, subscribeStudentRewardEventsForClasses,
  subscribeClassRewardEvents, subscribeTodayRewardEvents,
} from "./data/rewards";
export {
  subscribeMyNotifications, markNotificationRead, markAllNotificationsRead,
  sendClassNotice, subscribeClassNotices, pruneOldNotifications,
} from "./data/notifications";
export {
  markStudyAttendance, subscribeMyStudyAttendance, subscribeClassStudyAttendance,
  dailySeatLayoutId, saveStudySeatLayout, subscribeStudySeatLayout,
  saveStudyGroupAssignment, subscribeStudyGroupAssignment,
} from "./data/attendance";
export {
  subscribeStudentNotes, subscribeClassNoteCounts, addStudentNote, updateStudentNote,
  deleteStudentNote,
} from "./data/studentNotes";
export {
  LESSON_MEMO_HISTORY, LESSON_MEMO_CALENDAR, lessonMemoDate, lessonMemoPages, pagesText,
  lessonMemoProgress, subscribeLessonMemos, LESSON_TOPIC_MAX, LESSON_PAGES_MAX,
  LESSON_PAGE_MAX, addLessonMemo, updateLessonMemo, deleteLessonMemo,
} from "./data/lessonMemos";
export {
  CORNELL_LIMITS, CORNELL_MATERIAL_MAX, fetchBoardHandouts, cornellNoteId,
  subscribeMyCornellNote, saveCornellNote, subscribeMyCornellNotes,
  subscribeClassCornellNotesOn, subscribeStudentCornellNotes, saveCornellFeedback,
  CORNELL_RECENT_DAYS, invalidateMyRecentCornellNotes, fetchMyRecentCornellNotes,
  markCornellNoteRewarded, isCornellRewarded, isCornellFeedbackUnread,
  markCornellFeedbackSeen,
} from "./data/cornell";
export {
  subscribeMyTodayKwl, subscribeAllKwl, fetchAllKwlOnce, invalidateKwlDays, fetchKwlDays,
  fetchKwlUserDays, subscribeMyAllKwl, subscribeUserKwl, subscribeKwlAll,
  subscribeKwlForClasses, addKwl, saveKwlsActivityEntry, subscribeActivityKwl, deleteKwl,
  updateKwl,
} from "./data/kwl";
export {
  getDirectoryUser, getDirectoryRealName, subscribeUserDirectory, updateMyProfile,
  updateStudentProfile, assignUserRole, approveTeacherRequest, dismissTeacherRequest,
  requestWithdrawal, dismissWithdrawalRequest, deleteStudent,
} from "./data/users";
export {
  subscribeMyLessons, DEFAULT_LESSON_ACTIVITIES, addLesson, updateLesson, deleteLesson,
  recordLessonTaught,
  subscribeBroadcast, startBroadcast, stopBroadcast, PRESENCE_BEAT_MS, PRESENCE_STALE_MS,
  NOTING_WINDOW_MS, reportPresence, subscribePresence,
} from "./data/lessons";
export {
  subscribeQuestionSignals, subscribeMyQuestionSignal, setQuestionSignal,
  confirmQuestionSignal, subscribeClassSignalEvents, dismissQuestionSignal,
} from "./data/signals";
export {
  BOOK_GROUP_MODES, BOOK_ACTIVITY_TYPES, BOOK_SOLO_TYPES, BOOK_GROUPABLE_TYPES,
  BOOK_STUDENT_TOPIC_TYPES, subscribeBookActivities, addBookActivity, renameBookActivity,
  updateBookActivity, deleteBookActivity, restoreBookActivity, purgeBookActivity,
  subscribeBookGroups, composeBookGroups, addSoloBookBoards, joinBookGroup, leaveBookGroup,
  setBookGroupTopic, subscribeGroupWords, addConsonantWord, deleteConsonantWord,
  subscribeParatextEntries, fetchBookActivity, fetchBookActivities, fetchMyBookEntry,
  subscribeMyParatextEntry, saveParatextTopic, saveParatextEntry, peerReviewId,
  subscribeMyPeerReviews, subscribeReceivedPeerReviews, subscribeAllPeerReviews,
  savePeerReview, deletePeerReview, setPeerReviewLocked,
} from "./data/books";
export {
  memoPairKey, subscribeMyGroupMemos, subscribeMyUnreadMemos, sendGroupMemo,
  markGroupMemoRead, deleteGroupMemo,
} from "./data/groupMemos";
