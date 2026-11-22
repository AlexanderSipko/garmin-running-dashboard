import { Heart, HeartPulse, Scale, Moon, Wind } from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { hasMetricValue, hasWellnessForDay, localDateKey } from "../lib/wellnessDates";

const metrics = [
  { key: "sleep", label: "Сон", unit: "ч", icon: Moon, color: "sleep", iconClass: "text-[#b9a4ff]", digits: 1 },
  { key: "stress", label: "Стресс", unit: "уровень", icon: Wind, color: "stress", iconClass: "text-[#efa85f]", digits: 0 },
  { key: "hrv", label: "ВЧП", unit: "мс", icon: HeartPulse, color: "hrv", iconClass: "text-[#ef8490]", digits: 0 },
  { key: "weight", label: "Вес", unit: "кг", icon: Scale, color: "weight", iconClass: "text-[#8bb7ed]", digits: 1 },
];

const dailyMetrics = [
  ...metrics,
  { key: "resting_hr", label: "Пульс покоя", unit: "уд/мин", icon: Heart, iconClass: "text-[#f3ad92]", digits: 0 },
  { key: "vo2_max", label: "VO₂ макс.", unit: "мл/кг/мин", digits: 1 },
];
const dayLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "short" });

function rollingHrv(day, measurements) {
  const values = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(day.getFullYear(), day.getMonth(), day.getDate() - offset);
    const measurement = measurements.get(localDateKey(date));
    if (measurement != null) values.push(measurement);
  }
  if (!values.length) return null;
  return {
    value: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    count: values.length,
  };
}

function DayMetric({ label, icon: Icon, iconClass, value, unit, digits = 0, rule, average, note }) {
  const hasTrend = value != null && rule && average != null;
  const delta = hasTrend ? value - average : 0;
  const changed = hasTrend && Math.abs(delta) >= rule.tolerance;
  const isGood = changed && (rule.higherIsBetter ? delta > 0 : delta < 0);

  return (
    <div className="grid min-w-0 content-start gap-1 px-2.5 py-2 odd:border-r odd:border-[#95acb326] [&:nth-child(n+3)]:border-t [&:nth-child(n+3)]:border-[#95acb326]" title={note}>
      <dt className="flex items-center gap-1.5 text-[11px] font-medium leading-tight text-[#bbc8cd]">
        {Icon && <Icon size={13} className={`shrink-0 ${iconClass}`} aria-hidden="true" />}
        {label}
      </dt>
      <dd className="flex flex-wrap items-baseline gap-x-1 text-base font-bold leading-tight tabular-nums text-[#e5ebee]">
        {value == null ? "—" : value.toFixed(digits)}
        {value != null && <small className="text-[10px] font-medium text-[#a8b7be]">{unit}</small>}
        {hasTrend && (
          <span className={`text-xs ${changed ? (isGood ? "text-[#78d6a0]" : "text-[#f18491]") : "text-[#9aa8ad]"}`}
            aria-label={changed ? (delta > 0 ? "выше среднего" : "ниже среднего") : "около среднего"}
            title={`Среднее за 8 дней: ${average.toFixed(digits)} ${unit}`}>
            {!changed ? "↔" : delta > 0 ? "↑" : "↓"}
          </span>
        )}
      </dd>
    </div>
  );
}

