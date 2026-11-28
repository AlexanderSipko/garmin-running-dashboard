import { useEffect, useRef, useState } from "react";
import { requestActivityDetails } from "../lib/activityDetailsRequest";

const colors = ["#a3b3bd", "#82bee5", "#8de0cc", "#ffc988", "#f18b9b"];
const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });

export default function WeekRunningZones({ weekStart, demoData, averagePower, previousPower, currentWeek, onActivityUpdated }) {
  const [mode, setMode] = useState(null);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function load(nextMode, ids = []) {
    if (demoData) { setData(demoData); return; }
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const { signal } = controller;
    setBusy(true);
    setError("");
    try {
      for (const id of ids.slice(0, 3)) {
        try {
          const result = await requestActivityDetails(id, {
            method: "POST", onlyIfMissing: nextMode === "pulse", signal,
          });
          if (!signal.aborted && result.activity) onActivityUpdated?.(result.activity, result.weekly_volume);
        } catch {
          if (signal.aborted) return;
          setError("Не все детали удалось загрузить из Garmin.");
          break;
        }
      }
      const endpoint = nextMode === "power" ? "week-power" : "week-zones";
      const response = await fetch(`/api/dashboard/${endpoint}?week_start=${weekStart}`, { signal, cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!signal.aborted) setData(result);
    } catch {
      if (!signal.aborted) setError("Не удалось загрузить зоны за неделю.");
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!signal.aborted) setBusy(false);
    }
  }

  function toggle(nextMode) {
    setData(null);
    setError("");
    if (mode === nextMode) {
      setMode(null);
      return;
    }
    setMode(nextMode);
    void load(nextMode);
  }

  const difference = averagePower != null && previousPower != null ? averagePower - previousPower : null;
  const comparison = difference == null ? "" : difference === 0 ? " · без изменений"
    : ` · на ${Math.abs(difference)} Вт ${difference > 0 ? "выше" : "ниже"}`;
  const powerSummary = averagePower == null ? "Нет данных о средней мощности" : `${averagePower} Вт в среднем${comparison}`;
  const comparedPeriod = difference == null ? "" : currentWeek
    ? " относительно тех же дней предыдущей недели" : " относительно предыдущей недели";
  const covered = data?.covered_seconds || 0;
  const zones = Object.entries(data?.seconds_by_zone || {});
  return (
    <div className="mb-1.5 border-b border-white/10 pb-1.5 text-[11px] text-[color:var(--soft)]">
      <div className="flex min-w-0 items-center gap-x-3">
        <button type="button" disabled={busy} onClick={() => toggle("pulse")}
          aria-expanded={mode === "pulse"}
          className="min-h-7 shrink-0 whitespace-nowrap font-semibold text-[#b5e6d8] hover:underline disabled:opacity-60">
          Зоны пульса
        </button>
        {!demoData && <button type="button" disabled={busy} onClick={() => toggle("power")}
          aria-expanded={mode === "power"} aria-label={`Зоны мощности. ${powerSummary}${comparedPeriod}`}
          title={`${powerSummary}${comparedPeriod}`}
          className="min-h-7 min-w-0 truncate text-left font-semibold text-[#ffc988] hover:underline disabled:opacity-60">
          Зоны мощности{averagePower == null ? " · —" : ` · ${averagePower} Вт`}
          {difference != null && (difference === 0 ? " · ="
            : ` ${difference > 0 ? "↑" : "↓"} ${Math.abs(difference)}`)}
        </button>}
      </div>
      {busy && <p role="status">Загружаю…</p>}
      {data?.configured && <p className="mb-1">Данные: {data.recorded_runs} из {data.runs}{data.approximate ? " · оценка" : ""}{demoData ? " · пример" : ""}</p>}
      {data && !data.configured && <p>{mode === "power" ? "Заполни зоны мощности в настройках." : "Заполни пульсовые зоны бега в настройках."}</p>}
      {data?.configured && (covered > 0 ? (
        <>
          <div aria-hidden="true" className="flex h-2.5 gap-[3px] overflow-hidden rounded-md bg-[#142129]">
            {zones.map(([zone, seconds], index) => seconds > 0 && <span key={zone} className="min-w-0 rounded-sm" style={{ flex: `${seconds} 1 0px`, backgroundColor: colors[index] }} />)}
            {data.outside_seconds > 0 && <span className="min-w-0 rounded-sm bg-white/15" style={{ flex: `${data.outside_seconds} 1 0px` }} />}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
            {zones.map(([zone, seconds], index) => <span key={zone} style={{ color: colors[index] }}>{zone} {percent.format(seconds / covered)}</span>)}
            {data.outside_seconds > 0 && <span>Вне зон {percent.format(data.outside_seconds / covered)}</span>}
          </div>
        </>
      ) : <p>{mode === "power" ? "Нет данных мощности за неделю." : "Нет данных пульса за неделю."}</p>)}
      {data?.missing_activity_ids?.length > 0 && (
        <button type="button" disabled={busy} onClick={() => load(mode, data.missing_activity_ids)}
          className="mt-1 min-h-7 rounded border border-[#45565d] px-2 disabled:opacity-60">
          Подгрузить из Garmin ({Math.min(3, data.missing_activity_ids.length)} из {data.missing_activity_ids.length})
        </button>
      )}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
    </div>
  );
}
