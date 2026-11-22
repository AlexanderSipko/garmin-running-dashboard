import { fmtPace } from "../lib/format";

function SplitPaceChart({ splits }) {
  const chartSplits = splits
    .map((split, index) => ({
      ...split,
      index: split.index || index + 1,
      pace: Number(
        split.pace_seconds_per_km || split.paceSecondsPerKm || split.pace || 0
      ),
    }))
    .filter((split) => split.pace > 0);

  if (!chartSplits.length) return null;

  const width = 720;
  const height = 190;
  const left = 54;
  const right = 18;
  const top = 16;
  const bottom = 34;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const fastest = Math.min(...chartSplits.map((split) => split.pace));
  const slowest = Math.max(...chartSplits.map((split) => split.pace));
  const spread = slowest - fastest;
  const padding = spread ? Math.max(8, spread * 0.2) : 20;
  const low = fastest - padding;
  const high = slowest + padding;
  const points = chartSplits.map((split, index) => ({
    x:
      chartSplits.length === 1
        ? left + plotWidth / 2
        : left + (plotWidth * index) / (chartSplits.length - 1),
    y: top + ((split.pace - low) / (high - low)) * plotHeight,
    split,
  }));
  const path = points.reduce((result, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const distanceX = point.x - previous.x;
    return `${result} C ${previous.x + distanceX / 3} ${previous.y}, ${
      previous.x + (distanceX * 2) / 3
    } ${point.y}, ${point.x} ${point.y}`;
  }, "");

  return (
    <div className="split-pace-chart mt-2 mx-0 mb-[13px] pt-[10px] px-[10px] pb-[6px] [border:1px_solid_var(--border)] rounded-[10px] [background:color-mix(in_srgb,_var(--panel)_70%,_var(--bg))] [&_svg]:block [&_svg]:w-full [&_svg]:h-[190px] [&_svg]:overflow-visible">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="График темпа по километровым отрезкам"
      >
        {[0, 0.5, 1].map((position) => {
          const y = top + plotHeight * position;
          const pace = low + (high - low) * position;
          return (
            <g key={position}>
              <line className="split-chart-gridline [stroke:var(--border)] [stroke-dasharray:4_5]" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="split-chart-axis-label [fill:var(--muted)] [font:11px_'DM_Sans',_sans-serif]" x={left - 8} y={y + 4} textAnchor="end">
                {fmtPace(pace)}
              </text>
            </g>
          );
        })}
        <path className="split-pace-line [fill:none] [stroke:var(--accent)] stroke-[3.5] [stroke-linecap:round] [stroke-linejoin:round]" d={path} />
        {points.map(({ x, y, split }, index) => (
          <g key={`${split.index}-${index}`}>
            <circle className="split-pace-dot [fill:var(--accent)] [stroke:var(--panel)] stroke-[3]" cx={x} cy={y} r="5" />
            <text className="split-chart-km-label [font:11px_'DM_Sans',_sans-serif] [fill:var(--text)] font-semibold" x={x} y={height - 10} textAnchor="middle">
              {split.index} км
            </text>
            <title>
              {split.index} км · {fmtPace(split.pace)} /км
            </title>
          </g>
        ))}
      </svg>
      <div className="split-chart-caption pt-1 px-[5px] pb-0 text-[color:var(--muted)] text-[11px]">Быстрее ↑</div>
    </div>
  );
}

export default SplitPaceChart;
