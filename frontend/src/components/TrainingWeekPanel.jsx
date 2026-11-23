import { useEffect, useState } from "react";
import { CalendarDays, LoaderCircle } from "lucide-react";
import { localDateKey } from "../lib/wellnessDates";

const kinds = {
  rest: "Отдых", easy: "Лёгкий бег", long: "Длительная", quality: "Качественная", strength: "Силовая", race: "Запланированный старт",
};
const statuses = {
  upcoming: "Впереди",
  today: "Сегодня",
  matched: "Есть в Garmin",
  rest_done: "Нет активностей",
  rest_activity: "Есть активность",
  not_recorded: "Нет записи",
  different_activity: "Другой тип",
};
const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const initialPreferences = { available_days: [0, 1, 2, 3, 4, 5, 6], run_days: null, long_day: null, effort: "usual" };
const distanceStatus = { on_target: "В заданном объёме", below: "Меньше плана", above: "Больше плана" };
const field = "min-w-0 rounded-lg border border-[#46545b] bg-[#202c31] px-2.5 py-2 text-sm";

function WeekPreferenceFields({ value, onChange, disabled }) {
  function toggleDay(index) {
    const days = value.available_days.includes(index)
      ? value.available_days.filter((day) => day !== index)
      : [...value.available_days, index].sort((first, second) => first - second);
    onChange({
      ...value,
      available_days: days,
      long_day: days.includes(value.long_day) ? value.long_day : null,
      run_days: value.run_days != null && value.run_days > days.length ? null : value.run_days,
    });
  }

  return (
    <fieldset disabled={disabled} className="grid gap-3">
      <legend className="mb-2 text-xs font-semibold text-slate-300">Как тебе удобно тренироваться?</legend>
      <div className="flex flex-wrap gap-1.5" aria-label="Доступные дни для бега">
        {weekdays.map((weekday, index) => {
          const enabled = value.available_days.includes(index);
          return <button type="button" key={weekday} aria-pressed={enabled} onClick={() => toggleDay(index)}
            className={`min-h-9 min-w-9 rounded-lg border px-2 text-xs font-semibold ${enabled
              ? "border-[#947653] bg-[#3a3025] text-[#f3bc7f]"
              : "border-[#46545b] text-slate-400"}`}>{weekday}</button>;
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-xs text-slate-300">
          Пробежек за неделю
          <select className={field} value={value.run_days ?? ""}
            onChange={(event) => onChange({ ...value, run_days: event.target.value ? Number(event.target.value) : null })}>
            <option value="">Как обычно</option>
            {Array.from({ length: Math.min(value.available_days.length, 6) }, (_, index) => index + 1)
              .map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-300">
          День длительной
          <select className={field} value={value.long_day ?? ""}
            onChange={(event) => onChange({ ...value, long_day: event.target.value ? Number(event.target.value) : null })}>
            <option value="">Любой</option>
            {value.available_days.map((index) => <option key={index} value={index}>{weekdays[index]}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-300">
          Нагрузка недели
          <select className={field} value={value.effort} onChange={(event) => onChange({ ...value, effort: event.target.value })}>
            <option value="usual">Обычная</option>
            <option value="lighter">Полегче</option>
          </select>
        </label>
      </div>
    </fieldset>
  );
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "short" });
const button = "inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#526167] px-3 text-sm font-semibold hover:bg-white/5 disabled:opacity-50";

function formatDay(isoDate) {
  return dateFormat.format(new Date(`${isoDate}T12:00:00`));
}

async function requestWeek(path, options) {
  const response = await fetch(`/api/coach/week${path}`, options);
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw new Error(typeof result?.detail === "string" ? result.detail : "Не удалось загрузить план недели.");
  }
  return result;
}

export default function TrainingWeekPanel({ active, today, syncedAt, disabled, onApproved }) {
  const day = localDateKey(today);
  const [state, setState] = useState(null);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    requestWeek(`?day=${day}`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setState(result);
        if (result.preferences) setPreferences(result.preferences);
      })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [active, day, syncedAt]);

  async function changePlan(mode) {
    setAction(mode);
    setError("");
    try {
      const id = state?.draft?.id;
      const path = mode === "approve" ? "/approve" : mode === "discard" ? `?day=${day}&draft_id=${id}` : "";
      const result = await requestWeek(path, {
        method: mode === "discard" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: mode === "discard" ? undefined : JSON.stringify(
          mode === "approve" ? { day, draft_id: id } : { day, preferences }
        ),
      });
      setState(result);
      if (mode === "approve") onApproved(result.active.id);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setAction(null);
    }
  }

  const plan = state?.draft || state?.active;
  const draft = Boolean(state?.draft);
  const busy = disabled || loading || Boolean(action);

  return (
    <section className="grid gap-3 rounded-xl border border-[#415157] bg-[#172229] p-3" aria-label="План недели">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#f3bc7f]">
          <CalendarDays size={16} aria-hidden="true" /> План недели
        </h3>
        {plan && <span className="rounded-full bg-[#28383e] px-2.5 py-1 text-xs text-slate-200">
          {draft ? "Предложение" : plan.expired ? "Неделя завершилась" : "Подтверждён"}
        </span>}
      </header>

      {loading && !plan && <p className="text-sm text-slate-300" role="status">Загружаю план…</p>}
      {!plan && !loading && !error && <p className="text-sm text-slate-300">
        Выбери доступные дни. План учтёт привычный объём, цель и отмеченную разгрузку.
      </p>}

      {plan && <>
        <p className="text-sm leading-relaxed text-slate-200">{plan.rationale}</p>
        <p className="text-xs text-slate-300">
          {draft
            ? `На 7 дней: ${plan.planned_km} запланированных км`
            : `На текущую дату: ${plan.actual_run_km} из ${plan.planned_to_date_km} км по плану · найдено ${plan.matched_sessions} из ${plan.planned_sessions} занятий за неделю`}
        </p>
        {!draft && state?.synced_at && (
          <p className="text-xs text-slate-400">Последняя синхронизация Garmin: {new Date(state.synced_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
        )}
        <ol className="divide-y divide-[#415157] rounded-lg border border-[#415157]">
          {plan.sessions.map((session) => (
            <li key={session.date} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-2.5 py-2 text-xs">
              <span className="font-semibold">{formatDay(session.date)} · {kinds[session.kind]}</span>
              <span className="text-right tabular-nums text-slate-300">
                {session.distance_km != null && `${session.distance_km} км`}
                {!draft && session.actual_km != null && `${session.distance_km != null ? " · " : ""}факт ${session.actual_km} км`}
              </span>
              <span className="text-slate-300">{session.instruction}</span>
              {!draft && <span className={session.distance_status === "on_target" ? "text-emerald-300" : "text-slate-400"}>
                {distanceStatus[session.distance_status] || statuses[session.status]}
              </span>}
            </li>
          ))}
        </ol>
      </>}

      {!draft && (!plan || plan.expired) && !loading && (
        <WeekPreferenceFields value={preferences} onChange={setPreferences} disabled={busy} />
      )}
      <div className="flex flex-wrap gap-2">
        {draft ? <>
          <button type="button" className={`${button} bg-[#3a3025] text-[#f3bc7f]`} disabled={busy} onClick={() => changePlan("approve")}>
            Подтвердить план
          </button>
          <button type="button" className={button} disabled={busy} onClick={() => changePlan("discard")}>Отклонить</button>
        </> : (!plan || plan.expired) && (
          <button type="button" className={`${button} bg-[#3a3025] text-[#f3bc7f]`} disabled={busy || !preferences.available_days.length} onClick={() => changePlan("propose")}>
            {action === "propose" && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
            {action === "propose" ? "Составляю план…" : "Предложить план на 7 дней"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </section>
  );
}
