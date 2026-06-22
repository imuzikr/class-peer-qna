"use client";
// 궁금해요 / 해결됐어요 / 답변 수 아이콘
import { useId } from "react";

export function IconAsk({ size = 20, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M6.4 6.7c1.25-1.1 3.05-1.7 5.1-1.7 4.25 0 7 2.35 7 5.75s-2.75 5.75-7 5.75c-.72 0-1.4-.07-2.03-.21L6.7 18.4c-.42.32-1.01-.03-.92-.55l.48-2.75C5.13 14.07 4.5 12.58 4.5 10.75c0-1.66.66-3.07 1.9-4.05Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.28 9.34c.16-.73.82-1.24 1.65-1.24 1 0 1.7.62 1.7 1.5 0 .68-.36 1.08-1.04 1.47-.57.33-.77.59-.77 1.12v.17"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
      <path
        d="M11.85 14.27h.01"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <path
        d="M18.92 4.25 19.2 5c.04.11.13.2.24.24l.75.28-.75.28a.45.45 0 0 0-.24.24l-.28.75-.28-.75a.45.45 0 0 0-.24-.24l-.75-.28.75-.28a.45.45 0 0 0 .24-.24l.28-.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconAnswer({ size = 20, className = "" }) {
  const id = useId().replace(/:/g, "");
  const bubble = `ias-bubble-${id}`;
  const glow   = `ias-glow-${id}`;
  const shadow = `ias-shadow-${id}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={bubble} x1="5.2" y1="4.4" x2="18.8" y2="19.9" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF3EA" />
          <stop offset=".52" stopColor="#F6C7B8" />
          <stop offset="1" stopColor="#D9826A" />
        </linearGradient>
        <linearGradient id={glow} x1="6" y1="5" x2="18" y2="19" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C7B6FF" />
          <stop offset="1" stopColor="#FFB2C8" />
        </linearGradient>
        <filter id={shadow} x="2" y="3" width="20" height="19" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" floodColor="#B65F4C" floodOpacity=".18" />
        </filter>
      </defs>
      <path d="M5.92 6.56c1.35-1.18 3.34-1.83 5.7-1.83 4.45 0 7.35 2.3 7.35 5.78 0 3.5-2.9 5.8-7.35 5.8-.7 0-1.38-.06-2-.18l-2.9 2.34c-.56.45-1.36-.03-1.24-.74l.53-3.05c-1.12-1.03-1.74-2.46-1.74-4.17 0-1.58.57-2.95 1.65-3.95Z" fill={`url(#${bubble})`} filter={`url(#${shadow})`} />
      <path d="M7.5 8.05c1-.84 2.47-1.28 4.12-1.28 3.2 0 5.2 1.48 5.2 3.74 0 .78-.24 1.48-.68 2.06" stroke="#FFF9F4" strokeWidth="1.12" strokeLinecap="round" />
      <path d="M9.12 10.86h5.76M9.12 13.05h3.92" stroke="#9E5F55" strokeWidth="1.28" strokeLinecap="round" />
      <path d="M17.52 3.08 18.1 4.5c.08.2.24.36.44.44l1.42.58-1.42.59a.82.82 0 0 0-.44.44l-.58 1.42-.59-1.42a.82.82 0 0 0-.44-.44l-1.42-.59 1.42-.58c.2-.08.36-.24.44-.44l.59-1.42Z" fill={`url(#${glow})`} />
      <circle cx="5.04" cy="4.98" r="1.05" fill="#BFAEFF" opacity=".92" />
      <circle cx="19.6" cy="16.35" r=".82" fill="#FFE092" opacity=".95" />
      <path d="M6.4 6.7c1.25-1.1 3.05-1.7 5.1-1.7 4.25 0 7 2.35 7 5.75s-2.75 5.75-7 5.75c-.72 0-1.4-.07-2.03-.21L6.7 18.4c-.42.32-1.01-.03-.92-.55l.48-2.75C5.13 14.07 4.5 12.58 4.5 10.75c0-1.66.66-3.07 1.9-4.05Z" stroke="#3A312E" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.72 9.15h5.58M8.72 11.45h5.58M8.72 13.75h3.28" stroke="#3A312E" strokeWidth="1.55" strokeLinecap="round" />
      <circle cx="18.65" cy="5.35" r="1.75" fill="#8A6258" />
    </svg>
  );
}

export function IconSolved({ size = 20, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M6.4 6.7c1.25-1.1 3.05-1.7 5.1-1.7 4.25 0 7 2.35 7 5.75s-2.75 5.75-7 5.75c-.72 0-1.4-.07-2.03-.21L6.7 18.4c-.42.32-1.01-.03-.92-.55l.48-2.75C5.13 14.07 4.5 12.58 4.5 10.75c0-1.66.66-3.07 1.9-4.05Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m8.95 11.05 2.05 2.05 4.18-4.48"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.92 4.25 19.2 5c.04.11.13.2.24.24l.75.28-.75.28a.45.45 0 0 0-.24.24l-.28.75-.28-.75a.45.45 0 0 0-.24-.24l-.75-.28.75-.28a.45.45 0 0 0 .24-.24l.28-.75Z"
        fill="currentColor"
      />
    </svg>
  );
}
