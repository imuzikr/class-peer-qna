"use client";

// =============================================================
// 그리기 캔버스 모달
// -------------------------------------------------------------
// 마우스·터치로 자유롭게 그리거나(펜/지우개), 도형 도구를 선택해
// 드래그하면 사각형·원·직선·화살표를 삽입할 수 있습니다.
// 도형은 드래그하는 동안 실시간 미리보기가 표시됩니다.
// '그림 첨부'를 누르면 캔버스 내용이 이미지(data URL)로 변환되어
// 질문 작성 폼의 첨부 이미지로 들어갑니다.
// =============================================================
import { useEffect, useRef, useState } from "react";

const COLORS = ["#1f2333", "#e5484d", "#4f6ef7", "#16a34a", "#f59e0b"];
const SIZES = [
  { label: "가늘게", value: 3 },
  { label: "보통", value: 6 },
  { label: "굵게", value: 12 },
];
const TOOLS = [
  { id: "pen", label: "✏️ 펜" },
  { id: "rect", label: "⬜ 사각형" },
  { id: "ellipse", label: "⚪ 원" },
  { id: "line", label: "╱ 직선" },
  { id: "arrow", label: "↗ 화살표" },
  { id: "eraser", label: "🧽 지우개" },
];

export default function DrawingCanvas({ onSave, onClose }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null); // 펜/지우개: 직전 좌표
  const startPos = useRef(null); // 도형: 드래그 시작 좌표
  const snapshot = useRef(null); // 도형 미리보기용 캔버스 백업
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1].value);

  const isShapeTool = ["rect", "ellipse", "line", "arrow"].includes(tool);

  // 처음에 흰 배경으로 채움 (JPEG 저장 시 검은 배경 방지)
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);

  // 화면 좌표 → 캔버스 내부 좌표 변환 (마우스/터치 공용)
  function getPos(e) {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return {
      x: ((p.clientX - rect.left) * c.width) / rect.width,
      y: ((p.clientY - rect.top) * c.height) / rect.height,
    };
  }

  function setStroke(ctx) {
    ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
    ctx.lineWidth = tool === "eraser" ? size * 4 : size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  // 시작점(a) → 끝점(b)으로 도형 그리기
  function drawShape(ctx, a, b) {
    setStroke(ctx);
    ctx.beginPath();
    if (tool === "rect") {
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      return;
    }
    if (tool === "ellipse") {
      ctx.ellipse(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        Math.abs(b.x - a.x) / 2,
        Math.abs(b.y - a.y) / 2,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      return;
    }
    // 직선 (화살표도 몸통은 직선)
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    if (tool === "arrow") {
      // 화살촉: 선 끝에서 양쪽으로 30도 벌어진 두 획
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const head = Math.max(14, size * 3);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(
        b.x - head * Math.cos(angle - Math.PI / 6),
        b.y - head * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(
        b.x - head * Math.cos(angle + Math.PI / 6),
        b.y - head * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
    }
  }

  function start(e) {
    drawing.current = true;
    const p = getPos(e);
    last.current = p;
    startPos.current = p;
    if (isShapeTool) {
      // 미리보기를 위해 현재 화면을 백업해 둠
      const c = canvasRef.current;
      snapshot.current = c
        .getContext("2d")
        .getImageData(0, 0, c.width, c.height);
    }
  }

  function move(e) {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const p = getPos(e);

    if (isShapeTool) {
      // 백업을 복원한 뒤 현재 드래그 위치까지의 도형을 그림 → 미리보기
      ctx.putImageData(snapshot.current, 0, 0);
      drawShape(ctx, startPos.current, p);
      return;
    }

    // 펜/지우개: 직전 좌표에서 현재 좌표까지 선을 이어 그림
    setStroke(ctx);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }

  function end() {
    drawing.current = false;
    snapshot.current = null; // 도형 확정 (마지막 미리보기가 그대로 남음)
  }

  function clearAll() {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
  }

  function handleSave() {
    onSave(canvasRef.current.toDataURL("image/jpeg", 0.85));
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-canvas" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>🎨 그리기</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        {/* 도구 모음 */}
        <div className="canvas-toolbar">
          <div className="color-row">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch ${
                  tool !== "eraser" && color === c ? "active" : ""
                }`}
                style={{ background: c }}
                onClick={() => {
                  setColor(c);
                  if (tool === "eraser") setTool("pen");
                }}
                aria-label={`색상 ${c}`}
              />
            ))}
          </div>

          <div className="tool-row">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn-ghost ${tool === t.id ? "tool-active" : ""}`}
                onClick={() => setTool(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="tool-row">
            {SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`btn-ghost ${size === s.value ? "tool-active" : ""}`}
                onClick={() => setSize(s.value)}
              >
                {s.label}
              </button>
            ))}
            <button type="button" className="btn-ghost" onClick={clearAll}>
              🗑 전체 지우기
            </button>
          </div>
        </div>

        {/* 그리기 영역 */}
        <canvas
          ref={canvasRef}
          width={800}
          height={500}
          className="draw-canvas"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />

        <div className="canvas-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn-primary" onClick={handleSave}>
            ✓ 그림 첨부
          </button>
        </div>
      </div>
    </div>
  );
}
