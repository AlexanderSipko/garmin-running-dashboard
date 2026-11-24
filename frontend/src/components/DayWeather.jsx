import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Droplets, Sun } from "lucide-react";

function conditions(code) {
  if (code === 0) return [Sun, "Ясно", "text-[#ffd296]"];
  if (code === 1 || code === 2) return [CloudSun, "Переменная облачность", "text-[#ffd296]"];
  if (code === 45 || code === 48) return [CloudFog, "Туман", "text-slate-300"];
  if (code >= 95) return [CloudLightning, "Гроза", "text-violet-300"];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return [CloudSnow, "Снег", "text-sky-200"];
  if (code >= 51) return [CloudRain, "Дождь", "text-sky-300"];
  return [Cloud, "Облачно", "text-slate-300"];
}

function degrees(value) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}°`;
}

export function weatherLabel(day) {
  if (!day) return "";
  return [
    day.code == null ? "" : conditions(day.code)[1],
    day.min != null && day.max != null ? `от ${degrees(day.min)} до ${degrees(day.max)}` : "",
    day.precipitation != null ? `вероятность осадков до ${day.precipitation}%` : "",
  ].filter(Boolean).join(", ");
}

export default function DayWeather({ day }) {
  const [Icon, , color] = conditions(day.code);
  return (
    <span aria-hidden="true" className="mt-1 grid w-full min-w-0 justify-items-center gap-0.5 text-[9px] leading-none sm:text-[11px]">
      <span className="flex items-center gap-0.5 whitespace-nowrap text-slate-200">
        {day.code != null && <Icon className={`size-3 shrink-0 ${color}`} />}
        {day.max != null && <span>
          {degrees(day.max)}
          {day.min != null && <span className="hidden text-slate-400 min-[1120px]:inline"> / {degrees(day.min)}</span>}
        </span>}
      </span>
      {day.precipitation != null && <span className="text-sky-200">{day.precipitation}%</span>}
    </span>
  );
}

export function SelectedDayWeather({ day }) {
  if (!day) return null;
  const [Icon, label, color] = conditions(day.code);
  const temperature = [day.min, day.max].filter((value) => value != null).map(degrees).join(" … ");

  return (
    <section aria-label="Погода на выбранный день"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[#38505e] bg-[#1a2a34] px-3 py-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        {day.code != null && <Icon size={18} className={color} aria-hidden="true" />}
        {day.code != null ? label : "Прогноз погоды"}
      </h3>
      {temperature && <span className="text-sm font-semibold tabular-nums text-slate-100">{temperature}</span>}
      {day.precipitation != null && (
        <span className="inline-flex items-center gap-1.5 text-sm text-sky-200">
          <Droplets size={15} aria-hidden="true" /> Вероятность осадков {day.precipitation}%
        </span>
      )}
    </section>
  );
}
