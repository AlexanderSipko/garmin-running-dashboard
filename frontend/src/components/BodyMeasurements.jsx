import MeasurementForm from "./bodyMeasurements/MeasurementForm";
import MeasurementGuide from "./bodyMeasurements/MeasurementGuide";
import MeasurementJournal from "./bodyMeasurements/MeasurementJournal";
import useBodyMeasurements from "./bodyMeasurements/useBodyMeasurements";

export default function BodyMeasurements({ account, request }) {
  const { form, setForm, entries, loading, busy, error, notice, change, save, remove, reset } =
    useBodyMeasurements({ account, request });

  function edit(entry) {
    setForm(entry);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-5 px-3 py-5 sm:px-6">
      <h1 className="text-2xl font-bold">Замеры тела</h1>
      {!account && <p className="text-slate-300">Войди в аккаунт, чтобы вести личный журнал замеров.</p>}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_17rem]">
        <MeasurementForm form={form} disabled={!account || loading || busy} change={change} save={save} reset={reset} />
        <MeasurementGuide />
      </div>
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      {notice && <p role="status" className="text-emerald-300">{notice}</p>}
      {account && <MeasurementJournal entries={entries} loading={loading} error={error} busy={busy} edit={edit} remove={remove} />}
    </main>
  );
}
