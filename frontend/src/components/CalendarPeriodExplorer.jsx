import { Fragment, useMemo, useState } from "react";
import {
  Activity,
  Dumbbell,
  Footprints,
  Gauge,
  HeartPulse,
  Watch,
} from "lucide-react";
import { fmtPace, fmtDuration } from "../lib/format";
import ActivityDetail from "./ActivityDetail";
import RunningCoachPanel from "./RunningCoachPanel";
import YearHealthPanel from "./YearHealthPanel";
import PeriodTrends from "./PeriodTrends";

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const monthNames = Array.from({ length: 12 }, (_, month) =>
  new Date(2024, month, 1).toLocaleDateString("ru-RU", { month: "long" })
);
const monthShortNames = Array.from({ length: 12 }, (_, month) =>
  new Date(2024, month, 1).toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")
);

function getActivityDate(activity) {
  const [year, month, day] = String(activity.start_time).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getActivityCategory(activity) {
  const type = String(activity.type || "").toLowerCase().replace(/[^a-zа-я0-9]+/g, "_");
  if (/(strength|weight_training|gym|силов|зал)/.test(type)) return "strength";
  if (/(^|_)(run|running|virtual_run|trail_running)(_|$)/.test(type)) return "running";
  return null;
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function DaySummary({ activities, date }) {
  const distance = activities.reduce((sum, item) => sum + Number(item.distance_meters || 0), 0) / 1000;
  const seconds = activities.reduce((sum, item) => sum + Number(item.moving_duration_seconds || item.duration_seconds || 0), 0);
  const timed = activities.filter((item) => Number(item.avg_hr_bpm) > 0);
  const hrSeconds = timed.reduce((sum, item) => sum + Number(item.avg_hr_bpm) * Number(item.moving_duration_seconds || item.duration_seconds || 0), 0);
  const hrTime = timed.reduce((sum, item) => sum + Number(item.moving_duration_seconds || item.duration_seconds || 0), 0);
  const metrics = [
    ["ДИСТАНЦИЯ", `${distance.toFixed(1)} км`],
    ["ВРЕМЯ", fmtDuration(seconds)],
    ["СРЕДНИЙ ТЕМП", fmtPace(distance ? seconds / distance : 0)],
    ["СРЕДНИЙ ПУЛЬС", hrTime ? `${Math.round(hrSeconds / hrTime)} bpm` : "—"],
  ];
  return (
    <section className="day-summary min-w-0 pt-3 border-t border-[#34424a]" aria-label="Метрики выбранного дня">
      <h2 className="m-0 mb-2 text-[15px] font-semibold text-[#e0e8eb]">Итоги дня · {date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map(([label, value]) => (
          <article className="min-w-0 rounded-[10px] border border-[#34424a] bg-[linear-gradient(145deg,_#202a30,_#192228_80%)] p-3" key={label}>
            <small className="block text-[10px] text-[#aab6bb]">{label}</small>
            <b className="mt-1 block text-[18px] text-[#e5ebee]">{activities.length ? value : "—"}</b>
          </article>
        ))}
      </div>
      <p className="mt-2 mb-0 text-[11px] text-[#8f9ea5]">{activities.length} пробежек · суммарно {distance.toFixed(1)} км</p>
    </section>
  );
}

function CalendarPeriodExplorer({ activities, busy, error, onSync, publicDemo, syncedAt, usesDemoData, wellness }) {
  const availableYears = useMemo(() => {
    const years = new Set(activities.map((activity) => getActivityDate(activity).getFullYear()));
    years.add(new Date().getFullYear());
    return [...years].sort((first, second) => second - first);
  }, [activities]);

  const daySummaries = useMemo(() => {
    const summaries = new Map();
    activities.forEach((activity) => {
      const date = getActivityDate(activity);
      const key = dayKey(date);
      const summary = summaries.get(key) || {
        runKm: 0,
        runs: 0,
        runSeconds: 0,
        hrSeconds: 0,
        hrWeight: 0,
        strength: 0,
      };
      const category = getActivityCategory(activity);
      if (category === "running") {
        const distanceKm = Number(activity.distance_meters || 0) / 1000;
        const duration = Number(activity.moving_duration_seconds || activity.duration_seconds || 0);
        const heartRate = Number(activity.avg_hr_bpm || 0);
        summary.runKm += distanceKm;
        summary.runs += 1;
        summary.runSeconds += duration;
        if (heartRate > 0) {
          summary.hrSeconds += heartRate * duration;
          summary.hrWeight += duration;
        }
      }
      if (category === "strength") summary.strength += 1;
      summaries.set(key, summary);
    });
    return summaries;
  }, [activities]);

  const monthSummaries = useMemo(() => {
    const summaries = new Map();
    activities.forEach((activity) => {
      const date = getActivityDate(activity);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const summary = summaries.get(key) || {
        runKm: 0,
        runSeconds: 0,
        hrSeconds: 0,
        hrWeight: 0,
        strengthCount: 0,
      };
      const category = getActivityCategory(activity);
      if (category === "running") {
        const distanceKm = Number(activity.distance_meters || 0) / 1000;
        const duration = Number(activity.moving_duration_seconds || activity.duration_seconds || 0);
        const heartRate = Number(activity.avg_hr_bpm || 0);
        summary.runKm += distanceKm;
        summary.runSeconds += duration;
        if (heartRate > 0) {
          summary.hrSeconds += heartRate * duration;
          summary.hrWeight += duration;
        }
      }
      if (category === "strength") summary.strengthCount += 1;
      summaries.set(key, summary);
    });
    return summaries;
  }, [activities]);

  const yearSummaries = useMemo(() => {
    const summaries = new Map();
    activities.forEach((activity) => {
      const year = getActivityDate(activity).getFullYear();
      const summary = summaries.get(year) || {
        runKm: 0,
        runSeconds: 0,
        hrSeconds: 0,
        hrWeight: 0,
        runCount: 0,
        strengthCount: 0,
      };
      const category = getActivityCategory(activity);
      if (category === "running") {
        const distanceKm = Number(activity.distance_meters || 0) / 1000;
        const durationSeconds = Number(activity.moving_duration_seconds || activity.duration_seconds || 0);
        const heartRate = Number(activity.avg_hr_bpm || 0);
        summary.runKm += distanceKm;
        summary.runSeconds += durationSeconds;
        summary.runCount += 1;
        if (heartRate > 0) {
          summary.hrSeconds += heartRate * durationSeconds;
          summary.hrWeight += durationSeconds;
        }
      }
      if (category === "strength") summary.strengthCount += 1;
      summaries.set(year, summary);
    });
    return summaries;
  }, [activities]);

  const [expandedYear, setExpandedYear] = useState(() => new Date().getFullYear());
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [selectedTypes, setSelectedTypes] = useState(["running"]);
  const [selection, setSelection] = useState(() => ({
    type: "year",
    year: new Date().getFullYear(),
  }));

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

  const matchingRuns = matchingActivities.filter((activity) => getActivityCategory(activity) === "running");
  const strengthCount = matchingActivities.filter((activity) => getActivityCategory(activity) === "strength").length;
  const averageKm = matchingRuns.length
    ? matchingRuns.reduce((sum, activity) => sum + Number(activity.distance_meters || 0) / 1000, 0) / matchingRuns.length
    : 0;
  const totalRunKm = matchingRuns.reduce(
    (sum, activity) => sum + Number(activity.distance_meters || 0) / 1000,
    0
  );
  const totalRunSeconds = matchingRuns.reduce(
    (sum, activity) => sum + Number(activity.moving_duration_seconds || activity.duration_seconds || 0),
    0
  );
  const hrWeight = matchingRuns.reduce((sum, activity) =>
    sum + (Number(activity.avg_hr_bpm) > 0
      ? Number(activity.moving_duration_seconds || activity.duration_seconds || 0)
      : 0), 0);
  const weightedHr = matchingRuns.reduce((sum, activity) =>
    sum + (Number(activity.avg_hr_bpm) > 0
      ? Number(activity.avg_hr_bpm) * Number(activity.moving_duration_seconds || activity.duration_seconds || 0)
      : 0), 0);
  const averageHr = hrWeight ? Math.round(weightedHr / hrWeight) : null;
  const averagePace = totalRunKm ? totalRunSeconds / totalRunKm : null;
  const showRunning = selectedTypes.includes("running");
  const showStrength = selectedTypes.includes("strength");
  const chartYear = selection.year;
  const isMonthChart = selection.type !== "year";
  const chartData = useMemo(() => {
    if (isMonthChart) {
      const month = selection.month;
      const daysInMonth = new Date(chartYear, month + 1, 0).getDate();
      return Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const summary = daySummaries.get(`${chartYear}-${month}-${day}`);
        return { label: String(day), runKm: summary ? Number(summary.runKm.toFixed(1)) : 0,
          pace: summary?.runKm ? summary.runSeconds / summary.runKm : null,
          avgHr: summary?.hrWeight ? Math.round(summary.hrSeconds / summary.hrWeight) : null,
          strengthCount: summary?.strength || 0 };
      });
    }

    const currentDate = new Date();
    return Array.from({ length: 12 }, (_, month) => {
      const isFuture = chartYear > currentDate.getFullYear()
        || (chartYear === currentDate.getFullYear() && month > currentDate.getMonth());
      const summary = monthSummaries.get(`${chartYear}-${month}`);
      return {
        label: monthShortNames[month],
        runKm: isFuture ? null : Number((summary?.runKm || 0).toFixed(1)),
        pace: !isFuture && summary?.runKm ? summary.runSeconds / summary.runKm : null,
        avgHr: !isFuture && summary?.hrWeight ? Math.round(summary.hrSeconds / summary.hrWeight) : null,
        strengthCount: isFuture ? null : summary?.strengthCount || 0,
      };
    });
  }, [chartYear, daySummaries, isMonthChart, monthSummaries, selection.month]);
  const chartPeriodLabel = isMonthChart
    ? `Дни · ${monthNames[selection.month]} ${chartYear}`
    : `Месяцы · ${chartYear}`;

  const selectionLabel = selection.type === "year"
    ? `${selection.year} год`
    : selection.type === "month"
      ? `${monthNames[selection.month]} ${selection.year}`
      : `${selection.day} ${monthNames[selection.month]} ${selection.year}`;

  const calendarMonth = expandedMonth?.month;
  const calendarOffset = calendarMonth == null
    ? 0
    : (new Date(expandedYear, calendarMonth, 1).getDay() + 6) % 7;
  const calendarDayCount = calendarMonth == null
    ? 0
    : new Date(expandedYear, calendarMonth + 1, 0).getDate();
  const calendarWeeks = useMemo(() => {
    if (calendarMonth == null) return [];
    const first = new Date(expandedYear, calendarMonth, 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(expandedYear, calendarMonth, 1 - mondayOffset);
    const count = Math.ceil((mondayOffset + calendarDayCount) / 7);
    return Array.from({ length: count }, (_, week) => ({
      days: Array.from({ length: 7 }, (__, day) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + week * 7 + day)),
    }));
  }, [calendarDayCount, calendarMonth, expandedYear]);
  const dayRuns = selection.type === "day"
    ? periodActivities.filter((activity) => getActivityCategory(activity) === "running")
    : [];

  return (
    <main className="period-explorer grid grid-cols-[minmax(205px,_245px)_minmax(0,_1fr)_minmax(270px,_300px)] min-h-screen max-[760px]:grid-cols-[minmax(0,_1fr)] max-[760px]:overflow-x-clip">
      <aside className="period-explorer-sidebar min-w-0 self-start min-[761px]:sticky min-[761px]:top-0 min-[761px]:max-h-dvh min-[761px]:overflow-y-auto px-3 pb-4 [border-right:1px_solid_var(--border)] max-[760px]:px-3 max-[760px]:border-r-0" aria-label="Выбор даты">
        {onSync && <button
          className={[
            "period-sync-button mb-3 flex min-h-[34px] w-full items-center justify-center gap-2 px-2 text-[12px] font-semibold",
            "[border:1px_solid_#354c3d] rounded-[10px] [background:linear-gradient(145deg,_#1c2a22,_#151d19)]",
            "[box-shadow:inset_0_1px_#ffffff0a] text-[color:#d6f5df]",
            "[transition:border-color_140ms_ease,_box-shadow_140ms_ease,_transform_140ms_ease]",
            "[&:hover:not(:disabled)]:[transform:translateY(-1px)]",
            "[&:hover:not(:disabled)]:border-[color:#79b48a]",
            "[&:hover:not(:disabled)]:[box-shadow:0_0_12px_#5aa16d2e] [&_svg]:text-[color:#a8e8b7]",
            "[&:disabled]:cursor-wait [&:disabled]:opacity-[0.7]",
          ].join(" ")}
          type="button"
          onClick={onSync}
          disabled={busy}
          aria-label={busy ? "Синхронизация с Garmin" : "Обновить данные Garmin"}
          title={busy ? "Синхронизация с Garmin" : "Обновить данные Garmin"}
        >
          <Watch className={busy ? "is-spinning [.period-sync-button_&]:animate-spin" : ""} size={16} />
          {busy ? "Обновляю…" : "Обновить Garmin"}
        </button>}
        {error && <div className="period-sync-error mt-[-2px] mx-0 mb-[9px] text-[color:#ff9a91] text-[12px]">{error}</div>}

        <div className="period-explorer-years grid gap-2 max-[760px]:grid-flow-col max-[760px]:auto-cols-[minmax(145px,42vw)] max-[760px]:overflow-x-auto max-[760px]:snap-x max-[760px]:[&>*]:snap-start">
          {availableYears.map((year) => {
            const yearOpen = expandedYear === year;
            const summary = yearSummaries.get(year) || {
              runKm: 0,
              runSeconds: 0,
              hrSeconds: 0,
              hrWeight: 0,
              runCount: 0,
              strengthCount: 0,
            };
            const paceSeconds = summary.runKm ? summary.runSeconds / summary.runKm : null;
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
                    "period-year-metric distance flex items-center justify-center gap-[3px] min-w-0 p-[2px]",
                    "text-[color:#f0f4f5] whitespace-nowrap [&_small]:text-[color:#9aaab2] [&_small]:text-[8px]",
                    "[&_svg]:w-[15px] [&_svg]:h-[15px] [&_svg]:[flex:0_0_auto] [&_svg]:text-[color:#e5aa62]",
                    "[&.distance_svg]:text-[color:#e5aa62] [.period-year-metric&_svg]:text-[color:#e5aa62]",
                    "[&.pulse_svg]:text-[color:#f18c8c] [&.pace_svg]:text-[color:#91a6ff] [&_b]:overflow-hidden",
                    "[&_b]:text-[color:#dce4e8] [&_b]:font-display [&_b]:text-[13px] [&_b]:font-extrabold",
                    "[&_b]:tracking-[-0.04em] [&_b]:text-[ellipsis] [&_b]:whitespace-nowrap max-[760px]:[&_b]:text-[11px]",
                    "[.trend-legend-item&]:text-[color:#9fd75e] [.trend-chart-series&]:text-[color:#9fd75e]",
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
            <b>{matchingRuns.length + strengthCount}</b>
            <small>{matchingRuns.length} бег · {strengthCount} зал</small>
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
            <b>{matchingRuns.length ? averageKm.toFixed(1) : "—"}<small>км</small></b>
          </article>
        </div>

        {selection.type !== "day" && (
          <PeriodTrends
            data={chartData}
            periodLabel={chartPeriodLabel}
            showRunning={showRunning}
            showStrength
            periodSummary={{
              distanceKm: totalRunKm,
              pace: averagePace,
              heartRate: averageHr,
              strengthCount: periodActivities.filter((activity) => getActivityCategory(activity) === "strength").length,
            }}
          />
        )}

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
            <div className="period-month-list grid grid-cols-[repeat(6,_minmax(0,_1fr))] gap-[7px] mt-[14px] mx-0 mb-1 max-[420px]:grid-cols-[repeat(3,_minmax(0,_1fr))]">
            {Array.from({ length: 12 }, (_, month) => month).map((month) => {
              const monthName = monthNames[month];
              const currentDate = new Date();
              const monthLocked = expandedYear > currentDate.getFullYear()
                || (expandedYear === currentDate.getFullYear() && month > currentDate.getMonth());
              const summary = monthSummaries.get(`${expandedYear}-${month}`) || {
                runKm: 0,
                runSeconds: 0,
                hrSeconds: 0,
                hrWeight: 0,
                strengthCount: 0,
              };
              const showRunning = selectedTypes.includes("running");
              const showStrength = !showRunning && selectedTypes.includes("strength");
              const monthSelected = selection.year === expandedYear
                && selection.month === month
                && selection.type !== "year";
              const averageHr = summary.hrWeight ? Math.round(summary.hrSeconds / summary.hrWeight) : null;
              const pace = summary.runKm ? summary.runSeconds / summary.runKm : null;
              const monthLabel = showRunning
                ? `${monthName} ${expandedYear}: ${summary.runKm.toFixed(1)} км, ${averageHr || "нет данных о пульсе"} bpm, темп ${fmtPace(pace)}`
                : showStrength
                  ? `${monthName} ${expandedYear}: ${summary.strengthCount} силовых тренировок`
                  : `${monthName} ${expandedYear}`;
              return (
                <button
                  className={`period-month-cube relative isolate flex min-w-0 min-h-[76px] flex-col items-center justify-center gap-1 overflow-hidden px-1 py-1.5 border rounded-[10px] text-[#dce4e8] transition-[border-color,background,box-shadow,transform] duration-150 hover:-translate-y-px [&:disabled:hover]:transform-none [&.is-locked:hover]:transform-none ${showRunning ? "run-mode border-[#5e4940] [background:linear-gradient(145deg,_#362923,_#1d262b_82%)] hover:border-[#dc7959] hover:[background:linear-gradient(145deg,_#38251f,_#1b1e22_82%)] hover:[box-shadow:0_0_16px_#e77d5c24,_inset_0_1px_#ffffff0c] [&.is-selected]:border-[#dc7959] [&.is-selected]:[background:linear-gradient(145deg,_#38251f,_#1b1e22_82%)] [&.is-selected]:[box-shadow:0_0_16px_#e77d5c24,_inset_0_1px_#ffffff0c]" : showStrength ? "strength-mode border-[#424c76] [background:linear-gradient(145deg,_#293148,_#1c252f_82%)] hover:border-[#7485d5] hover:[background:linear-gradient(145deg,_#252c47,_#1a202c_82%)] hover:[box-shadow:0_0_16px_#91a6ff26,_inset_0_1px_#ffffff0c] [&.is-selected]:border-[#7485d5] [&.is-selected]:[background:linear-gradient(145deg,_#252c47,_#1a202c_82%)] [&.is-selected]:[box-shadow:0_0_16px_#91a6ff26,_inset_0_1px_#ffffff0c]" : "border-[#394651] [background:linear-gradient(145deg,_#25323a,_#1a242a_78%)]"}${monthLocked ? " is-locked cursor-not-allowed opacity-[0.26] [filter:saturate(.35)] shadow-none transform-none hover:border-[#394651]" : ""}${monthSelected ? " is-selected" : ""}`}
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
                    setSelection({ type: "month", year: expandedYear, month });
                  }}
                >
                  <span className="z-[1] text-[13px] font-extrabold capitalize leading-none">{monthShortNames[month]}</span>
                  {showRunning ? (
                    <span className={[
                      "period-month-metrics running-month-metrics grid w-full gap-[2px] z-[1] [&_>_span]:flex",
                      "[&_>_span]:items-center [&_>_span]:justify-center [&_>_span]:gap-[3px] [&_>_span]:min-w-0",
                      "[&_>_span]:text-[color:#dce4e8] [&_svg]:w-[11px] [&_svg]:h-[11px] [&_svg]:[flex:0_0_auto]",
                      "[&_>_span:nth-child(1)_svg]:text-[color:#e7a05b] [&_>_span:nth-child(2)_svg]:text-[color:#ee817d]",
                      "[&_>_span:nth-child(3)_svg]:text-[color:#ed9b62] [&_b]:overflow-hidden [&_b]:font-display",
                      "[&_b]:text-[12px] [&_b]:font-extrabold [&_b]:text-[ellipsis] [&_b]:whitespace-nowrap",
                      "[&_small]:text-[color:#aab6bb] [&_small]:text-[9px]",
                    ].join(" ")}>
                      <span><Footprints /><b>{summary.runKm.toFixed(1)}</b><small>км</small></span>
                      <span><HeartPulse /><b>{averageHr || "—"}</b><small>bpm</small></span>
                      <span><Gauge /><b>{fmtPace(pace)}</b><small>/км</small></span>
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

        {expandedMonth?.year === expandedYear && (
          <div className="period-month-days mt-3 mx-0 mb-1">
            <div className="period-month-days-heading mb-2 text-[#e0e8eb] text-[16px] font-extrabold capitalize">
              {monthNames[expandedMonth.month]} {expandedYear}
            </div>
            <div className="period-day-list grid grid-cols-[repeat(7,_minmax(0,_1fr))] gap-1 m-0">
              {weekdays.map((label, index) => (
                <span key={label} className={`text-center text-[11px] font-bold ${index >= 5 ? "text-[#f3ad92]" : "text-[color:var(--soft)]"}`}>{label}</span>
              ))}
              {calendarWeeks.map((week, weekIndex) => {
                const weekRuns = week.days.map((day) => daySummaries.get(`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`)).filter(Boolean);
                const weekKm = weekRuns.reduce((sum, item) => sum + item.runKm, 0);
                const weekSeconds = weekRuns.reduce((sum, item) => sum + item.runSeconds, 0);
                const weekHrWeight = weekRuns.reduce((sum, item) => sum + item.hrWeight, 0);
                const weekHrSeconds = weekRuns.reduce((sum, item) => sum + item.hrSeconds, 0);
                return <Fragment key={weekIndex}>
                  <div className="col-span-7 mt-1 flex flex-wrap gap-x-3 rounded-md border border-[#ffffff0d] bg-[#ffffff06] px-2 py-1.5 text-[12px] font-semibold text-[color:var(--soft)]">
                    <span>{weekKm.toFixed(1)} км</span><span>Темп {weekKm ? `${fmtPace(weekSeconds / weekKm)} /км` : "—"}</span><span>Пульс {weekHrWeight ? `${Math.round(weekHrSeconds / weekHrWeight)} уд/мин` : "—"}</span>
                  </div>
                  {weekdays.map((label, weekday) => {
                    const date = week.days[weekday];
                    const day = date.getDate();
                    const month = date.getMonth();
                    const year = date.getFullYear();
                    const outsideMonth = month !== calendarMonth;
                    const monthName = monthNames[month];
                    const daily = daySummaries.get(`${year}-${month}-${day}`) || { runKm: 0, runs: 0, strength: 0 };
                    const hasRun = selectedTypes.includes("running") && daily.runs > 0;
                    const hasStrength = selectedTypes.includes("strength") && daily.strength > 0;
                    const daySelected = selection.type === "day" && selection.year === expandedYear && selection.month === month && selection.day === day;
                    return (
                      <button
                        className={`period-cube period-day-cube flex min-w-0 min-h-[54px] flex-col items-center justify-center p-[4px] border border-[color:var(--border)] rounded-[9px] bg-[color:var(--panel)] text-[color:var(--text)] text-[14px] font-semibold text-center capitalize shadow-[0_3px_9px_#00000018] [&.has-run]:border-[#e5aa62] [&.has-run]:[background:linear-gradient(145deg,_#362923,_#1d262b_82%)] [&.is-selected]:border-[color:var(--accent)] [&.is-selected]:bg-[color:var(--accent-soft)] [&_small]:mt-[2px] [&_small]:text-[#e5aa62] [&_small]:text-[10px] [&_small]:leading-[1.1] ${outsideMonth ? "opacity-35" : ""}${hasRun ? " has-run" : ""}${daySelected ? " is-selected" : ""}`}
                        type="button"
                        key={day}
                        aria-label={`${day} ${monthName} ${expandedYear}${hasRun ? `, бег ${daily.runKm.toFixed(1)} км` : ""}${hasStrength ? ", силовая тренировка" : ""}`}
                        onClick={() => { if (outsideMonth) { setExpandedMonth({ year, month }); setExpandedYear(year); } setSelection({ type: "day", year, month, day }); }}
                      >
                        <span className={weekday >= 5 ? "text-[#f3ad92]" : undefined}>{day}</span>
                        {hasRun && <><small>{daily.runKm.toFixed(1)} км</small><i aria-hidden="true" style={{ width: `${Math.min(12, 4 + daily.runKm * 0.2)}px`, height: `${Math.min(12, 4 + daily.runKm * 0.2)}px` }} className="mt-1 rounded-full bg-[#e5aa62] opacity-80" /></>}
                        {hasStrength && <i aria-hidden="true" />}
                      </button>
                    );
                  })}
                </Fragment>;
              })}
            </div>
          </div>
        )}

        {selection.type === "day" && (
          <>
            {(publicDemo || dayRuns.length !== 1) && <DaySummary activities={dayRuns} date={periodStart} />}
            {!publicDemo && <ActivityDetail date={periodStart} activities={dayRuns} />}
          </>
        )}

        {!publicDemo && <details className="mt-3 rounded-xl border border-[#34424a] bg-[linear-gradient(145deg,_#202a30,_#192228_80%)] p-3">
          <summary className="cursor-pointer text-[15px] font-semibold text-[#e5ebee]">Открыть чат с тренером</summary>
          <RunningCoachPanel period={selection.type} periodStart={periodStart} periodEnd={periodEnd} syncedAt={syncedAt} hasRealData={!usesDemoData} />
        </details>}

      </section>

      <YearHealthPanel
        wellness={wellness}
        period={selectionLabel}
        periodStart={periodStart}
        periodEnd={periodEnd}
      />
    </main>
  );
}

export default CalendarPeriodExplorer;
