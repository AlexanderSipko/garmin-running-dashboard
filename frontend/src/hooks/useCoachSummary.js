import { useEffect, useRef, useState } from "react";
import postJson from "../lib/coachRequest";

export default function useCoachSummary(key, period, active) {
  const [entries, setEntries] = useState({});
  const pending = useRef(new Map());
  const { focus_date: day, start_date, end_date } = period;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ day, start_date, end_date });
    fetch(`/api/coach/daily?${query}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((saved) => {
        if (saved && !controller.signal.aborted) {
          setEntries((current) => current[key]?.result ? current : {
            ...current, [key]: { ...current[key], result: saved },
          });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [active, key, day, start_date, end_date]);

  function refreshSummary() {
    if (pending.current.has(key)) return pending.current.get(key);
    setEntries((current) => ({
      ...current, [key]: { ...current[key], loading: true, error: "" },
    }));
    const request = postJson("/api/coach/summary", period)
      .then((result) => {
        setEntries((current) => ({ ...current, [key]: { result } }));
      })
      .catch((error) => {
        setEntries((current) => ({
          ...current, [key]: { ...current[key], loading: false, error: error.message },
        }));
      })
      .finally(() => pending.current.delete(key));
    pending.current.set(key, request);
    return request;
  }

  const entry = entries[key];
  return {
    summary: entry?.result?.answer || "",
    loadingSummary: Boolean(entry?.loading),
    summaryError: entry?.error || "",
    refreshSummary,
  };
}
