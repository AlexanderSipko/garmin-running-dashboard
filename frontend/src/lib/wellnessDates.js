export const wellnessMetricKeys = ["sleep", "stress", "hrv", "weight", "resting_hr", "vo2_max"];

export function localDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function hasMetricValue(value) {
  return value != null && value !== "" && Number.isFinite(Number(value));
}

export function hasWellnessForDay(wellness, day) {
  return wellnessMetricKeys.some((metric) =>
    wellness?.metrics?.[metric]?.some(({ date, value }) => date === day && hasMetricValue(value))
  );
}
