import SectionEyebrow from "./SectionEyebrow";
import { fmtPace } from "../lib/format";

const SERIES = [
  { key: "km", label: "Километраж", className: "distance", colorClass: "text-[#9fd75e]" },
  { key: "pace", label: "Темп", className: "pace", colorClass: "text-[#6db8e5]" },
  { key: "hr", label: "Пульс", className: "heart", colorClass: "text-[#ec8e7e]" },
];

const CHART = { width: 720, height: 230, left: 26, right: 18, top: 20, bottom: 34 };

function WeeklyTrendChart({ data, period }) {
  const pointsBySeries = SERIES.map((series) => ({
    ...series,
    values: data.map((week) => {
      const value = week[series.key];
      return value == null || !Number.isFinite(Number(value))
        ? null
        : Number(value);
    }),
  }));

  return (
    <section className="weekly-trend-card p-[18px] mb-3 [border:1px_solid_var(--border)] rounded-[11px] [background:var(--panel)] max-[460px]:py-[13px] px-[10px]">
      <header className="card-heading [&_h2]:[font:600_14px_Manrope,_sans-serif] [&_h2]:tracking-[-0.25px] [&_h2]:mt-1 mx-0 mb-0 flex justify-between items-center [&_h2]:mt-1">
        <div>
          <SectionEyebrow>
            {period === "week"
              ? "ПОСЛЕДНИЕ ЧЕТЫРЕ НЕДЕЛИ"
              : "НЕДЕЛИ ВЫБРАННОГО МЕСЯЦА"}
          </SectionEyebrow>
          <h2>Как меняется бег</h2>
        </div>
      </header>

      <div className="trend-legend grid grid-cols-[repeat(3,_minmax(0,_1fr))] gap-2 mt-[17px] mx-0 mb-2 max-[460px]:grid-cols-[1fr] max-[460px]:gap-[6px]">
        {pointsBySeries.map((series) => {
          const latest = [...series.values].reverse().find((value) => value != null);
          return (
            <div className={`trend-legend-item ${series.className} grid min-w-0 grid-cols-[9px_minmax(0,_1fr)] items-center gap-x-2 gap-y-[3px] p-[9px] px-[10px] border border-[color:var(--border)] rounded-[9px] [background:color-mix(in_srgb,_var(--bg)_75%,_var(--panel))] ${series.colorClass} [&_i]:row-span-2 [&_i]:w-2 [&_i]:h-2 [&_i]:rounded-full [&_i]:bg-current [&_span]:text-[color:var(--muted)] [&_span]:text-[11px] [&_b]:text-[color:var(--text)] [&_b]:text-[13px] [&_b]:tabular-nums [&_b]:whitespace-nowrap`} key={series.key}>
              <i />
              <span>{series.label}</span>
              <b>{formatTrendValue(series.key, latest)}</b>
            </div>
          );
        })}
      </div>

      <TrendPlot data={data} series={pointsBySeries} />

      <div className="weekly-trend-values pt-[11px] mt-[7px] [border-top:1px_solid_var(--border)]">
        <span className="trend-values-label text-[color:var(--muted)] text-[10px] tracking-[0.8px]">ТОЧНЫЕ ЗНАЧЕНИЯ ПО НЕДЕЛЯМ</span>
        <div className="trend-value-grid grid grid-cols-[repeat(auto-fit,_minmax(105px,_1fr))] gap-2 mt-[9px] max-[460px]:gap-[3px]">
          {data.map((week) => (
            <div
              className={[
                "trend-value-column flex flex-col gap-[5px] p-[9px] rounded-[7px]",
                "[background:color-mix(in_srgb,_var(--panel)_65%,_var(--bg))] text-[11px] tabular-nums [&_b]:mb-[2px]",
                "[&_b]:text-[color:var(--muted)] [&_b]:text-[10px] [&_b]:font-medium",
                "[&_span:nth-of-type(1)]:text-[color:#9fd75e] [&_span:nth-of-type(2)]:text-[color:#6db8e5]",
                "[&_span:nth-of-type(3)]:text-[color:#ec8e7e] max-[460px]:gap-1 max-[460px]:py-[6px] px-1",
                "max-[460px]:text-[10px] max-[460px]:[&_b]:text-[9px]",
              ].join(" ")}
              key={week.weekStart.toISOString()}
            >
              <b>{week.label}</b>
              <span>{week.km.toFixed(1)} км</span>
              <span>{week.pace ? `${fmtPace(week.pace)} /км` : "— /км"}</span>
              <span>{week.hr ? `${week.hr} bpm` : "— bpm"}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="chart-scale-note mt-[9px] mx-0 mb-0 text-[color:var(--muted)] text-[10px] leading-[1.5]">
        Линии показывают динамику каждого показателя отдельно; цифры ниже —
        фактические значения.
      </p>
    </section>
  );
}

function TrendPlot({ data, series }) {
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const xForIndex = (index) =>
    data.length === 1
      ? CHART.left + plotWidth / 2
      : CHART.left + (plotWidth * index) / Math.max(1, data.length - 1);

  return (
    <svg
      className="weekly-trend-chart block w-full h-[225px] overflow-visible rounded-[10px] [background:color-mix(in_srgb,_var(--bg)_79%,_var(--panel))] max-[460px]:h-[190px]"
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      role="img"
      aria-label="Динамика километража, темпа и пульса по неделям"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((step) => {
        const y = CHART.top + plotHeight * step;
        return (
          <line
            className="trend-chart-gridline [stroke:color-mix(in_srgb,_var(--border)_82%,_transparent)] stroke-[1]"
            key={step}
            x1={CHART.left}
            x2={CHART.width - CHART.right}
            y1={y}
            y2={y}
          />
        );
      })}

      {series.map((item) => {
        const points = scalePoints(item.values, xForIndex);
        const visiblePoints = points.filter(Boolean);
        if (!visiblePoints.length) return null;

        return (
          <g className={`trend-chart-series ${item.className} ${item.colorClass} [&_path]:fill-none [&_path]:[stroke:currentColor] [&_path]:stroke-[3.5] [&_path]:[stroke-linecap:round] [&_path]:[stroke-linejoin:round] [&_circle]:fill-current [&_circle]:[stroke:var(--bg)] [&_circle]:[stroke-width:3]`} key={item.key}>
            <path d={smoothPath(visiblePoints)} />
            {visiblePoints.map((point, visibleIndex) => {
              const dataIndex = points.indexOf(point);
              const value = item.values[dataIndex];
              return (
                <circle cx={point.x} cy={point.y} r="4.5" key={`${dataIndex}-${visibleIndex}`}>
                  <title>
                    {data[dataIndex].label}: {formatTrendValue(item.key, value)}
                  </title>
                </circle>
              );
            })}
          </g>
        );
      })}

      {data.map((week, index) => (
        <text
          className="trend-chart-week-label [fill:var(--muted)] [font:11px_'DM_Sans',_sans-serif]"
          key={week.weekStart.toISOString()}
          x={xForIndex(index)}
          y={CHART.height - 8}
          textAnchor="middle"
        >
          {week.label}
        </text>
      ))}
    </svg>
  );
}

function scalePoints(values, xForIndex) {
  const visible = values.filter((value) => value != null);
  if (!visible.length) return [];

  const min = Math.min(...visible);
  const max = Math.max(...visible);
  const spread = max - min;
  const padding = spread * 0.18;
  const low = min - padding;
  const high = max + padding;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;

  return values.map((value, index) => {
    if (value == null) return null;
    const relative = spread === 0 ? 0.5 : (high - value) / (high - low);
    return {
      x: xForIndex(index),
      y: CHART.top + relative * plotHeight,
    };
  });
}

function formatTrendValue(key, value) {
  if (value == null) return "нет данных";
  if (key === "km") return `${value.toFixed(1)} км`;
  if (key === "pace") return `${fmtPace(value)} /км`;
  return `${Math.round(value)} bpm`;
}

function smoothPath(points) {
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const dx = point.x - previous.x;
    return `${path} C ${previous.x + dx / 3} ${previous.y}, ${
      previous.x + (dx * 2) / 3
    } ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

export default WeeklyTrendChart;
