import { useEffect, useRef, useState } from "react";
import { CalendarDays, CalendarSync, LoaderCircle, Pencil } from "lucide-react";
import { localDateKey } from "../lib/wellnessDates";
import PlannedSessionEditor, { isPlannedRun, requestWeek, sessionLabels as kinds } from "./PlannedSessionEditor";

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
const dateRangeFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const distanceFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const button = "inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#526167] px-3 text-sm font-semibold hover:bg-white/5 disabled:opacity-50";

function formatDay(isoDate) {
  return dateFormat.format(new Date(`${isoDate}T12:00:00`));
}

function WeekMoveForm({ plan, proposal, disabled, onMove, onCancel }) {
  const freeDays = plan.sessions.filter(({ status }) => status === "today" || status === "upcoming");
  const sources = freeDays.filter(({ kind }) => kind !== "rest" && kind !== "race");
  const targets = freeDays.filter(({ kind }) => kind === "rest");
  const validProposal = proposal?.plan_id === plan.id && proposal?.revision === (plan.revision ?? 0);
  const [from, setFrom] = useState(() => validProposal ? proposal.from_date : "");
  const [to, setTo] = useState(() => validProposal ? proposal.to_date : "");
  const form = useRef(null);

  useEffect(() => {
    if (proposal) form.current?.scrollIntoView({ block: "nearest" });
  }, [proposal]);

  function confirm(event) {
    event.preventDefault();
    if (from && to) onMove(from, to);
  }

  return (
    <form ref={form} onSubmit={confirm} className="grid gap-2 rounded-lg border border-[#52658b] p-2.5">
      <h4 className="text-sm font-semibold text-[#c1cdff]">Перенести занятие</h4>
      {sources.length > 0 && targets.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-slate-300">
            Занятие
            <select className={field} value={from} onChange={(event) => setFrom(event.target.value)} disabled={disabled} required>
              <option value="">Выбери занятие</option>
              {sources.map((session) => <option key={session.date} value={session.date}>
                {formatDay(session.date)} · {kinds[session.kind]}
              </option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-slate-300">
            Новый день
            <select className={field} value={to} onChange={(event) => setTo(event.target.value)} disabled={disabled} required>
              <option value="">Выбери свободный день</option>
              {targets.map(({ date }) => <option key={date} value={date}>{formatDay(date)}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <p className="text-xs text-slate-300">Для переноса нужны предстоящее занятие и свободный день в этом плане.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {sources.length > 0 && targets.length > 0 && (
          <button type="submit" className={`${button} bg-[#2c3b57] text-[#d6deff]`} disabled={disabled || !from || !to}>
            Подтвердить перенос
          </button>
        )}
        <button type="button" className={button} disabled={disabled} onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
}

export default function TrainingWeekPanel({
  active, today, syncedAt, disabled, onPlanVersion, onPlanChanged, moveProposal, onDismissMove,
}) {
  const day = localDateKey(today);
  const [state, setState] = useState(null);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [moving, setMoving] = useState(false);
  const [editingDate, setEditingDate] = useState(null);
  const activePlan = state?.active;
  const planVersion = activePlan ? `${activePlan.id}:${activePlan.revision ?? 0}` : null;

  useEffect(() => {
    onPlanVersion(planVersion);
  }, [onPlanVersion, planVersion]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setFeedback("");
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
      if (mode === "approve") onPlanChanged(result.active);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setAction(null);
    }
  }

  function closeMove() {
    setMoving(false);
    onDismissMove();
  }

  async function saveSessionEdit(path, method, fields, message) {
    setAction(path);
    setError("");
    setFeedback("");
    try {
      const result = await requestWeek(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day, plan_id: activePlan.id, revision: activePlan.revision ?? 0,
          ...fields,
        }),
      });
      setState(result);
      onPlanChanged(result.active);
      closeMove();
      setEditingDate(null);
      setFeedback(message);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setAction(null);
    }
  }

  const plan = state?.draft || state?.active;
  const draft = Boolean(state?.draft);
  const busy = disabled || loading || Boolean(action);
  const showMove = moving || Boolean(moveProposal);
  const planDates = plan && dateRangeFormat.formatRange(
    new Date(`${plan.sessions[0].date}T12:00:00`),
    new Date(`${plan.sessions.at(-1).date}T12:00:00`),
  );

  return (
    <section className="grid gap-3 rounded-xl border border-[#415157] bg-[#172229] p-3" aria-label="План недели">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#f3bc7f]">
            <CalendarDays size={16} aria-hidden="true" /> План недели
          </h3>
          {planDates && <p className="mt-0.5 pl-6 text-xs text-slate-400">{planDates}</p>}
        </div>
        {plan && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${draft || plan.expired
          ? "bg-[#28383e] text-slate-200" : "bg-[#24413c] text-[#b5e6d8]"}`}>
          {draft ? "Предложение" : plan.expired ? "Неделя завершилась" : "Подтверждён"}
        </span>}
      </header>

      {loading && !plan && <p className="text-sm text-slate-300" role="status">Загружаю план…</p>}
      {!plan && !loading && !error && <p className="text-sm text-slate-300">
        Выбери доступные дни. План учтёт привычный объём, цель и отмеченную разгрузку.
      </p>}

      {plan && <>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg bg-[#202e35] px-2.5 py-2 text-xs text-slate-300">
          <span>План <b className="ml-1 text-[#c2cfff]">{distanceFormat.format(plan.planned_km)} км</b></span>
          {!draft && (
            <>
              <span>Факт <b className="ml-1 text-[#f3bc7f]">{distanceFormat.format(plan.actual_run_km)} км</b>
                {plan.planned_to_date_km > 0 && <span className="ml-1">из {distanceFormat.format(plan.planned_to_date_km)} км к сегодня</span>}
              </span>
              <span>{plan.matched_sessions} из {plan.planned_sessions} занятий</span>
            </>
          )}
        </div>
        {plan.rationale && <p className="text-xs leading-relaxed text-slate-300">{plan.rationale}</p>}
        {!draft && state?.synced_at && (
          <p className="text-xs text-slate-400">Последняя синхронизация Garmin: {new Date(state.synced_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
        )}
        <ol className="divide-y divide-white/10 rounded-lg border border-white/10">
          {plan.sessions.map((session) => {
            const editable = !draft && isPlannedRun(session)
              && (session.status === "upcoming" || session.status === "today");
            const editing = editable && !showMove && editingDate === session.date;
            const distanceLabel = session.distance_km == null ? "" : `${distanceFormat.format(session.distance_km)} км`;
            return (
              <li key={session.date} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 px-2.5 py-1.5 text-xs">
                <span className="flex flex-wrap items-baseline gap-x-2 font-semibold">
                  <time dateTime={session.date} className="capitalize text-[#abbac4]">{formatDay(session.date)}</time>
                  <span>{kinds[session.kind]}</span>
                </span>
                <span className="flex items-center justify-end gap-1.5 tabular-nums text-slate-300">
                  {distanceLabel && <b className="text-[#c2cfff]">{distanceLabel}</b>}
                  {!draft && session.actual_km != null && <span>факт {distanceFormat.format(session.actual_km)} км</span>}
                  {editable && (
                    <button type="button" disabled={busy} aria-expanded={editing}
                      aria-label={`Изменить тренировку, ${formatDay(session.date)}`} title="Изменить тренировку"
                      onClick={() => {
                        closeMove();
                        setEditingDate(editing ? null : session.date);
                      }}
                      className="grid size-7 place-items-center rounded-md text-[#c2cfff] hover:bg-white/10 focus-visible:outline-2 disabled:opacity-50">
                      <Pencil size={13} aria-hidden="true" />
                    </button>
                  )}
                </span>
                <span className="min-w-0 whitespace-pre-wrap break-words text-slate-300">{session.kind !== "rest" && session.instruction}</span>
                {!draft && <span className={`text-right text-[11px] ${session.distance_status === "on_target" ? "text-emerald-300" : "text-slate-400"}`}>
                  {distanceStatus[session.distance_status] || statuses[session.status]}
                </span>}
                {editing && (
                  <PlannedSessionEditor session={session} disabled={busy} onCancel={() => setEditingDate(null)}
                    onSave={(fields) => saveSessionEdit("/distance", "PATCH", fields, "Тренировка обновлена.")} />
                )}
              </li>
            );
          })}
        </ol>
      </>}

      {!draft && activePlan && !activePlan.expired && (
        showMove ? (
          <WeekMoveForm
            key={`${planVersion}:${moveProposal?.from_date || ""}:${moveProposal?.to_date || ""}`}
            plan={activePlan} proposal={moveProposal} disabled={busy} onCancel={closeMove}
            onMove={(from, to) => saveSessionEdit("/move", "POST", { from_date: from, to_date: to }, `Занятие перенесено на ${formatDay(to)}.`)}
          />
        ) : (
          <button type="button" className={`${button} w-fit`} disabled={busy} onClick={() => {
            setEditingDate(null);
            setMoving(true);
          }}>
            <CalendarSync size={15} aria-hidden="true" /> Перенести занятие
          </button>
        )
      )}

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
            {action === "propose" ? "Составляю план…" : plan?.expired ? "Предложить план на следующую неделю" : "Предложить план на 7 дней"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      {feedback && <p role="status" className="text-xs text-emerald-300">{feedback}</p>}
    </section>
  );
}
