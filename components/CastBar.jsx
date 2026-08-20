"use client";

// =============================================================
// 방송 상태 막대 (곁텍스트 읽기 · RAFT 글쓰기 교사 화면 공용)
// -------------------------------------------------------------
// 지금 누구의 어느 영역을 학생 화면에 띄우고 있는지 늘 보여 주고,
// 이전/다음으로 영역을 옮기거나 방송을 끝낼 수 있게 합니다.
//
// 영역을 옮길 때 방송이 잠깐 꺼지지 않습니다 — 방송 문서를 새 내용으로
// 덮어쓰기만 하므로 학생 화면이 곧바로 다음 영역으로 바뀝니다.
// =============================================================
import { eulReul } from "@/lib/korean";

export default function CastBar({ who, label, index, total, onPrev, onNext, onStop }) {
  // 영역 이름에 따라 을/를이 달라집니다 ('제목를'이 아니라 '제목을')
  const josa = eulReul(label).slice(label.length);
  return (
    <div className="cast-bar" role="status">
      <span className="broadcast-live-dot" aria-hidden="true" />
      <span className="cast-bar-text">
        <strong>{who}</strong>님의 <strong>{label}</strong>{josa} 학생 화면에 띄우는 중
        <span className="cast-bar-step">{index + 1} / {total}</span>
      </span>
      <div className="cast-bar-actions">
        <button type="button" className="btn-ghost" onClick={onPrev} disabled={!onPrev}>
          ← 이전 영역
        </button>
        <button type="button" className="btn-ghost" onClick={onNext} disabled={!onNext}>
          다음 영역 →
        </button>
        <button type="button" className="btn-primary cast-bar-stop" onClick={onStop}>
          방송 끝내기
        </button>
      </div>
    </div>
  );
}
