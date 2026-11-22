import SectionEyebrow from "./SectionEyebrow";
function DistanceChart({
  data,
  title = "Дистанция по дням",
  palette = "lime",
}) {
  const max = Math.max(1, ...data.map((x) => x.km));
  const w = 600,
    h = 160,
    gap = w / Math.max(1, data.length);
  const coords = data.map(
    (d, i) =>
      `${Math.round(gap * i + gap / 2)},${h - 15 - (d.km / max) * (h - 35)}`
  );
  const points = coords.join(" ");
  return (
    <article className={`chart-card chart-${palette} min-w-0 py-[15px] px-[17px] border border-[color:var(--border)] rounded-[11px] bg-[color:var(--panel)]`}>
      <div className="card-heading [&_h2]:[font:600_14px_Manrope,_sans-serif] [&_h2]:tracking-[-0.25px] [&_h2]:mt-1 mx-0 mb-0 flex justify-between items-center [&_h2]:mt-1">
        <div>
          <SectionEyebrow>ДИНАМИКА</SectionEyebrow>
          <h2>{title}</h2>
        </div>
        <span className="chart-legend flex items-center gap-[6px] text-[color:var(--muted)] text-[9px] [&_i]:w-[7px] [&_i]:h-[7px] [&_i]:rounded-[50%] [&_i]:[background:var(--accent)]">
          <i />
          км
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className={[
          "distance-chart block w-full h-[135px] mt-[9px] overflow-visible [&_line]:[stroke:var(--border)]",
          "[&_line]:[stroke-dasharray:3_4] [&_polyline]:[stroke:var(--accent)] [&_polyline]:stroke-[2.5]",
          "[&_polyline]:[stroke-linejoin:round] [&_polyline]:[stroke-linecap:round]",
          "[&_circle]:[fill:var(--accent)] [&_text]:[fill:var(--muted)]",
          "[&_text]:[font:9px_'DM_Sans',_sans-serif] [.theme-coach_.chart-blue_&_polyline]:[stroke:#7694b7]",
          "[.theme-coach_.chart-blue_&_circle]:[fill:#7694b7]",
          "[.theme-calendar_.chart-amber_&_polyline]:[stroke:#e5aa62]",
          "[.theme-calendar_.chart-amber_&_circle]:[fill:#e5aa62]",
        ].join(" ")}
      >
        <line x1="0" x2={w} y1={h - 15} y2={h - 15} />
        <polyline
          points={points}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        {data.map((d, i) => (
          <g key={i}>
            <circle
              cx={gap * i + gap / 2}
              cy={h - 15 - (d.km / max) * (h - 35)}
              r="3.5"
            />
            <text x={gap * i + gap / 2} y={h - 1} textAnchor="middle">
              {d.label}
            </text>
          </g>
        ))}
      </svg>
    </article>
  );
}

export default DistanceChart;
