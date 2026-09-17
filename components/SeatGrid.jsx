export default function SeatGrid({ children, className = "" }) {
  return (
    <div
      className="seat-pairs-scroll"
      role="region"
      aria-label="자리표"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          event.currentTarget.scrollLeft += event.key === "ArrowRight" ? 64 : -64;
        }
      }}
      onFocus={(event) => {
        if (event.target !== event.currentTarget) {
          event.target.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      }}
    >
      <div className={`seat-pairs-grid ${className}`}>
        {children}
      </div>
    </div>
  );
}
