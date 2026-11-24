import { useId, useRef, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import WeatherSettings from "./WeatherSettings";

export default function WeatherPanel({ weather, request, onChange }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggle = useRef(null);
  const city = weather?.location?.name;
  const status = weather?.loading ? "Загружаю прогноз…" : weather?.unavailable
    ? "Прогноз временно недоступен"
    : "Прогноз на 14 дней";

  function saveLocation(location) {
    onChange(location);
    setOpen(false);
    toggle.current?.focus();
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button ref={toggle} type="button" aria-expanded={open} aria-controls={panelId}
          aria-label={city ? `Сменить город прогноза. Сейчас ${city}` : "Выбрать город для прогноза"}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg border border-[#415861] bg-[#203039] px-3 text-sm font-semibold text-sky-200 hover:bg-[#283d47] focus-visible:outline-2">
          <MapPin size={15} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{city || "Выбрать город"}</span>
          <ChevronDown size={14} className={open ? "shrink-0 rotate-180" : "shrink-0"} aria-hidden="true" />
        </button>
        {city && <span className="text-xs text-slate-400" role="status">{status}</span>}
      </div>
      <div id={panelId} hidden={!open} className="max-w-lg">
        {open && <WeatherSettings location={weather?.location} request={request} onChange={saveLocation} />}
      </div>
    </div>
  );
}
