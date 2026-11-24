import { ArrowDown, ArrowUp, Minus, Pencil, Trash2 } from "lucide-react";
import { measurementChanges, measurements } from "./measurements";

export default function MeasurementJournal({ entries, loading, error, busy, edit, remove }) {
  const changes = measurementChanges(entries);

  return (
    <section className="min-w-0 rounded-2xl border border-[#344852] bg-[#172229] p-3 sm:p-5">
      <h2 className="text-lg font-bold">Журнал записей</h2>
      <p className="mb-4 mt-1 text-xs leading-relaxed text-slate-400">Стрелка показывает изменение к предыдущему замеру.</p>
      {loading ? <p role="status">Загружаю журнал…</p> : entries.length === 0 ? (
        !error && <p className="text-sm text-slate-300">Записей пока нет.</p>
      ) : <ul className="grid gap-3">
        {entries.map((entry) => (
          <li key={entry.day} className="rounded-xl border border-[#344852] bg-[#202f38] p-2.5 sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-2 border-b border-[#3b4d56] pb-2">
              <time dateTime={entry.day} className="font-bold">{entry.day.split("-").reverse().join(".")}</time>
              <div className="flex gap-2">
                <button type="button" disabled={busy} title="Редактировать" aria-label={`Редактировать запись за ${entry.day}`}
                  className="grid size-11 place-items-center rounded-lg border border-slate-600 text-[#ffc988] hover:bg-slate-700 disabled:opacity-50"
                  onClick={() => edit(entry)}><Pencil size={17} aria-hidden="true" /></button>
                <button type="button" disabled={busy} title="Удалить" aria-label={`Удалить запись за ${entry.day}`}
                  className="grid size-11 place-items-center rounded-lg border border-rose-300/30 text-rose-300 hover:bg-rose-400/15 disabled:opacity-50"
                  onClick={() => remove(entry.day)}><Trash2 size={17} aria-hidden="true" /></button>
              </div>
            </div>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7.5rem),1fr))] gap-1.5 empty:hidden">
              {measurements.filter(([key]) => entry[key] != null).map(([key, label, unit]) => {
                const change = changes.get(entry.day)[key];
                const difference = change?.difference ?? null;
                const Icon = difference > 0 ? ArrowUp : difference < 0 ? ArrowDown : Minus;
                const color = difference > 0 ? "text-amber-300" : difference < 0 ? "text-sky-300" : "text-slate-400";
                return (
                  <div key={key} className="min-w-0 rounded-lg bg-[#19262e] px-2.5 py-1.5">
                    <dt className="text-[11px] leading-tight text-slate-400">{label}</dt>
                    <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-1 tabular-nums">
                      <span className="whitespace-nowrap text-base font-semibold leading-tight">
                        {entry[key].toLocaleString("ru-RU")} <small className="text-[10px] font-normal text-slate-400">{unit}</small>
                      </span>
                      {difference !== null && (
                        <sup title={`К замеру от ${change.day.split("-").reverse().join(".")}`}
                          aria-label={`Изменение: ${difference.toLocaleString("ru-RU")} ${unit}`}
                          className={`relative -top-1 inline-flex items-center gap-px whitespace-nowrap text-[10px] leading-none ${color}`}>
                          <Icon size={10} aria-hidden="true" />
                          {difference > 0 ? "+" : ""}{difference.toLocaleString("ru-RU")}
                        </sup>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {entry.note && <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-[#19262e] px-3 py-2 text-sm leading-relaxed text-slate-200">{entry.note}</p>}
          </li>
        ))}
      </ul>}
    </section>
  );
}
