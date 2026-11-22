import { useEffect, useState } from "react";
import { Flag } from "lucide-react";

const stages = [
  ["", "Пока не выбран"],
  ["base", "Базовый период"],
  ["build", "Подготовка к старту"],
  ["taper", "Снижение нагрузки перед стартом"],
  ["recovery", "Восстановление"],
];

const field = "min-w-0 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm";

export default function RunnerPlanForm({ request, onSaved }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    request("/plan", { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setPlan(value); })
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
    setBusy(true);
    setFeedback("");
    setError(false);
    try {
      const saved = await request("/plan", { method: "PUT", body: JSON.stringify(plan) });
      setPlan(saved);
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
    setPlan((current) => ({
      ...current,
      [name]: name === "race_date" || name === "stage" ? value || null : value,
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
          <button className="w-fit rounded-lg border border-[#806044] bg-[#3a3025] px-3 py-2 text-sm font-semibold text-[#f3bc7f] disabled:opacity-50"
            type="submit" disabled={busy}>{busy ? "Сохраняю…" : "Сохранить план"}</button>
        </form>
      ) : !error && <p className="text-sm text-slate-300" role="status">Загружаю план…</p>}
      {feedback && <p className={error ? "text-sm text-rose-300" : "text-sm text-emerald-300"} role={error ? "alert" : "status"}>{feedback}</p>}
    </section>
  );
}
