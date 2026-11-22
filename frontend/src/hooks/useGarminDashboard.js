import { useEffect, useMemo, useState } from "react";
import { buildDashboardSummary } from "../lib/dashboardAnalytics";

const publicDemo = import.meta.env.VITE_PUBLIC_DEMO === "true";

function useGarminDashboard(period, selectedMonth) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (publicDemo) return;

    let mounted = true;

    fetch("/api/dashboard?days=3650")
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить Garmin");
        return response.json();
      })
      .then((dashboard) => {
        if (mounted) setData(dashboard);
      })
      .catch((requestError) => {
        if (mounted) setError(requestError.message);
      });

    return () => {
      mounted = false;
    };
  }, []);

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

  const summary = useMemo(
    () => buildDashboardSummary(data, period, selectedMonth),
    [data, period, selectedMonth]
  );

  return {
    ...summary,
    connected: Boolean(data?.connection?.configured),
    syncedAt: data?.connection?.synced_at || null,
    busy,
    error,
    sync: publicDemo ? undefined : sync,
    publicDemo,
  };
}

export default useGarminDashboard;
