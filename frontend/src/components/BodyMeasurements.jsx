import { useState } from "react";
import { Plus } from "lucide-react";
import MeasurementForm from "./bodyMeasurements/MeasurementForm";
import MeasurementJournal from "./bodyMeasurements/MeasurementJournal";
import useBodyMeasurements from "./bodyMeasurements/useBodyMeasurements";

export default function BodyMeasurements({ account, request }) {
  const [editor, setEditor] = useState(null);
  const { form, setForm, entries, loading, busy, error, notice, change, save, remove, reset } =
    useBodyMeasurements({ account, request });

  function openEditor(entry) {
    if (entry) setForm(entry);
    else reset();
    setEditor(entry ? "edit" : "new");
    window.scrollTo({ top: 0 });
  }

  async function saveAndClose(event) {
    if (await save(event)) setEditor(null);
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-4 px-3 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Замеры тела</h1>
        {account && !editor && (
          <button type="button" disabled={loading || busy} onClick={() => openEditor()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#ffc988] px-3 text-sm font-semibold text-[#261a10] hover:bg-[#ffd8aa] disabled:opacity-50">
            <Plus size={16} aria-hidden="true" /> Добавить
          </button>
        )}
      </header>
      {!account && <p className="text-slate-300">Войди в аккаунт, чтобы вести личный журнал замеров.</p>}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      {notice && !editor && <p role="status" className="text-emerald-300">{notice}</p>}
      {account && (editor ? (
        <MeasurementForm form={form} disabled={busy} change={change} save={saveAndClose}
          editing={editor === "edit"} cancel={() => setEditor(null)} />
      ) : (
        <MeasurementJournal entries={entries} loading={loading} error={error} busy={busy} edit={openEditor} remove={remove} />
      ))}
    </main>
  );
}
