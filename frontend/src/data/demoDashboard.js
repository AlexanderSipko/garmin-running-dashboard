export function buildPublicDemoDashboard() {
  const activities = Array.from({ length: 42 }, (_, index) => {
    const day = new Date();
    day.setDate(day.getDate() - index * 2 - 1);
    const distance = 4200 + ((index * 1379) % 8200);
    return {
      id: `demo-${index + 1}`,
      name: index % 4 === 0 ? "Лёгкий восстановительный бег" : "Беговая тренировка",
      type: "running",
      start_time: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}T07:30:00`,
      distance_meters: distance,
      moving_duration_seconds: Math.round(distance / 1000 * (345 + index % 35)),
      avg_hr_bpm: 138 + index % 19,
    };
  });
  const sampleRuns = activities.slice(0, 16);
  for (const [index, run] of sampleRuns.entries()) {
    if (index % 4 === 0) activities.push({
      id: `demo-bike-${index}`, name: "Велопрогулка", type: "cycling",
      start_time: run.start_time.replace("07:30", "16:00"),
      distance_meters: 15000 + index * 900, moving_duration_seconds: 3000 + index * 120,
    });
    if (index % 3 === 0) activities.push({
      id: `demo-strength-${index}`, name: "Силовая тренировка", type: "strength_training",
      start_time: run.start_time.replace("07:30", "18:00"), duration_seconds: 2700,
    });
  }
  activities.sort((first, second) => second.start_time.localeCompare(first.start_time));
  const metrics = Object.fromEntries(["sleep", "hrv", "resting_hr", "stress", "weight", "vo2_max"].map((key) => [
    key,
    Array.from({ length: 28 }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - index - 1);
      const base = { sleep: 7.2, hrv: 48, resting_hr: 53, stress: 28, weight: 72.4, vo2_max: 49 }[key];
      const variation = { sleep: 1.1, hrv: 13, resting_hr: 7, stress: 18, weight: 0.8, vo2_max: 1.4 }[key];
      return { date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`, value: Number((base + Math.sin(index * 1.7) * variation / 2).toFixed(1)) };
    }),
  ]));
  return { connection: { configured: false, synced_at: null }, activities, wellness: { years: [], metrics, synced_at: null, errors: {} } };
}


export function demoWeekHeartRateZones(runCount, seconds) {
  return {
    configured: true,
    runs: runCount,
    recorded_runs: runCount,
    covered_seconds: seconds,
    seconds_by_zone: Object.fromEntries([0.15, 0.56, 0.22, 0.06, 0.01].map(
      (share, index) => [`Z${index + 1}`, seconds * share],
    )),
    outside_seconds: 0,
    approximate: false,
    missing_activity_ids: [],
  };
}
