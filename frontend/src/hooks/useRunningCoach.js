import { useEffect, useMemo, useRef, useState } from "react";

function toDateString(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildRequestPeriod(period, start, end) {
  let previousStart;
  let previousEnd;

  if (period === "year") {
    previousStart = new Date(start.getFullYear() - 1, 0, 1);
    previousEnd = new Date(start.getFullYear() - 1, 11, 31);
  } else if (period === "month") {
    previousStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    previousEnd = new Date(start.getFullYear(), start.getMonth(), 0);
  } else if (period === "day") {
    previousStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
    previousEnd = previousStart;
  } else {
    previousEnd = new Date(start);
    previousEnd.setDate(previousEnd.getDate() - 1);
    previousStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7);
  }

  return {
    start_date: toDateString(start),
    end_date: toDateString(end),
    previous_start_date: toDateString(previousStart),
    previous_end_date: toDateString(previousEnd),
  };
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.detail || "Не удалось получить ответ агента.");
    error.status = response.status;
    throw error;
  }
  return result;
}

function requestSummary(key, payload, cache, { retry = false } = {}) {
  const { summaryCache, summaryInFlight, summaryErrors } = cache;
  if (summaryCache.has(key)) return Promise.resolve(summaryCache.get(key));
  if (summaryInFlight.has(key)) return summaryInFlight.get(key);
  if (!retry && summaryErrors.has(key)) return Promise.reject(summaryErrors.get(key));
  const request = postJson("/api/coach/summary", payload)
    .then((result) => {
      summaryCache.set(key, result);
      summaryErrors.delete(key);
      return result;
    })
    .catch((error) => {
      summaryErrors.set(key, error);
      throw error;
    })
    .finally(() => summaryInFlight.delete(key));
  summaryInFlight.set(key, request);
  return request;
}

function useRunningCoach({
  period,
  periodStart,
  periodEnd,
  syncedAt,
  focusDay,
  trainingWeekId,
  active = true,
}) {
  const cache = useRef({ summaryCache: new Map(), summaryInFlight: new Map(), summaryErrors: new Map() }).current;
  const { summaryCache, summaryErrors } = cache;
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState("");
  const [summaryUsage, setSummaryUsage] = useState(null);
  const [messages, setMessages] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const focusDate = toDateString(focusDay);
  const requestPeriod = useMemo(
    () => ({ ...buildRequestPeriod(period, periodStart, periodEnd), daily: true, focus_date: focusDate }),
    [period, periodStart, periodEnd, focusDate]
  );
  const cacheKey = `${focusDate}:${period}:${requestPeriod.start_date}:${requestPeriod.end_date}:${syncedAt || "unsynced"}:${trainingWeekId || "no-week"}`;


  useEffect(() => {
    fetch("/api/coach/status")
      .then((response) => response.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false, unavailable: true }));
  }, []);

  useEffect(() => {
    setError("");
    setSummary(summaryCache.get(cacheKey)?.answer || "");
    setSummaryUsage(summaryCache.get(cacheKey)?.usage || null);
  }, [cacheKey]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setHistoryLoading(true);
    fetch("/api/coach/chat", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (!controller.signal.aborted && Array.isArray(result?.messages)) setMessages(result.messages);
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [active]);

  useEffect(() => {
    if (!active || !status?.configured) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      day: focusDate,
      start_date: requestPeriod.start_date,
      end_date: requestPeriod.end_date,
    });
    fetch(`/api/coach/daily?${query}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((saved) => {
        if (saved && !controller.signal.aborted) {
          setSummary((current) => current || saved.answer);
          setSummaryUsage((current) => current || saved.usage);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [active, focusDate, requestPeriod.start_date, requestPeriod.end_date, status?.configured, syncedAt, trainingWeekId]);

  const refreshSummary = async () => {
    summaryCache.delete(cacheKey);
    summaryErrors.delete(cacheKey);
    setLoadingSummary(true);
    setError("");
    try {
      const result = await requestSummary(cacheKey, requestPeriod, cache, { retry: true });
      setSummary(result.answer);
      setSummaryUsage(result.usage);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingSummary(false);
    }
  };

  const ask = async (question) => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || sending || historyLoading) return;

    setMessages((current) => [
      ...current,
      { role: "user", content: cleanQuestion, usage: null },
    ]);
    setSending(true);
    setError("");

    try {
      const result = await postJson("/api/coach/chat", {
        ...requestPeriod,
        today: toDateString(new Date()),
        question: cleanQuestion,
        summary: summary ? summary.slice(0, 1200) : null,
      });
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.answer, usage: result.usage },
      ]);
      return result;
    } catch (requestError) {
      setMessages((current) => current.slice(0, -1));
      setError(requestError.message);
    } finally {
      setSending(false);
    }
  };

  const totalTokens =
    (summaryUsage?.total_tokens || 0) +
    messages.reduce(
      (sum, message) => sum + (message.usage?.total_tokens || 0),
      0
    );

  return {
    enabled: status?.enabled !== false,
    configured: Boolean(status?.configured),
    unavailable: Boolean(status?.unavailable),
    statusChecked: status !== null,
    model: status?.model || "",
    provider: status?.provider || "",
    summary,
    summaryUsage,
    messages,
    loadingSummary,
    sending,
    historyLoading,
    error,
    totalTokens,
    ask,
    refreshSummary,
  };
}

export default useRunningCoach;
