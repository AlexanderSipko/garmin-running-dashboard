import { useEffect, useState } from "react";

export default function useWeatherForecast(accountId, request) {
  const [snapshot, setSnapshot] = useState(null);
  const weather = snapshot?.accountId === accountId ? snapshot.weather : null;
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();

    async function refresh() {
      try {
        const weather = await request("/weather", { signal: controller.signal });
        if (!controller.signal.aborted) setSnapshot({ accountId, weather });
      } catch {
        if (!controller.signal.aborted) {
          setSnapshot((previous) => previous?.accountId === accountId
            ? { accountId, weather: { ...previous.weather, unavailable: true } }
            : previous);
        }
      }
    }

    void refresh();
    const interval = setInterval(refresh, 30 * 60 * 1000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [accountId, request, revision]);

  function changeLocation(location) {
    setSnapshot({ accountId, weather: { location, days: {}, loading: Boolean(location) } });
    setRevision((value) => value + 1);
  }

  return { weather, changeLocation };
}
