import { useEffect, useState } from "react";

const button = "rounded-lg border border-slate-600 px-3 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50";

export default function RecoveryUsers({ request }) {
  const [page, setPage] = useState(null);
  const [after, setAfter] = useState("");
  const [retry, setRetry] = useState(0);
  const [link, setLink] = useState(null);
  const [busyEmail, setBusyEmail] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    request(`/users?${new URLSearchParams({ after })}`, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setPage(value); })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [request, after, retry]);

  async function createLink(email) {
    setError("");
    setCopied(false);
    setLink(null);
    setBusyEmail(email);
    try {
      const result = await request("/users/reset-link", { method: "POST", body: JSON.stringify({ email }) });
      setLink({ email, value: result.link });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusyEmail("");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link.value);
      setCopied(true);
    } catch {
      setError("Скопируй ссылку из поля вручную.");
    }
  }

  return (
    <section className="grid gap-3 rounded-2xl border border-slate-700 bg-[#1b262c] p-4">
      <h3 className="font-semibold">Пользователи</h3>
      {!page && !error && <p role="status" className="text-sm text-slate-300">Загружаю список…</p>}
      {page?.emails.length === 0 && <p className="text-sm text-slate-300">На этой странице других пользователей нет.</p>}
      {page && (
        <ul className="grid gap-2">
          {page.emails.map((email) => (
            <li key={email} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-2">
              <span className="break-all text-sm">{email}</span>
              <button className={button} type="button" disabled={Boolean(busyEmail)} onClick={() => createLink(email)}>
                {busyEmail === email ? "Создаю…" : "Создать ссылку сброса"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {(after || page?.next_after) && (
        <div className="flex flex-wrap gap-2">
          {after && <button className={button} type="button" disabled={Boolean(busyEmail)} onClick={() => { setPage(null); setError(""); setAfter(""); }}>В начало</button>}
          {page?.next_after && <button className={button} type="button" disabled={Boolean(busyEmail)} onClick={() => { setAfter(page.next_after); setPage(null); setError(""); }}>Дальше</button>}
        </div>
      )}
      {link && (
        <div className="grid gap-2">
          <label className="grid min-w-0 gap-1 text-sm">
            Ссылка для {link.email} · действует 30 минут
            <input readOnly className="min-w-0 rounded border border-slate-600 bg-slate-950 p-2" value={link.value}
              onFocus={(event) => event.target.select()} />
          </label>
          <button className={button + " w-fit"} type="button" onClick={copyLink}>Скопировать ссылку</button>
          {copied && <p role="status" className="text-sm text-emerald-300">Ссылка скопирована.</p>}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {error && !page && <button className={button} type="button" onClick={() => { setError(""); setRetry((value) => value + 1); }}>Повторить загрузку</button>}
    </section>
  );
}
