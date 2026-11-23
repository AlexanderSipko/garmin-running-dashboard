import { useState } from "react";

export const sessionLabels = {
  rest: "Отдых", easy: "Лёгкий бег", recovery: "Восстановительный бег", long: "Длительная",
  tempo: "Темповый бег", intervals: "Интервалы", quality: "Качественная",
  strength: "Силовая", race: "Запланированный старт",
};
const runKinds = new Set(["easy", "recovery", "long", "tempo", "intervals", "quality", "race"]);
const field = "min-w-0 rounded-lg border border-[#46545b] bg-[#202c31] px-2.5 py-2 text-sm";
const button = "min-h-9 rounded-lg border border-[#526167] px-3 text-sm font-semibold disabled:opacity-50";

export function isPlannedRun(session) {
  return runKinds.has(session?.kind);
}

export async function requestWeek(path, options) {
  const response = await fetch(`/api/coach/week${path}`, options);
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw new Error(typeof result?.detail === "string" ? result.detail : "Не удалось обновить план недели.");
  }
  return result;
}

export default function PlannedSessionEditor({ session, disabled, onSave, onCancel }) {
  const [kind, setKind] = useState(session.kind);
  const [distance, setDistance] = useState(String(session.distance_km ?? "").replace(".", ","));
  const [description, setDescription] = useState(session.instruction ?? "");
  const input = distance.trim().replace(",", ".");
  const km = Number(input);
  const valid = /^\d+(?:\.\d)?$/.test(input) && Number.isFinite(km) && km >= 0.1;
  const kinds = session.kind === "race" ? ["race"] : [...runKinds].filter((value) => value !== "race");

  function submit(event) {
    event.preventDefault();
    if (valid && !disabled) onSave({ session_date: session.date, kind, distance_km: km, instruction: description });
  }

  return (
    <form onSubmit={submit} className="col-span-2 mt-1 rounded-lg bg-[#263542] p-2.5">
      <fieldset disabled={disabled} className="grid gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
          <label className="grid gap-1 text-xs font-medium text-slate-200">
            Тип тренировки
            <select autoFocus className={field} value={kind} onChange={(event) => setKind(event.target.value)}>
              {kinds.map((value) => <option key={value} value={value}>{sessionLabels[value]}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-200">
            Дистанция, км
            <input className={field} inputMode="decimal" value={distance} onChange={(event) => setDistance(event.target.value)} />
          </label>
        </div>
        <label className="grid gap-1 text-xs font-medium text-slate-200">
          Описание работы
          <textarea className={`${field} resize-y`} rows={3} maxLength={500} value={description}
            placeholder="Например, 2 км разминки, 5 × 800 м, 2 км заминки"
            onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={`${button} bg-[#2c3b57] text-[#d6deff]`} disabled={!valid}>Сохранить</button>
          <button type="button" className={button} onClick={onCancel}>Отмена</button>
        </div>
      </fieldset>
    </form>
  );
}
