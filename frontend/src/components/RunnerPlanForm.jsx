import { useEffect, useState } from "react";
import { Flag } from "lucide-react";

const stages = [
  ["", "Пока не выбран"],
  ["base", "Базовый период"],
  ["build", "Подготовка к старту"],
  ["taper", "Снижение нагрузки перед стартом"],
  ["recovery", "Восстановление"],
];

const zoneGuide = [
  ["Восстановительный", "border-slate-400"],
  ["Лёгкий", "border-sky-400"],
  ["Умеренный", "border-emerald-400"],
  ["Интенсивный", "border-amber-400"],
  ["Очень интенсивный", "border-rose-400"],
];

function withZoneEnds(plan) {
  if (plan.heart_rate_zone_ends?.length || !plan.heart_rate_zone_starts?.length) return plan;
  return {
    ...plan,
    heart_rate_zone_ends: [...plan.heart_rate_zone_starts.slice(1).map((start) => start - 1), ""],
  };
}

const field = "min-w-0 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm";

export default function RunnerPlanForm({ request, onSaved }) {
  const [plan, setPlan] = useState(null);
  const [savedPlan, setSavedPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    request("/plan", { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) { setSavedPlan(value); setPlan(withZoneEnds(value)); } })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setError(true);
          setFeedback(failure.message);
        }
      });
    return () => controller.abort();
  }, [request]);

  async function save(event) {
    event.preventDefault();
    const readZones = (key) => Array.from({ length: 5 }, (_, index) => plan[key]?.[index] ?? "");
    const startInputs = readZones("heart_rate_zone_starts");
    const endInputs = readZones("heart_rate_zone_ends");
    const starts = startInputs.map(Number);
    const ends = endInputs.map(Number);
    const empty = [...startInputs, ...endInputs].every((value) => value === "");
    const legacy = savedPlan?.heart_rate_zone_starts?.length === 5 && !savedPlan.heart_rate_zone_ends?.length
      && starts.every((start, index) => start === savedPlan.heart_rate_zone_starts[index])
      && endInputs.every((end, index) => index === 4 ? end === "" : Number(end) === starts[index + 1] - 1);
    if (!empty && !legacy && (startInputs.includes("") || endInputs.includes("") ||
      starts.some((start, index) => start > ends[index] || (index > 0 && start <= ends[index - 1])))) {
      setError(true);
      setFeedback("Заполни диапазоны всех пяти зон по возрастанию без пересечений или оставь все поля пустыми.");
      return;
    }
    setBusy(true);
    setFeedback("");
    setError(false);
    try {
      const saved = await request("/plan", { method: "PUT", body: JSON.stringify({ ...plan, heart_rate_zone_starts: empty ? [] : starts, heart_rate_zone_ends: empty || legacy ? [] : ends }) });
      setSavedPlan(saved);
      setPlan(withZoneEnds(saved));
      onSaved();
      setFeedback("План сохранён.");
    } catch (failure) {
      setError(true);
      setFeedback(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function change(event) {
    const { name, value } = event.target;
    const nextValue = name === "height_cm" ? (value ? Number(value) : null)
      : name === "race_date" || name === "stage" ? value || null : value;
    setPlan((current) => ({
      ...current,
      [name]: nextValue,
    }));
  }

  return (
    <section className="grid gap-3 rounded-2xl border border-slate-700 bg-[#1b262c] p-4" aria-labelledby="runner-plan-title">
      <h3 id="runner-plan-title" className="flex items-center gap-2 text-base font-semibold">
        <Flag size={17} aria-hidden="true" /> План бегуна
      </h3>
      <p className="text-sm text-slate-300">
        Консультант учтёт этот план. Этап можно выбрать самому или оставить пустым, чтобы обсудить его с консультантом.
      </p>
      {plan ? (
        <form className="grid gap-3" onSubmit={save}>
          <label className="grid gap-1 text-sm">
            Цель
            <input className={field} name="goal" value={plan.goal} maxLength={160} onChange={change}
              placeholder="Полумарафон быстрее 1:45" />
          </label>
          <label className="grid gap-1 text-sm">
            Рост, см
            <input className={`${field} w-full max-w-40`} name="height_cm" type="number" inputMode="numeric"
              min={50} max={275} step={1} value={plan.height_cm ?? ""} onChange={change} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Дата старта
              <input className={field} name="race_date" type="date" value={plan.race_date || ""} onChange={change} />
            </label>
            <label className="grid gap-1 text-sm">
              Мой этап
              <select className={field} name="stage" value={plan.stage || ""} onChange={change}>
                {stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            Другие важные даты
            <textarea className={field} name="key_dates" value={plan.key_dates} maxLength={240} rows={2}
              onChange={change} placeholder="12 апреля — контрольный забег" />
          </label>
          <label className="grid gap-1 text-sm">
            Предпочтения и ограничения
            <textarea className={field} name="preferences" value={plan.preferences} maxLength={360} rows={2}
              onChange={change} placeholder="Бегаю четыре раза в неделю. Длительная по воскресеньям." />
          </label>
          <fieldset className="min-w-0 rounded-xl border border-slate-700 p-3">
            <legend className="px-1 text-sm font-semibold">Пульсовые зоны для бега</legend>
            <p className="mb-2 text-xs text-slate-300">
              Перенеси нижнюю и верхнюю границы беговых зон из Garmin в уд/мин.
            </p>
            <ul className="grid gap-2">
              {zoneGuide.map(([label, color], index) => (
                <li key={label} className={`grid grid-cols-[minmax(0,1fr)_minmax(0,4.6rem)_minmax(0,4.6rem)] items-center gap-2 rounded-lg border-l-2 bg-slate-950/40 p-2 ${color}`}>
                  <div className="min-w-0 text-xs [overflow-wrap:anywhere]">
                    <b className="block">Z{index + 1}</b>
                    <span className="text-slate-300">{label}</span>
                  </div>
                  {[["heart_rate_zone_starts", "От"], ["heart_rate_zone_ends", "До"]].map(([key, caption]) => (
                    <label key={key} className="grid min-w-0 gap-1 text-xs">
                      {caption}
                      <input aria-label={`Z${index + 1}: ${caption.toLowerCase()}, уд/мин`}
                        className={`${field} w-full px-2`} type="number" inputMode="numeric" min={30} max={250} step={1}
                        value={plan[key]?.[index] ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPlan((current) => ({
                            ...current,
                            [key]: Array.from({ length: 5 }, (_, i) => i === index ? value : current[key]?.[i] ?? ""),
                          }));
                        }} />
                    </label>
                  ))}
                </li>
              ))}
            </ul>
          </fieldset>
          <button className="w-fit rounded-lg border border-[#806044] bg-[#3a3025] px-3 py-2 text-sm font-semibold text-[#f3bc7f] disabled:opacity-50"
            type="submit" disabled={busy}>{busy ? "Сохраняю…" : "Сохранить план"}</button>
        </form>
      ) : !error && <p className="text-sm text-slate-300" role="status">Загружаю план…</p>}
      {feedback && <p className={error ? "text-sm text-rose-300" : "text-sm text-emerald-300"} role={error ? "alert" : "status"}>{feedback}</p>}
    </section>
  );
}
