export default function SeatGrid({ children, className = "", scrollClassName = "", ariaLabel = "자리표" }) {
  return (
    <div
      className={`seat-pairs-scroll ${scrollClassName}`}
      role="region"
      aria-label={ariaLabel}
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
