export function getActivityDate(activity) {
  const [year, month, day] = String(activity.start_time).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function getActivityCategory(activity) {
  const type = String(activity.type || "").toLowerCase().replace(/[^a-zа-я0-9]+/g, "_");
  if (/(strength|weight_training|gym|силов|зал)/.test(type)) return "strength";
  if (/(^|_)(run|running|virtual_run|trail_running)(_|$)/.test(type)) return "running";
  return null;
}

export function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function emptySummary() {
  return { runKm: 0, runSeconds: 0, hrSeconds: 0, hrWeight: 0, runCount: 0, strengthCount: 0 };
}

function accumulate(summaries, key, activity, category) {
  const summary = summaries.get(key) || emptySummary();

  if (category === "running") {
    const seconds = Number(activity.moving_duration_seconds || activity.duration_seconds || 0);
    const heartRate = Number(activity.avg_hr_bpm || 0);
    summary.runKm += Number(activity.distance_meters || 0) / 1000;
    summary.runSeconds += seconds;
    summary.runCount += 1;
    if (heartRate > 0) {
      summary.hrSeconds += heartRate * seconds;
      summary.hrWeight += seconds;
    }
  } else if (category === "strength") {
    summary.strengthCount += 1;
  }

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
