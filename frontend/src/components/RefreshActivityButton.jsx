import { useState } from "react";
import { RefreshCw } from "lucide-react";

export default function RefreshActivityButton({ activityId, strength, onActivityUpdated }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  if (!/^[1-9][0-9]*$/.test(String(activityId))) return null;

  async function refresh() {
    setBusy(true);
    setFeedback(null);
    try {
      const endpoint = strength ? "strength-refresh" : "detail";
      const response = await fetch(`/api/activities/${activityId}/${endpoint}`, { method: "POST" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.activity) {
        throw new Error(typeof result?.detail === "string" ? result.detail : "Не удалось обновить тренировку из Garmin.");
      }
      onActivityUpdated(result.activity);
      setFeedback({ text: "Данные Garmin обновлены." });
    } catch (failure) {
      setFeedback({ text: failure.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={refresh}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#46545b] px-2.5 text-xs font-semibold hover:bg-[#26363d] disabled:opacity-60">
        <RefreshCw size={14} className={busy ? "animate-spin" : undefined} aria-hidden="true" />
        {busy ? "Обновляю…" : "Обновить детали"}
      </button>
      {feedback && <span role={feedback.error ? "alert" : "status"}
        className={feedback.error ? "text-xs text-rose-300" : "text-xs text-emerald-300"}>{feedback.text}</span>}
    </div>
  );
}
