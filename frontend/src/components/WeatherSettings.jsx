import { useState } from "react";
import { MapPin } from "lucide-react";

const button = "rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold disabled:opacity-50";

export default function WeatherSettings({ location, request, onChange }) {
  const [city, setCity] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const query = new URLSearchParams({ city: city.trim() });
      setResults(await request(`/weather/search?${query}`));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function select(id) {
    setBusy(true);
    setError("");
    try {
      const saved = await request("/weather/location", { method: "PUT", body: JSON.stringify({ id }) });
      onChange(saved);
      setResults(null);
      setCity("");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-2xl border border-slate-700 bg-[#1b262c] p-4" aria-labelledby="weather-settings">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="weather-settings" className="flex items-center gap-2 font-semibold"><MapPin size={17} /> Город для прогноза</h3>
        {location && <button type="button" className="text-xs text-slate-400" disabled={busy} onClick={() => select(null)}>Убрать город</button>}
      </div>
      <p className="text-sm text-slate-300">{location?.name || "Город ещё не выбран"}</p>
      <form className="flex gap-2" onSubmit={search}>
        <input value={city} onChange={(event) => setCity(event.target.value)} maxLength={100} disabled={busy}
          aria-label="Название города" placeholder="Например, Екатеринбург"
          className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm" />
        <button type="submit" className={button} disabled={busy || city.trim().length < 2}>Найти</button>
      </form>
      {results?.length === 0 && <p className="text-sm">Город не найден.</p>}
      {results?.map((result) => (
        <button className={`${button} text-left`} key={result.id} type="button" disabled={busy} onClick={() => select(result.id)}>
          {Array.from(new Set([result.name, result.admin1, result.country].filter(Boolean))).join(", ")}
        </button>
      ))}
      {busy && <p role="status" className="text-sm text-slate-400">Загрузка…</p>}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    </section>
  );
}
