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
  const [chat, setChat] = useState(null);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const focusDate = localDateKey(new Date(focusDay));
  const todayChat = chat?.day === focusDate ? chat : null;
  const messages = todayChat?.messages ?? [];
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
    if (!active || chat?.day === focusDate) return;
    const controller = new AbortController();
    setHistoryLoading(true);
    const query = new URLSearchParams({ day: focusDate });
    fetch(`/api/coach/chat?${query}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить сегодняшнюю переписку.");
        return response.json();
      })
      .then((result) => {
        if (!controller.signal.aborted) {
          setChat({ day: focusDate, messages: result.messages, hasHistory: result.has_history });
        }
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message);
      })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [active, focusDate, chat?.day]);

  const refresh = () => {
    setError("");
    return refreshSummary();
  };

  const ask = async (question) => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || sending || historyLoading) return;

    const userMessage = { role: "user", content: cleanQuestion, usage: null };
    setPendingQuestion({ day: focusDate, message: userMessage });
    setSending(true);
    setError("");

    try {
      const result = await postJson("/api/coach/chat", {
        ...requestPeriod,
        today: focusDate,
        question: cleanQuestion,
        summary: summary ? summary.slice(0, 1200) : null,
      });
      setChat((current) => {
        if (current && current.day > focusDate) return current;
        const previous = current?.day === focusDate ? current : { day: focusDate, messages: [], hasHistory: true };
        return {
          ...previous,
          messages: [...previous.messages, userMessage,
            { role: "assistant", content: result.answer, usage: result.usage }],
        };
      });
      return result;
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPendingQuestion(null);
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
    messages: pendingQuestion?.day === focusDate ? [...messages, pendingQuestion.message] : messages,
    hasHistory: todayChat?.hasHistory,
    loadingSummary,
    sending,
    historyLoading: !todayChat && historyLoading,
    error: error || summaryError,
    totalTokens,
    ask,
    refreshSummary: refresh,
  };
}

export default useRunningCoach;
