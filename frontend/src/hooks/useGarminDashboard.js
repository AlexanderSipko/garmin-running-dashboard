import { useEffect, useState } from "react";
import { buildPublicDemoDashboard } from "../data/demoDashboard";

function useGarminDashboard(publicDemo) {
  const [data, setData] = useState(() => publicDemo ? buildPublicDemoDashboard() : { activities: [] });
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

  return {
    activities: data.activities ?? [],
    wellness: data.wellness,
    syncedAt: data?.connection?.synced_at || null,
    busy,
    error,
    sync: publicDemo ? undefined : sync,
  };
}

export default useGarminDashboard;
