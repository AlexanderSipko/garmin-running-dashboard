import { CalendarDays } from "lucide-react";
import { fmtDate } from "../lib/format";

function PeriodSelector({ period, periodStart, periodEnd, onChange }) {
  return (
    <div className={[
      "period-tabs flex items-center gap-[5px] pt-5 px-0 pb-4 [&_button]:[border:0]",
      "[&_button]:[background:transparent] [&_button]:text-[color:var(--muted)] [&_button]:py-2 px-[11px]",
      "[&_button]:rounded-[7px] [&_button]:text-[11px] [&_button_small]:ml-[5px]",
      "[&_button_small]:text-[9px] [&_button_small]:opacity-[0.7] max-[760px]:pt-[15px]",
      "max-[420px]:[&_button]:py-[7px] px-2 max-[420px]:[&_button_small]:hidden",
    ].join(" ")}>
      <button
        className={period === "week" ? [
          "active [.period-tabs_button&]:[background:var(--accent-soft)]",
          "[.period-tabs_button&]:text-[color:var(--accent)] [.period-tabs_button&]:font-bold",
          "[.page-navigation_button&]:border-[color:var(--accent)]",
          "[.page-navigation_button&]:[background:var(--accent-soft)]",
          "[.page-navigation_button&]:text-[color:var(--accent)] [.page-navigation_button&]:font-bold",
          "[.year-day&]:[background:var(--accent)] [.year-day&]:text-[color:var(--bg)]",
          "[.year-day&]:font-bold",
        ].join(" ") : ""}
        onClick={() => onChange("week")}
      >
        Неделя <small>7 дней</small>
      </button>
      <button
        className={period === "month" ? [
          "active [.period-tabs_button&]:[background:var(--accent-soft)]",
          "[.period-tabs_button&]:text-[color:var(--accent)] [.period-tabs_button&]:font-bold",
          "[.page-navigation_button&]:border-[color:var(--accent)]",
          "[.page-navigation_button&]:[background:var(--accent-soft)]",
          "[.page-navigation_button&]:text-[color:var(--accent)] [.page-navigation_button&]:font-bold",
          "[.year-day&]:[background:var(--accent)] [.year-day&]:text-[color:var(--bg)]",
          "[.year-day&]:font-bold",
        ].join(" ") : ""}
        onClick={() => onChange("month")}
      >
        Месяц <small>30 дней</small>
      </button>
      <span className="period-date ml-auto flex items-center gap-[7px] text-[color:var(--muted)] text-[10px] max-[760px]:text-[0] max-[760px]:[&_svg]:text-[initial]">
        <CalendarDays size={14} />
        {fmtDate(periodStart, { day: "numeric", month: "short" })} —{" "}
        {fmtDate(periodEnd, { day: "numeric", month: "short" })}
      </span>
    </div>
  );
}

export default PeriodSelector;
