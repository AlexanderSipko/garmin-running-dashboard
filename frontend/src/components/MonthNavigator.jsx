import SectionEyebrow from "./SectionEyebrow";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const WEEKDAYS = ["П", "В", "С", "Ч", "П", "С", "В"];

function MonthNavigator({ selectedMonth, monthTotals, onSelectMonth }) {
  const year = selectedMonth.getFullYear();

  return (
    <section className="month-navigator p-[18px] mb-3 [border:1px_solid_var(--border)] rounded-[11px] [background:var(--panel)] max-[460px]:py-[13px] px-[10px]">
      <header className="month-navigator-heading flex items-center justify-between gap-[14px] [&_h2]:mt-1 mx-0 mb-3 [&_h2]:[font:600_14px_Manrope,_sans-serif] [&_h2]:capitalize">
        <div>
          <SectionEyebrow>БЫСТРЫЙ ПЕРЕХОД</SectionEyebrow>
          <h2>Календарь года</h2>
        </div>
        <div className={[
          "year-switcher flex items-center gap-[9px] [&_button]:grid [&_button]:w-[30px] [&_button]:h-[30px]",
          "[&_button]:place-items-center [&_button]:[border:1px_solid_var(--border)] [&_button]:rounded-[7px]",
          "[&_button]:[background:var(--bg)] [&_button]:text-[color:var(--text)] [&_b]:min-w-[40px]",
          "[&_b]:[font:600_13px_Manrope,_sans-serif] [&_b]:text-center",
        ].join(" ")}>
          <button
            aria-label="Предыдущий год"
            onClick={() =>
              onSelectMonth(new Date(year - 1, selectedMonth.getMonth(), 1))
            }
          >
            <ChevronLeft size={16} />
          </button>
          <b>{year}</b>
          <button
            aria-label="Следующий год"
            onClick={() =>
              onSelectMonth(new Date(year + 1, selectedMonth.getMonth(), 1))
            }
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      <div className="year-calendar-grid grid grid-cols-[repeat(4,_minmax(0,_1fr))] gap-[10px] mt-[9px] max-[760px]:grid-cols-[repeat(3,_minmax(0,_1fr))] max-[460px]:grid-cols-[repeat(2,_minmax(0,_1fr))] max-[460px]:gap-[5px]">
        {monthTotals.map((month) => (
          <MiniMonth
            key={month.month}
            month={month}
            year={year}
            selected={month.month === selectedMonth.getMonth()}
            onSelect={() => onSelectMonth(new Date(year, month.month, 1))}
          />
        ))}
      </div>
      <p className="month-navigator-note mt-[9px] mx-0 mb-0 text-[color:var(--muted)] text-[10px] leading-[1.5]">
        Выбери месяц, чтобы открыть его календарь и статистику.
      </p>
    </section>
  );
}

function MiniMonth({ month, year, selected, onSelect }) {
  const daysInMonth = new Date(year, month.month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month.month, 1).getDay() + 6) % 7;
  const activeDays = new Set(
    month.activities.map((activity) => new Date(activity.start_time).getDate())
  );

  return (
    <article className={`year-month-card min-w-0 p-[10px] border border-[color:var(--border)] rounded-[8px] bg-[color:var(--bg)] [&.selected]:border-[color:var(--accent)] [&.selected]:bg-[color:var(--accent-soft)] ${selected ? "selected" : ""} max-[460px]:py-[7px] max-[460px]:px-[5px]`}>
      <button className="year-month-heading flex w-full items-center justify-between gap-[5px] p-0 [border:0] [background:transparent] text-[color:var(--text)] text-left [&_b]:[font:600_12px_Manrope,_sans-serif] [&_span]:text-[color:var(--accent)] [&_span]:text-[10px] [&_span]:font-bold [&_span]:whitespace-nowrap" onClick={onSelect} type="button">
        <b>{MONTHS[month.month]}</b>
        <span>{month.distanceKm.toFixed(1)} км</span>
      </button>
      <div className="year-weekdays grid grid-cols-[repeat(7,_minmax(0,_1fr))] justify-items-center mt-2 [&_span]:text-[color:var(--muted)] [&_span]:text-[8px]">
        {WEEKDAYS.map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>
      <div className="year-month-days grid grid-cols-[repeat(7,_minmax(0,_1fr))] justify-items-center [gap:2px_1px] mt-[3px]">
        {Array.from({ length: firstWeekday }, (_, index) => (
          <span className="year-day-empty grid w-[22px] h-[22px] place-items-center max-[460px]:w-[19px] max-[460px]:h-[19px] max-[460px]:text-[8px]" key={`empty-${index}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          return (
            <button
              className={`year-day grid w-[22px] h-[22px] place-items-center p-0 border-0 rounded-full bg-transparent text-[color:var(--muted)] text-[9px] [&.active]:bg-[color:var(--accent)] [&.active]:text-[color:var(--bg)] [&.active]:font-bold ${activeDays.has(day) ? "active" : ""} max-[460px]:w-[19px] max-[460px]:h-[19px] max-[460px]:text-[8px]`}
              key={day}
              onClick={onSelect}
              type="button"
              aria-label={`${day} ${MONTHS[month.month]}${
                activeDays.has(day) ? ", была тренировка" : ""
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
      <span className="year-month-runs block pt-[6px] text-[color:var(--muted)] text-[9px]">
        {month.activities.length}{" "}
        {month.activities.length === 1 ? "тренировка" : "тренировок"}
      </span>
    </article>
  );
}

export default MonthNavigator;
