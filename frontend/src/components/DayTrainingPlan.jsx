import { useState } from "react";
import { CalendarDays, Moon, Pencil, Plus, X } from "lucide-react";
import { localDateKey } from "../lib/wellnessDates";
import PlannedSessionEditor, { isPlannedRun, requestWeek, sessionLabels } from "./PlannedSessionEditor";

const distance = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export default function DayTrainingPlan({ date, session, hasActivities, canTrim, onPlanChanged }) {
  const today = localDateKey(new Date());
  const canChange = date >= today && !hasActivities;
  const isRest = session?.kind === "rest";
  const editable = canChange && (!session || (session.current_plan || session.standalone)
    && (isPlannedRun(session) || isRest));
  const actionClass = "flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[#c2cfff] hover:bg-white/10 focus-visible:outline-2";
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!session && !editable) return null;

  async function save(fields, action) {
    setSaving(true);
    setError("");
    try {
      const inWeek = Boolean(session?.current_plan);
      const path = action || (inWeek && !isRest ? "/distance" : "/calendar-session");
      const result = await requestWeek(path, {
        method: path === "/calendar-session" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...fields, day: today, plan_id: session?.plan_id,
          revision: inWeek && isRest && !action ? undefined : session?.revision,
          ...(inWeek && isRest && !action ? {
            expected_week_id: session.plan_id, expected_week_revision: session.revision,
          } : {}),
        }),
      });
      setEditing(false);
      onPlanChanged(result.active, result.session);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="my-3 min-w-0 rounded-xl border border-[#52658b] bg-[#202b37] p-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-[#c2cfff]">
          <CalendarDays size={16} aria-hidden="true" /> {session ? "По плану" : "План на день"}
        </h2>
        <div className="flex flex-wrap items-center justify-end">
        {editable && (
          <button type="button" aria-label={session && !isRest ? "Изменить тренировку" : "Добавить тренировку"} aria-expanded={editing}
            disabled={saving} onClick={() => { setEditing(!editing); setError(""); }}
            className={actionClass}>
            {session && !isRest ? <Pencil size={15} aria-hidden="true" /> : <><Plus size={15} aria-hidden="true" /> Добавить тренировку</>}
          </button>
        )}
        {canChange && session?.current_plan && !isRest && (
          <button type="button" className={actionClass} disabled={saving} aria-label="Сделать днём отдыха"
            title="Сделать днём отдыха" onClick={() => save({ session_date: date }, "/rest")}>
            <Moon size={15} aria-hidden="true" />
          </button>
        )}
        {canChange && session?.current_plan && isRest && canTrim && (
          <button type="button" className={actionClass} disabled={saving} aria-label="Удалить завершающие дни отдыха"
            title="Удалить этот и последующие дни отдыха" onClick={() => save({ session_date: date }, "/rest-tail")}>
            <X size={15} aria-hidden="true" />
          </button>
        )}
        </div>
      </header>
      {session && <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-sm font-semibold">
        <span>{sessionLabels[session.kind]}</span>
        {session.distance_km != null && <span className="text-[#c2cfff]">{distance.format(session.distance_km)} км</span>}
      </p>}
      {session?.instruction && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">{session.instruction}</p>}
      {editable && editing && (
        <PlannedSessionEditor session={session && !isRest ? session : { date, kind: "easy" }}
          disabled={saving} onSave={save} onCancel={() => setEditing(false)} />
      )}
      {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
    </section>
  );
}
