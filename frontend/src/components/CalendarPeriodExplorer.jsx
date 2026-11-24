import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  Dumbbell,
  Footprints,
  Gauge,
  HeartPulse,
} from "lucide-react";
import { dayFromPath } from "../lib/dashboardRoutes";
import { localDateKey } from "../lib/wellnessDates";
import { fmtPace } from "../lib/format";
import { averageRunningPace, dayKey, emptySummary, getActivityCategory, getActivityDate, summarizeActivities, summarizeCalendar } from "../lib/calendarAnalytics";
import { SelectedDayWeather } from "./DayWeather";
import WeatherPanel from "./WeatherPanel";
import DaySummary from "./DaySummary";
import DayTrainingPlan from "./DayTrainingPlan";
import WorkoutReview from "./WorkoutReview";
import MonthDayCalendar from "./MonthDayCalendar";
import ActivityDetail from "./ActivityDetail";
import RunningCoachPanel from "./RunningCoachPanel";
import YearHealthPanel from "./YearHealthPanel";
import PeriodTrends from "./PeriodTrends";

const monthNames = Array.from({ length: 12 }, (_, month) =>
  new Date(2024, month, 1).toLocaleDateString("ru-RU", { month: "long" })
);
const monthShortNames = Array.from({ length: 12 }, (_, month) =>
  new Date(2024, month, 1).toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")
);

