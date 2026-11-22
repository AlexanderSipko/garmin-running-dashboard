import { Dumbbell, Footprints, Gauge, HeartPulse } from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtPace } from "../lib/format";

const runningMetrics = [
  { key: "runKm", label: "Дистанция", unit: "км", color: "#efa85f", dotClass: "bg-[#efa85f]", iconClass: "text-[#efa85f]", icon: Footprints },
  { key: "pace", label: "Темп", unit: "/км", color: "#90a9ff", dotClass: "bg-[#90a9ff]", iconClass: "text-[#90a9ff]", icon: Gauge },
  { key: "avgHr", label: "Пульс", unit: "bpm", color: "#f18491", dotClass: "bg-[#f18491]", iconClass: "text-[#f18491]", icon: HeartPulse },
];

function formatMetric(key, value) {
  if (value == null || !Number.isFinite(Number(value))) return "нет данных";
  if (key === "runKm") return `${Number(value).toFixed(1)} км`;
  if (key === "pace") return `${fmtPace(value)} /км`;
  return `${Math.round(value)} bpm`;
}

function CombinedTooltip({ active, label, payload, showRunning }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="period-chart-tooltip grid gap-[3px] py-[7px] px-[9px] [border:1px_solid_#46545b] rounded-[8px] [background:#202a30f2] [box-shadow:0_6px_16px_#00000038] text-[color:#dce5e9] text-[10px]">
      <b>{label}</b>
      {showRunning && runningMetrics.map((metric) => (
        <span className="combined-tooltip-row flex items-center gap-[6px] [&_i]:w-[7px] [&_i]:h-[7px] [&_i]:rounded-[50%]" key={metric.key}>
          <i className={`h-[7px] w-[7px] rounded-full ${metric.dotClass}`} />
          {metric.label}: {formatMetric(metric.key, point[metric.key])}
        </span>
      ))}
      {point.strengthCount != null && (
        <span className="combined-tooltip-row flex items-center gap-[6px] [&_i]:w-[7px] [&_i]:h-[7px] [&_i]:rounded-[50%]">
          <i className="h-[7px] w-[7px] rounded-full bg-[#a7b5ff]" />
          Силовые: {point.strengthCount}
        </span>
      )}
    </div>
  );
}

function MetricLegend({ data, metric }) {
  const latest = [...data].reverse().find((point) => point[metric.key] != null);
  const Icon = metric.icon;

  return (
    <div className="combined-chart-metric min-w-0 px-1 text-center sm:px-2">
      <span className="flex flex-wrap items-center justify-center gap-1 text-[11px] font-semibold text-[#aebbc0]">
        <Icon className={metric.iconClass} size={16} aria-hidden="true" />
        {metric.label}
      </span>
      <b className="mt-1 block break-words text-[clamp(14px,2vw,24px)] font-bold leading-tight tabular-nums text-[#e5ebee]">
        {latest ? formatMetric(metric.key, latest[metric.key]) : "—"}
      </b>
    </div>
  );
}

function StrengthTooltip({ active, label, payload }) {
  const count = payload?.[0]?.value;
  if (!active || count == null) return null;

  return (
    <div className="rounded-lg border border-[#46545b] bg-[#202a30f2] p-2.5 text-[11px] text-[#dce5e9]">
      <div>{label}</div>
      <div>Силовые: {count} занятий</div>
    </div>
  );
}

