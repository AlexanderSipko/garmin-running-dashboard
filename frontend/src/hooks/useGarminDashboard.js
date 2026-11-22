import { useCallback, useEffect, useState } from "react";
import { buildPublicDemoDashboard } from "../data/demoDashboard";
import { hasWellnessForDay, localDateKey } from "../lib/wellnessDates";

function mergeWellnessDay(previous, incoming, day) {
  const metrics = { ...previous?.metrics };
  for (const [name, points] of Object.entries(incoming.metrics)) {
    metrics[name] = [...(metrics[name] || []).filter((point) => point.date !== day), ...points];
  }
  return { ...previous, metrics, synced_at: incoming.synced_at ?? previous?.synced_at };
}

function useGarminDashboard(publicDemo) {
  const [data, setData] = useState(() => publicDemo ? buildPublicDemoDashboard() : { activities: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (publicDemo) return;

    const controller = new AbortController();
    const { signal } = controller;
    let wellnessRetry;

    fetch("/api/dashboard?days=3650", { signal })
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить Garmin");
        return response.json();
      })
      .then((dashboard) => {
        if (signal.aborted) return;
        setData(dashboard);

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
  }, [publicDemo]);

  const sync = async () => {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/sync?days=3650", { method: "POST" });
      const dashboard = await response.json();
      if (!response.ok) {
        throw new Error(dashboard.detail || "Синхронизация не выполнена");
      }
      setData(dashboard);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const replaceActivity = useCallback((updated) => {
    setData((current) => {
      const activities = (current.activities ?? []).map((activity) =>
        String(activity.id) === String(updated.id) ? updated : activity
      );
      activities.sort((first, second) => String(second.start_time || "").localeCompare(String(first.start_time || "")));
      return { ...current, activities };
    });
  }, []);

  return {
    activities: data.activities ?? [],
    replaceActivity,
    wellness: data.wellness,
    syncedAt: data?.connection?.synced_at || null,
    busy,
    error,
    sync: publicDemo ? undefined : sync,
  };
}

export default useGarminDashboard;
