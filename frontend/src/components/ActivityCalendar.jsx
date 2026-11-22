import SectionEyebrow from "./SectionEyebrow";
import { useEffect, useState } from "react";
import { fmtDate, fmtPace } from "../lib/format";
import ActivityDetail from "./ActivityDetail";

function ActivityCalendar({ period, weekRows, monthDays, selectedMonth }) {
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    setSelectedDay(null);
  }, [period, selectedMonth]);

  const selectDay = (day) => {
    setSelectedDay({ date: day.date, activities: day.activities });
  };

  return (
    <section className="activity-calendar-card p-[18px] mb-3 [border:1px_solid_var(--border)] rounded-[11px] [background:var(--panel)] max-[460px]:py-[13px] px-[10px]">
      <div className="card-heading [&_h2]:[font:600_14px_Manrope,_sans-serif] [&_h2]:tracking-[-0.25px] [&_h2]:mt-1 mx-0 mb-0 flex justify-between items-center [&_h2]:mt-1">
        <div>
          <SectionEyebrow>
            {period === "week" ? "ТЕКУЩАЯ И ПРОШЛАЯ НЕДЕЛИ" : "ДНИ МЕСЯЦА"}
          </SectionEyebrow>
          <h2>
            {period === "week"
              ? "Активность и отдых"
              : selectedMonth.toLocaleDateString("ru-RU", {
                  month: "long",
                  year: "numeric",
                })}
          </h2>
        </div>
        <span className="calendar-legend flex items-center gap-[6px] text-[color:var(--muted)] text-[9px] [&_i]:w-[7px] [&_i]:h-[7px] [&_i]:rounded-[50%] [&_i]:[background:var(--accent)]">
          <i /> день с пробежкой
        </span>
      </div>

      {period === "week" ? (
        <WeekScroller rows={weekRows} onSelectDay={selectDay} />
      ) : (
        <MonthGrid
          days={monthDays}
          month={selectedMonth}
          onSelectDay={selectDay}
        />
      )}

      {selectedDay && (
        <ActivityDetail
          date={selectedDay.date}
          activities={selectedDay.activities}
        />
      )}
    </section>
  );
}

