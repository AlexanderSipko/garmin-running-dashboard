import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { demoWeekHeartRateZones } from "../data/demoDashboard";
import { requestActivityDetails } from "../lib/activityDetailsRequest";

const zones = [["Z1", "#a3b3bd"], ["Z2", "#82bee5"], ["Z3", "#8de0cc"], ["Z4", "#ffc988"], ["Z5", "#f18b9b"], ["Вне зон", "#65747c"]];
const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });

function durationLabel(minutes) {
  if (minutes === 0) return "0 мин";
  if (minutes < 1) return "<1 мин";
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return hours ? `${hours} ч ${rest} мин` : `${rest} мин`;
}

const format = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export default function MonthHeartRateZones({ monthStart, calendarDays, demo }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(!demo);
  const [error, setError] = useState("");
  const pending = useRef(null);

  async function load(ids = []) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const { signal } = controller;
    setBusy(true);
    setError("");
    try {
      for (const id of ids.slice(0, 3)) {
        try {
          await requestActivityDetails(id, { method: "POST", onlyIfMissing: true, signal });
        } catch {
          if (signal.aborted) return;
          setError("Часть деталей загрузить не удалось.");
          break;
        }
      }
      const response = await fetch(`/api/dashboard/month-zones?month_start=${monthStart}`, { signal, cache: "no-store" });
      if (!response.ok) throw new Error();
      const next = await response.json();
      if (!signal.aborted) setData(next);
    } catch {
      if (!signal.aborted) setError("Не удалось загрузить зоны за месяц.");
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!signal.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    if (!demo) void load();
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [monthStart, demo]);

  const days = calendarDays.map(({ label, runCount, runSeconds }) => {
    const entry = demo ? demoWeekHeartRateZones(runCount, runSeconds)
      : data?.days?.[`${monthStart.slice(0, 7)}-${label.padStart(2, "0")}`];
    return {
      label, entry,
      ...Object.fromEntries(Object.entries(entry?.seconds_by_zone || {}).map(([zone, seconds]) => [zone, seconds / 60])),
      "Вне зон": (entry?.outside_seconds || 0) / 60,
    };
  });
  const coveredMinutes = days.reduce((sum, { entry }) => sum + (entry?.covered_seconds || 0) / 60, 0);
  const totals = zones.map(([zone, color]) => ({
    zone, color, minutes: days.reduce((sum, day) => sum + (day[zone] || 0), 0),
  }));
  const hasData = coveredMinutes > 0;

  return (
    <div className="min-w-0 rounded-xl border border-[#34424a] bg-[#19242b] p-3">
      {hasData && <>
        <div className="h-48 min-w-0 sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 5, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#ffffff15" />
              <XAxis dataKey="label" tick={{ fill: "#aebbc0", fontSize: 10 }} minTickGap={8} axisLine={false} tickLine={false} />
              <YAxis width={34} tick={{ fill: "#aebbc0", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={({ active, payload, label }) => {
                const entry = payload?.[0]?.payload?.entry;
                if (!active || !entry?.covered_seconds) return null;
                return <div className="rounded-lg border border-[#46545b] bg-[#202a30] p-2 text-xs">
                  <b>День {label} · {entry.recorded_runs} из {entry.runs}{entry.approximate ? " · оценка" : ""}</b>
                  {payload.filter(({ value }) => value > 0).map(({ dataKey, value }) => (
                    <div key={dataKey}>{dataKey} · {format.format(value)} мин</div>
                  ))}
                </div>;
              }} />
              {zones.map(([zone, color]) => <Bar key={zone} dataKey={zone} stackId="zones" fill={color} stroke="#19242b" strokeWidth={1.25} isAnimationActive={false} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 border-t border-white/10 pt-2">
          <div className="mb-2 flex flex-wrap justify-between gap-x-2 gap-y-1 text-xs text-slate-300">
            <span>За месяц · {durationLabel(coveredMinutes)} с пульсом</span>
            <span className="text-slate-400">Шкала в минутах{demo ? " · пример" : ""}</span>
          </div>
          <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
            {totals.filter(({ zone, minutes }) => zone !== "Вне зон" || minutes > 0).map(({ zone, color, minutes }) => (
              <div key={zone} className="min-w-0 rounded-lg bg-[#223139] px-2 py-1.5 tabular-nums">
                <dt className="flex items-center justify-between gap-1 text-xs font-semibold" style={{ color }}>
                  <span>{zone}</span><span>{percent.format(minutes / coveredMinutes)}</span>
                </dt>
                <dd className="mt-0.5 text-xs text-slate-200">{durationLabel(minutes)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
        {busy && <span role="status">Загружаю…</span>}
        {data?.configured === false && <span>Укажи пульсовые зоны бега в настройках.</span>}
        {data?.configured && <span>Пульс у {data.recorded_runs} из {data.runs} пробежек{data.approximate ? " · часть данных приблизительная" : ""}</span>}
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
    </div>
  );
}
