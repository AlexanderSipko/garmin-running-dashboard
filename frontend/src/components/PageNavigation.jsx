function PageNavigation({ page, onPageChange }) {
  return (
    <nav className="page-navigation flex gap-[7px] pt-4 [&_button]:py-2 px-3 [&_button]:[border:1px_solid_var(--border)] [&_button]:rounded-[7px] [&_button]:[background:var(--panel)] [&_button]:text-[color:var(--muted)] [&_button]:text-[10px]" aria-label="Разделы">
      <button
        className={page === "dashboard" ? [
          "active [.period-tabs_button&]:[background:var(--accent-soft)]",
          "[.period-tabs_button&]:text-[color:var(--accent)] [.period-tabs_button&]:font-bold",
          "[.page-navigation_button&]:border-[color:var(--accent)]",
          "[.page-navigation_button&]:[background:var(--accent-soft)]",
          "[.page-navigation_button&]:text-[color:var(--accent)] [.page-navigation_button&]:font-bold",
          "[.year-day&]:[background:var(--accent)] [.year-day&]:text-[color:var(--bg)]",
          "[.year-day&]:font-bold",
        ].join(" ") : ""}
        onClick={() => onPageChange("dashboard")}
      >
        Дашборд
      </button>
      <button
        className={page === "calculator" ? [
          "active [.period-tabs_button&]:[background:var(--accent-soft)]",
          "[.period-tabs_button&]:text-[color:var(--accent)] [.period-tabs_button&]:font-bold",
          "[.page-navigation_button&]:border-[color:var(--accent)]",
          "[.page-navigation_button&]:[background:var(--accent-soft)]",
          "[.page-navigation_button&]:text-[color:var(--accent)] [.page-navigation_button&]:font-bold",
          "[.year-day&]:[background:var(--accent)] [.year-day&]:text-[color:var(--bg)]",
          "[.year-day&]:font-bold",
        ].join(" ") : ""}
        onClick={() => onPageChange("calculator")}
      >
        Калькулятор темпа
      </button>
    </nav>
  );
}

export default PageNavigation;
