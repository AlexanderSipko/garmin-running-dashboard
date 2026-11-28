export function getActivityDate(activity) {
  const [year, month, day] = String(activity.start_time).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function getActivityCategory(activity) {
  const type = String(activity.type || "").toLowerCase().replace(/[^a-zа-я0-9]+/g, "_");
  if (/(strength|weight_training|gym|силов|зал)/.test(type)) return "strength";
  if (/(^|_)(run|running|virtual_run|trail_running)(_|$)/.test(type)) return "running";
  if (/(^|_)(cycling|biking|bike|bicycle|велосипед)(_|$)/.test(type)) return "cycling";
  return null;
}

export function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function emptySummary() {
  return { runKm: 0, runSeconds: 0, timedKm: 0, timedSeconds: 0, hrSeconds: 0, hrWeight: 0,
    powerSum: 0, powerSamples: 0, powerRunCount: 0, runCount: 0, strengthCount: 0, cyclingKm: 0, cyclingCount: 0 };
}

export function averageRunningPace(summary) {
  return summary?.timedKm > 0 ? summary.timedSeconds / summary.timedKm : null;
}

export function averageRunningPower(days) {
  let watts = 0;
  let samples = 0;
  for (const day of days) {
    if (!day?.powerSamples) continue;
    watts += day.powerSum;
    samples += day.powerSamples;
  }
  return samples ? Math.round(watts / samples) : null;
}

function addActivity(summary, activity, category) {
  if (category === "running") {
    const seconds = Number(activity.moving_duration_seconds || activity.duration_seconds || 0);
    const km = Number(activity.distance_meters || 0) / 1000;
    const heartRate = Number(activity.avg_hr_bpm || 0);
    summary.runKm += km;
    summary.runSeconds += seconds;
    summary.runCount += 1;
    if (km > 0 && seconds > 0) {
      summary.timedKm += km;
      summary.timedSeconds += seconds;
    }
    if (heartRate > 0 && seconds > 0) {
      summary.hrSeconds += heartRate * seconds;
      summary.hrWeight += seconds;
    }
    const power = activity.running_power;
    if (Number.isFinite(power?.average_watts) && power.average_watts > 0
        && Number.isInteger(power.samples) && power.samples > 0) {
      summary.powerSum += power.average_watts * power.samples;
      summary.powerSamples += power.samples;
      summary.powerRunCount += 1;
    }
  } else if (category === "cycling") {
    summary.cyclingKm += Number(activity.distance_meters || 0) / 1000;
    summary.cyclingCount += 1;
  } else if (category === "strength") {
    summary.strengthCount += 1;
  }
}

export function summarizeActivities(activities) {
  const summary = emptySummary();
  for (const activity of activities) addActivity(summary, activity, getActivityCategory(activity));
  return summary;
}

function accumulate(summaries, key, activity, category) {
  const summary = summaries.get(key) || emptySummary();
  addActivity(summary, activity, category);
  summaries.set(key, summary);
}

export function summarizeCalendar(activities) {
  const daySummaries = new Map();
  const monthSummaries = new Map();
  const yearSummaries = new Map();

  for (const activity of activities) {
    const date = getActivityDate(activity);
    const year = date.getFullYear();
    const month = date.getMonth();
    const category = getActivityCategory(activity);

    accumulate(daySummaries, dayKey(date), activity, category);
    accumulate(monthSummaries, `${year}-${month}`, activity, category);
    accumulate(yearSummaries, year, activity, category);
  }

  return { daySummaries, monthSummaries, yearSummaries };
}

function shiftDays(date, offset) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

function weekKm(daySummaries, start) {
  let km = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    km += daySummaries.get(dayKey(shiftDays(start, offset)))?.runKm || 0;
  }
  return km;
}

function percentChange(km, referenceKm) {
  return referenceKm > 0 ? km / referenceKm - 1 : null;
}

export function demoWeeklyVolumeReference(daySummaries, weekStart, historyStart) {
  const previousMonday = shiftDays(weekStart, -7);
  const sixWeeksAgo = shiftDays(weekStart, -42);
  const previousKm = historyStart && previousMonday >= historyStart
    ? weekKm(daySummaries, previousMonday)
    : null;
  let typicalKm = null;

  if (historyStart && sixWeeksAgo >= historyStart) {
    const weeks = Array.from({ length: 6 }, (_, index) => weekKm(daySummaries, shiftDays(sixWeeksAgo, index * 7)));
    weeks.sort((first, second) => first - second);
    typicalKm = (weeks[2] + weeks[3]) / 2;
  }

  return { previous_km: previousKm, typical_km: typicalKm, weeks: typicalKm == null ? 0 : 6 };
}

export function weeklyVolumeComparison(reference, totalKm) {
  if (!reference) return null;
  const { previous_km: previousKm, typical_km: typicalKm, weeks } = reference;
  return {
    previousKm,
    typicalKm,
    weeks,
    previousChange: percentChange(totalKm, previousKm),
    typicalChange: percentChange(totalKm, typicalKm),
  };
}
