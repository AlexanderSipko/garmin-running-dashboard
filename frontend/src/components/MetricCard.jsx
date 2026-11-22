import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function Trend({ value }) {
  return value == null ? (
    <span className="trend neutral inline-flex items-center gap-[3px] text-[9px] [&.up]:text-[color:#78c47f] [&.down]:text-[color:#e18b78] [&.neutral]:text-[color:var(--muted)] [.trend&]:text-[color:var(--muted)] [.metric-card_&]:mt-1 [.calendar-period-summary_&]:text-[10px]">нет сравнения</span>
  ) : (
    <span className={`trend inline-flex items-center gap-[3px] text-[9px] ${value >= 0 ? "up text-[#78c47f]" : "down text-[#e18b78]"}`}>
      {value >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{" "}
      {Math.abs(value)}% к прошлому периоду
    </span>
  );
}

function MetricCard({ label, value, unit, icon, trend }) {
  return (
    <article className="metric-card [background:var(--panel)] [border:1px_solid_var(--border)] rounded-[11px] py-[13px] px-[15px] min-h-[84px]">
      <div className="metric-label text-[color:var(--muted)] text-[8px] tracking-[0.8px] flex items-center gap-[7px] [&_span]:text-[color:var(--accent)] [&_span]:flex">
        <span>{icon}</span>
        {label}
      </div>
      <div className="metric-value [font:700_21px_Manrope,_sans-serif] tracking-[-0.5px] mt-[9px] [&_small]:[font:500_9px_'DM_Sans',_sans-serif] [&_small]:text-[color:var(--muted)] [&_small]:ml-[5px] [&_small]:tracking-[0]">
        {value}
        <small>{unit}</small>
      </div>
      {trend && <Trend value={trend} />}
    </article>
  );
}

export default MetricCard;
