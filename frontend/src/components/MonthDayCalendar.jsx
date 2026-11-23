import { Fragment, useState } from "react";
import { CalendarDays, Dumbbell, Flag, Gauge, HeartPulse } from "lucide-react";
import { dayKey, weeklyVolumeComparison } from "../lib/calendarAnalytics";
import { fmtPace } from "../lib/format";
import { localDateKey } from "../lib/wellnessDates";

const percent = new Intl.NumberFormat("ru-RU", { style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 1 });
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

function WeekVolumeComparison({ comparison, previousDeload }) {
  const { previousKm, previousChange, typicalKm, typicalChange } = comparison;
  if (previousKm == null) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-[#adbbc0]">
      <span title={`Предыдущая неделя: ${distance.format(previousKm)} км`}>
        {previousChange == null ? "Прошлая неделя" : "К прошлой"}
        {previousChange != null && <b className="ml-1 text-[#f3bc7f]">{percent.format(previousChange)}</b>}
        <span className="ml-1">({distance.format(previousKm)} км)</span>
        {previousDeload && <span className="ml-1 text-[#9fcfc2]">· разгрузка</span>}
      </span>
      {typicalKm != null && (
        <span title="Медиана километража за 6 предыдущих завершённых недель">
          {typicalChange == null ? "Типичная неделя" : "К типичной"}
          {typicalChange != null && <b className="ml-1 text-[#f3bc7f]">{percent.format(typicalChange)}</b>}
          <span className="ml-1">({distance.format(typicalKm)} км)</span>
        </span>
      )}
      {previousKm > 0 && !previousDeload && (
        <span title="Ориентир для сравнения объёма, 110% от прошлой недели">
          Ориентир +10%: <b className="text-[#e5ebee]">{distance.format(previousKm * 1.1)} км</b>
        </span>
      )}
    </div>
  );
}

