import { Check } from "lucide-react";
import { dashboardOptions } from "../data/dashboardOptions";

function DashboardStylePicker({ selected, onSelect }) {
  return (
    <section className="prototype-toolbar flex justify-between items-center gap-[18px] pt-[15px] px-0 pb-[18px] [border-bottom:1px_solid_var(--border)] [.theme-coach_&]:border-[color:#dfded5] max-[760px]:items-start max-[760px]:flex-col">
      <div>
        <span className="toolbar-title block text-[9px] font-bold tracking-[1.3px] text-[color:var(--muted)]">ВЫБЕРИ НАПРАВЛЕНИЕ</span>
        <span className="toolbar-hint block text-[10px] text-[color:var(--muted)] mt-[5px]">
          Переключи макет — данные и период сохраняются
        </span>
      </div>
      <div className={[
        "style-options flex gap-[7px] [&_button]:relative [&_button]:text-left",
        "[&_button]:[background:var(--panel)] [&_button]:[border:1px_solid_var(--border)]",
        "[&_button]:text-[color:var(--text)] [&_button]:rounded-[8px] [&_button]:pt-2 pr-[27px] pb-2",
        "pl-[10px] [&_button]:min-w-[145px] [&_button_b]:block [&_button_small]:block [&_button_b]:text-[9px]",
        "[&_button_b]:tracking-[0.8px] [&_button_small]:text-[9px] [&_button_small]:text-[color:var(--muted)]",
        "[&_button_small]:mt-[3px] [&_button_svg]:absolute [&_button_svg]:right-[9px]",
        "[&_button_svg]:top-[12px] [&_button_svg]:text-[color:var(--accent)] max-[760px]:w-full",
        "max-[760px]:[&_button]:min-w-0 max-[760px]:[&_button]:[flex:1] max-[760px]:[&_button]:pr-[18px]",
        "max-[760px]:[&_button_small]:text-[8px] max-[760px]:[&_button_svg]:right-[5px]",
        "max-[420px]:[&_button]:py-2 px-[5px] max-[420px]:[&_button_small]:hidden",
        "max-[420px]:[&_button_svg]:right-[4px] max-[420px]:[&_button_svg]:top-[8px]",
      ].join(" ")}>
        {dashboardOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => onSelect(option.id)}
            className={selected === option.id ? [
              "selected [.style-options_button&]:border-[color:var(--accent)]",
              "[.style-options_button&]:[box-shadow:0_0_0_1px_color-mix(in_srgb,_var(--accent)_23%,_transparent)]",
              "[.distance-presets_button&]:border-[color:var(--accent)]",
              "[.distance-presets_button&]:[background:var(--accent-soft)]",
              "[.distance-presets_button&]:text-[color:var(--accent)]",
              "[.calculator-mode_button&]:border-[color:var(--accent)]",
              "[.calculator-mode_button&]:[background:var(--accent-soft)]",
              "[.calculator-mode_button&]:text-[color:var(--accent)]",
              "[.year-month-card&]:border-[color:var(--accent)]",
              "[.year-month-card&]:[background:var(--accent-soft)]",
            ].join(" ") : ""}
          >
            <b>{option.name}</b>
            <small>{option.hint}</small>
            {selected === option.id && <Check size={14} />}
          </button>
        ))}
      </div>
    </section>
  );
}

export default DashboardStylePicker;
