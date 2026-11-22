import SectionEyebrow from "../components/SectionEyebrow";
import ActivityCalendar from "../components/ActivityCalendar";
import MonthNavigator from "../components/MonthNavigator";
import WeeklyTrendChart from "../components/WeeklyTrendChart";
import { Trend } from "../components/MetricCard";
import { fmtDuration, fmtPace } from "../lib/format";

function CalendarDashboard({
  period,
  activities,
  km,
  seconds,
  avgPace,
  avgHr,
  delta,
  chart,
  weekRows,
  monthDays,
  monthTotals,
  selectedMonth,
  onMonthChange,
}) {
  return (
    <>
      <header className="calendar-intro [&_h1]:[font:700_29px_Manrope,_sans-serif] [&_h1]:tracking-[-1.1px] [&_h1]:my-[6px] mx-0 [&_p]:text-[color:var(--muted)] [&_p]:text-[11px] [&_p]:m-0 flex items-end justify-between pt-[10px] px-0 pb-[18px] [&_h1]:text-[26px]">
        <div>
          <SectionEyebrow>БЕГОВОЙ КАЛЕНДАРЬ</SectionEyebrow>
          <h1>{period === "week" ? "Твои недели" : "Твой месяц"}</h1>
          <p>Дистанция, темп и пульс по дням и неделям.</p>
        </div>
        <div className={[
          "calendar-period-summary flex flex-col items-end gap-1 text-right",
          "[&_>_span]:text-[color:var(--muted)] [&_>_span]:text-[9px] [&_>_span]:tracking-[1px]",
          "[&_>_b]:[font:700_25px_Manrope,_sans-serif] [&_>_b_small]:text-[color:var(--muted)]",
          "[&_>_b_small]:[font:500_10px_'DM_Sans',_sans-serif] [&_>_small]:text-[color:var(--muted)]",
          "[&_>_small]:[font:500_10px_'DM_Sans',_sans-serif] max-[460px]:[&_>_b]:text-[21px]",
        ].join(" ")}>
          <span>{period === "week" ? "ЗА 7 ДНЕЙ" : "ЗА МЕСЯЦ"}</span>
          <b>
            {km.toFixed(1)} <small>км</small>
          </b>
          <Trend value={delta} />
          <span className="calendar-period-detail text-[color:var(--soft)] text-[11px] tabular-nums">
            {avgPace ? `${fmtPace(avgPace)} /км` : "— /км"} · {avgHr || "—"} bpm
          </span>
          <small>
            {activities.length} тренировок · {fmtDuration(seconds)}
          </small>
        </div>
      </header>

      <ActivityCalendar
        period={period}
        weekRows={weekRows}
        monthDays={monthDays}
        selectedMonth={selectedMonth}
      />

      <WeeklyTrendChart data={chart} period={period} />

      <MonthNavigator
        selectedMonth={selectedMonth}
        monthTotals={monthTotals}
        onSelectMonth={onMonthChange}
      />
    </>
  );
}

export default CalendarDashboard;
