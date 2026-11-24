import { Ruler } from "lucide-react";
import { measurements } from "./measurements";

const input = "w-full min-w-0 rounded-xl border border-[#3b505b] bg-[#111c23] px-3 py-2.5 text-base text-slate-100 focus:border-[#ffc988] focus:outline-none";
const button = "min-h-11 rounded-xl px-3 text-sm font-semibold disabled:opacity-50";

export default function MeasurementForm({ form, disabled, change, save, reset }) {
  return (
    <form onSubmit={save} className="min-w-0 rounded-2xl border border-[#344852] bg-gradient-to-br from-[#24343d] to-[#19252d] p-4 sm:p-5">
      <h2 className="mb-4 flex items-center gap-2 font-bold"><Ruler size={18} className="text-[#ffc988]" aria-hidden="true" /> Запись замеров</h2>
      <fieldset disabled={disabled} className="grid min-w-0 gap-4">
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">Дата
          <input type="date" required className={input} value={form.day} onChange={(event) => change("day", event.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3 sm:gap-x-3">
          {measurements.map(([key, label, unit]) => (
            <label key={key} className="grid min-w-0 gap-1.5 text-sm">
              <span className="font-medium text-slate-200">{label}</span>
              <span className="relative min-w-0">
          <input type="number" inputMode="decimal" min="0.1" max={key === "weight" ? 700 : 500} step="0.1"
                className={`${input} pr-9 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
                aria-label={`${label}, ${unit}`} value={form[key] ?? ""} onChange={(event) => change(key, event.target.value)} />
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">{unit}</span>
          </span>
            </label>
          ))}
        </div>
        <label className="grid gap-1.5 text-sm font-medium">Заметка
          <textarea className={`${input} resize-y`} rows={3} maxLength={1000} value={form.note}
            onChange={(event) => change("note", event.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2 border-t border-[#344852] pt-3">
          <button className={`${button} bg-[#ffc988] text-[#261a10] hover:bg-[#ffd8aa]`}>Сохранить</button>
          <button type="button" className={`${button} border border-[#435762] text-slate-200 hover:bg-slate-700`} onClick={reset}>Очистить</button>
        </div>
      </fieldset>
    </form>
  );
}
