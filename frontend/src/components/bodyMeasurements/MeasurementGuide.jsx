import { Info } from "lucide-react";
import { measurements } from "./measurements";

export default function MeasurementGuide() {
  return (
    <details className="rounded-xl border border-[#3b505b] bg-[#19252d] text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 font-medium [&::-webkit-details-marker]:hidden">
        <Info size={17} className="text-[#ffc988]" aria-hidden="true" /> Как измерять
      </summary>
      <div className="grid gap-3 border-t border-[#3b505b] p-3 text-slate-300">
        <p>Для начала записывай вес раз в неделю, а обхваты раз в две недели. Держи ленту ровно и не затягивай её.</p>
        <dl className="grid gap-2 sm:grid-cols-2">
          {measurements.map(([key, label, , hint]) => (
            <div key={key}><dt className="font-semibold text-slate-100">{label}</dt><dd>{hint}</dd></div>
          ))}
        </dl>
      </div>
    </details>
  );
}
