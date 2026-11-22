import { Fragment } from "react";
import { Gauge, HeartPulse } from "lucide-react";
import { dayKey } from "../lib/calendarAnalytics";
import { fmtPace } from "../lib/format";

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
  return (
    <div className="period-month-days mt-3 mx-0 mb-1">
      <div className="period-month-days-heading mb-2 text-[#e0e8eb] text-[16px] font-extrabold capitalize">
        {monthNames[calendarMonth]} {expandedYear}
      </div>
      <div className="period-day-list grid grid-cols-[repeat(7,_minmax(0,_1fr))] gap-1 m-0">
        {weekdays.map((label, index) => (
          <span key={label} className={`text-center text-[11px] font-bold ${index >= 5 ? "text-[#f3ad92]" : "text-[color:var(--soft)]"}`}>{label}</span>
        ))}
        {calendarWeeks.map((week, weekIndex) => {
          const weekRuns = week.days.map((day) => daySummaries.get(dayKey(day))).filter(Boolean);
          const weekKm = weekRuns.reduce((sum, item) => sum + item.runKm, 0);
          const weekSeconds = weekRuns.reduce((sum, item) => sum + item.runSeconds, 0);
          const weekHrWeight = weekRuns.reduce((sum, item) => sum + item.hrWeight, 0);
          const weekHrSeconds = weekRuns.reduce((sum, item) => sum + item.hrSeconds, 0);
          return <Fragment key={weekIndex}>
            <div className="col-span-7 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[#ffffff0d] bg-[#ffffff06] px-2 py-1 text-xs tabular-nums max-[480px]:gap-x-2 font-semibold text-[color:var(--soft)]">
              <span>{weekKm.toFixed(1)} км</span>
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
              const hasRun = selectedTypes.includes("running") && daily.runCount > 0;
              const hasStrength = selectedTypes.includes("strength") && daily.strengthCount > 0;
              const daySelected = selection.type === "day" && selection.year === year && selection.month === month && selection.day === day;
              return (
                <button
                  className={`period-cube period-day-cube flex min-w-0 min-h-[54px] flex-col items-center justify-center p-[4px] border border-[color:var(--border)] rounded-[9px] bg-[color:var(--panel)] text-[color:var(--text)] text-[14px] font-semibold text-center capitalize shadow-[0_3px_9px_#00000018] [&.has-run]:border-[#e5aa62] [&.has-run]:[background:linear-gradient(145deg,_#362923,_#1d262b_82%)] [&.is-selected]:border-[color:var(--accent)] [&.is-selected]:bg-[color:var(--accent-soft)] [&_small]:mt-[2px] [&_small]:text-[#e5aa62] [&_small]:text-[10px] [&_small]:leading-[1.1] ${outsideMonth ? "opacity-35" : ""}${hasRun ? " has-run" : ""}${daySelected ? " is-selected" : ""}`}
                  type="button"
                  key={day}
                  aria-label={`${day} ${monthName} ${year}${hasRun ? `, бег ${daily.runKm.toFixed(1)} км` : ""}${hasStrength ? ", силовая тренировка" : ""}`}
                  onClick={() => onSelectDay({ year, month, day })}
                >
                  <span className={weekday >= 5 ? "text-[#f3ad92]" : undefined}>{day}</span>
                  {hasRun && <><small>{daily.runKm.toFixed(1)} км</small><i aria-hidden="true" style={{ width: `${Math.min(12, 4 + daily.runKm * 0.2)}px`, height: `${Math.min(12, 4 + daily.runKm * 0.2)}px` }} className="mt-1 rounded-full bg-[#e5aa62] opacity-80" /></>}
                  {hasStrength && <i aria-hidden="true" />}
                </button>
              );
            })}
          </Fragment>;
        })}
      </div>
    </div>
  );
}
