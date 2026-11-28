import { useMemo, useState } from "react";
import { ArrowUpRight, Bike, ChevronDown, Copy, Dumbbell, Footprints } from "lucide-react";
import { getActivityCategory, getActivityDate } from "../lib/calendarAnalytics";
import { fmtDuration } from "../lib/format";
import { PageLink } from "../app/DashboardRouter";
import ActivityCoachAnalysis from "./ActivityCoachAnalysis";
import RefreshActivityButton from "./RefreshActivityButton";
import RunningCoachPanel from "./RunningCoachPanel";
import { copyText } from "../lib/copyText";
import { dayPath } from "../lib/dashboardRoutes";

const filters = [["all", "Все"], ["running", "Бег"], ["strength", "Силовые"], ["cycling", "Велосипед"]];
const pageSize = 24;
const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const kmFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const control = "rounded-lg border border-[#42535b] px-3 py-2 text-sm font-semibold hover:bg-[#283740]";

function Description({ activity, strength, demo, onActivityUpdated, onOpenChat, coachModelLabel }) {
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState(false);
  const text = activity.description?.trim() || "";
  const duration = activity.moving_duration_seconds || activity.duration_seconds;

  async function copy() {
    const copied = await copyText(text);
    setManualCopy(!copied);
    setNotice(copied ? "Описание скопировано." : "Нажми и удерживай текст в поле, затем выбери «Копировать».");
  }

  return (
    <div className="grid gap-3 border-t border-[#344650] px-4 pb-4 pt-3 text-sm">
      {(duration > 0 || activity.avg_hr_bpm > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
          {duration > 0 && <span>Время · {fmtDuration(duration)}</span>}
          {activity.avg_hr_bpm > 0 && <span>Средний пульс · {Math.round(activity.avg_hr_bpm)} уд/мин</span>}
        </div>
      )}
      {!text && <p className="text-slate-400">Сохранённого описания пока нет.</p>}
      {text && (manualCopy ? (
        <textarea aria-label="Описание для копирования" readOnly rows={5} value={text}
          onFocus={(event) => event.target.select()}
          className="w-full min-w-0 rounded-lg border border-[#536671] bg-[#152128] p-3 text-base text-slate-100" />
      ) : <p className="whitespace-pre-wrap break-words leading-relaxed text-slate-100">{text}</p>)}
      <div className="flex flex-wrap items-center gap-2">
        {!demo && <RefreshActivityButton activityId={activity.id} strength={strength} onActivityUpdated={(updated, weeklyVolume) => {
          setNotice("");
          setManualCopy(false);
          onActivityUpdated(updated, weeklyVolume);
        }} />}
        {text && <button type="button" className={`${control} inline-flex items-center gap-2`} onClick={copy}><Copy size={14} aria-hidden="true" /> Скопировать описание</button>}
        <PageLink className={`${control} inline-flex items-center gap-2`} to={dayPath(String(activity.start_time).slice(0, 10))}>
          Открыть день <ArrowUpRight size={14} aria-hidden="true" />
        </PageLink>
      </div>
      {notice && <p role="status" className="text-slate-300">{notice}</p>}
      {!demo && <ActivityCoachAnalysis activity={activity} onOpenChat={onOpenChat} modelLabel={coachModelLabel} readOnlySaved />}
    </div>
  );
}

