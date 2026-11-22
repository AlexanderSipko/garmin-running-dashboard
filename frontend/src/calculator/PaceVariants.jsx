import SectionEyebrow from "../components/SectionEyebrow";
import { calculatePaceVariants, formatClock } from "../lib/paceCalculator";

function PaceVariants({ distanceKm, paceSecondsPerKm }) {
  const variants = calculatePaceVariants(distanceKm, paceSecondsPerKm);

  return (
    <section className="calculator-table-card pace-variants p-[17px] [border:1px_solid_var(--border)] rounded-[11px] [background:var(--panel)] mb-[10px]">
      <div className="calculator-card-heading [&_h2]:mt-1 mx-0 mb-[14px] [&_h2]:[font:600_14px_Manrope,_sans-serif]">
        <SectionEyebrow>ЕСЛИ ИЗМЕНИТЬ ТЕМП</SectionEyebrow>
        <h2>Варианты времени на финише</h2>
      </div>
      <div className="variant-list mt-2">
        {variants.map((variant) => (
          <div
            className={variant.adjustment === 0 ? [
              "variant current grid grid-cols-[1fr_0.7fr_0.7fr] gap-[10px] py-[10px] px-2",
              "[border-top:1px_solid_var(--border)] text-[color:var(--muted)] text-[10px]",
              "[&_b]:text-[color:var(--text)] [&_b]:font-semibold [&.current]:[background:var(--accent-soft)]",
              "[&.current]:text-[color:var(--accent)] [.variant&]:[background:var(--accent-soft)]",
              "[.variant&]:text-[color:var(--accent)] [&.current_b]:text-[color:var(--accent)]",
              "[.variant&_b]:text-[color:var(--accent)] max-[460px]:grid-cols-[1fr_0.8fr_0.7fr]",
              "max-[460px]:gap-[5px] max-[460px]:pr-[2px] max-[460px]:pl-[2px] max-[460px]:text-[9px]",
            ].join(" ") : [
              "variant grid grid-cols-[1fr_0.7fr_0.7fr] gap-[10px] py-[10px] px-2",
              "[border-top:1px_solid_var(--border)] text-[color:var(--muted)] text-[10px]",
              "[&_b]:text-[color:var(--text)] [&_b]:font-semibold [&.current]:[background:var(--accent-soft)]",
              "[&.current]:text-[color:var(--accent)] [&.current_b]:text-[color:var(--accent)]",
              "max-[460px]:grid-cols-[1fr_0.8fr_0.7fr] max-[460px]:gap-[5px] max-[460px]:pr-[2px]",
              "max-[460px]:pl-[2px] max-[460px]:text-[9px]",
            ].join(" ")}
            key={variant.adjustment}
          >
            <span>
              {variant.adjustment === 0
                ? "Текущий темп"
                : `${variant.adjustment > 0 ? "+" : ""}${
                    variant.adjustment
                  } сек/км`}
            </span>
            <b>{formatClock(variant.paceSecondsPerKm)} /км</b>
            <b>{formatClock(variant.finishSeconds)}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

export default PaceVariants;
