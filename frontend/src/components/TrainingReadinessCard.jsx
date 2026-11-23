import { useEffect, useState } from "react";
import { Footprints, Gauge, Heart, HeartPulse, Moon } from "lucide-react";
import { localDateKey } from "../lib/wellnessDates";

const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const metrics = [
  { key: "sleep_hours", label: "Сон", unit: "ч", icon: Moon, color: "text-[#b9a4ff]" },
  { key: "resting_bpm", label: "Пульс покоя", unit: "уд/мин", icon: Heart, color: "text-[#f3ad92]" },
  { key: "hrv_average_ms", label: "ВЧП за 7 дней", unit: "мс", icon: HeartPulse, color: "text-[#ef8490]" },
  { key: "recorded_run_km", label: "Бег за 7 дней", unit: "км", icon: Footprints, color: "text-[#efa85f]" },
];

export default function TrainingReadinessCard({ syncedAt, wellnessSyncedAt }) {
  const today = localDateKey(new Date());
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setFailed(false);
    fetch(`/api/dashboard/readiness?day=${today}`, { signal })
      .then((response) => {
        if (!response.ok) throw new Error("Readiness request failed");
        return response.json();
      })
      .then((result) => {
        if (!signal.aborted) setData(result);
      })
      .catch(() => {
        if (!signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [today, syncedAt, wellnessSyncedAt]);

  const hasMeasurements = data && metrics.some(({ key }) => typeof data[key] === "number");
  const measurementDate = data?.measurement_date;

  return (
    <section className="mb-4 rounded-xl border border-[#3b4a50] bg-linear-to-br from-[#23353a] to-[#1a272d] p-3">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <Gauge size={17} className="shrink-0 text-[#a8dfce]" aria-hidden="true" />
        Готовность к тренировкам
      </h2>
      {hasMeasurements && (
        <>
          {measurementDate && (
            <p className="mt-1 text-xs text-[#aebec5]">
              Сон и пульс · <time dateTime={measurementDate}>{shortDate.format(new Date(`${measurementDate}T12:00:00`))}</time>
            </p>
          )}
          <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-2 border-t border-[#95acb326] pt-2">
            {metrics.map(({ key, label, unit, icon: Icon, color }) => (
              <div key={key} className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-[#bbc8cd]">
                  <Icon size={13} className={`shrink-0 ${color}`} aria-hidden="true" />
                  {label}
                </dt>
                <dd className="mt-0.5 text-base font-bold tabular-nums" title={
                  key === "hrv_average_ms" && data.hrv_samples > 0
                    ? `Есть замеры за ${data.hrv_samples} из 7 дней`
                    : undefined
                }>
                  {typeof data[key] === "number" ? (
                    <>{number.format(data[key])} <small className="text-[11px] font-medium text-[#a8b7be]">{unit}</small></>
                  ) : "—"}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <p className="mt-2 text-[11px] text-[#aebec5]" role="status">
        {failed ? "Не удалось загрузить показатели." : data
          ? hasMeasurements ? "Балл Garmin недоступен." : "Пока нет показателей за последние 7 дней."
          : "Загружаем показатели…"}
      </p>
    </section>
  );
}
