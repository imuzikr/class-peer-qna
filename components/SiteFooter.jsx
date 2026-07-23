"use client";

// =============================================================
// 사이트 푸터 — 랜딩·약관 페이지 하단 공통
// -------------------------------------------------------------
// 3열: [브랜드(로고+소개)] [정책 및 약관] [문의] + 하단 저작권 바.
// 아이콘은 앱 공용(StatusIcons) 재사용: 정책 항목=칠판(공부방),
// 문의=연필(질문하기), 소속=학교(학습 공간).
// 연락처·소속은 아래 상수에서 수정하세요.
// =============================================================
import Link from "next/link";
import { IconLogo, IconBlackboard, IconWrite, IconSchool } from "./StatusIcons";

const CONTACT_EMAIL = "iseoul72@gmail.com"; // 문의 이메일
const AFFILIATION = "서울특별시교육청 소속"; // 소속 표기

export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        {/* 브랜드 */}
        <div className="footer-brand">
          <div className="footer-brand-head">
            <span className="footer-logo" aria-hidden="true">
              <IconLogo size={26} />
            </span>
            <strong>배움나눔</strong>
          </div>
          <p className="footer-tagline">
            함께 묻고 답하며 성장하는 우리들의 공부방
            <br />
            수업 속 질문과 배움을 실시간으로 나누는 교실 Q&amp;A
          </p>
        </div>

        {/* 정책 및 약관 */}
        <div className="footer-col">
          <h4>정책 및 약관</h4>
          <Link href="/privacy" className="footer-link">
            <IconBlackboard size={17} /> 개인정보처리방침
          </Link>
          <Link href="/terms" className="footer-link">
            <IconBlackboard size={17} /> 이용약관
          </Link>
        </div>

        {/* 문의 */}
        <div className="footer-col">
          <h4>문의</h4>
          <a className="footer-link" href={`mailto:${CONTACT_EMAIL}`}>
            <IconWrite size={17} /> {CONTACT_EMAIL}
          </a>
          <span className="footer-link footer-link--static">
            <IconSchool size={17} /> {AFFILIATION}
          </span>
        </div>
      </div>

      {/* 하단 저작권 바 */}
      <div className="site-footer-bottom">
        <span>© {year} 배움나눔. All rights reserved.</span>
        <span className="footer-bottom-links">
          <Link href="/privacy">개인정보처리방침</Link>
          <span className="footer-sep" aria-hidden="true">|</span>
          <Link href="/terms">이용약관</Link>
        </span>
      </div>
    </footer>
  );
}
