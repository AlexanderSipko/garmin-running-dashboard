import { useEffect, useMemo, useState } from "react";
import postJson from "../lib/coachRequest";
import { localDateKey } from "../lib/wellnessDates";
import useCoachSummary from "./useCoachSummary";

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
    start_date: localDateKey(start),
    end_date: localDateKey(end),
    previous_start_date: localDateKey(previousStart),
    previous_end_date: localDateKey(previousEnd),
  };
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
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const focusDate = localDateKey(new Date(focusDay));
  const requestPeriod = useMemo(
    () => ({ ...buildRequestPeriod(period, periodStart, periodEnd), daily: true, focus_date: focusDate }),
    [period, periodStart, periodEnd, focusDate]
  );
  const cacheKey = `${focusDate}:${period}:${requestPeriod.start_date}:${requestPeriod.end_date}:${syncedAt || "unsynced"}:${trainingWeekId || "no-week"}`;

  const { summary, summaryUsage, loadingSummary, summaryError, refreshSummary } = useCoachSummary(
    cacheKey, requestPeriod, active && status?.configured
  );

  useEffect(() => {
    fetch("/api/coach/status")
      .then((response) => response.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false, unavailable: true }));
  }, []);

  useEffect(() => {
    setError("");
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

  const refresh = () => {
    setError("");
    return refreshSummary();
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
        today: localDateKey(new Date()),
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
    error: error || summaryError,
    totalTokens,
    ask,
    refreshSummary: refresh,
  };
}

export default useRunningCoach;
