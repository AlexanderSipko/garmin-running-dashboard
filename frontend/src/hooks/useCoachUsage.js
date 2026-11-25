import { useEffect, useState } from "react";

export default function useCoachUsage(day, active, busy) {
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    if (!active || busy) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ day });
    fetch(`/api/coach/usage?${query}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((usage) => {
        if (usage && !controller.signal.aborted) setSnapshot({ day, usage });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [day, active, busy]);

  return snapshot?.day === day ? snapshot.usage : null;
}