export default function MonthDayCalendar({
  expandedYear, calendarMonth, monthNames, daySummaries, selectedTypes, selection, onSelectDay,
  deloadWeeks = {}, plannedSessions = [], onMarkDeload, syncBusy,
}) {
  const [pendingWeek, setPendingWeek] = useState(null);
  const [labelError, setLabelError] = useState(null);
  const calendarWeeks = buildWeeks(expandedYear, calendarMonth);
  const today = new Date();
  const showRunning = selectedTypes.includes("running");
  const showStrength = selectedTypes.includes("strength");
  const planByDate = new Map(plannedSessions.map((session) => [session.date, session]));
  let historyStart = null;
  for (const key of daySummaries.keys()) {
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(year, month, day);
    if (!historyStart || date < historyStart) historyStart = date;
  }

  async function toggleDeload(weekKey, enabled) {
    setPendingWeek(weekKey);
    setLabelError(null);
    try {
      await onMarkDeload(weekKey, enabled);
    } catch (error) {
      setLabelError({ weekKey, message: error.message });
    } finally {
      setPendingWeek(null);
    }
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
        {calendarWeeks.map((week) => {
          const weekRuns = week.days.map((day) => daySummaries.get(dayKey(day))).filter(Boolean);
          const weekKm = weekRuns.reduce((sum, item) => sum + item.runKm, 0);
          const weekSeconds = weekRuns.reduce((sum, item) => sum + item.runSeconds, 0);
          const weekHrWeight = weekRuns.reduce((sum, item) => sum + item.hrWeight, 0);
          const weekHrSeconds = weekRuns.reduce((sum, item) => sum + item.hrSeconds, 0);
          const weekStart = week.days[0];
          const nextMonday = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
          const weekKey = localDateKey(weekStart);
          const markedDeload = Boolean(deloadWeeks[weekKey]);
          const currentWeek = weekStart <= today && today < nextMonday;
          const comparison = showRunning && weekStart <= today
            ? weeklyVolumeComparison(daySummaries, weekStart, weekKm, historyStart)
            : null;
          const previousDeload = comparison && Boolean(deloadWeeks[localDateKey(comparison.previousMonday)]);
          let plannedKm = 0;
          let recordedOnPlannedDaysKm = 0;
          for (const date of week.days) {
            const plan = planByDate.get(localDateKey(date));
            if (!plan?.distance_km || plan.kind === "strength") continue;
            plannedKm += plan.distance_km;
            recordedOnPlannedDaysKm += daySummaries.get(dayKey(date))?.runKm ?? 0;
          }

          return <Fragment key={weekKey}>
            <div className="col-span-7 mt-1 grid gap-1 rounded-md border border-[#ffffff0d] bg-[#ffffff06] px-2 py-1 text-xs tabular-nums text-[color:var(--soft)]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold max-[480px]:gap-x-2">
                <span>{distance.format(weekKm)} км{currentWeek && <span className="ml-1 font-normal">на сегодня</span>}</span>
                <span className="inline-flex items-center gap-1"><Gauge size={12} aria-label="Темп" />{weekKm ? `${fmtPace(weekSeconds / weekKm)}/км` : "—"}</span>
                <span className="inline-flex items-center gap-1"><HeartPulse size={12} aria-label="Пульс" />{weekHrWeight ? `${Math.round(weekHrSeconds / weekHrWeight)} уд/мин` : "—"}</span>
                {onMarkDeload && weekStart <= today && (
                  <button type="button" aria-pressed={markedDeload} disabled={Boolean(pendingWeek) || syncBusy}
                    onClick={() => toggleDeload(weekKey, !markedDeload)}
                    className={`inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-[11px] disabled:opacity-50 ${markedDeload
                      ? "border-[#5b887c] bg-[#25413b] text-[#b5e6d8]"
                      : "border-[#45565d] text-[#bfcbcf] hover:bg-white/5"}`}>
                    <Flag size={12} aria-hidden="true" />
                    {pendingWeek === weekKey ? "Сохраняю…" : markedDeload ? "Разгрузочная" : "Отметить разгрузку"}
                  </button>
                )}
              </div>
              {comparison && <WeekVolumeComparison comparison={comparison} previousDeload={previousDeload} />}
              {showRunning && plannedKm > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b6c5ff]"
                  title="Факт Garmin за запланированные беговые дни этой календарной недели">
                  <CalendarDays size={12} aria-hidden="true" />
                  План {distance.format(plannedKm)} км · факт {distance.format(recordedOnPlannedDaysKm)} км
                </span>
              )}
              {labelError?.weekKey === weekKey && <p role="alert" className="text-xs text-rose-300">{labelError.message}</p>}
            </div>
            {week.days.map((date, weekday) => {
              const day = date.getDate();
              const month = date.getMonth();
              const year = date.getFullYear();
              const outsideMonth = month !== calendarMonth;
              const monthName = monthNames[month];
              const daily = daySummaries.get(dayKey(date)) || { runKm: 0, runCount: 0, strengthCount: 0 };
              const hasRun = showRunning && daily.runCount > 0;
              const hasStrength = showStrength && daily.strengthCount > 0;
              const plan = planByDate.get(localDateKey(date));
              const plannedRun = showRunning && plan && plan.kind !== "strength";
              const plannedStrength = showStrength && plan?.kind === "strength";
              const planLabel = plannedRun
                ? `План: ${plan.distance_km ? `${distance.format(plan.distance_km)} км` : plan.kind === "race" ? "забег" : "бег"}`
                : plannedStrength ? "План: силовая тренировка" : "";
              const showPlan = (plannedRun && !hasRun) || (plannedStrength && !hasStrength);
              const daySelected = selection.type === "day" && selection.year === year && selection.month === month && selection.day === day;
              return (
                <button
                  className={`period-cube period-day-cube relative isolate flex min-w-0 min-h-[54px] flex-col items-center justify-end px-0.5 pb-2 pt-5 border border-[color:var(--border)] rounded-[9px] bg-[color:var(--panel)] text-[color:var(--text)] text-[14px] font-semibold text-center capitalize shadow-[0_3px_9px_#00000018] [&.has-run]:border-[#e5aa62] [&.has-run]:[background:linear-gradient(145deg,_#362923,_#1d262b_82%)] [&.is-selected]:border-[color:var(--accent)] [&.is-selected]:bg-[color:var(--accent-soft)] ${outsideMonth ? "opacity-35" : ""}${hasRun ? " has-run" : ""}${daySelected ? " is-selected" : ""}`}
                  type="button"
                  key={day}
                  title={planLabel || undefined}
                  aria-label={`${day} ${monthName} ${year}${hasRun ? `, бег ${daily.runKm.toFixed(1)} км` : ""}${hasStrength ? ", силовая тренировка" : ""}${planLabel ? `, ${planLabel}` : ""}`}
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
                  {showPlan && (
                    <span aria-hidden="true" className="max-w-full whitespace-nowrap rounded-sm border border-dashed border-[#7c8fc4] px-0.5 text-[10px] font-semibold leading-tight text-[#b6c5ff] sm:px-1 sm:text-xs">
                      {plan.distance_km ? (
                        <>{distance.format(plan.distance_km)}<span className="max-[420px]:hidden"> км</span></>
                      ) : <CalendarDays size={12} />}
                    </span>
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
