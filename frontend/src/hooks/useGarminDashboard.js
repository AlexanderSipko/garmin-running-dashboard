import { useCallback, useEffect, useRef, useState } from "react";
import { buildPublicDemoDashboard } from "../data/demoDashboard";

function replacePlannedSessions(dashboard, week) {
  const dates = new Set(week.sessions.map(({ date }) => date));
  return {
    ...dashboard,
    planned_sessions: [
      ...(dashboard.planned_sessions ?? []).filter((session) => !dates.has(session.date)
        && !(session.current_plan && (session.plan_id === week.id || session.kind === "rest")))
        .map((session) => ({ ...session, current_plan: false })),
      ...week.sessions
        .map(({ date, kind, distance_km, instruction }) => ({
          date, kind, distance_km, instruction, plan_id: week.id, revision: week.revision ?? 0, current_plan: true,
        })),
    ],
  };
}

function applyPlanChange(dashboard, { week, session }) {
  if (week) return replacePlannedSessions(dashboard, week);
  if (!session) return {
    ...dashboard,
    planned_sessions: (dashboard.planned_sessions ?? []).filter((row) => !row.current_plan),
  };
  return {
    ...dashboard,
    planned_sessions: [
      ...(dashboard.planned_sessions ?? []).filter(({ date }) => date !== session.date), session,
    ],
  };
}

function useGarminDashboard(publicDemo) {
  const [data, setData] = useState(() => publicDemo ? buildPublicDemoDashboard() : { activities: [] });
  const [loading, setLoading] = useState(!publicDemo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lastWeekChange = useRef(null);

  const acceptDashboard = useCallback((dashboard, weekAtRequestStart) => {
    const changedWeek = lastWeekChange.current;
    setData(changedWeek && changedWeek !== weekAtRequestStart
      ? applyPlanChange(dashboard, changedWeek)
      : dashboard);
  }, []);

  useEffect(() => {
    if (publicDemo) return;

    const controller = new AbortController();
    const { signal } = controller;
    const weekAtRequestStart = lastWeekChange.current;

    fetch("/api/dashboard?days=3650", { signal })
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить Garmin");
        return response.json();
      })
      .then((dashboard) => {
        if (signal.aborted) return;
        acceptDashboard(dashboard, weekAtRequestStart);
      })
      .catch((requestError) => {
        if (!signal.aborted) setError(requestError.message);
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });

    return () => controller.abort();
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

  const replaceActivity = useCallback((updated, weeklyVolume) => {
    setData((current) => {
      const activities = (current.activities ?? []).map((activity) =>
        String(activity.id) === String(updated.id) ? updated : activity
      );
      activities.sort((first, second) => String(second.start_time || "").localeCompare(String(first.start_time || "")));
      return { ...current, activities, weekly_volume: weeklyVolume ?? current.weekly_volume };
    });
  }, []);

  const replaceTrainingWeek = useCallback((week, session) => {
    const change = { week, session };
    lastWeekChange.current = change;
    setData((current) => applyPlanChange(current, change));
  }, []);

  return {
    activities: data.activities ?? [],
    replaceActivity,
    deloadWeeks: data.deload_weeks,
    weeklyVolume: data.weekly_volume,
    plannedSessions: data.planned_sessions,
    replaceTrainingWeek,
    markDeloadWeek,
    wellness: data.wellness,
    syncedAt: data?.connection?.synced_at || null,
    busy,
    loading,
    error,
    sync: publicDemo ? undefined : sync,
  };
}

export default useGarminDashboard;
