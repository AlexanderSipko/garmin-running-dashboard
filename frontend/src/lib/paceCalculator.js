export const COMMON_DISTANCES = [
  { label: "5 км", value: 5 },
  { label: "10 км", value: 10 },
  { label: "Полумарафон", value: 21.0975 },
  { label: "Марафон", value: 42.195 },
];

export function formatClock(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";

  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  const clock = [minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");

  return hours ? `${hours}:${clock}` : clock;
}

export function calculateSplits(distanceKm, paceSecondsPerKm) {
  if (distanceKm <= 0 || paceSecondsPerKm <= 0) return [];

  const segments = [];
  const fullKilometers = Math.floor(distanceKm);
  const remainingDistance = Number((distanceKm - fullKilometers).toFixed(3));
  const segmentCount = fullKilometers + (remainingDistance > 0 ? 1 : 0);
  let elapsedSeconds = 0;

  for (let index = 0; index < segmentCount; index += 1) {
    const segmentDistance = index < fullKilometers ? 1 : remainingDistance;
    const segmentSeconds = segmentDistance * paceSecondsPerKm;
    elapsedSeconds += segmentSeconds;

    segments.push({
      label:
        segmentDistance === 1
          ? `Километр ${index + 1}`
          : `Последние ${Math.round(segmentDistance * 1000)} м`,
      distanceKm: segmentDistance,
      paceSecondsPerKm,
      segmentSeconds,
      elapsedSeconds,
    });
  }

  return segments;
}

export function calculatePaceVariants(distanceKm, paceSecondsPerKm) {
  const adjustments = [-15, -10, -5, 0, 5, 10, 15];

  return adjustments.map((adjustment) => {
    const pace = Math.max(1, paceSecondsPerKm + adjustment);

    return {
      adjustment,
      paceSecondsPerKm: pace,
      finishSeconds: pace * distanceKm,
    };
  });
}
