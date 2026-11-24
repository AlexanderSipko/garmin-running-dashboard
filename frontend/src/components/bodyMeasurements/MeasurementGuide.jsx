import { PersonStanding } from "lucide-react";
import { measurements } from "./measurements";

export default function MeasurementGuide() {
  return (
    <aside className="grid content-start gap-3 rounded-2xl border border-slate-700 p-4 text-sm">
      <h2 className="flex items-center gap-2 font-bold"><PersonStanding size={24} className="text-[#ffc988]" /> Как измерять</h2>
      <svg viewBox="0 0 220 160" role="img" aria-label="Точки замера шеи, плеч, груди, талии, ягодиц, плеча, бедра и икры" className="mx-auto h-48 w-full max-w-[250px] rounded-xl bg-gradient-to-b from-[#263942] to-[#19262e] p-2">
        <g fill="#526972" stroke="#9bb2ba" strokeWidth="1.5" strokeLinejoin="round">
          <circle cx="105" cy="20" r="11" />
          <path d="M100 32h10l2 7 12 4q6 2 9 10l10 27-7 3-13-22-5 13 6 21-4 44h-10l-5-34-5 34H90l-4-44 6-21-5-13-13 22-7-3 10-27q3-8 9-10l12-4z" />
        </g>
        <g fill="none" stroke="#ffc988" strokeWidth="1.5">
          <path d="M85 44H45 M110 35h36 M93 129H47 M91 55h28l19-12h8 M91 73H48 M87 94h36l20-13h5 M77 62H42 M112 116h14l13 8h8" />
        </g>
        <g fill="#ffc988">
          <circle cx="119" cy="55" r="2.5" /><circle cx="91" cy="73" r="2.5" />
          <circle cx="123" cy="94" r="2.5" /><circle cx="77" cy="62" r="2.5" /><circle cx="116" cy="116" r="2.5" />
        </g>
        <g fill="#e3eaed" fontSize="10">
          <text x="7" y="47">Плечи</text><text x="151" y="37">Шея</text><text x="18" y="132">Икра</text>
          <text x="151" y="46">Грудь</text><text x="7" y="76">Талия</text>
          <text x="153" y="84">Ягодицы</text><text x="6" y="65">Рука</text>
          <text x="152" y="127">Бедро</text>
        </g>
      </svg>
      <p className="text-slate-300">Для начала записывай вес раз в неделю, а объёмы раз в две недели. Можно выбрать свой ритм.</p>
      <p className="text-slate-300">Держи ленту ровно и не затягивай её. Руку и бедро измеряй с одной и той же стороны.</p>
      <dl className="grid gap-2">
        {measurements.map(([key, label, , hint]) => (
          <div key={key}><dt className="font-semibold">{label}</dt><dd className="text-slate-300">{hint}</dd></div>
        ))}
      </dl>
    </aside>
  );
}
