import { Bar, BarChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import useMonthZoneDetails from "../hooks/useMonthZoneDetails";
import ZoneDurationSummary, { zoneColors } from "./ZoneDurationSummary";
import ZoneCoverageExclusions from "./ZoneCoverageExclusions";
import { DeloadLegend, deloadAreaStyle, getDeloadRanges, MonthAxisTick } from "./MonthChartDeload";

const button = "rounded border border-[#45565d] px-2 py-1 disabled:opacity-50";
const exclusionReasons = {
  summary_only: "Есть среднее и пик, но недостаточно точек для времени по зонам.",
  no_power: "В загруженных деталях FIT нет ватт.",
};

export default function MonthRunningPower({ days, monthStart, demo, onActivityUpdated }) {
  const { data, busy, error, load } = useMonthZoneDetails({
    monthStart, endpoint: "month-power", enabled: !demo, onlyIfMissing: false, onActivityUpdated,
  });
  const hasPower = days.some((day) => day.avgPower != null);
  const deloadRanges = getDeloadRanges(days);
  const daysByLabel = new Map(days.map((day) => [day.label, day]));
  const totals = zoneColors.map(([zone, color]) => ({
    zone, color,
    minutes: (zone === "Вне зон" ? data?.outside_seconds || 0 : data?.seconds_by_zone?.[zone] || 0) / 60,
  }));
  return (
    <div className="min-w-0 rounded-xl border border-[#34424a] bg-[#19242b] p-3">
      <h3 className="mb-2 text-xs font-semibold text-slate-200">Средняя мощность бега по дням, Вт</h3>
      <div className="relative h-48 min-w-0 sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 5, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#ffffff15" />
              <XAxis dataKey="label" interval={0} tick={<MonthAxisTick days={daysByLabel} />} tickMargin={9} axisLine={false} tickLine={false} />
              <YAxis width={34} domain={hasPower ? [0, "auto"] : [0, 1]}
                tick={hasPower ? { fill: "#aebbc0", fontSize: 10 } : false} axisLine={false} tickLine={false} />
              <Tooltip content={({ active, payload, label }) => {
                const day = payload?.[0]?.payload;
                if (!active || !day || (day.avgPower == null && !day.deloadWeek)) return null;
                return (
                  <div className="rounded-lg border border-[#46545b] bg-[#202a30] p-2 text-xs">
                    <b>{label} число{day.avgPower != null && ` · ${day.avgPower} Вт`}</b>
                    {day.deloadWeek && <p className="text-[#aee2d4]">Разгрузочная неделя</p>}
                    {day.avgPower != null && <p className="text-slate-300">С мощностью: {day.powerRunCount} из {day.runCount} пробежек</p>}
                  </div>
                );
              }} />
              {deloadRanges.map(([week, range]) => (
                <ReferenceArea key={week} x1={range.start} x2={range.end} {...deloadAreaStyle} />
              ))}
              <Bar dataKey="avgPower" fill="#ffc988" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        {!hasPower && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-3 text-center text-xs text-slate-300">
            Не хватает данных о мощности за этот месяц
          </p>
        )}
      </div>
      {deloadRanges.length > 0 && <DeloadLegend />}
      <ZoneDurationSummary totals={totals} coveredMinutes={(data?.covered_seconds || 0) / 60}
        title="Зоны мощности за месяц" caption="Длительность по записям FIT" label="с мощностью" />
      {!demo && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
        {busy && <span role="status">Загружаю…</span>}
        {data && <span>{data.configured ? "Зоны мощности рассчитаны" : "Есть данные для расчёта зон"} для {data.recorded_runs} из {data.runs} пробежек.</span>}
        {data?.configured === false && <span>Заполни зоны мощности в настройках плана бегуна.</span>}
        {data?.configured && !data.covered_seconds && <span>Нет данных для зон мощности.</span>}
        <button type="button" disabled={busy} onClick={() => load()} className={button}>Обновить</button>
        {data?.missing_activity_ids?.length > 0 && (
          <button type="button" disabled={busy} onClick={() => load(data.missing_activity_ids)} className={button}>
            Подгрузить из Garmin ({Math.min(3, data.missing_activity_ids.length)} из {data.missing_activity_ids.length})
          </button>
        )}
        {error && <p role="alert" className="text-rose-300">{error}</p>}
      </div>}
      <ZoneCoverageExclusions runs={data?.excluded_runs} reasons={exclusionReasons} />
    </div>
  );
}
