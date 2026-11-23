import { useEffect, useState } from "react";
import { CalendarDays, LoaderCircle } from "lucide-react";
import { localDateKey } from "../lib/wellnessDates";

const kinds = {
  rest: "Отдых", easy: "Лёгкий бег", long: "Длительная", quality: "Качественная", strength: "Силовая",
};
const statuses = {
  upcoming: "Впереди",
  today: "Сегодня",
  matched: "Есть в Garmin",
  rest_done: "День отдыха",
  rest_activity: "Есть активность",
  not_recorded: "Нет записи",
};
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
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    requestWeek(`?day=${day}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setState(result); })
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
        body: mode === "discard" ? undefined : JSON.stringify({ day, ...(mode === "approve" ? { draft_id: id } : {}) }),
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
        Консультант предложит семь дней с учётом твоей цели и недавней нагрузки.
      </p>}

      {plan && <>
        <p className="text-sm leading-relaxed text-slate-200">{plan.rationale}</p>
        <p className="text-xs text-slate-300">
          {draft ? `Запланировано ${plan.planned_km} км` : `План ${plan.planned_km} км · факт ${plan.actual_run_km} км · по типу совпало ${plan.matched_sessions} из ${plan.planned_sessions} занятий`}
        </p>
        <ol className="divide-y divide-[#415157] rounded-lg border border-[#415157]">
          {plan.sessions.map((session) => (
            <li key={session.date} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-2.5 py-2 text-xs">
              <span className="font-semibold">{formatDay(session.date)} · {kinds[session.kind]}</span>
              <span className="text-right tabular-nums text-slate-300">
                {session.distance_km != null && `${session.distance_km} км`}
                {!draft && session.actual_km != null && `${session.distance_km != null ? " · " : ""}факт ${session.actual_km} км`}
              </span>
              <span className="text-slate-300">{session.instruction}</span>
              {!draft && <span className={session.status === "matched" ? "text-emerald-300" : "text-slate-400"}>{statuses[session.status]}</span>}
            </li>
          ))}
        </ol>
      </>}

      <div className="flex flex-wrap gap-2">
        {draft ? <>
          <button type="button" className={`${button} bg-[#3a3025] text-[#f3bc7f]`} disabled={busy} onClick={() => changePlan("approve")}>
            Подтвердить план
          </button>
          <button type="button" className={button} disabled={busy} onClick={() => changePlan("discard")}>Отклонить</button>
        </> : (!plan || plan.expired) && (
          <button type="button" className={`${button} bg-[#3a3025] text-[#f3bc7f]`} disabled={busy} onClick={() => changePlan("propose")}>
            {action === "propose" && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
            {action === "propose" ? "Составляю план…" : "Предложить план на 7 дней"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </section>
  );
}
