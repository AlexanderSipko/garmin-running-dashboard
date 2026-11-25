import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const series = [
  { sport: "running", key: "runKm", label: "Бег", unit: "км", color: "#efa85f", axis: "distance" },
  { sport: "cycling", key: "cyclingKm", label: "Велосипед", unit: "км", color: "#8de0cc", axis: "distance" },
  { sport: "strength", key: "strengthCount", label: "Силовые", unit: "зан.", color: "#a7b5ff", axis: "count" },
];

export default function CombinedYearTrends({ data, selectedTypes }) {
  const visible = series.filter(({ sport }) => selectedTypes.includes(sport));
  if (!visible.length) return <p className="text-xs text-slate-400">Выбери вид тренировки, чтобы увидеть динамику.</p>;

  return (
    <section className="min-w-0 rounded-xl border border-[#34424a] bg-[#19242b] p-2 sm:p-3" aria-label="Общая динамика за год">
      <div className="h-44 min-w-0 sm:h-60">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 3, bottom: 0, left: 3 }}>
            <CartesianGrid vertical={false} stroke="#ffffff15" />
            <XAxis dataKey="label" tick={{ fill: "#aebbc0", fontSize: 11 }} minTickGap={9} axisLine={false} tickLine={false} />
            <YAxis yAxisId="distance" hide domain={[0, "auto"]} />
            <YAxis yAxisId="count" hide allowDecimals={false} domain={[0, "auto"]} />
            <Tooltip content={({ active, label, payload }) => active && payload?.length ? (
              <div className="rounded-lg border border-[#46545b] bg-[#202a30] px-3 py-2 text-xs">
                <b>{label}</b>
                {payload.map(({ dataKey, value }) => {
                  const metric = visible.find(({ key }) => key === dataKey);
                  return <div key={dataKey} style={{ color: metric.color }}>
                    {metric.label}: {metric.axis === "distance" ? Number(value).toFixed(1) : value} {metric.unit}
                  </div>;
                })}
              </div>
            ) : null} />
            {visible.map(({ key, color, axis }) => (
              <Line key={key} dataKey={key} yAxisId={axis} type="monotone" stroke={color}
                strokeWidth={2.5} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs">
        {visible.map(({ key, label, unit, color }) => (
          <li key={key} style={{ color }}>━ {label}, {unit}</li>
        ))}
      </ul>
    </section>
  );
}
