import { useId, useRef, useState } from "react";
import { MapPin, Pencil } from "lucide-react";
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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {city && (
          <>
            <span className="inline-flex min-w-0 items-center gap-2 text-sky-200">
              <MapPin size={14} className="shrink-0" aria-hidden="true" />
              <b>{city}</b>
            </span>
            <span className="text-slate-400" role="status">{status}</span>
          </>
        )}
        <button ref={toggle} type="button" aria-expanded={open} aria-controls={panelId}
          aria-label={city ? `Сменить город прогноза. Сейчас ${city}` : "Выбрать город для прогноза"}
          title={city ? "Сменить город" : undefined}
          onClick={() => setOpen((value) => !value)}
          className={city
            ? "grid size-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-[#283d47] hover:text-sky-200 focus-visible:outline-2 aria-expanded:text-sky-200"
            : "inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#415861] bg-[#203039] px-3 text-sm font-semibold text-sky-200 hover:bg-[#283d47] focus-visible:outline-2"}>
          {city ? <Pencil size={14} aria-hidden="true" /> : (
            <><MapPin size={15} aria-hidden="true" /> Выбрать город</>
          )}
        </button>
      </div>
      <div id={panelId} hidden={!open} className="max-w-lg">
        {open && <WeatherSettings location={weather?.location} request={request} onChange={saveLocation} />}
      </div>
    </div>
  );
}
