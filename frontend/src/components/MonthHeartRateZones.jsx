import { Bar, BarChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { demoWeekHeartRateZones } from "../data/demoDashboard";
import useMonthZoneDetails from "../hooks/useMonthZoneDetails";
import ZoneDurationSummary, { zoneColors as zones } from "./ZoneDurationSummary";
import ZoneCoverageExclusions from "./ZoneCoverageExclusions";
import { DeloadLegend, deloadAreaStyle, getDeloadRanges, MonthAxisTick } from "./MonthChartDeload";

const format = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const exclusionReasons = {
  summary_only: "Пульс известен, но недостаточно точек для расчёта времени по зонам.",
  no_pulse: "В загруженных деталях нет записей пульса.",
};

export default function MonthHeartRateZones({ monthStart, calendarDays, demo, onActivityUpdated }) {
  const { data, busy, error, load } = useMonthZoneDetails({
    monthStart, endpoint: "month-zones", enabled: !demo, onlyIfMissing: true, onActivityUpdated,
  });

  const days = calendarDays.map(({ label, runCount, runSeconds, deloadWeek }) => {
    const entry = demo ? demoWeekHeartRateZones(runCount, runSeconds)
      : data?.days?.[`${monthStart.slice(0, 7)}-${label.padStart(2, "0")}`];
    return {
      label, entry, deloadWeek,
      ...Object.fromEntries(Object.entries(entry?.seconds_by_zone || {}).map(([zone, seconds]) => [zone, seconds / 60])),
      "Вне зон": (entry?.outside_seconds || 0) / 60,
    };
  });
  const coveredMinutes = days.reduce((sum, { entry }) => sum + (entry?.covered_seconds || 0) / 60, 0);
  const totals = zones.map(([zone, color]) => ({
    zone, color, minutes: days.reduce((sum, day) => sum + (day[zone] || 0), 0),
  }));
  const hasData = coveredMinutes > 0;
  const deloadRanges = getDeloadRanges(calendarDays);
  const daysByLabel = new Map(calendarDays.map((day) => [day.label, day]));
  return (
    <div className="min-w-0 rounded-xl border border-[#34424a] bg-[#19242b] p-3">
      {(hasData || deloadRanges.length > 0) && <>
        <div className="h-48 min-w-0 sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 5, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#ffffff15" />
              <XAxis dataKey="label" interval={0} tick={<MonthAxisTick days={daysByLabel} />} tickMargin={9} axisLine={false} tickLine={false} />
              <YAxis width={34} domain={hasData ? [0, "auto"] : [0, 1]}
                tick={hasData ? { fill: "#aebbc0", fontSize: 10 } : false} axisLine={false} tickLine={false} />
              <Tooltip content={({ active, payload, label }) => {
                const day = payload?.[0]?.payload;
                const entry = day?.entry;
                if (!active || !day || (!entry?.covered_seconds && !day.deloadWeek)) return null;
                return <div className="rounded-lg border border-[#46545b] bg-[#202a30] p-2 text-xs">
                  <b>День {label}{entry?.covered_seconds ? ` · ${entry.recorded_runs} из ${entry.runs}${entry.approximate ? " · оценка" : ""}` : ""}</b>
                  {day.deloadWeek && <div className="text-[#aee2d4]">Разгрузочная неделя</div>}
                  {payload.filter(({ value }) => value > 0).map(({ dataKey, value }) => (
                    <div key={dataKey}>{dataKey} · {format.format(value)} мин</div>
                  ))}
                </div>;
              }} />
              {deloadRanges.map(([week, range]) => (
                <ReferenceArea key={week} x1={range.start} x2={range.end} {...deloadAreaStyle} />
              ))}
              {zones.map(([zone, color]) => <Bar key={zone} dataKey={zone} stackId="zones" fill={color} stroke="#19242b" strokeWidth={1.25} isAnimationActive={false} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {deloadRanges.length > 0 && <DeloadLegend />}
        <ZoneDurationSummary totals={totals} coveredMinutes={coveredMinutes} title="Распределение за месяц"
          caption={demo ? "Шкала графика в минутах · пример" : "Шкала графика в минутах"} label="с пульсом" />
      </>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
        {busy && <span role="status">Загружаю…</span>}
        {data?.configured === false && <span>Укажи пульсовые зоны бега в настройках.</span>}
        {data?.configured && <span>Зоны пульса рассчитаны для {data.recorded_runs} из {data.runs} пробежек{data.approximate ? " · часть данных приблизительная" : ""}.</span>}
        {!busy && !hasData && data?.configured && <span>Нет данных для графика.</span>}
        {!demo && data?.configured && <button type="button" disabled={busy} onClick={() => load()} className="rounded border border-[#45565d] px-2 py-1 disabled:opacity-50">Обновить</button>}
        {data?.missing_activity_ids?.length > 0 && (
          <button type="button" disabled={busy} onClick={() => load(data.missing_activity_ids)}
            className="rounded border border-[#45565d] px-2 py-1 disabled:opacity-50">
            Подгрузить из Garmin ({Math.min(3, data.missing_activity_ids.length)} из {data.missing_activity_ids.length})
          </button>
        )}
        {error && <p role="alert" className="text-rose-300">{error}</p>}
        {error && !data && <button type="button" disabled={busy} onClick={() => load()} className="underline">Повторить</button>}
      </div>
      <ZoneCoverageExclusions runs={data?.excluded_runs} reasons={exclusionReasons} />
    </div>
  );
}
