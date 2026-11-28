const commonReasons = {
  not_loaded: "Детали ещё не загружены.",
  needs_refresh: "Сохранённые детали нужно обновить из Garmin.",
  no_activity_id: "У записи нет идентификатора тренировки Garmin.",
};

export default function ZoneCoverageExclusions({ runs, reasons }) {
  if (!runs?.length) return null;
  return (
    <details className="mt-2 text-xs text-slate-300">
      <summary className="cursor-pointer text-[#ffc988]">
        {runs.length === 1 ? "Какая пробежка не вошла?" : `Почему не вошли пробежки (${runs.length})?`}
      </summary>
      <ul className="mt-2 grid gap-2">
        {runs.map((run, index) => (
          <li key={run.activity_id ?? `${run.date}-${index}`} className="min-w-0 rounded-md bg-[#223139] px-2 py-1.5">
            <b><time dateTime={run.date}>{run.date.split("-").reverse().join(".")}</time></b>
            {run.name && <span className="break-words"> · {run.name}</span>}
            <p className="text-slate-400">{reasons[run.reason] || commonReasons[run.reason] || "Недостаточно записей для расчёта."}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
