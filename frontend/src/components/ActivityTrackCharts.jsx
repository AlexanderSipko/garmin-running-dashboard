import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtPace } from "../lib/format";
import { normalizeTrackPoints } from "../lib/activityTrackData";

function formatDistanceTick(distanceMeters) {
  return Number.isFinite(distanceMeters) ? (distanceMeters / 1000).toFixed(1) : "";
}

function TrackTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="activity-track-tooltip grid gap-1 py-[7px] px-[9px] [border:1px_solid_#46545b] rounded-[8px] [background:#202a30f2] text-[color:#dce5e9] text-[10px]">
      <b>{(point.distance_meters / 1000).toFixed(2)} км</b>
      {point.pace_seconds_per_km != null && <span>Темп: {fmtPace(point.pace_seconds_per_km)} /км</span>}
      {point.heart_rate_bpm != null && <span>Пульс: {Math.round(point.heart_rate_bpm)} уд/мин</span>}
      {point.power_watts != null && <span>Мощность: {Math.round(point.power_watts)} Вт</span>}
    </div>
  );
}

function TrackChart({ points, hasPace, hasPulse, hasPower }) {
  return (
    <article className="activity-track-card min-w-0 py-[10px] px-[10px] pb-[7px] border border-[color:var(--border)] rounded-[11px] [background:color-mix(in_srgb,_var(--panel)_75%,_var(--bg))] [&_>_header]:flex [&_>_header]:items-center [&_>_header]:justify-between [&_>_header]:gap-2 [&_>_header]:text-[color:var(--soft)] [&_>_header]:text-[14px] [&_>_header_b]:text-[color:var(--text)] [&_>_header_b]:text-[14px] [&_>_small]:block [&_>_small]:text-right [&_>_small]:text-[color:var(--muted)] [&_>_small]:text-[11px]">
      <header className="flex-wrap">
        <span>По дистанции</span>
        <div className="flex flex-wrap gap-x-3 text-xs">
          {hasPace && <span className="text-[#a7b8ff]">Темп</span>}
          {hasPulse && <span className="text-[#f49aa4]">Пульс</span>}
          {hasPower && <span className="text-[#ffc988]">Мощность, Вт</span>}
        </div>
      </header>
      <div className="activity-track-plot w-full h-[250px] mt-[8px] max-[600px]:h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 12, right: 12, bottom: 0, left: 12 }}>
            <CartesianGrid vertical={false} stroke="#ffffff12" />
            <XAxis
              dataKey="distance_meters"
              type="number"
              domain={[0, "dataMax"]}
              tickFormatter={formatDistanceTick}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#aebbc0", fontSize: 12 }}
              tickMargin={7}
              minTickGap={24}
            />
            <Tooltip content={<TrackTooltip />} cursor={{ stroke: "#ffffff40", strokeDasharray: "3 3" }} />
            {hasPower && <YAxis yAxisId="power" orientation="right" domain={[0, "auto"]} tick={{ fill: "#ffc988", fontSize: 12 }} width={34} />}
            {hasPower && (
              <Line yAxisId="power" type="linear" dataKey="power_watts" stroke="#ffc988" strokeWidth={2}
                dot={false} connectNulls={false} isAnimationActive={false} />
            )}
            {hasPace && <YAxis yAxisId="pace" orientation="left" reversed domain={["dataMin - 30", "dataMax + 30"]} tick={{ fill: "#a7b8ff", fontSize: 12 }} tickFormatter={(value) => fmtPace(value)} width={42} />}
            {hasPulse && <YAxis yAxisId="hr" orientation="right" domain={["dataMin - 8", "dataMax + 8"]} tick={{ fill: "#f49aa4", fontSize: 12 }} width={36} />}
            {hasPace && <Line yAxisId="pace" type="monotone" dataKey="pace_seconds_per_km" stroke="#90a9ff" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />}
            {hasPulse && <Line yAxisId="hr" type="monotone" dataKey="heart_rate_bpm" stroke="#f18491" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <small>Дистанция, км</small>
    </article>
  );
}

function ActivityTrackCharts({ points }) {
  const normalizedPoints = normalizeTrackPoints(points);
  const hasPace = normalizedPoints.some((point) => point.pace_seconds_per_km != null);
  const hasPulse = normalizedPoints.some((point) => point.heart_rate_bpm != null);
  const hasPower = normalizedPoints.filter((point) => point.power_watts != null).length >= 2;
  if (!hasPace && !hasPulse && !hasPower) return null;

  return (
    <section className="activity-track-charts min-w-0 mt-4 [&_>_h5]:mt-0 mx-0 mb-[9px] [&_>_h5]:text-[color:var(--text)] [&_>_h5]:text-[12px]" aria-label="Графики тренировки по дистанции">
      <h5>Детали по дистанции</h5>
      <div className="grid min-w-0 grid-cols-1 gap-3">
        <TrackChart points={normalizedPoints} hasPace={hasPace} hasPulse={hasPulse} hasPower={hasPower} />
      </div>
    </section>
  );
}

export default ActivityTrackCharts;
