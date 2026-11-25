import { localDateKey } from "../lib/wellnessDates";

export function currentCalendarMonth() {
  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() };
}

export function readCalendarView(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

export function saveCalendarView(key, view) {
  try {
    sessionStorage.setItem(key, JSON.stringify(view));
  } catch {
    // The calendar still works when browser storage is disabled.
  }
}

export function scrollToCurrentWeek() {
  const monday = new Date();
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  document.getElementById(`calendar-week-${localDateKey(monday)}`)?.scrollIntoView({ block: "start" });
}
