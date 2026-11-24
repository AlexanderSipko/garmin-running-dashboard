export async function requestActivityDetails(
  activityId,
  { method = "GET", strength = false, onlyIfMissing = false, signal } = {},
) {
  const endpoint = strength ? "strength-refresh" : "detail";
  const query = onlyIfMissing ? "?only_if_missing=true" : "";
  const response = await fetch(`/api/activities/${activityId}/${endpoint}${query}`, {
    method,
    signal,
    cache: "no-store",
  });
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const message = typeof result?.detail === "string"
      ? result.detail
      : `Не удалось получить детали тренировки (HTTP ${response.status}). Попробуй ещё раз.`;
    throw new Error(message);
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Сервер вернул неожиданный ответ. Попробуй обновить детали ещё раз.");
  }
  return result;
}

export async function refreshActivityDetails(activityId, strength) {
  const result = await requestActivityDetails(activityId, { method: "POST", strength });
  if (!result.activity) throw new Error("Не удалось обновить тренировку из Garmin.");
  return result;
}
