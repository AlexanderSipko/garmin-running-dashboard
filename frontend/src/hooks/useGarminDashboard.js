import { useCallback, useEffect, useRef, useState } from "react";
import { buildPublicDemoDashboard } from "../data/demoDashboard";
import { hasWellnessForDay, localDateKey } from "../lib/wellnessDates";

function mergeWellnessDay(previous, incoming, day) {
  const metrics = { ...previous?.metrics };
  for (const [name, points] of Object.entries(incoming.metrics)) {
    metrics[name] = [...(metrics[name] || []).filter((point) => point.date !== day), ...points];
  }
  return { ...previous, metrics, synced_at: incoming.synced_at ?? previous?.synced_at };
}

function replacePlannedSessions(dashboard, week) {
  const dates = new Set(week.sessions.map(({ date }) => date));
  return {
    ...dashboard,
    planned_sessions: [
      ...(dashboard.planned_sessions ?? []).filter((session) => !dates.has(session.date))
        .map((session) => ({ ...session, current_plan: false })),
      ...week.sessions.filter(({ kind }) => kind !== "rest")
        .map(({ date, kind, distance_km, instruction }) => ({
          date, kind, distance_km, instruction, plan_id: week.id, revision: week.revision ?? 0, current_plan: true,
        })),
    ],
  };
}

function useGarminDashboard(publicDemo) {
  const [data, setData] = useState(() => publicDemo ? buildPublicDemoDashboard() : { activities: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lastWeekChange = useRef(null);

  const acceptDashboard = useCallback((dashboard, weekAtRequestStart) => {
    const changedWeek = lastWeekChange.current;
    setData(changedWeek && changedWeek !== weekAtRequestStart
      ? replacePlannedSessions(dashboard, changedWeek)
      : dashboard);
  }, []);

  useEffect(() => {
    if (publicDemo) return;

    const controller = new AbortController();
    const { signal } = controller;
    const weekAtRequestStart = lastWeekChange.current;
    let wellnessRetry;

    fetch("/api/dashboard?days=3650", { signal })
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить Garmin");
        return response.json();
      })
      .then((dashboard) => {
        if (signal.aborted) return;
        acceptDashboard(dashboard, weekAtRequestStart);

        const day = localDateKey(new Date());
        if (!hasWellnessForDay(dashboard.wellness, day)) {
          wellnessRetry = setTimeout(async () => {
            try {
              const response = await fetch(`/api/dashboard/wellness?day=${day}`, { signal });
              if (!response.ok) return;
              const wellness = await response.json();
              if (signal.aborted || !hasWellnessForDay(wellness, day)) return;

              setData((current) => hasWellnessForDay(current.wellness, day)
                ? current
                : { ...current, wellness: mergeWellnessDay(current.wellness, wellness, day) });
            } catch {
              // The initial dashboard is still usable if the optional recheck fails.
            }
          }, 1500);
        }
      })
      .catch((requestError) => {
        if (!signal.aborted) setError(requestError.message);
      });

    return () => {
      controller.abort();
      clearTimeout(wellnessRetry);
    };
  }, [publicDemo, acceptDashboard]);

  const sync = async () => {
    const weekAtRequestStart = lastWeekChange.current;
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/sync?days=3650", { method: "POST" });
      const dashboard = await response.json();
      if (!response.ok) {
        throw new Error(dashboard.detail || "Синхронизация не выполнена");
      }
      acceptDashboard(dashboard, weekAtRequestStart);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  async function markDeloadWeek(weekStart, deload) {
    if (!publicDemo) {
      const response = await fetch("/api/dashboard/week-label", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart, deload }),
      });
      if (!response.ok) throw new Error("Не удалось сохранить отметку недели.");
    }
    setData((current) => {
      const labels = { ...current.deload_weeks };
      if (deload) labels[weekStart] = true;
      else delete labels[weekStart];
      return { ...current, deload_weeks: labels };
    });
  }

  const replaceActivity = useCallback((updated) => {
    setData((current) => {
      const activities = (current.activities ?? []).map((activity) =>
        String(activity.id) === String(updated.id) ? updated : activity
      );
      activities.sort((first, second) => String(second.start_time || "").localeCompare(String(first.start_time || "")));
      return { ...current, activities };
    });
  }, []);

  const replaceTrainingWeek = useCallback((week) => {
    lastWeekChange.current = week;
    setData((current) => replacePlannedSessions(current, week));
  }, []);

  return {
    activities: data.activities ?? [],
    replaceActivity,
    deloadWeeks: data.deload_weeks,
    plannedSessions: data.planned_sessions,
    replaceTrainingWeek,
    markDeloadWeek,
    wellness: data.wellness,
    syncedAt: data?.connection?.synced_at || null,
    busy,
    error,
    sync: publicDemo ? undefined : sync,
  };
}

export default useGarminDashboard;
