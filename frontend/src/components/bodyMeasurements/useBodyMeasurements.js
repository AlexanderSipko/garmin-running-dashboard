import { useEffect, useState } from "react";
import { localDateKey } from "../../lib/wellnessDates";
import { measurements } from "./measurements";

const empty = () => ({ day: localDateKey(new Date()), note: "" });

export default function useBodyMeasurements({ account, request }) {
  const [form, setForm] = useState(empty);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(Boolean(account));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!account) return;
    const controller = new AbortController();
    request("/measurements", { signal: controller.signal })
      .then(({ entries }) => setEntries(entries.map((entry) => ({ ...entry, glutes: entry.glutes ?? entry.hips }))))
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [account?.id, request]);

  function change(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function save(event) {
    event.preventDefault();
    const entry = { day: form.day, note: form.note.trim() };
    for (const [key] of measurements) entry[key] = form[key] ? Number(form[key]) : null;
    const previous = entries.find(({ day }) => day === entry.day);
    if (previous && !window.confirm("Заменить запись за этот день?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request("/measurements", { method: "PUT", body: JSON.stringify(entry) });
      setEntries((current) => [result.entry, ...current.filter(({ day }) => day !== entry.day)]
        .sort((a, b) => b.day.localeCompare(a.day)));
      setForm(empty());
      setNotice("Запись сохранена.");
      return true;
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(day) {
    if (!window.confirm("Удалить эту запись?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/measurements/${day}`, { method: "DELETE" });
      setEntries((current) => current.filter((entry) => entry.day !== day));
      if (form.day === day) setForm(empty());
      setNotice("Запись удалена.");
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return { form, setForm, entries, loading, busy, error, notice, change, save, remove, reset: () => setForm(empty()) };
}
