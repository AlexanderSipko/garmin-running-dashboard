export const dashboardPath = "/";
export const workoutsPath = "/workouts";
export const guidePath = "/connect";

export function dayPath(date) {
  return `/calendar/${date}`;
}

export function dayFromPath(path) {
  const match = /^\/calendar\/(\d{4})-(\d{2})-(\d{2})\/?$/.exec(path);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month: month - 1, day };
}

export function legacyPage(hash) {
  if (hash === "#workouts") return workoutsPath;
  if (hash === "#connect") return guidePath;
  if (hash.startsWith("#day=")) {
    const path = dayPath(hash.slice(5));
    if (dayFromPath(path)) return path;
  }
  return null;
}
