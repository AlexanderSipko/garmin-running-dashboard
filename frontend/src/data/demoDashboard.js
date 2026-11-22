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
