import { useEffect, useState } from "react";

const km = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function ReviewForm({ run, plan, single }) {
  const [ready, setReady] = useState(false);
  const [effort, setEffort] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const url = `/api/coach/review/${run.id}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const { review } = await response.json();
      if (controller.signal.aborted) return;
      setEffort(review?.effort || "");
      setNote(review?.note || "");
      setReady(true);
    }).catch(() => { if (!controller.signal.aborted) setMessage("Не удалось загрузить отзыв."); });
    return () => controller.abort();
  }, [url]);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effort, note }) });
      setMessage(response.ok ? "Отзыв сохранён." : "Не удалось сохранить отзыв.");
    } catch {
      setMessage("Не удалось связаться с сервером.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={save} className="mt-2 grid gap-2 rounded-lg bg-[#202e35] p-3 text-sm">
    <b>{run.name || "Пробежка"} · Garmin {km.format(run.distance_meters / 1000)} км
      {single && plan?.distance_km > 0 && ` · план ${km.format(plan.distance_km)} км`}</b>
    {plan?.instruction && <p className="whitespace-pre-wrap text-slate-300">Задание на день · {plan.instruction}</p>}
    <label>Как далась пробежка?
      <select className="ml-2 rounded bg-[#172229] p-1" value={effort} disabled={!ready || busy} onChange={(e) => setEffort(e.target.value)}>
        <option value="">Выбрать</option><option value="easy">Легко</option><option value="normal">Как ожидал</option><option value="hard">Тяжело</option>
      </select>
    </label>
    <label className="grid gap-1">Что получилось или пришлось изменить?
      <textarea maxLength={280} rows={2} className="rounded bg-[#172229] p-2" value={note} disabled={!ready || busy} onChange={(e) => setNote(e.target.value)} />
    </label>
    <button disabled={!ready || !effort || busy} className="w-fit rounded border border-slate-600 px-3 py-1 disabled:opacity-50">Сохранить отзыв</button>
    {message && <span role="status">{message}</span>}
  </form>;
}

export default function WorkoutReview({ runs, plan }) {
  const [open, setOpen] = useState(false);
  return <section className="my-2">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="rounded border border-slate-600 px-3 py-2 text-sm">
      {open ? "Свернуть разбор" : "Разобрать тренировку"}
    </button>
    {open && runs.map((run) => <ReviewForm key={run.id} run={run} plan={plan} single={runs.length === 1} />)}
  </section>;
}
