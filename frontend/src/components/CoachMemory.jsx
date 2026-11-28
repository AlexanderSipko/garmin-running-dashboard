import { useState } from "react";

const button = "rounded-lg border border-[#526167] px-3 py-2 text-xs font-semibold disabled:opacity-50";

async function requestMemory(update) {
  const response = await fetch("/api/coach/memory", update ? {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown: update.markdown, revision: update.revision, limit_chars: update.limit_chars }),
  } : undefined);
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Не удалось обновить память.");
  return result;
}

export default function CoachMemorySettings() {
  const [memory, setMemory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const used = Array.from(memory?.markdown.trim() ?? "").length;
  const overLimit = memory && used > memory.limit_chars;

  async function loadOrSave(update) {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      setMemory(await requestMemory(update));
      setSaved(Boolean(update));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-2 rounded-xl border border-[#415157] p-3">
      <button type="button" disabled={busy} aria-expanded={Boolean(memory)}
        onClick={() => { if (memory) setMemory(null); else void loadOrSave(); }}
        className="text-left text-sm font-semibold text-slate-300">
        Память консультанта
      </button>
      {memory && <>
        <textarea aria-label="Память консультанта в Markdown" rows={7} disabled={busy}
          placeholder="Предпочтения, правила общения и уроки из ошибок"
          className="w-full resize-y rounded-lg border border-[#526167] bg-[#172229] p-2 text-sm"
          value={memory.markdown} onChange={(event) => {
            setMemory({ ...memory, markdown: event.target.value });
            setSaved(false);
          }} />
        <label className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          Лимит памяти
          <select className="rounded-md border border-[#526167] bg-[#172229] px-2 py-1" disabled={busy}
            value={memory.limit_chars} onChange={(event) => {
              setMemory({ ...memory, limit_chars: Number(event.target.value) });
              setSaved(false);
            }}>
            {memory.limit_options.map((limit) => (
              <option key={limit} value={limit}>{limit.toLocaleString("ru-RU")} символов</option>
            ))}
          </select>
        </label>
        <p className={`text-xs ${overLimit ? "text-rose-300" : "text-slate-400"}`}>
          {used.toLocaleString("ru-RU")} из {memory.limit_chars.toLocaleString("ru-RU")} символов.
          {overLimit ? " Сократи текст или выбери больший лимит."
            : " Больше записанного текста даёт больше контекста и может увеличить расход входных токенов."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy || overLimit} onClick={() => loadOrSave(memory)}>Сохранить</button>
          <button type="button" className={button} disabled={busy || !memory.markdown}
            onClick={() => loadOrSave({ ...memory, markdown: "" })}>Очистить</button>
        </div>
      </>}
      {saved && memory && <p role="status" className="text-xs text-emerald-300">Сохранено</p>}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </section>
  );
}

export function CoachMemoryProposal({ proposal, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await requestMemory(proposal);
      onClose(true);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-2 rounded-xl border border-[#52658b] bg-[#202b37] p-3 text-sm">
      <p>{proposal.note.replace(/^- \*\*([^*]+)\*\*/, "$1")}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${button} bg-[#eab16a] text-[#17120e]`}
          disabled={busy} onClick={save}>Запомнить</button>
        <button type="button" className={button} disabled={busy} onClick={() => onClose(false)}>Отмена</button>
      </div>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </section>
  );
}
