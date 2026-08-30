import "./globals.css";

export const metadata = {
  title: "배움나눔 — 우리 반 질문/답변 게시판",
  description: "공부하다 막히는 내용을 서로 묻고 답하는 학습 커뮤니티",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

// 랜딩 깜빡임 막기 — 첫 페인트 '전에' 실행되어야 해서 인라인 스크립트입니다.
// -------------------------------------------------------------
// / 는 정적으로 미리 만들어진 HTML이라 브라우저가 받자마자 랜딩을 그립니다.
// 그런데 로그인 여부는 Firebase가 IndexedDB에서 세션을 복원한 뒤에야 알 수
// 있어서(하이드레이션보다도 나중), 이미 로그인한 사람도 랜딩을 한 번 보고
// 나서 /board로 넘어갔습니다. React의 useEffect로 가려도 HTML이 이미 칠해진
// 뒤라 늦습니다 — 그래서 <head>에서 동기로 실행되는 이 스크립트가 필요합니다.
//
// 지난 접속에서 남긴 힌트(lib/auth.js)가 있으면 <html>에 표시를 달고,
// 그 표시가 있는 동안 랜딩을 숨깁니다(app/globals.css). 표시는 인증이
// 확정되는 순간 app/page.js가 지웁니다.
//
// 안전장치: 인증이 끝내 응답하지 않아도(네트워크 두절 등) 화면이 영영 빈
// 채로 남으면 안 되므로, 3초 뒤에는 스스로 표시를 지워 랜딩을 보여 줍니다.
// 깜빡임을 없애려다 페이지를 못 쓰게 만드는 쪽이 훨씬 나쁩니다.
const AUTH_PENDING_SCRIPT = `
try {
  if (localStorage.getItem("bn_had_session") === "1" && location.pathname === "/") {
    document.documentElement.setAttribute("data-auth-pending", "");
    setTimeout(function () {
      document.documentElement.removeAttribute("data-auth-pending");
    }, 3000);
  }
} catch (e) {}
`;

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: AUTH_PENDING_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
