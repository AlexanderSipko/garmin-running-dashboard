import { demoActivities } from "../data/demoActivities";

const getDistance = (activity) => Number(activity.distance_meters || 0);
const getDuration = (activity) =>
  Number(activity.moving_duration_seconds || activity.duration_seconds || 0);

function getActivityDay(activity) {
  const day = new Date(activity.start_time);
  day.setHours(0, 0, 0, 0);
  return day;
}

function mondayOf(day) {
  const monday = new Date(day);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function summarizeActivities(activities) {
  const distanceMeters = activities.reduce(
    (sum, activity) => sum + getDistance(activity),
    0
  );
  const durationSeconds = activities.reduce(
    (sum, activity) => sum + getDuration(activity),
    0
  );
  const heartRateSeconds = activities.reduce(
    (sum, activity) =>
      sum + Number(activity.avg_hr_bpm || 0) * getDuration(activity),
    0
  );
  const heartRateDuration = activities.reduce(
    (sum, activity) => sum + (activity.avg_hr_bpm ? getDuration(activity) : 0),
    0
  );

  return {
    distanceKm: distanceMeters / 1000,
    durationSeconds,
    averagePaceSecondsPerKm: distanceMeters
      ? durationSeconds / (distanceMeters / 1000)
      : null,
    averageHeartRate: heartRateDuration
      ? Math.round(heartRateSeconds / heartRateDuration)
      : null,
  };
}

function buildWeeklyTrend(activities, start, weekCount) {
  const firstMonday = mondayOf(start);
  const weeks = Array.from({ length: weekCount }, (_, index) => {
    const weekStart = new Date(firstMonday);
    weekStart.setDate(weekStart.getDate() + index * 7);
    return {
      weekStart,
      label: weekStart.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      }),
      km: 0,
      seconds: 0,
      heartRateSeconds: 0,
      heartRateDuration: 0,
      runs: 0,
    };
  });

  activities.forEach((activity) => {
    const activityWeek = mondayOf(getActivityDay(activity));
    const index = Math.floor(
      (activityWeek.getTime() - firstMonday.getTime()) / (7 * 86400000)
    );
    if (index < 0 || index >= weeks.length) return;

    const week = weeks[index];
    const distance = getDistance(activity);
    const duration = getDuration(activity);
    week.km += distance / 1000;
    week.seconds += duration;
    week.runs += 1;
    if (activity.avg_hr_bpm) {
      week.heartRateSeconds += Number(activity.avg_hr_bpm) * duration;
      week.heartRateDuration += duration;
    }
  });

  return weeks.map((week) => ({
    ...week,
    km: Math.round(week.km * 10) / 10,
    pace: week.km ? week.seconds / week.km : null,
    hr: week.heartRateDuration
      ? Math.round(week.heartRateSeconds / week.heartRateDuration)
      : null,
  }));
}

export function buildWeekRows(activities, anchorDate = new Date(), count = 26) {
  const currentMonday = mondayOf(anchorDate);

  return Array.from({ length: count }, (_, index) => {
    const start = new Date(currentMonday);
    start.setDate(start.getDate() - index * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const weekActivities = activities.filter((activity) => {
      const day = getActivityDay(activity);
      return day >= start && day < end;
    });
    const days = Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(start);
      date.setDate(date.getDate() + dayIndex);
      const dayActivities = weekActivities.filter(
        (activity) => getActivityDay(activity).getTime() === date.getTime()
      );
      return {
        date,
        activities: dayActivities,
        ...summarizeActivities(dayActivities),
      };
    });

    return {
      start,
      end,
      days,
      activities: weekActivities,
      ...summarizeActivities(weekActivities),
    };
  });
}

export function buildMonthDays(activities, monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(year, month, index + 1);
    const dayActivities = activities.filter(
      (activity) => getActivityDay(activity).getTime() === date.getTime()
    );
    return {
      date,
      activities: dayActivities,
      ...summarizeActivities(dayActivities),
    };
  });
}

export function buildMonthTotals(activities, year) {
  return Array.from({ length: 12 }, (_, month) => {
    const monthStart = new Date(year, month, 1);
    const nextMonth = new Date(year, month + 1, 1);
    const monthActivities = activities.filter((activity) => {
      const date = new Date(activity.start_time);
      return date >= monthStart && date < nextMonth;
    });

    return {
      month,
      activities: monthActivities,
      ...summarizeActivities(monthActivities),
    };
  });
}

export function buildDashboardSummary(
  data,
  period,
  selectedMonth,
  today = new Date()
) {
  const hasGarminActivities = Boolean(data?.activities?.length);
  const historyActivities = hasGarminActivities
    ? data.activities
    : demoActivities;
  const monthStart = new Date(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth(),
    1
  );
  const periodStart =
    period === "week"
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)
      : monthStart;
  const periodEnd =
    period === "week"
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
      : new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const previousStart =
    period === "week"
      ? new Date(
          periodStart.getFullYear(),
          periodStart.getMonth(),
          periodStart.getDate() - 7
        )
      : new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);

  const activitiesInRange = (start, end) =>
    historyActivities.filter((activity) => {
      const day = getActivityDay(activity);
      return day >= start && day < end;
    });
  const activities = activitiesInRange(periodStart, periodEnd);
  const previousActivities = activitiesInRange(previousStart, periodStart);
  const currentMetrics = summarizeActivities(activities);
  const previousMetrics = summarizeActivities(previousActivities);
  const previousDistance = previousMetrics.distanceKm;
  const historyStart = historyActivities.reduce((earliest, activity) => {
    const day = getActivityDay(activity);
    return !earliest || day < earliest ? day : earliest;
  }, null);
  const hasPreviousWindow = historyStart && historyStart <= previousStart;
  const chartStart =
    period === "week"
      ? new Date(mondayOf(today).getTime() - 3 * 7 * 86400000)
      : mondayOf(monthStart);
  const chartWeekCount =
    period === "week"
      ? 4
      : Math.floor(
          (new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0) -
            chartStart) /
            (7 * 86400000)
        ) + 1;
  const weekCount = period === "week" ? 4 : chartWeekCount;
  const chartActivities =
    period === "week"
      ? historyActivities
      : activitiesInRange(monthStart, periodEnd);

  return {
    ...currentMetrics,
    activities,
    historyActivities,
    latest: historyActivities[0] || null,
    comparisonPercent: previousDistance && hasPreviousWindow
      ? Math.round(
          ((currentMetrics.distanceKm - previousDistance) / previousDistance) *
            100
        )
      : null,
    chart: buildWeeklyTrend(chartActivities, chartStart, weekCount),
    weekRows: buildWeekRows(historyActivities),
    monthDays: buildMonthDays(historyActivities, monthStart),
    monthTotals: buildMonthTotals(
      historyActivities,
      selectedMonth.getFullYear()
    ),
    selectedMonth: monthStart,
    periodStart,
    periodEnd: new Date(periodEnd.getTime() - 86400000),
    usesDemoData: !hasGarminActivities,
    wellness: data?.wellness || { years: [], synced_at: null, errors: {} },
  };
}
