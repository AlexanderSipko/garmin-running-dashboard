export function normalizeTrackPoints(points) {
  return (Array.isArray(points) ? points : [])
    .map((point) => ({
      ...point,
      distance_meters: point.distance_meters == null ? Number.NaN : Number(point.distance_meters),
      pace_seconds_per_km: point.pace_seconds_per_km != null && Number.isFinite(Number(point.pace_seconds_per_km))
        ? Number(point.pace_seconds_per_km)
        : null,
      heart_rate_bpm: point.heart_rate_bpm != null && Number.isFinite(Number(point.heart_rate_bpm))
        ? Number(point.heart_rate_bpm)
        : null,
    }))
    .filter((point) => Number.isFinite(point.distance_meters) && point.distance_meters >= 0)
    .sort((first, second) => first.distance_meters - second.distance_meters);
}