function WeekScroller({ rows, onSelectDay }) {
  return (
    <div className="week-scroll-window max-h-[368px] overflow-y-auto mt-3 pr-[5px] [scroll-snap-type:y_proximity] [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin] max-[760px]:max-h-[378px] max-[460px]:max-h-[360px]" aria-label="Прокручиваемые недели">
      {rows.map((week, index) => (
        <article className="week-row pt-[10px] px-0 pb-[13px] [border-top:1px_solid_var(--border)] [scroll-snap-align:start]" key={week.start.toISOString()}>
          <header className="week-row-heading flex items-center justify-between gap-[14px] min-h-[31px] mb-2 [&_>_b]:min-w-[130px] [&_>_b]:text-[color:var(--text)] [&_>_b]:[font:600_13px_Manrope,_sans-serif] max-[760px]:items-start max-[760px]:flex-col max-[760px]:gap-[7px] max-[760px]:pb-[3px]">
            <b>
              {index === 0
                ? "Текущая неделя"
                : index === 1
                ? "Предыдущая неделя"
                : fmtDate(week.start, { day: "numeric", month: "short" })}
            </b>
            <div className="week-summary flex flex-wrap justify-end gap-[14px] text-[color:var(--soft)] text-[11px] tabular-nums max-[760px]:justify-start max-[760px]:gap-[10px] max-[760px]:text-[10px]">
              <span>{week.distanceKm.toFixed(1)} км</span>
              <span>
                {week.averagePaceSecondsPerKm
                  ? `${fmtPace(week.averagePaceSecondsPerKm)} /км`
                  : "— /км"}
              </span>
              <span>
                {week.averageHeartRate
                  ? `${week.averageHeartRate} bpm`
                  : "— bpm"}
              </span>
            </div>
          </header>
          <div className="week-day-grid grid grid-cols-[repeat(7,_minmax(0,_1fr))] gap-[7px] max-[460px]:gap-[3px]">
            {week.days.map((day) => (
              <DayTile
                day={day}
                key={day.date.toISOString()}
                onClick={() => onSelectDay(day)}
              />
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function DayTile({ day, onClick }) {
  const active = day.activities.length > 0;
  const weekday = day.date.toLocaleDateString("ru-RU", { weekday: "short" });

  return (
    <button
      className={`day-tile flex min-w-0 min-h-[112px] flex-col justify-between p-[10px] border border-[color:var(--border)] rounded-[9px] [background:color-mix(in_srgb,_var(--panel)_68%,_var(--bg))] text-[color:var(--text)] text-left transition-[border-color,transform] duration-[120ms] hover:border-[color:var(--accent)] hover:-translate-y-px [&.has-activity]:border-[color:color-mix(in_srgb,_var(--accent)_54%,_var(--border))] [&.has-activity]:bg-[color:var(--accent-soft)] ${active ? "has-activity" : ""} max-[460px]:min-h-[91px] max-[460px]:py-[5px] max-[460px]:px-[3px] max-[460px]:rounded-[6px]`}
      onClick={onClick}
      type="button"
      aria-label={`${weekday}, ${fmtDate(day.date)}${
        active ? `, ${day.distanceKm.toFixed(1)} км` : ", отдыха не было"
      }`}
    >
      <span className="day-tile-heading flex items-center justify-between gap-1 capitalize [&_b]:text-[color:var(--soft)] [&_b]:text-[11px] [&_b]:font-semibold [&_time]:text-[color:var(--muted)] [&_time]:text-[11px] [&_time]:tabular-nums max-[460px]:[&_b]:text-[9px] max-[460px]:[&_time]:text-[9px]">
        <b>{weekday}</b>
        <time>{day.date.getDate()}</time>
      </span>
      {active ? (
        <span className="day-tile-metrics flex flex-col gap-[5px] text-[11px] tabular-nums [&_>_span]:text-[color:var(--soft)] [&_>_span]:whitespace-nowrap max-[760px]:gap-1 max-[760px]:text-[9px] max-[460px]:gap-[3px] max-[460px]:text-[9px]">
          <b className="day-distance [.day-tile-metrics_&]:text-[color:var(--accent)] [.day-tile-metrics_&]:[font:700_18px_Manrope,_sans-serif] [&_small]:[font:600_10px_'DM_Sans',_sans-serif] max-[760px]:[.day-tile-metrics_&]:text-[15px] max-[460px]:[.day-tile-metrics_&]:text-[14px] max-[460px]:[&_small]:text-[8px]">
            {day.distanceKm.toFixed(1)} <small>км</small>
          </b>
          <span>
            {day.averagePaceSecondsPerKm
              ? `${fmtPace(day.averagePaceSecondsPerKm)} /км`
              : "— /км"}
          </span>
          <span>
            {day.averageHeartRate ? `${day.averageHeartRate} bpm` : "— bpm"}
          </span>
        </span>
      ) : (
        <span className="day-rest text-[color:var(--muted)] text-[11px]">Отдых</span>
      )}
    </button>
  );
}

function MonthGrid({ days, month, onSelectDay }) {
  const firstWeekday =
    (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;

  return (
    <div className="month-calendar-grid grid grid-cols-[repeat(7,_minmax(0,_1fr))] gap-[7px] mt-[15px] max-[460px]:gap-[3px]">
      {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
        <span className="month-weekday py-[5px] px-0 text-[color:var(--muted)] text-[10px] text-center" key={day}>
          {day}
        </span>
      ))}
      {Array.from({ length: firstWeekday }, (_, index) => (
        <span className="month-day-placeholder min-h-[78px]" key={`empty-${index}`} />
      ))}
      {days.map((day) => (
        <MonthDay
          key={day.date.toISOString()}
          day={day}
          onClick={() => onSelectDay(day)}
        />
      ))}
    </div>
  );
}

function MonthDay({ day, onClick }) {
  const active = day.activities.length > 0;

  return (
    <button
      className={`month-day flex min-h-[78px] flex-col items-center justify-between py-2 px-1 border border-[color:var(--border)] rounded-[9px] bg-[color:var(--bg)] text-[color:var(--text)] transition-[border-color,transform] duration-[120ms] hover:border-[color:var(--accent)] hover:-translate-y-px ${active ? "has-activity" : ""} max-[460px]:min-h-[64px] max-[460px]:py-[5px] max-[460px]:px-[2px]`}
      onClick={onClick}
      type="button"
      aria-label={`${fmtDate(day.date)}${
        active ? `, ${day.distanceKm.toFixed(1)} км` : ""
      }`}
    >
      <span className={[
        "month-day-number grid w-[28px] h-[28px] place-items-center rounded-[50%] text-[color:var(--soft)]",
        "text-[12px] [.month-day.has-activity_&]:[background:var(--accent)]",
        "[.month-day.has-activity_&]:text-[color:var(--bg)] [.month-day.has-activity_&]:font-bold",
        "max-[460px]:w-[24px] max-[460px]:h-[24px] max-[460px]:text-[11px]",
      ].join(" ")}>{day.date.getDate()}</span>
      {active ? (
        <span className="month-day-distance text-[color:var(--accent)] text-[10px] font-bold tabular-nums max-[460px]:text-[8px]">
          {day.distanceKm.toFixed(1)} км
        </span>
      ) : (
        <span className="month-day-dot h-[5px]" />
      )}
    </button>
  );
}

export default ActivityCalendar;
