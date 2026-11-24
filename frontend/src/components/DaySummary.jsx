import { fmtDuration, fmtPace } from "../lib/format";

import { averageRunningPace, summarizeActivities } from "../lib/calendarAnalytics";

export default function DaySummary({ activities, date }) {
  const summary = summarizeActivities(activities);
  const { runKm: distance, runSeconds: seconds, hrSeconds, hrWeight } = summary;
  const metrics = [
    ["ДИСТАНЦИЯ", `${distance.toFixed(1)} км`],
    ["ВРЕМЯ", fmtDuration(seconds)],
    ["СРЕДНИЙ ТЕМП", fmtPace(averageRunningPace(summary))],
    ["СРЕДНИЙ ПУЛЬС", hrWeight ? `${Math.round(hrSeconds / hrWeight)} bpm` : "—"],
  ];
  return (
    <section className="day-summary min-w-0 pt-3 border-t border-[#34424a]" aria-label="Метрики выбранного дня">
      <h2 className="m-0 mb-2 text-[15px] font-semibold text-[#e0e8eb]">Итоги дня · {date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map(([label, value]) => (
          <article className="min-w-0 rounded-[10px] border border-[#34424a] bg-[linear-gradient(145deg,_#202a30,_#192228_80%)] p-3" key={label}>
            <small className="block text-[10px] text-[#aab6bb]">{label}</small>
            <b className="mt-1 block text-[18px] text-[#e5ebee]">{activities.length ? value : "—"}</b>
          </article>
        ))}
      </div>
      <p className="mt-2 mb-0 text-[11px] text-[#8f9ea5]">{activities.length} пробежек · суммарно {distance.toFixed(1)} км</p>
    </section>
  );
}
