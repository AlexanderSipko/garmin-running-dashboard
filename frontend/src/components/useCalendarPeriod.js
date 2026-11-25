import { useEffect, useMemo, useRef, useState } from "react";
import { currentCalendarMonth, readCalendarView, saveCalendarView, scrollToCurrentWeek } from "./calendarViewState";
import { dayFromPath } from "../lib/dashboardRoutes";
import { localDateKey } from "../lib/wellnessDates";
import {
  averageRunningPace,
  dayKey,
  emptySummary,
  getActivityCategory,
  getActivityDate,
  summarizeActivities,
  summarizeCalendar,
} from "../lib/calendarAnalytics";

export const monthNames = Array.from({ length: 12 }, (_, month) =>
  new Date(2024, month, 1).toLocaleDateString("ru-RU", { month: "long" })
);
export const monthShortNames = Array.from({ length: 12 }, (_, month) =>
  new Date(2024, month, 1).toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")
);

export function useCalendarPeriod({ activities, pagePath, publicDemo, plannedSessions, deloadWeeks, viewScope }) {
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

  const storageKey = `calendar-view:v1:${viewScope}:${pagePath}`;
  const [initial] = useState(() => readCalendarView(storageKey));
  const [yearChartOpen, setYearChartOpen] = useState(initial?.yearChartOpen ?? false);
  const [expandedYear, setExpandedYear] = useState(() => initial ? initial.expandedYear : currentCalendarMonth().year);
  const [expandedMonth, setExpandedMonth] = useState(() => initial ? initial.expandedMonth : currentCalendarMonth());
  const [selectedTypes, setSelectedTypes] = useState(["running"]);
  const [selection, setSelection] = useState(() => initial?.selection ?? { type: "month", ...currentCalendarMonth() });
  const [weekJump, setWeekJump] = useState(0);

  function showCurrentWeek() {
    const month = currentCalendarMonth();
    setExpandedYear(month.year);
    setExpandedMonth(month);
    setSelection({ type: "month", ...month });
    setWeekJump((count) => count + 1);
  }

  useEffect(() => {
    const save = () => saveCalendarView(storageKey, {
      selection, expandedYear, expandedMonth, yearChartOpen, scrollY: window.scrollY,
    });
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [storageKey, selection, expandedYear, expandedMonth, yearChartOpen]);

  useEffect(() => {
    if (!weekJump && dayFromPath(pagePath)) return;
    const frame = requestAnimationFrame(() => {
      if (!weekJump && Number.isFinite(initial?.scrollY)) {
        window.scrollTo(0, initial.scrollY);
      } else {
        scrollToCurrentWeek();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [initial, pagePath, weekJump]);

  useEffect(() => {
    const linkedDay = dayFromPath(pagePath);
    if (!linkedDay) return undefined;
    const { year, month } = linkedDay;
    if (!initial) {
      setExpandedYear(year);
      setExpandedMonth({ year, month });
      setSelection({ type: "day", ...linkedDay });
    }
    const frame = requestAnimationFrame(() => {
      if (Number.isFinite(initial?.scrollY)) window.scrollTo(0, initial.scrollY);
      else linkedDetails.current?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [initial, pagePath]);

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

  return {
    detailCache,
    linkedDetails,
    yearsOpen,
    setYearsOpen,
    availableYears,
    daySummaries,
    monthSummaries,
    yearSummaries,
    yearChartOpen,
    setYearChartOpen,
    expandedYear,
    setExpandedYear,
    expandedMonth,
    setExpandedMonth,
    selectedTypes,
    setSelectedTypes,
    selection,
    setSelection,
    periodStart,
    periodEnd,
    periodActivities,
    runCount,
    strengthCount,
    totalRunKm,
    averageKm,
    averageHr,
    averagePace,
    showRunning,
    showStrength,
    chartYear,
    chartMonth,
    monthlySummary,
    monthChartData,
    yearChartData,
    selectionLabel,
    selectDay,
    showCurrentWeek,
    dayActivities,
    dayRuns,
    dayPlan,
  };
}