function CalendarPeriodExplorer({
  activities, pagePath, busy, error, onActivityUpdated, publicDemo, coachEnabled, syncedAt, wellness,
  planRevision, weather, weatherRequest, onWeatherChange, deloadWeeks, plannedSessions, onTrainingWeekChanged, onMarkDeload,
}) {
  const detailCache = useRef(new Map()).current;
  const linkedDetails = useRef(null);
  const [yearsOpen, setYearsOpen] = useState(false);
  const availableYears = useMemo(() => {
    const years = new Set(activities.map((activity) => getActivityDate(activity).getFullYear()));
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    if (!publicDemo) {
      years.add(currentYear + 1);
      for (const session of plannedSessions ?? []) years.add(Number(session.date.slice(0, 4)));
    }
    return [...years].sort((first, second) => second - first);
  }, [activities, plannedSessions, publicDemo]);

  const { daySummaries, monthSummaries, yearSummaries } = useMemo(
    () => summarizeCalendar(activities),
    [activities]
  );

  const [yearChartOpen, setYearChartOpen] = useState(true);
  const [expandedYear, setExpandedYear] = useState(() => new Date().getFullYear());
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [selectedTypes, setSelectedTypes] = useState(["running"]);
  const [selection, setSelection] = useState(() => ({
    type: "year",
    year: new Date().getFullYear(),
  }));

  useEffect(() => {
    const linkedDay = dayFromPath(pagePath);
    if (!linkedDay) return;
    const { year, month } = linkedDay;
    setExpandedYear(year);
    setExpandedMonth({ year, month });
    setSelection({ type: "day", ...linkedDay });
    const frame = requestAnimationFrame(() => linkedDetails.current?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [pagePath]);

  const { periodStart, periodEnd } = useMemo(() => {
    const start = selection.type === "year"
      ? new Date(selection.year, 0, 1)
      : selection.type === "month"
        ? new Date(selection.year, selection.month, 1)
        : new Date(selection.year, selection.month, selection.day);
    const end = selection.type === "year"
      ? new Date(selection.year, 11, 31)
      : selection.type === "month"
        ? new Date(selection.year, selection.month + 1, 0)
        : start;
    return { periodStart: start, periodEnd: end };
  }, [selection]);

  const periodActivities = useMemo(() => activities.filter((activity) => {
    const date = getActivityDate(activity);
    return date >= periodStart && date <= periodEnd;
  }), [activities, periodStart, periodEnd]);
  const matchingActivities = useMemo(
    () => periodActivities.filter((activity) => selectedTypes.includes(getActivityCategory(activity))),
    [periodActivities, selectedTypes]
  );

  const periodSummary = summarizeActivities(matchingActivities);
  const { runCount, strengthCount, runKm: totalRunKm, hrWeight, hrSeconds } = periodSummary;
  const averageKm = runCount ? totalRunKm / runCount : 0;
  const averageHr = hrWeight ? Math.round(hrSeconds / hrWeight) : null;
  const averagePace = averageRunningPace(periodSummary);
  const showRunning = selectedTypes.includes("running");
  const showStrength = selectedTypes.includes("strength");
  const chartYear = selection.year;
  const chartMonth = expandedMonth?.month;
  const monthlySummary = chartMonth == null ? null : monthSummaries.get(`${chartYear}-${chartMonth}`);
  const monthChartData = useMemo(() => {
    if (chartMonth == null) return [];
    const daysInMonth = new Date(chartYear, chartMonth + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const date = new Date(chartYear, chartMonth, day);
      const summary = daySummaries.get(dayKey(date));
      const weekday = date.getDay();
      const monday = new Date(chartYear, chartMonth, day - (weekday + 6) % 7);
      const weekKey = localDateKey(monday);
      return {
        label: String(day),
        weekend: weekday === 0 || weekday === 6,
        deloadWeek: deloadWeeks?.[weekKey] ? weekKey : null,
        runKm: summary ? Number(summary.runKm.toFixed(1)) : 0,
        pace: averageRunningPace(summary),
        avgHr: summary?.hrWeight ? Math.round(summary.hrSeconds / summary.hrWeight) : null,
        strengthCount: summary?.strengthCount || 0,
      };
    });
  }, [chartMonth, chartYear, daySummaries, deloadWeeks]);

  const yearChartData = useMemo(() => {
    const currentDate = new Date();
    return Array.from({ length: 12 }, (_, month) => {
      const isFuture = chartYear > currentDate.getFullYear()
        || (chartYear === currentDate.getFullYear() && month > currentDate.getMonth());
      const summary = monthSummaries.get(`${chartYear}-${month}`);
      return {
        label: monthShortNames[month],
        runKm: isFuture ? null : Number((summary?.runKm || 0).toFixed(1)),
        pace: isFuture ? null : averageRunningPace(summary),
        avgHr: !isFuture && summary?.hrWeight ? Math.round(summary.hrSeconds / summary.hrWeight) : null,
        strengthCount: isFuture ? null : summary?.strengthCount || 0,
      };
    });
  }, [chartYear, monthSummaries]);

  const selectionLabel = selection.type === "year"
    ? `${selection.year} год`
    : selection.type === "month"
      ? `${monthNames[selection.month]} ${selection.year}`
      : `${selection.day} ${monthNames[selection.month]} ${selection.year}`;

  function selectDay({ year, month, day }) {
    if (year !== expandedYear || month !== expandedMonth?.month) {
      setExpandedMonth({ year, month });
      setExpandedYear(year);
    }
    setSelection({ type: "day", year, month, day });
  }

  const dayActivities = selection.type === "day"
    ? periodActivities.filter((activity) => getActivityCategory(activity))
    : [];
  const dayRuns = dayActivities.filter((activity) => getActivityCategory(activity) === "running");
  const dayPlan = selection.type === "day"
    ? plannedSessions?.find(({ date }) => date === localDateKey(periodStart))
    : null;

  return (
    <main className="period-explorer grid grid-cols-[minmax(205px,_245px)_minmax(0,_1fr)_minmax(270px,_300px)] min-h-screen max-[760px]:grid-cols-[minmax(0,_1fr)] max-[760px]:overflow-x-clip">
      <aside className="period-explorer-sidebar min-w-0 self-start min-[761px]:sticky min-[761px]:top-0 min-[761px]:max-h-dvh min-[761px]:overflow-y-auto px-3 pb-4 [border-right:1px_solid_var(--border)] max-[760px]:px-3 max-[760px]:border-r-0" aria-label="Выбор даты">
        {error && <div className="period-sync-error mt-[-2px] mx-0 mb-[9px] text-[color:#ff9a91] text-[12px]">{error}</div>}

        <button type="button" aria-expanded={yearsOpen} aria-controls="calendar-years"
          onClick={() => setYearsOpen(!yearsOpen)}
          className="mb-2 hidden min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-[#415157] px-3 text-sm font-semibold max-[760px]:flex">
          <span>Годы · {expandedYear}</span>
          <ChevronDown size={16} className={yearsOpen ? "rotate-180" : undefined} />
        </button>
        <div id="calendar-years" className={`period-explorer-years grid gap-2 max-[760px]:grid-flow-col max-[760px]:auto-cols-[minmax(145px,42vw)] max-[760px]:overflow-x-auto max-[760px]:snap-x max-[760px]:[&>*]:snap-start ${yearsOpen ? "" : "max-[760px]:hidden"}`}>
          {availableYears.map((year) => {
            const yearOpen = expandedYear === year;
            const summary = yearSummaries.get(year) || emptySummary();
            const paceSeconds = averageRunningPace(summary);
            const averageHr = summary.hrWeight ? Math.round(summary.hrSeconds / summary.hrWeight) : null;
            return (
              <section className="period-year" key={year}>
                <button
                  className={`period-cube period-year-cube relative isolate grid w-full min-h-[36px] gap-0 overflow-hidden p-[9px] border border-[#394651] rounded-[7px] text-left capitalize [background:radial-gradient(ellipse_at_100%_0%,_#d9954a24,_transparent_48%),_linear-gradient(145deg,_#293740,_#1a242a_75%)] [box-shadow:inset_0_1px_#ffffff09,_0_3px_10px_#00000020] transition-[border-color,transform,box-shadow] duration-[160ms] hover:border-[#82909a] hover:-translate-y-px hover:[box-shadow:inset_0_1px_#ffffff12,_0_7px_17px_#00000035] [&.is-selected]:border-[#d99c58] [&.is-selected]:[background:radial-gradient(ellipse_at_100%_0%,_#efb86a3a,_transparent_54%),_linear-gradient(145deg,_#44372a,_#202a30_78%)] [&.is-selected]:[box-shadow:inset_0_1px_#ffffff14,_0_6px_18px_#00000038]${yearOpen ? " is-selected" : ""}`}
                  type="button"
                  aria-expanded={yearOpen}
                  onClick={() => {
                    setExpandedYear(yearOpen ? null : year);
                    setExpandedMonth(null);
                    setSelection({ type: "year", year });
                  }}
                >
                  <span className="period-year-watermark absolute z-[-1] top-[-12px] right-[-5px] text-[color:#ffffff] font-display text-[58px] font-extrabold tracking-[-6px] leading-none opacity-[0.055] [pointer-events:none]" aria-hidden="true">{year}</span>
                  <span className="period-year-stats-distance grid grid-cols-[repeat(1,_minmax(0,_1fr))] items-center p-0 z-[1]">

                  
                  <span className={[
                    "period-year-metric distance flex min-w-0 items-baseline justify-center gap-1 whitespace-nowrap p-0.5 text-[#ffc17f]",
                    "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:self-center [&_svg]:text-[#e5aa62]",
                    "[&_b]:truncate [&_b]:font-display [&_b]:text-[21px] [&_b]:font-extrabold [&_b]:leading-tight",
                    "[&_b]:tabular-nums [&_small]:text-[10px] [&_small]:font-semibold max-[760px]:[&_b]:text-[18px]",
                  ].join(" ")} title="Общая дистанция бега">
                      <Footprints /><b>{summary.runKm.toFixed(1)}</b><small>км</small>
                    </span>
                    
                  
                  </span>
                  <span className="period-year-stats grid items-center p-0 z-[1]">
                    <span className={[
                      "period-year-metric pulse flex items-center justify-center gap-[3px] min-w-0 p-[2px]",
                      "text-[color:#f0f4f5] whitespace-nowrap [&_small]:text-[color:#9aaab2] [&_small]:text-[8px]",
                      "[&_svg]:w-[15px] [&_svg]:h-[15px] [&_svg]:[flex:0_0_auto] [&_svg]:text-[color:#e5aa62]",
                      "[&.distance_svg]:text-[color:#e5aa62] [&.pulse_svg]:text-[color:#f18c8c]",
                      "[.period-year-metric&_svg]:text-[color:#f18c8c] [&.pace_svg]:text-[color:#91a6ff]",
                      "[&_b]:overflow-hidden [&_b]:text-[color:#dce4e8] [&_b]:font-display [&_b]:text-[13px]",
                      "[&_b]:font-extrabold [&_b]:tracking-[-0.04em] [&_b]:text-[ellipsis] [&_b]:whitespace-nowrap",
                      "max-[760px]:[&_b]:text-[11px]",
                    ].join(" ")} title="Средний пульс на пробежках, ударов в минуту">
                      <HeartPulse /><b>{averageHr || "—"}</b><small>bpm</small>
                   
                    <span className={[
                      "period-year-metric pace flex items-center justify-center gap-[3px] min-w-0 p-[2px]",
                      "text-[color:#f0f4f5] whitespace-nowrap [&_small]:text-[color:#9aaab2] [&_small]:text-[8px]",
                      "[&_svg]:w-[15px] [&_svg]:h-[15px] [&_svg]:[flex:0_0_auto] [&_svg]:text-[color:#e5aa62]",
                      "[&.distance_svg]:text-[color:#e5aa62] [&.pulse_svg]:text-[color:#f18c8c]",
                      "[&.pace_svg]:text-[color:#91a6ff] [.period-year-metric&_svg]:text-[color:#91a6ff]",
                      "[&_b]:overflow-hidden [&_b]:text-[color:#dce4e8] [&_b]:font-display [&_b]:text-[13px]",
                      "[&_b]:font-extrabold [&_b]:tracking-[-0.04em] [&_b]:text-[ellipsis] [&_b]:whitespace-nowrap",
                      "max-[760px]:[&_b]:text-[11px] [.trend-legend-item&]:text-[color:#6db8e5]",
                      "[.trend-chart-series&]:text-[color:#6db8e5]",
                    ].join(" ")} title="Средний темп бега">
                      <Gauge /><b>{fmtPace(paceSeconds)}</b><small>/км</small>
                    </span>
                    </span>
                  </span>
                  <span className={[
                    "period-year-workout-divider flex items-center gap-[6px] mt-[7px] mx-0 mb-1 text-[color:#98a8af]",
                    "[&_i]:h-[1px] [&_i]:[flex:1] [&_i]:[background:linear-gradient(90deg,_transparent,_#ffffff35)]",
                    "[&_i:last-child]:[background:linear-gradient(90deg,_#ffffff35,_transparent)] [&_small]:text-[7px]",
                    "[&_small]:font-bold [&_small]:tracking-[0.12em]",
                  ].join(" ")}>
                    <i />
                    <small>ТРЕНИРОВКИ</small>
                    <i />
                  </span>
                  <span className="period-year-counts grid grid-cols-[repeat(2,_minmax(0,_1fr))] z-[1]">
                    <span className={[
                      "period-year-count running-count flex items-center justify-center gap-[5px] min-w-0 py-[2px] px-[7px]",
                      "[.period-year-count_+_&]:[border-left:1px_solid_#ffffff1c] [&_>_b]:text-[color:#dce4e8]",
                      "[&_>_b]:font-display [&_>_b]:text-[17px] [&_>_b]:font-extrabold [&_>_b]:leading-none",
                      "[&_svg]:w-[14px] [&_svg]:h-[14px] [&_svg]:text-[color:#e5aa62] max-[760px]:py-[2px] px-1",
                    ].join(" ")} title={`${summary.runCount} пробежек`}>
                      <b>{summary.runCount}</b>
                      <Footprints />
                    </span>
                    <span className={[
                      "period-year-count strength-count flex items-center justify-center gap-[5px] min-w-0 py-[2px]",
                      "px-[7px] [.period-year-count_+_&]:[border-left:1px_solid_#ffffff1c] [&_>_b]:text-[color:#dce4e8]",
                      "[&_>_b]:font-display [&_>_b]:text-[17px] [&_>_b]:font-extrabold [&_>_b]:leading-none",
                      "[&_svg]:w-[14px] [&_svg]:h-[14px] [&_svg]:text-[color:#91a6ff] max-[760px]:py-[2px] px-1",
                    ].join(" ")} title={`${summary.strengthCount} занятий в зале`}>
                      <b>{summary.strengthCount}</b>
                      <Dumbbell />
                    </span>
                  </span>
                </button>

              </section>
            );
          })}
        </div>
      </aside>

      <section className="period-explorer-summary flex flex-col gap-[18px] min-w-0 bg-[radial-gradient(ellipse_at_top,_#344a3e33,_transparent_55%),linear-gradient(180deg,_#1b252b,_var(--bg)_42rem)] py-6 px-[clamp(18px,2vw,34px)] [&_>_div_+_div]:mt-0 max-[760px]:p-3">
        <header className={[
          "period-summary-heading flex items-center justify-between gap-[14px]",
          "[&_>_div:first-child_>_span]:text-[color:#9ba9ae] [&_>_div:first-child_>_span]:text-[9px]",
          "[&_>_div:first-child_>_span]:font-bold [&_>_div:first-child_>_span]:tracking-[.14em] [&_h1]:mt-1",
          "mx-0 mb-0 [&_h1]:text-[color:#e7edf0] [&_h1]:font-display [&_h1]:text-[24px] [&_h1]:leading-[1.15]",
          "max-[420px]:[&_h1]:text-[19px]",
        ].join(" ")}>
          <div>
            <span>СВОДКА ПЕРИОДА</span>
            <h1>{selectionLabel}</h1>
          </div>
          <div className="period-type-filters grid grid-cols-[repeat(2,_32px)] [justify-content:start] items-center gap-[7px] mb-5 [.period-summary-heading_&]:flex [.period-summary-heading_&]:gap-[7px] [.period-summary-heading_&]:m-0" aria-label="Типы тренировок">
            {[
              { id: "running", label: "Бег", icon: Footprints },
              { id: "strength", label: "Силовые тренировки", icon: Dumbbell },
            ].map((type) => (
              <button
                type="button"
                key={type.id}
                aria-pressed={selectedTypes.includes(type.id)}
                aria-label={type.label}
                title={type.label}
                className={`period-type-filter period-type-${type.id} grid w-8 h-8 place-items-center p-0 border border-[#34414a] rounded-[10px] text-[#9aa8b0] [background:linear-gradient(145deg,_#192229,_#151c22)] transition-[color,border-color,background,box-shadow] duration-[140ms] [&_svg]:w-4 [&_svg]:h-4 ${type.id === "running"
                  ? "[&.is-active]:border-[#c88d4f] [&.is-active]:text-[#f1bd7e] [&.is-active]:[background:linear-gradient(145deg,_#382b20,_#211f1c)] [&.is-active]:[box-shadow:0_0_18px_#e5aa6230,_inset_0_1px_#ffffff0b] [&:not(.is-active):hover]:border-[#a87542] [&:not(.is-active):hover]:text-[#f1bd7e] [&:not(.is-active):hover]:[background:#382b203d] [&:not(.is-active):hover]:[box-shadow:0_0_13px_#e5aa621c]"
                  : "[&.is-active]:border-[#7888d2] [&.is-active]:text-[#b1beff] [&.is-active]:[background:linear-gradient(145deg,_#242b46,_#1a202c)] [&.is-active]:[box-shadow:0_0_18px_#91a6ff30,_inset_0_1px_#ffffff0b] [&:not(.is-active):hover]:border-[#6677c2] [&:not(.is-active):hover]:text-[#b1beff] [&:not(.is-active):hover]:[background:#242b463d] [&:not(.is-active):hover]:[box-shadow:0_0_13px_#91a6ff20]"}${selectedTypes.includes(type.id) ? " is-active" : ""}`}
                onClick={() => setSelectedTypes((current) => current.includes(type.id)
                  ? current.filter((item) => item !== type.id)
                  : [...current, type.id])}
              >
                <type.icon size={17} />
              </button>
            ))}
          </div>
        </header>
        {!publicDemo && <WeatherPanel weather={weather} request={weatherRequest} onChange={onWeatherChange} />}
        {coachEnabled && <RunningCoachPanel
          key={planRevision}
          period={selection.type}
          periodStart={periodStart}
          periodEnd={periodEnd}
          label={selectionLabel}
          syncedAt={syncedAt}
          onTrainingWeekChanged={onTrainingWeekChanged}
        />}

        <div className="period-summary-metrics grid grid-cols-[repeat(auto-fit,_minmax(112px,_1fr))] gap-[9px] max-[420px]:grid-cols-[repeat(2,_minmax(0,_1fr))]">
          <article className={[
            "period-summary-metric run-summary flex flex-col justify-between min-w-0 min-h-[76px] pt-[10px]",
            "px-[9px] pb-2 [border:1px_solid_#34424a] rounded-[12px]",
            "[background:linear-gradient(145deg,_#202a30,_#192228_80%)] [&_>_span]:flex [&_>_span]:items-center",
            "[&_>_span]:gap-[5px] [&_>_span]:overflow-hidden [&_>_span]:text-[color:#aab6bb]",
            "[&_>_span]:text-[9px] [&_>_span]:text-[ellipsis] [&_>_span]:whitespace-nowrap",
            "[&_>_span_svg]:w-[13px] [&_>_span_svg]:h-[13px] [&_>_span_svg]:[flex:0_0_auto]",
            "[&_>_b]:overflow-hidden [&_>_b]:text-[color:#e5ebee] [&_>_b]:font-display [&_>_b]:text-[19px]",
            "[&_>_b]:font-[750] [&_>_b]:tracking-[-.04em] [&_>_b]:leading-none [&_>_b]:text-[ellipsis]",
            "[&_>_b]:whitespace-nowrap [&_>_b_small]:ml-[3px] [&_>_b_small]:text-[color:#98a5ab]",
            "[&_>_b_small]:text-[9px] [&_>_b_small]:font-medium [&_>_b_small]:tracking-[0]",
            "[&_>_small]:text-[color:#98a5ab] [&_>_small]:text-[8px] [&_>_small]:leading-[1.15]",
            "[&_>_span_svg]:text-[color:#efa85f] max-[420px]:min-h-[68px]",
          ].join(" ")}>
            <span><Footprints />Дистанция</span>
            <b>{totalRunKm.toFixed(1)}<small>км</small></b>
          </article>
          <article className={[
            "period-summary-metric pace-summary flex flex-col justify-between min-w-0 min-h-[76px] pt-[10px]",
            "px-[9px] pb-2 [border:1px_solid_#34424a] rounded-[12px]",
            "[background:linear-gradient(145deg,_#202a30,_#192228_80%)] [&_>_span]:flex [&_>_span]:items-center",
            "[&_>_span]:gap-[5px] [&_>_span]:overflow-hidden [&_>_span]:text-[color:#aab6bb]",
            "[&_>_span]:text-[9px] [&_>_span]:text-[ellipsis] [&_>_span]:whitespace-nowrap",
            "[&_>_span_svg]:w-[13px] [&_>_span_svg]:h-[13px] [&_>_span_svg]:[flex:0_0_auto]",
            "[&_>_b]:overflow-hidden [&_>_b]:text-[color:#e5ebee] [&_>_b]:font-display [&_>_b]:text-[19px]",
            "[&_>_b]:font-[750] [&_>_b]:tracking-[-.04em] [&_>_b]:leading-none [&_>_b]:text-[ellipsis]",
            "[&_>_b]:whitespace-nowrap [&_>_b_small]:ml-[3px] [&_>_b_small]:text-[color:#98a5ab]",
            "[&_>_b_small]:text-[9px] [&_>_b_small]:font-medium [&_>_b_small]:tracking-[0]",
            "[&_>_small]:text-[color:#98a5ab] [&_>_small]:text-[8px] [&_>_small]:leading-[1.15]",
            "[&_>_span_svg]:text-[color:#90a9ff] max-[420px]:min-h-[68px]",
          ].join(" ")}>
            <span><Gauge />Средний темп</span>
            <b>{fmtPace(averagePace)}<small>/км</small></b>
          </article>
          <article className={[
            "period-summary-metric hr-summary flex flex-col justify-between min-w-0 min-h-[76px] pt-[10px]",
            "px-[9px] pb-2 [border:1px_solid_#34424a] rounded-[12px]",
            "[background:linear-gradient(145deg,_#202a30,_#192228_80%)] [&_>_span]:flex [&_>_span]:items-center",
            "[&_>_span]:gap-[5px] [&_>_span]:overflow-hidden [&_>_span]:text-[color:#aab6bb]",
            "[&_>_span]:text-[9px] [&_>_span]:text-[ellipsis] [&_>_span]:whitespace-nowrap",
            "[&_>_span_svg]:w-[13px] [&_>_span_svg]:h-[13px] [&_>_span_svg]:[flex:0_0_auto]",
            "[&_>_b]:overflow-hidden [&_>_b]:text-[color:#e5ebee] [&_>_b]:font-display [&_>_b]:text-[19px]",
            "[&_>_b]:font-[750] [&_>_b]:tracking-[-.04em] [&_>_b]:leading-none [&_>_b]:text-[ellipsis]",
            "[&_>_b]:whitespace-nowrap [&_>_b_small]:ml-[3px] [&_>_b_small]:text-[color:#98a5ab]",
            "[&_>_b_small]:text-[9px] [&_>_b_small]:font-medium [&_>_b_small]:tracking-[0]",
            "[&_>_small]:text-[color:#98a5ab] [&_>_small]:text-[8px] [&_>_small]:leading-[1.15]",
            "[&_>_span_svg]:text-[color:#f18491] max-[420px]:min-h-[68px]",
          ].join(" ")}>
            <span><HeartPulse />Средний пульс</span>
            <b>{averageHr || "—"}<small>bpm</small></b>
          </article>
          <article className={[
            "period-summary-metric workout-summary flex flex-col justify-between min-w-0 min-h-[76px] pt-[10px]",
            "px-[9px] pb-2 [border:1px_solid_#34424a] rounded-[12px]",
            "[background:linear-gradient(145deg,_#202a30,_#192228_80%)] [&_>_span]:flex [&_>_span]:items-center",
            "[&_>_span]:gap-[5px] [&_>_span]:overflow-hidden [&_>_span]:text-[color:#aab6bb]",
            "[&_>_span]:text-[9px] [&_>_span]:text-[ellipsis] [&_>_span]:whitespace-nowrap",
            "[&_>_span_svg]:w-[13px] [&_>_span_svg]:h-[13px] [&_>_span_svg]:[flex:0_0_auto]",
            "[&_>_b]:overflow-hidden [&_>_b]:text-[color:#e5ebee] [&_>_b]:font-display [&_>_b]:text-[19px]",
            "[&_>_b]:font-[750] [&_>_b]:tracking-[-.04em] [&_>_b]:leading-none [&_>_b]:text-[ellipsis]",
            "[&_>_b]:whitespace-nowrap [&_>_b_small]:ml-[3px] [&_>_b_small]:text-[color:#98a5ab]",
            "[&_>_b_small]:text-[9px] [&_>_b_small]:font-medium [&_>_b_small]:tracking-[0]",
            "[&_>_small]:text-[color:#98a5ab] [&_>_small]:text-[8px] [&_>_small]:leading-[1.15]",
            "[&_>_span_svg]:text-[color:#b1beff] max-[420px]:min-h-[68px]",
          ].join(" ")}>
            <span><Dumbbell />Тренировки</span>
            <b>{runCount + strengthCount}</b>
            <small>{runCount} бег · {strengthCount} зал</small>
          </article>
          <article className={[
            "period-summary-metric average-summary flex flex-col justify-between min-w-0 min-h-[76px] pt-[10px]",
            "px-[9px] pb-2 [border:1px_solid_#34424a] rounded-[12px]",
            "[background:linear-gradient(145deg,_#202a30,_#192228_80%)] [&_>_span]:flex [&_>_span]:items-center",
            "[&_>_span]:gap-[5px] [&_>_span]:overflow-hidden [&_>_span]:text-[color:#aab6bb]",
            "[&_>_span]:text-[9px] [&_>_span]:text-[ellipsis] [&_>_span]:whitespace-nowrap",
            "[&_>_span_svg]:w-[13px] [&_>_span_svg]:h-[13px] [&_>_span_svg]:[flex:0_0_auto]",
            "[&_>_b]:overflow-hidden [&_>_b]:text-[color:#e5ebee] [&_>_b]:font-display [&_>_b]:text-[19px]",
            "[&_>_b]:font-[750] [&_>_b]:tracking-[-.04em] [&_>_b]:leading-none [&_>_b]:text-[ellipsis]",
            "[&_>_b]:whitespace-nowrap [&_>_b_small]:ml-[3px] [&_>_b_small]:text-[color:#98a5ab]",
            "[&_>_b_small]:text-[9px] [&_>_b_small]:font-medium [&_>_b_small]:tracking-[0]",
            "[&_>_small]:text-[color:#98a5ab] [&_>_small]:text-[8px] [&_>_small]:leading-[1.15]",
            "[&_>_span_svg]:text-[color:#e9bd79] max-[420px]:min-h-[68px]",
          ].join(" ")}>
            <span><Activity />Среднее за бег</span>
            <b>{runCount ? averageKm.toFixed(1) : "—"}<small>км</small></b>
          </article>
        </div>

        <section className="min-w-0 rounded-xl border border-[#34424a] bg-[#1b252b] p-3">
          <button type="button" aria-expanded={yearChartOpen} aria-controls="year-trends"
            onClick={() => setYearChartOpen(!yearChartOpen)}
            className="flex min-h-10 w-full items-center justify-between gap-2 text-left text-sm font-semibold">
            <span>Годовая динамика · {chartYear}</span>
            <span className="inline-flex items-center gap-1 text-xs text-[#aebbc0]">
              {yearChartOpen ? "Свернуть" : "Развернуть"}
              <ChevronDown size={16} aria-hidden="true" className={yearChartOpen ? "rotate-180" : undefined} />
            </span>
          </button>
          <div id="year-trends" hidden={!yearChartOpen}>
            {yearChartOpen && <PeriodTrends data={yearChartData} periodLabel={`Месяцы · ${chartYear}`}
              showRunning={showRunning} showStrength={showStrength} />}
          </div>
        </section>

        {expandedYear !== null && (
          <section className="period-calendar-section flex flex-col gap-[10px] min-w-0">
            <div className={[
              "period-section-heading flex items-center justify-between gap-[14px]",
              "[&_>_div_>_span]:text-[color:#9ba9ae] [&_>_div_>_span]:text-[9px] [&_>_div_>_span]:font-bold",
              "[&_>_div_>_span]:tracking-[.14em] [&_h2]:mt-[3px] mx-0 mb-0 [&_h2]:text-[color:#e0e8eb]",
              "[&_h2]:font-display [&_h2]:text-[15px] [&_h2]:font-bold",
            ].join(" ")}>
              <div>
                <span>КАЛЕНДАРЬ ГОДА</span>
                <h2>Месяцы · {expandedYear}</h2>
              </div>
            </div>
            <div className="period-month-list grid grid-cols-[repeat(6,_minmax(0,_1fr))] gap-[7px] mt-[14px] mx-0 mb-1 max-[620px]:grid-cols-[repeat(3,_minmax(0,_1fr))]">
            {Array.from({ length: 12 }, (_, month) => month).map((month) => {
              const monthName = monthNames[month];
              const currentDate = new Date();
              const monthLocked = publicDemo && (expandedYear > currentDate.getFullYear()
                || (expandedYear === currentDate.getFullYear() && month > currentDate.getMonth()));
              const summary = monthSummaries.get(`${expandedYear}-${month}`) || emptySummary();
              const showRunning = selectedTypes.includes("running");
              const showStrength = !showRunning && selectedTypes.includes("strength");
              const monthSelected = selection.year === expandedYear
                && selection.month === month
                && selection.type !== "year";
              const averageHr = summary.hrWeight ? Math.round(summary.hrSeconds / summary.hrWeight) : null;
              const pace = averageRunningPace(summary);
              const monthLabel = showRunning
                ? `${monthName} ${expandedYear}: ${summary.runKm.toFixed(1)} км, ${averageHr || "нет данных о пульсе"} bpm, темп ${fmtPace(pace)}`
                : showStrength
                  ? `${monthName} ${expandedYear}: ${summary.strengthCount} силовых тренировок`
                  : `${monthName} ${expandedYear}`;
              return (
                <button
                  className={`period-month-cube relative isolate flex min-w-0 min-h-[80px] flex-col items-center justify-end gap-1 overflow-hidden px-1 pb-2 pt-6 border rounded-[10px] text-[#dce4e8] transition-[border-color,background,box-shadow,transform] duration-150 hover:-translate-y-px [&:disabled:hover]:transform-none [&.is-locked:hover]:transform-none ${showRunning ? "run-mode border-[#5e4940] [background:linear-gradient(145deg,_#362923,_#1d262b_82%)] hover:border-[#dc7959] hover:[background:linear-gradient(145deg,_#38251f,_#1b1e22_82%)] hover:[box-shadow:0_0_16px_#e77d5c24,_inset_0_1px_#ffffff0c] [&.is-selected]:border-[#dc7959] [&.is-selected]:[background:linear-gradient(145deg,_#38251f,_#1b1e22_82%)] [&.is-selected]:[box-shadow:0_0_16px_#e77d5c24,_inset_0_1px_#ffffff0c]" : showStrength ? "strength-mode border-[#424c76] [background:linear-gradient(145deg,_#293148,_#1c252f_82%)] hover:border-[#7485d5] hover:[background:linear-gradient(145deg,_#252c47,_#1a202c_82%)] hover:[box-shadow:0_0_16px_#91a6ff26,_inset_0_1px_#ffffff0c] [&.is-selected]:border-[#7485d5] [&.is-selected]:[background:linear-gradient(145deg,_#252c47,_#1a202c_82%)] [&.is-selected]:[box-shadow:0_0_16px_#91a6ff26,_inset_0_1px_#ffffff0c]" : "border-[#394651] [background:linear-gradient(145deg,_#25323a,_#1a242a_78%)]"}${monthLocked ? " is-locked cursor-not-allowed opacity-[0.26] [filter:saturate(.35)] shadow-none transform-none hover:border-[#394651]" : ""}${monthSelected ? " is-selected" : ""}`}
                  type="button"
                  key={monthName}
                  disabled={monthLocked}
                  aria-label={monthLabel}
                  aria-pressed={monthSelected}
                  aria-disabled={monthLocked}
                  title={monthLabel}
                  onClick={() => {
                    if (monthLocked) return;
                    const monthOpen = expandedMonth?.year === expandedYear && expandedMonth.month === month;
                    setExpandedMonth(monthOpen ? null : { year: expandedYear, month });
                    setSelection(monthOpen
                      ? { type: "year", year: expandedYear }
                      : { type: "month", year: expandedYear, month });
                  }}
                >
                  <span aria-hidden="true" className="pointer-events-none absolute right-1.5 top-1 bg-gradient-to-br from-[#d4dde1]/80 to-[#d4dde1]/20 bg-clip-text text-[14px] font-bold capitalize leading-none text-transparent">
                    {monthShortNames[month]}
                  </span>
                  {showRunning ? (
                    <span className="z-[1] grid w-full min-w-0 gap-1.5 tabular-nums">
                      <span className="flex items-baseline justify-center gap-1 whitespace-nowrap text-[#ffc17f]">
                        <b className="font-display text-[clamp(16px,2vw,23px)] font-extrabold leading-none">{summary.runKm.toFixed(1)}</b>
                        <small className="text-[10px] font-semibold">км</small>
                      </span>
                      <span className="flex items-center justify-center gap-1.5 whitespace-nowrap text-[11px] font-semibold text-[#dce4e8]">
                        <span className="inline-flex items-center gap-0.5">
                          <Gauge size={11} className="shrink-0 text-[#e7a05b]" aria-hidden="true" />
                          {fmtPace(pace)}
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <HeartPulse size={11} className="shrink-0 text-[#ee817d]" aria-hidden="true" />
                          {averageHr ?? "—"}
                        </span>
                      </span>
                    </span>
                  ) : showStrength ? (
                    <span className={[
                      "period-month-metrics strength-month-metrics grid w-full gap-[2px] z-[1] [&_>_span]:flex",
                      "[&_>_span]:items-center [&_>_span]:justify-center [&_>_span]:gap-[3px] [&_>_span]:min-w-0",
                      "[&_svg]:[flex:0_0_auto] [&_b]:overflow-hidden [&_b]:font-display [&_b]:font-extrabold",
                      "[&_b]:text-[ellipsis] [&_b]:whitespace-nowrap [&_small]:text-[color:#aab6bb] [&_small]:text-[7px]",
                      "justify-items-center [&_>_span]:text-[color:#b6c2ff] [&_svg]:w-[18px] [&_svg]:h-[18px]",
                      "[&_svg]:text-[color:#91a6ff] [&_b]:text-[15px]",
                    ].join(" ")}>
                      <span><Dumbbell /><b>{summary.strengthCount}</b></span>
                    </span>
                  ) : (
                    <span className={[
                      "period-month-metrics grid w-full gap-[2px] z-[1] [&_>_span]:flex [&_>_span]:items-center",
                      "[&_>_span]:justify-center [&_>_span]:gap-[3px] [&_>_span]:min-w-0 [&_>_span]:text-[color:#dce4e8]",
                      "[&_svg]:w-[11px] [&_svg]:h-[11px] [&_svg]:[flex:0_0_auto] [&_b]:overflow-hidden [&_b]:font-display",
                      "[&_b]:text-[9px] [&_b]:font-extrabold [&_b]:text-[ellipsis] [&_b]:whitespace-nowrap",
                      "[&_small]:text-[color:#aab6bb] [&_small]:text-[7px]",
                    ].join(" ")}>—</span>
                  )}
                </button>
              );
            })}
            </div>
          </section>
        )}

        {chartMonth != null && (
          <section className="min-w-0" aria-label="График выбранного месяца">
            <h2 className="mb-2 text-sm font-bold capitalize">{monthNames[chartMonth]} · {chartYear}</h2>
            <PeriodTrends data={monthChartData} periodLabel={`Дни · ${monthNames[chartMonth]} ${chartYear}`}
              showRunning={showRunning} showStrength={showStrength}
              periodSummary={{
                distanceKm: monthlySummary?.runKm || 0,
                pace: averageRunningPace(monthlySummary),
                heartRate: monthlySummary?.hrWeight ? Math.round(monthlySummary.hrSeconds / monthlySummary.hrWeight) : null,
                strengthCount: monthlySummary?.strengthCount || 0,
              }}
            />
          </section>
        )}

        {expandedMonth?.year === expandedYear && (
          <MonthDayCalendar
            expandedYear={expandedYear}
            calendarMonth={expandedMonth.month}
            monthNames={monthNames}
            daySummaries={daySummaries}
            selectedTypes={selectedTypes}
            selection={selection}
            onSelectDay={selectDay}
            deloadWeeks={deloadWeeks}
            plannedSessions={plannedSessions}
            onMarkDeload={onMarkDeload}
            syncBusy={busy}
            forecast={weather?.days}
          />
        )}

        {selection.type === "day" && (
          <div ref={linkedDetails} className="grid gap-3">
            <SelectedDayWeather day={weather?.days?.[localDateKey(periodStart)]} />
            {!publicDemo && <DayTrainingPlan key={localDateKey(periodStart)} date={localDateKey(periodStart)} session={dayPlan}
              hasActivities={periodActivities.length > 0} onPlanChanged={onTrainingWeekChanged} />}
            {(!dayPlan || dayActivities.length > 0) && (
              <>
                {(publicDemo || dayRuns.length > 1 || dayActivities.length === 0) && <DaySummary activities={dayRuns} date={periodStart} />}
                {!publicDemo && <ActivityDetail date={periodStart} activities={dayActivities} detailCache={detailCache} onActivityUpdated={onActivityUpdated} />}
                {!publicDemo && dayRuns.length > 0 && <WorkoutReview key={localDateKey(periodStart)} runs={dayRuns} plan={dayPlan} />}
              </>
            )}
          </div>
        )}

      </section>

      <YearHealthPanel wellness={wellness} />
    </main>
  );
}

export default CalendarPeriodExplorer;
