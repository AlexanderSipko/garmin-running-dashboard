import { useState } from "react";
import MeasurementArrows from "./MeasurementArrows";
import MeasurementBody from "./MeasurementBody";
import MeasurementGuide from "./MeasurementGuide";
import { measurements } from "./measurements";

const input = "w-full min-w-0 rounded-lg border border-[#3b505b] bg-[#111c23] px-2 py-2 text-base text-slate-100 focus:border-[#ffc988] focus:outline-none";
const button = "min-h-11 rounded-xl px-3 text-sm font-semibold disabled:opacity-50";

export default function MeasurementForm({ form, disabled, change, save, cancel, editing }) {
  const [active, setActive] = useState(null);
  const [back, setBack] = useState(false);

  function field(key, side) {
    const [, label, unit] = measurements.find(([id]) => id === key);
    return (
      <label key={key} className="relative grid min-w-0 gap-1 text-xs font-medium text-slate-200">
        <span>{label}</span>
        <span className="relative min-w-0" data-measurement-field={side ? key : undefined} data-side={side}>
          <input type="number" inputMode="decimal" min="0.1" max={key === "weight" ? 700 : 500} step="0.1"
            className={`${input} pr-7 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
            aria-label={`${label}, ${unit}`} value={form[key] ?? ""}
            onFocus={() => {
              setActive(key);
              if (key !== "weight") setBack(key === "glutes" || key === "calf");
            }}
            onBlur={() => setActive(null)}
            onChange={(event) => change(key, event.target.value)} />
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-slate-400">{unit}</span>
        </span>
      </label>
    );
  }

  return (
    <form onSubmit={save} className="mx-auto w-full max-w-2xl rounded-2xl border border-[#344852] bg-[#202e37] min-w-0 p-2.5 sm:p-5">
      <h2 className="mb-3 font-bold">{editing ? "Редактирование замера" : "Новая запись"}</h2>
      <fieldset disabled={disabled} className="grid min-w-0 gap-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="grid min-w-0 gap-1 text-xs font-medium">Дата
            <input type="date" required readOnly={editing} className={input} value={form.day}
              onChange={(event) => change("day", event.target.value)} />
          </label>
          {field("weight")}
        </div>
        <MeasurementGuide />
        <div className="relative grid grid-cols-[minmax(0,1fr)_minmax(44px,0.65fr)_minmax(0,1fr)] gap-2 rounded-xl bg-[#18262e] p-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,1fr)] sm:gap-5 sm:p-4">
          <div className="grid content-between gap-2 py-2">
            {["neck", "chest", "waist", "thigh"].map((key) => field(key, "left"))}
          </div>
          <div className="flex min-w-0 items-center py-2">
            <MeasurementBody back={back} active={active} />
          </div>
          <div className="grid content-between gap-2 pb-2 pt-7">
            {["shoulders", "arm", "glutes", "calf"].map((key) => field(key, "right"))}
          </div>
          <MeasurementArrows active={active} />
        </div>
        <label className="grid gap-1 text-xs font-medium">Заметка
          <textarea className={`${input} resize-y`} rows={2} maxLength={1000} value={form.note}
            onChange={(event) => change("note", event.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button className={`${button} bg-[#ffc988] text-[#261a10] hover:bg-[#ffd8aa]`}>Сохранить</button>
          <button type="button" className={`${button} border border-[#435762] text-slate-200 hover:bg-slate-700`} onClick={cancel}>Отмена</button>
        </div>
      </fieldset>
    </form>
  );
}
