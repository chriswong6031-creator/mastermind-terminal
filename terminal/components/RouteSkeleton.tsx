// Instant on-brand frame shown during route navigation (rendered by each segment's loading.tsx)
// while its server component fetches. Themed via tokens, so it matches dark/light. The real page
// mounts over it; a brief layout settle is acceptable in exchange for never flashing a blank screen.
const box = (style: React.CSSProperties, i = 0) => (
  <span key={i} className="skel-box" style={{ animationDelay: `${(i % 6) * 0.09}s`, ...style }} />
);

export default function RouteSkeleton() {
  return (
    <div className="skel" aria-busy="true" aria-label="Loading">
      <div className="skel-top">
        {box({ width: 130, height: 22 })}
        {box({ width: 170, height: 30 }, 1)}
        <span style={{ flex: 1 }} />
        {box({ width: 118, height: 30 }, 2)}
        {box({ width: 30, height: 30, borderRadius: 999 }, 3)}
      </div>
      <div className="skel-nav">{Array.from({ length: 6 }).map((_, i) => box({ width: 40, height: 40 }, i))}</div>
      <div className="skel-main">
        {box({ width: 240, height: 26 })}
        {box({ flex: 1, minHeight: 0 }, 4)}
        {box({ height: 110 }, 2)}
      </div>
    </div>
  );
}
