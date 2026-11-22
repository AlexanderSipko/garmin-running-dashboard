import SectionEyebrow from "./SectionEyebrow";
import { Waves } from "lucide-react";

function PeriodInsight({ kind, p }) {
  const text =
    p.delta == null
      ? "Для сравнения с прошлым периодом нужно больше истории."
      : p.delta > 5
      ? `Объём вырос на ${p.delta}% относительно прошлого периода. Следи, чтобы рост нагрузки сопровождался восстановлением.`
      : p.delta < -5
      ? `Объём ниже прошлого периода на ${Math.abs(
          p.delta
        )}%. Проверь, совпадает ли это с твоим планом и самочувствием.`
      : "Объём близок к прошлому периоду — нагрузка выглядит стабильной.";
  return (
    <article className={`insight-card flex items-start gap-3 py-[13px] px-4 my-[10px] border border-[color:var(--border)] rounded-[11px] bg-[color:var(--panel)] [&_p]:text-[11px] [&_p]:leading-[1.55] [&_p]:my-[5px] [&_p]:text-[color:var(--text)] [&_small]:text-[9px] [&_small]:text-[color:var(--muted)]`}>
      <span className="insight-icon text-[color:var(--accent)] w-[30px] h-[30px] rounded-[9px] [background:var(--accent-soft)] grid place-items-center [flex:none]">
        <Waves size={18} />
      </span>
      <div>
        <SectionEyebrow>НАБЛЮДЕНИЕ ПО ДАННЫМ</SectionEyebrow>
        <p>{text}</p>
        <small>Сравнение километража; не медицинская оценка.</small>
      </div>
    </article>
  );
}

export default PeriodInsight;
