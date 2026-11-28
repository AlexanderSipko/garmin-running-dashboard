import { useEffect, useRef, useState } from "react";
import { requestActivityDetails } from "../lib/activityDetailsRequest";

export default function useMonthZoneDetails({ monthStart, endpoint, enabled, onlyIfMissing, onActivityUpdated }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(enabled);
  const [error, setError] = useState("");
  const pending = useRef(null);

  async function load(ids = []) {
    if (!enabled || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const { signal } = controller;
    setBusy(true);
    setError("");
    try {
      for (const id of ids.slice(0, 3)) {
        try {
          const result = await requestActivityDetails(id, { method: "POST", onlyIfMissing, signal });
          if (!signal.aborted && result.activity) onActivityUpdated?.(result.activity, result.weekly_volume);
        } catch {
          if (signal.aborted) return;
          setError("Часть деталей загрузить не удалось.");
          break;
        }
      }
      const query = new URLSearchParams({ month_start: monthStart });
      const response = await fetch(`/api/dashboard/${endpoint}?${query}`, { signal, cache: "no-store" });
      if (!response.ok) throw new Error();
      const next = await response.json();
      if (!signal.aborted) setData(next);
    } catch {
      if (!signal.aborted) setError("Не удалось загрузить зоны за месяц.");
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!signal.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    if (enabled) void load();
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [monthStart, endpoint, enabled]);

  return { data, busy, error, load };
}
