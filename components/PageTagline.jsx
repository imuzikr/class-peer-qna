// '작은 변화로 시작하는 성장의 기록' — 각 화면 제목 곁의 문구.
// 예전에는 상단바 로고 옆에 있었는데, 이동 메뉴가 로고 옆으로 올라가면서
// 제목 곁으로 옮겼습니다(공부방·책방 제목 위, 질문방 '전체 질문 n개' 왼쪽).
// 글자를 세 곳에 따로 적으면 한 곳만 고쳤을 때 문구가 둘이 되므로 여기 하나.
export const PAGE_TAGLINE = "작은 변화로 시작하는 성장의 기록";

export default function PageTagline({ className = "" }) {
  return <p className={`page-tagline${className ? ` ${className}` : ""}`}>{PAGE_TAGLINE}</p>;
}