function RecentWellness({ wellness }) {
  const today = new Date();
  const hasToday = hasWellnessForDay(wellness, localDateKey(today));
  const firstDayOffset = hasToday ? 0 : 1;
  const days = Array.from({ length: 8 }, (_, index) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - firstDayOffset - index)
  );
  const dateKeys = new Set(days.map(localDateKey));
  const valuesByMetric = Object.fromEntries(dailyMetrics.map(({ key }) => [
    key,
    new Map((wellness?.metrics?.[key] || [])
      .filter(({ date, value }) => dateKeys.has(date) && hasMetricValue(value))
      .map(({ date, value }) => [date, Number(value)])),
  ]));
  const hrvHistory = new Map((wellness?.metrics?.hrv || [])
    .filter(({ value }) => hasMetricValue(value))
    .map(({ date, value }) => [date, Number(value)]));
  const rollingHrvByDay = new Map(
    days.map((day) => [localDateKey(day), rollingHrv(day, hrvHistory)])
  );
  const trendRules = {
    sleep: { tolerance: 0.5, higherIsBetter: true },
    hrv: { tolerance: 5, higherIsBetter: true },
    resting_hr: { tolerance: 2, higherIsBetter: false },
  };
  const averages = Object.fromEntries(Object.entries(trendRules).map(([key]) => {
    const values = [...valuesByMetric[key].values()];
    return [key, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null];
  }));
  return (
    <section className="mb-4" aria-label="Показатели здоровья за последние 8 дней">
      <h2 className="mb-2 text-[15px] font-bold">Здоровье · 8 последних дней</h2>
      <div className="mb-2 h-[150px] w-full rounded-lg border border-[#3b4a50] bg-[#202c31] p-2" aria-label="График сна, среднего ВЧП за 7 дней и пульса покоя">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={[...days].reverse().map((day) => {
            const date = localDateKey(day);
            return {
              label: day.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
              sleep: valuesByMetric.sleep.get(date) ?? null,
              hrvAverage: rollingHrvByDay.get(date)?.value ?? null,
              restingHr: valuesByMetric.resting_hr.get(date) ?? null,
            };
          })} barCategoryGap="38%" barGap={2} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="wellness-sleep-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#b9a4ff" stopOpacity={0.34} />
                <stop offset="100%" stopColor="#b9a4ff" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="wellness-hrv-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef8490" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ef8490" stopOpacity={0.035} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#ffffff12" />
            <XAxis
              dataKey="label"
              interval={0}
              axisLine={false}
              tickLine={false}
              tick={({ x, y, payload, index }) => [0, 7].includes(index) ? (
                <text x={x} y={y + 10} textAnchor="middle" fill="#aebbc0" fontSize={10}>
                  {String(payload.value).split(" ")[0]}
                </text>
              ) : null}
            />
            <YAxis yAxisId="sleep" hide domain={["dataMin - 1", "dataMax + 1"]} />
            <YAxis yAxisId="hrv" hide orientation="right" domain={["dataMin - 8", "dataMax + 8"]} />
            <YAxis yAxisId="resting" hide orientation="right" domain={["dataMin - 8", "dataMax + 8"]} />
            <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
              <div className="rounded-md border border-[#46545b] bg-[#202a30f2] p-2 text-[11px] text-[#dce5e9]">
                <b>{label}</b>
                {payload.map(({ dataKey, value }) => <div key={dataKey}>{dataKey === "sleep" ? `Сон: ${Number(value).toFixed(1)} ч` : dataKey === "hrvAverage" ? `ВЧП за 7 дней: ${Math.round(value)} мс` : `Пульс покоя: ${Math.round(value)} уд/мин`}</div>)}
              </div>
            ) : null} />
            <Area yAxisId="sleep" dataKey="sleep" name="Сон" type="monotone" stroke="#b9a4ff" strokeWidth={2} fill="url(#wellness-sleep-area)" connectNulls={false} isAnimationActive={false} />
            <Area yAxisId="hrv" dataKey="hrvAverage" name="ВЧП за 7 дней" type="monotone" stroke="#ef8490" strokeWidth={2} fill="url(#wellness-hrv-area)" connectNulls={false} isAnimationActive={false} />
            <Line yAxisId="resting" dataKey="restingHr" name="ЧСС покоя" type="monotone" stroke="#f3ad92" strokeWidth={2} dot={{ r: 1.5, fill: "#f3ad92" }} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mb-2 flex flex-wrap gap-x-3 text-[10px] text-[color:var(--muted)]" aria-label="Легенда графика"><span className="text-[#b9a4ff]">▬ Сон, ч</span><span className="text-[#ef8490]">▬ ВЧП за 7 дней</span><span className="text-[#f3ad92]">━ ЧСС покоя</span></div>
      <div className="grid gap-2 sm:max-[760px]:grid-cols-2">
        {days.map((day) => {
          const date = localDateKey(day);
          const available = dailyMetrics.filter(({ key }) => key !== "hrv" && valuesByMetric[key].has(date));
          const nightlyHrv = valuesByMetric.hrv.get(date);
          const hrvAverage = rollingHrvByDay.get(date);
          const showHrv = nightlyHrv != null || hrvAverage != null;

          return (
            <article key={date} className="rounded-xl border border-[#3b4a50] bg-linear-to-br from-[#23333a] via-[#202c31] to-[#1a272d] p-2.5">
              <time dateTime={date} className="mb-2 block text-sm font-bold capitalize">{dayLabel.format(day)}</time>
              {available.length || showHrv ? (
                <dl className="grid grid-cols-2 border-t border-[#95acb326]">
                  {showHrv && <>
                    <DayMetric label="ВЧП за ночь" icon={HeartPulse} iconClass="text-[#ef8490]"
                      value={nightlyHrv} unit="мс" rule={trendRules.hrv} average={averages.hrv} />
                    <DayMetric label="ВЧП за 7 дней" icon={HeartPulse} iconClass="text-[#ef8490]"
                      value={hrvAverage?.value} unit="мс"
                      note={hrvAverage ? `Есть замеры за ${hrvAverage.count} из 7 дней` : undefined} />
                  </>}
                  {available.map((metric) => (
                    <DayMetric key={metric.key} label={metric.label} icon={metric.icon}
                      iconClass={metric.iconClass} value={valuesByMetric[metric.key].get(date)}
                      unit={metric.unit} digits={metric.digits}
                      rule={trendRules[metric.key]} average={averages[metric.key]} />
                  ))}
                </dl>
              ) : (
                <p className="text-xs text-[color:var(--muted)]">Нет данных</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function YearHealthPanel({ wellness }) {
  return (
    <aside className={[
      "year-health-panel min-w-0 self-start min-[761px]:sticky min-[761px]:top-0 min-[761px]:max-h-dvh min-[761px]:overflow-y-auto py-[14px] px-[12px]",
      "[border-left:1px_solid_var(--border)]",
      "[background:radial-gradient(ellipse_at_top_right,_#344a3e55,_transparent_58%)]",
      "max-[760px]:[grid-column:1_/_-1]",
      "max-[760px]:[border-top:1px_solid_var(--border)] max-[760px]:[border-left:0]",
    ].join(" ")} aria-label="Показатели здоровья за неделю">
      <RecentWellness wellness={wellness} />
    </aside>
  );
}

export default YearHealthPanel;
