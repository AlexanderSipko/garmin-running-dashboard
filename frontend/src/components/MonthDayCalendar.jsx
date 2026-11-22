import { Fragment } from "react";
import { Dumbbell, Gauge, HeartPulse } from "lucide-react";
import { dayKey, weeklyVolumeComparison } from "../lib/calendarAnalytics";
import { fmtPace } from "../lib/format";

const percent = new Intl.NumberFormat("ru-RU", { style: "percent", signDisplay: "exceptZero" });
const distance = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function buildWeeks(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: Math.ceil((offset + daysInMonth) / 7) }, (_, week) => ({
    days: weekdays.map((_, day) => new Date(year, month, 1 - offset + week * 7 + day)),
  }));
}

export default function MonthDayCalendar({
  expandedYear, calendarMonth, monthNames, daySummaries, selectedTypes, selection, onSelectDay,
}) {
  const calendarWeeks = buildWeeks(expandedYear, calendarMonth);
  const today = new Date();
  const showRunning = selectedTypes.includes("running");
  let historyStart = null;
  for (const key of daySummaries.keys()) {
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(year, month, day);
    if (!historyStart || date < historyStart) historyStart = date;
  }

  return (
    <div className="period-month-days mt-3 mx-0 mb-1">
      <div className="period-month-days-heading mb-2 text-[#e0e8eb] text-[16px] font-extrabold capitalize">
        {monthNames[calendarMonth]} {expandedYear}
      </div>
      <div className="period-day-list grid grid-cols-[repeat(7,_minmax(0,_1fr))] gap-1 m-0">
        {weekdays.map((label, index) => (
          <span key={label} className={`text-center text-[11px] font-bold ${index >= 5 ? "rounded-md bg-[#473029] py-0.5 text-[#ffd1a5]" : "text-[color:var(--soft)]"}`}>{label}</span>
        ))}
        {calendarWeeks.map((week, weekIndex) => {
          const weekRuns = week.days.map((day) => daySummaries.get(dayKey(day))).filter(Boolean);
          const weekKm = weekRuns.reduce((sum, item) => sum + item.runKm, 0);
          const weekSeconds = weekRuns.reduce((sum, item) => sum + item.runSeconds, 0);
          const weekHrWeight = weekRuns.reduce((sum, item) => sum + item.hrWeight, 0);
          const weekHrSeconds = weekRuns.reduce((sum, item) => sum + item.hrSeconds, 0);
          const weekStart = week.days[0];
          const nextMonday = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
          const comparison = showRunning && weekStart <= today
            ? weeklyVolumeComparison(daySummaries, weekStart, weekKm, historyStart)
            : null;
          const comparisonText = comparison && percent.format(comparison.change / 100);
          const comparisonHint = comparison && `${comparisonText} к среднему за предыдущие 6 недель (${distance.format(comparison.averageKm)} км)${today < nextMonday ? ". Текущая неделя ещё идёт." : ""}`;
          return <Fragment key={weekIndex}>
            <div className="col-span-7 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[#ffffff0d] bg-[#ffffff06] px-2 py-1 text-xs tabular-nums max-[480px]:gap-x-2 font-semibold text-[color:var(--soft)]">
              <span className="inline-flex items-center gap-1.5">
                {weekKm.toFixed(1)} км
                {comparison && (
                  <span title={comparisonHint} aria-label={comparisonHint}
                    className={`rounded bg-white/6 px-1.5 py-0.5 text-[11px] ${comparison.change > 0 ? "text-[#f3bc7f]" : comparison.change < 0 ? "text-[#a9c2f5]" : "text-slate-300"}`}>
                    {comparisonText}
                  </span>
                )}
              </span>
              <span className="inline-flex items-center gap-1"><Gauge size={12} aria-label="Темп" />{weekKm ? `${fmtPace(weekSeconds / weekKm)}/км` : "—"}</span>
              <span className="inline-flex items-center gap-1"><HeartPulse size={12} aria-label="Пульс" />{weekHrWeight ? `${Math.round(weekHrSeconds / weekHrWeight)} уд/мин` : "—"}</span>
            </div>
            {week.days.map((date, weekday) => {
              const day = date.getDate();
              const month = date.getMonth();
              const year = date.getFullYear();
              const outsideMonth = month !== calendarMonth;
              const monthName = monthNames[month];
              const daily = daySummaries.get(dayKey(date)) || { runKm: 0, runCount: 0, strengthCount: 0 };
              const hasRun = showRunning && daily.runCount > 0;
              const hasStrength = selectedTypes.includes("strength") && daily.strengthCount > 0;
              const daySelected = selection.type === "day" && selection.year === year && selection.month === month && selection.day === day;
              return (
                <button
                  className={`period-cube period-day-cube relative isolate flex min-w-0 min-h-[54px] flex-col items-center justify-end px-0.5 pb-2 pt-5 border border-[color:var(--border)] rounded-[9px] bg-[color:var(--panel)] text-[color:var(--text)] text-[14px] font-semibold text-center capitalize shadow-[0_3px_9px_#00000018] [&.has-run]:border-[#e5aa62] [&.has-run]:[background:linear-gradient(145deg,_#362923,_#1d262b_82%)] [&.is-selected]:border-[color:var(--accent)] [&.is-selected]:bg-[color:var(--accent-soft)] ${outsideMonth ? "opacity-35" : ""}${hasRun ? " has-run" : ""}${daySelected ? " is-selected" : ""}`}
                  type="button"
                  key={day}
                  aria-label={`${day} ${monthName} ${year}${hasRun ? `, бег ${daily.runKm.toFixed(1)} км` : ""}${hasStrength ? ", силовая тренировка" : ""}`}
                  onClick={() => onSelectDay({ year, month, day })}
                >
                  <span aria-hidden="true" className={`pointer-events-none absolute right-1 top-0.5 bg-gradient-to-br bg-clip-text text-[15px] font-bold leading-none text-transparent ${weekday >= 5 ? "from-[#f3bc9a]/85 to-[#f3bc9a]/25" : "from-[#c2cfd4]/75 to-[#c2cfd4]/20"}`}>
                    {day}
                  </span>
                  {hasRun && (
                    <span className="whitespace-nowrap text-[clamp(10px,1.35vw,16px)] font-extrabold leading-tight text-[#ffc17f]">
                      {daily.runKm.toFixed(1)}<span className="ml-0.5 text-[8px] font-semibold">км</span>
                    </span>
                  )}
                  {hasStrength && !hasRun && (
                    <Dumbbell className="text-[#a7b5ff]" size={15} aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </Fragment>;
        })}
      </div>
    </div>
  );
}