export default function WorkoutHistory({ activities, loading, error, demo, onActivityUpdated,
  coachEnabled, coachModelLabel, viewScope, syncedAt, planRevision, onTrainingWeekChanged }) {
  const [filter, setFilter] = useState("all");
  const [year, setYear] = useState("all");
  const [limit, setLimit] = useState(pageSize);
  const [expanded, setExpanded] = useState(null);
  const [chatActivity, setChatActivity] = useState(null);
  const rows = useMemo(() => activities.flatMap((activity, index) => {
    const category = getActivityCategory(activity);
    const date = getActivityDate(activity);
    if (!category || !Number.isFinite(date.getTime())) return [];
    return [{ activity, category, date, key: activity.id ?? index }];
  }).sort((first, second) => String(second.activity.start_time).localeCompare(String(first.activity.start_time))), [activities]);
  const years = Array.from(new Set(rows.map(({ date }) => date.getFullYear())));
  const visible = rows.filter(({ category, date }) => (filter === "all" || category === filter)
    && (year === "all" || String(date.getFullYear()) === year));
  const reviewDate = chatActivity ? getActivityDate(chatActivity) : new Date();

  function setView(update, value) {
    update(value);
    setLimit(pageSize);
    setExpanded(null);
  }

  return (
    <main className="mx-auto grid max-w-4xl gap-4 px-3 py-5 sm:px-6">
      <h1 className="text-2xl font-bold">Тренировки</h1>
      <div className="flex flex-wrap items-center gap-2">
        {filters.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filter === value}
            className={`${control} aria-pressed:border-[#bf955f] aria-pressed:bg-[#382e24] aria-pressed:text-[#ffc988]`}
            onClick={() => setView(setFilter, value)}>{label}</button>
        ))}
        <select aria-label="Год тренировки" value={year} onChange={(event) => setView(setYear, event.target.value)}
          className={`${control} bg-[#1b282e]`}>
          <option value="all">Все годы</option>
          {years.map((value) => <option key={value}>{value}</option>)}
        </select>
      </div>
      {loading && <p role="status" className="text-sm text-slate-300">Загружаю тренировки…</p>}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {!loading && !error && !visible.length && <p className="text-sm text-slate-300">За выбранный период тренировок нет.</p>}
      <ul className="grid gap-2">
        {visible.slice(0, limit).map(({ activity, category, date, key }) => {
          const strength = category === "strength";
          const cycling = category === "cycling";
          const Icon = strength ? Dumbbell : cycling ? Bike : Footprints;
          const open = expanded === key;
          const duration = activity.moving_duration_seconds || activity.duration_seconds;
          return (
            <li key={key} className="rounded-xl border border-[#344650] bg-[#1b282e]">
              <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : key)}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-[#23343c]">
                <Icon size={19} aria-hidden="true" className={strength ? "shrink-0 text-[#b7c4ff]" : cycling ? "shrink-0 text-[#8de0cc]" : "shrink-0 text-[#ffc988]"} />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <b className="break-words">{activity.name || (strength ? "Силовая" : cycling ? "Велосипед" : "Пробежка")}</b>
                  <small className="text-sm text-slate-400">
                    {dateFormat.format(date)}
                    {strength ? (duration > 0 && ` · ${fmtDuration(duration)}`)
                      : (activity.distance_meters > 0 && ` · ${kmFormat.format(activity.distance_meters / 1000)} км`)}
                  </small>
                </span>
                <ChevronDown size={17} aria-hidden="true" className={open ? "shrink-0 rotate-180" : "shrink-0"} />
              </button>
              {open && <Description activity={activity} strength={strength} demo={demo} onActivityUpdated={onActivityUpdated}
                onOpenChat={coachEnabled ? setChatActivity : undefined} coachModelLabel={coachModelLabel} />}
            </li>
          );
        })}
      </ul>
      {visible.length > limit && <button type="button" className={`${control} w-fit`} onClick={() => setLimit((value) => value + pageSize)}>Показать ещё</button>}
      {coachEnabled && <RunningCoachPanel key={planRevision} chatActivity={chatActivity} onClose={() => setChatActivity(null)}
        showOpenButtons={false} modelLabel={coachModelLabel} viewScope={viewScope} period="day"
        periodStart={reviewDate} periodEnd={reviewDate} label={dateFormat.format(reviewDate)} syncedAt={syncedAt}
        onTrainingWeekChanged={onTrainingWeekChanged} />}
    </main>
  );
}
