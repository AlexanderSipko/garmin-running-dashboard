import { useEffect, useRef, useState } from "react";
import { ChevronUp, Footprints, KeyRound, LogIn, LogOut, Settings2, UserPlus, X } from "lucide-react";

export async function accountRequest(path, options = {}) {
  const response = await fetch(`/api/account${path}`, {
    ...options,
    headers: { "Content-Type": "application/json" },
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(typeof result.detail === "string" ? result.detail : "Проверь введённые данные.");
  }
  return result;
}

const field = "min-w-0 rounded-md border border-slate-600 bg-slate-950 px-3 py-2";
const button = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-sm font-medium hover:bg-slate-800 disabled:opacity-50";
const primary = "border-[#806044] bg-[#3a3025] text-[#f3bc7f] hover:bg-[#4a3929]";

function KeySetting({ provider, label, configured, onChange }) {
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  async function action(mode) {
    setBusy(true);
    setFeedback("");
    try {
      const path = `/keys/${provider}`;
      if (mode === "check") {
        await accountRequest(`${path}/check`, { method: "POST" });
        setFeedback("Ключ принят провайдером.");
      } else {
        const result = await accountRequest(path, {
          method: "PUT",
          body: JSON.stringify({ value: mode === "save" ? value : null }),
        });
        setValue("");
        onChange(result.configured);
        setFeedback(result.configured ? "Ключ сохранён." : "Ключ удалён.");
      }
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-3 rounded-2xl border border-slate-700 bg-[#1b262c] p-4" onSubmit={(event) => { event.preventDefault(); void action("save"); }}>
      <label className="grid gap-2 text-sm font-medium">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2"><KeyRound size={15} aria-hidden="true" />{label}</span>
          <span className={configured ? "text-emerald-300" : "text-slate-400"}>
            {configured ? "Сохранён" : "Не добавлен"}
          </span>
        </span>
        <input className={`${field} h-11 rounded-xl focus:border-[#eab16a] focus:outline-none`}
          placeholder={configured ? "Вставь новый ключ для замены" : "Вставь ключ"}
          type="password" autoComplete="off" maxLength={4096}
          value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className={`${button} ${primary}`} disabled={busy || !value.trim()}>Сохранить</button>
        <button className={button} type="button" disabled={busy || !configured} onClick={() => action("check")}>Проверить</button>
        <button className={`${button} text-rose-300`} type="button" disabled={busy || !configured} onClick={() => action("remove")}>Удалить</button>
      </div>
      {feedback && <p role="status">{feedback}</p>}
    </form>
  );
}

export default function AccountPanel({ account, onChange }) {
  const [mode, setMode] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const dialog = useRef(null);
  const authOpen = !account && (mode === "login" || mode === "register");
  const registering = mode === "register";

  useEffect(() => {
    const element = dialog.current;
    if (authOpen && !element.open) element.showModal();
    if (!authOpen && element.open) element.close();
  }, [authOpen]);

  function open(next) {
    setError("");
    setMode(next);
  }

  async function submit(event) {
    event?.preventDefault();
    const values = event ? Object.fromEntries(new FormData(event.currentTarget)) : null;
    setBusy(true);
    setError("");
    try {
      if (values) {
        const user = await accountRequest(`/${mode}`, { method: "POST", body: JSON.stringify(values) });
        onChange(user);
        onChange(await accountRequest(""));
        setMode("settings");
      } else {
        await accountRequest("/logout", { method: "POST" });
        onChange(null);
        setMode(null);
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="border-b border-slate-700 bg-[#141b20] px-3 py-2 text-slate-100">
      <nav className="flex flex-wrap items-center gap-2" aria-label="Аккаунт">
        <span className="mr-auto min-w-0 truncate text-sm text-slate-300">{account?.email || "Демо · вымышленные данные"}</span>
        {account ? <>
          <button className={button} onClick={() => open(mode === "settings" ? null : "settings")} aria-expanded={mode === "settings"}><Settings2 size={15} />Настройки</button>
          <button className={button} disabled={busy} onClick={() => submit()}><LogOut size={15} />Выйти</button>
        </> : <>
          <button className={button} onClick={() => open("login")}><LogIn size={15} />Войти</button>
          <button className={`${button} ${primary}`} onClick={() => open("register")}><UserPlus size={15} />Регистрация</button>
        </>}
      </nav>
      <dialog ref={dialog} aria-labelledby="auth-title"
        onCancel={(event) => { event.preventDefault(); if (!busy) open(null); }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[420px] overflow-y-auto rounded-3xl border border-[#415157] bg-[#1b262c] p-0 text-slate-100 shadow-2xl backdrop:bg-[#091014]/80 backdrop:backdrop-blur-sm">
        {authOpen && <div className="relative bg-[radial-gradient(ellipse_at_top_left,#72533148,transparent_62%)] p-6 sm:p-8">
          <button type="button" aria-label="Закрыть" disabled={busy} onClick={() => open(null)}
            className="absolute right-4 top-4 rounded-full p-2 text-slate-300 hover:bg-white/10">
            <X size={20} />
          </button>
          <div className="mb-4 grid size-11 place-items-center rounded-2xl border border-[#a6794d] bg-[#3a3025] text-[#f3bc7f]">
            <Footprints size={22} aria-hidden="true" />
          </div>
          <h2 id="auth-title" className="mb-2 text-2xl font-bold">
            {registering ? "Создать аккаунт" : "Вход в дашборд"}
          </h2>
          <p className="mb-6 text-sm text-slate-300">
            {registering ? "Сохраняй свои тренировки и показатели Garmin в личном кабинете." : "Твои тренировки и показатели Garmin в одном месте."}
          </p>
          <form key={mode} className="grid gap-4" onSubmit={submit}>
            <label className="grid gap-1.5 text-sm font-medium">
              Email
              <input className={`${field} h-12 text-base focus:border-[#eab16a] focus:outline-none`}
                name="email" type="email" autoComplete="email" placeholder="name@example.com" required />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Пароль
              <input className={`${field} h-12 text-base focus:border-[#eab16a] focus:outline-none`}
                name="password" type="password" minLength={10} maxLength={128}
                autoComplete={registering ? "new-password" : "current-password"} required />
              {registering && <span className="font-normal text-slate-400">Минимум 10 символов</span>}
            </label>
            {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
            <button disabled={busy} className="h-12 rounded-xl bg-[#eab16a] font-bold text-[#18130f] hover:bg-[#f4c38c] disabled:opacity-60">
              {busy ? "Подожди…" : registering ? "Создать аккаунт" : "Войти"}
            </button>
          </form>
          <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
            <button type="button" disabled={busy} className="font-semibold text-[#f3bc7f] hover:underline"
              onClick={() => open(registering ? "login" : "register")}>
              {registering ? "Уже есть аккаунт" : "Зарегистрироваться"}
            </button>
            <button type="button" disabled={busy} className="text-slate-300 hover:underline" onClick={() => open(null)}>
              Остаться в демо
            </button>
          </div>
        </div>}
      </dialog>
      {account && mode === "settings" && <section className="mt-3 grid max-w-lg gap-4" aria-label="Настройки ключей">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Ключи подключения</h2>
          <button className={button} onClick={() => open(null)}><ChevronUp size={15} />Свернуть</button>
        </div>
        <KeySetting provider="garmin" label="Garmin Personal API key" configured={account.garmin}
          onChange={(garmin) => onChange({ ...account, garmin })} />
        <KeySetting provider="ai" label="GigaChat Authorization Key (необязательно)" configured={account.ai}
          onChange={(ai) => onChange({ ...account, ai })} />
      </section>}
      {error && !authOpen && <p className="mt-2 text-rose-300" role="alert">{error}</p>}
    </header>
  );
}
