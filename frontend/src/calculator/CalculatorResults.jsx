import SectionEyebrow from "../components/SectionEyebrow";
import { Clock3, Gauge, Route } from "lucide-react";
import { formatClock } from "../lib/paceCalculator";

function CalculatorResults({ distanceKm, paceSecondsPerKm, finishSeconds }) {
  return (
    <section className="calculator-results p-[17px] [border:1px_solid_var(--border)] rounded-[11px] [background:var(--panel)]">
      <div className="calculator-result-heading [&_h2]:mt-1 mx-0 mb-[14px] [&_h2]:[font:600_14px_Manrope,_sans-serif]">
        <SectionEyebrow>РЕЗУЛЬТАТ</SectionEyebrow>
        <h2>Твой ориентир</h2>
      </div>
      <div className="result-grid grid grid-cols-[1fr] gap-2 max-[760px]:grid-cols-[repeat(3,_1fr)] max-[460px]:grid-cols-[1fr]">
        <Result
          icon={<Gauge size={17} />}
          label="ТЕМП"
          value={`${formatClock(paceSecondsPerKm)} /км`}
        />
        <Result
          icon={<Clock3 size={17} />}
          label="ФИНИШНОЕ ВРЕМЯ"
          value={formatClock(finishSeconds)}
        />
        <Result
          icon={<Route size={17} />}
          label="ДИСТАНЦИЯ"
          value={`${distanceKm.toLocaleString("ru-RU")} км`}
        />
      </div>
    </section>
  );
}

function Result({ icon, label, value }) {
  return (
    <article className="calculator-result py-[11px] px-3 [border:1px_solid_var(--border)] rounded-[8px] [background:color-mix(in_srgb,_var(--panel)_75%,_var(--bg))] [&_b]:block [&_b]:mt-[6px] [&_b]:[font:700_18px_Manrope,_sans-serif] max-[760px]:p-[10px] max-[760px]:[&_b]:text-[15px]">
      <div className="calculator-result-label flex items-center gap-[7px] text-[color:var(--accent)] text-[8px] tracking-[0.7px]">
        {icon}
        <span>{label}</span>
      </div>
      <b>{value}</b>
    </article>
  );
}

export default CalculatorResults;