function TrendCard({ data }) {
  const latest = [...data].reverse().find((point) => point.strengthCount != null);

  return (
    <article className={[
      "period-trend-card trend-strengthCount min-w-0 pt-[10px] px-[9px] pb-1 [border:1px_solid_#303e45]",
      "rounded-[13px] [background:linear-gradient(155deg,_#1c262c,_#171f24_90%)] [&_>_header]:flex",
      "[&_>_header]:items-center [&_>_header]:gap-[5px] [&_>_header]:min-w-0",
      "[&_>_header]:text-[color:#adb9be] [&_>_header]:text-[9px] [&_>_header]:whitespace-nowrap",
      "[&_>_header_>_span]:overflow-hidden [&_>_header_>_span]:text-[ellipsis] [&_>_header_>_b]:ml-auto",
      "[&_>_header_>_b]:text-[color:#e5ebee] [&_>_header_>_b]:text-[10px] [&_>_header_>_b]:font-bold",
      "[&_>_header_svg]:text-[color:#a7b5ff]",
    ].join(" ")}>
      <header>
        <Dumbbell size={15} aria-hidden="true" />
        <span>Силовые тренировки</span>
        <b>{latest?.strengthCount ?? 0}</b>
      </header>
      <div className="period-trend-chart [.combined-running-chart_&]:h-[230px] [.combined-running-chart_&]:mt-[3px] w-full h-[120px] mt-1 max-[420px]:h-[110px] max-[420px]:[.combined-running-chart_&]:h-[185px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#ffffff10" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#8f9ea5", fontSize: 13 }} tickMargin={8} />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              cursor={{ stroke: "#ffffff35", strokeDasharray: "3 3" }}
              content={<StrengthTooltip />}
            />
            <Area type="monotone" dataKey="strengthCount" stroke="#a7b5ff" strokeWidth={2} fill="#a7b5ff" fillOpacity={0.12} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function PeriodTrends({ data, periodLabel, showRunning, showStrength, periodSummary }) {
  const isDailyChart = periodLabel.startsWith("Дни ·");
  return (
    <section className="period-trends flex min-w-0 flex-col gap-2.5" aria-label={`Динамика за ${periodLabel}`}>
      {showRunning && data.length > 0 && (
        <article className="period-trend-card combined-running-chart min-w-0 rounded-[13px] border border-[#36464d] bg-[radial-gradient(ellipse_at_15%_0%,_#efa85f0d,_transparent_42%),_linear-gradient(155deg,_#202b31,_#171f24_90%)] p-3">
          <div className="period-trend-chart [.combined-running-chart_&]:h-[230px] [.combined-running-chart_&]:mt-[3px] w-full h-[120px] mt-1 max-[420px]:h-[110px] max-[420px]:[.combined-running-chart_&]:h-[185px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 12, right: 8, left: 2, bottom: 0 }}>
                <defs>
                  {runningMetrics.map((metric) => (
                    <linearGradient key={metric.key} id={`combined-fill-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={metric.color} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={metric.color} stopOpacity={0.005} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} stroke="#ffffff10" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} tick={{ fill: "#aebbc0", fontSize: 14, fontWeight: 600 }} tickMargin={9} />
                <YAxis yAxisId="distance" hide domain={[0, "dataMax + 2"]} />
                <YAxis yAxisId="pace" hide orientation="right" reversed domain={["dataMin - 30", "dataMax + 30"]} />
                <YAxis yAxisId="heart" hide orientation="right" domain={["dataMin - 8", "dataMax + 8"]} />
                <Tooltip content={<CombinedTooltip showRunning={showRunning} />} cursor={{ stroke: "#ffffff35", strokeDasharray: "3 3" }} />
                {isDailyChart ? <YAxis yAxisId="strength" hide orientation="right" allowDecimals={false} domain={[0, "dataMax + 1"]} /> : null}
                {isDailyChart
                  ? <Bar yAxisId="distance" dataKey="runKm" name="Бег, км" fill="#efa85f" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                  : <Area yAxisId="distance" type="monotone" dataKey="runKm" name="Дистанция" stroke="#efa85f" strokeWidth={2.5} fill="url(#combined-fill-runKm)" connectNulls={false} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />}
                {isDailyChart && <Bar yAxisId="strength" dataKey="strengthCount" name="Силовые" fill="#91a6ff" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />}
                {!isDailyChart && <Line yAxisId="pace" type="monotone" dataKey="pace" name="Темп" stroke="#90a9ff" strokeWidth={2.5} connectNulls={false} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />}
                {!isDailyChart && <Line yAxisId="heart" type="monotone" dataKey="avgHr" name="Пульс" stroke="#f18491" strokeWidth={2.5} connectNulls={false} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </article>
      )}

      {isDailyChart && periodSummary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Итоги выбранного месяца">
          {[
            ["За месяц", `${periodSummary.distanceKm.toFixed(1)} км`],
            ["Средний темп", periodSummary.pace == null ? "—" : `${fmtPace(periodSummary.pace)} /км`],
            ["Средний пульс", periodSummary.heartRate == null ? "—" : `${periodSummary.heartRate} bpm`],
            ["Силовые", String(periodSummary.strengthCount)],
          ].map(([label, value]) => (
            <div className="rounded-lg border border-[#34424a] bg-[#202a30] px-3 py-2.5" key={label}>
              <span className="block text-[12px] text-[#aebbc0]">{label}</span>
              <b className="mt-1 block text-[18px] font-bold text-[#e5ebee]">{value}</b>
            </div>
          ))}
        </div>
      )}

      {showStrength && !isDailyChart && data.length > 0 && <TrendCard data={data} />}
      {!showRunning && !showStrength && (
        <p className="period-trends-empty m-0 text-[color:var(--muted)] text-[12px]">Включи бег или силовые, чтобы увидеть динамику.</p>
      )}
    </section>
  );
}

export default PeriodTrends;
