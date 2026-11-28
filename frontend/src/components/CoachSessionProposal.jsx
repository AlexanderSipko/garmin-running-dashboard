import { useState } from "react";
import { localDateKey } from "../lib/wellnessDates";
import { requestWeek, sessionLabels } from "./PlannedSessionEditor";

const formatDate = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long", day: "numeric", month: "long",
});

export default function CoachSessionProposal({ proposal, onSave, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await requestWeek(proposal.plan_id ? "/distance" : "/calendar-session", {
        method: proposal.plan_id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...proposal, day: localDateKey(new Date()) }),
      });
      onSave(result);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-2 rounded-xl border border-[#52658b] bg-[#202b37] p-3 text-sm">
      <h3 className="font-bold text-[#c2cfff]">Предложение консультанта</h3>
      <p>{formatDate.format(new Date(`${proposal.session_date}T12:00:00`))} · {sessionLabels[proposal.kind]} · {proposal.distance_km} км</p>
      {proposal.instruction && <p className="whitespace-pre-wrap break-words">{proposal.instruction}</p>}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-[#eab16a] px-3 py-2 font-semibold text-[#17120e] disabled:opacity-50">
          {busy ? "Сохраняю…" : "Сохранить в плане"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-slate-600 px-3 py-2">Отмена</button>
      </div>
    </section>
  );
}
