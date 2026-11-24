import { useEffect, useState } from "react";
import { Dumbbell, Pencil } from "lucide-react";
import { fmtDuration } from "../lib/format";

const field = "w-full min-w-0 rounded-lg border border-[#46545b] bg-[#172229] px-3 py-2 text-sm";
const button = "inline-flex min-h-9 w-fit items-center gap-1.5 rounded-lg border border-[#46545b] px-3 text-xs font-semibold hover:bg-[#26363d] disabled:opacity-50";

export default function StrengthActivity({ activity, onActivityUpdated }) {
  const originalTitle = activity.name || "Силовая тренировка";
  const [entry, setEntry] = useState(null);
  const [draft, setDraft] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const canEdit = /^[1-9][0-9]*$/.test(String(activity.id));
  const url = `/api/activities/${activity.id}/strength-note`;
  const duration = Number(activity.moving_duration_seconds || activity.duration_seconds || 0);

  useEffect(() => {
    if (!canEdit) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (controller.signal.aborted) return;
        setEntry(result.entry);
        setReady(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Не удалось загрузить заметку.");
      });
    return () => controller.abort();
  }, [canEdit, retryCount, url]);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.entry) {
        throw new Error(typeof result?.detail === "string" ? result.detail : "Не удалось сохранить тренировку.");
      }
      setEntry(result.entry);
      onActivityUpdated?.({ ...activity, strength_title: result.entry.title });
      setDraft(null);
      setNotice("Заметка сохранена.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function edit() {
    setNotice("");
    setDraft(entry || { title: originalTitle.slice(0, 100), note: "" });
  }

  return (
    <article className="grid gap-3 rounded-xl border border-[#415157] bg-[#1b272e] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs text-[#b7c4ff]">
            <Dumbbell size={15} aria-hidden="true" />
            Силовая{duration > 0 && ` · ${fmtDuration(duration)}`}
          </p>
          <h4 className="mt-1 break-words text-base font-semibold">{entry?.title || originalTitle}</h4>
        </div>
        {canEdit && !draft && (
          <button type="button" className={button} disabled={!ready} onClick={edit}>
            <Pencil size={14} aria-hidden="true" /> {entry ? "Редактировать" : "Добавить заметку"}
          </button>
        )}
      </div>
      {!draft && entry?.note && <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{entry.note}</p>}
      {draft && (
        <form className="grid gap-3" onSubmit={save}>
          <label className="grid gap-1 text-sm text-slate-300">
            Название тренировки
            <input className={field} required maxLength={100} disabled={busy} value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Грудь и трицепс" />
          </label>
          <label className="grid gap-1 text-sm text-slate-300">
            Что делал
            <textarea className={field} rows={4} maxLength={2000} disabled={busy} value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              placeholder="Жим лёжа 60 кг — 3×8. Разгибания на блоке 20 кг — 3×12." />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={button} disabled={busy || !draft.title.trim()}>{busy ? "Сохраняю…" : "Сохранить"}</button>
            <button type="button" className={button} disabled={busy} onClick={() => { setDraft(null); setError(""); }}>Отмена</button>
          </div>
        </form>
      )}
      {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {error && !ready && <button type="button" className={button} onClick={() => {
        setError("");
        setRetryCount((count) => count + 1);
      }}>Повторить загрузку</button>}
    </article>
  );
}
