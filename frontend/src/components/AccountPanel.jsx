import AdminDatabaseSize from "./AdminDatabaseSize";
import RecoveryUsers from "./RecoveryUsers";
import WeatherSettings from "./WeatherSettings";
import RunnerPlanForm from "./RunnerPlanForm";
import CoachMemorySettings from "./CoachMemory";
import { version as appVersion } from "../../package.json";
import { useEffect, useRef, useState } from "react";
import { Footprints, KeyRound, LogIn, LogOut, Settings2, UserPlus, X } from "lucide-react";

export async function accountRequest(path, options = {}) {
  const response = await fetch(`/api/account${path}`, {
    ...options,
    headers: { "Content-Type": "application/json" },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    const error = new Error(typeof result?.detail === "string" ? result.detail : "Сервер аккаунтов временно недоступен.");
    error.status = response.status;
    throw error;
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
      <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
        <button className={`${button} ${primary} min-h-9 min-w-0 max-sm:px-0.5 max-sm:text-[12px]`} disabled={busy || !value.trim()}>Сохранить</button>
        <button className={`${button} min-h-9 min-w-0 max-sm:px-0.5 max-sm:text-[12px]`} type="button" disabled={busy || !configured} onClick={() => action("check")}>Проверить</button>
        <button className={`${button} min-h-9 min-w-0 max-sm:px-0.5 max-sm:text-[12px] text-rose-300`} type="button" disabled={busy || !configured} onClick={() => action("remove")}>Удалить</button>
      </div>
      {feedback && <p role="status">{feedback}</p>}
    </form>
  );
}

function GigachatBalance() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function refresh() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await accountRequest("/keys/ai/balance"));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 px-1 text-xs text-slate-300">
      <button type="button" disabled={busy} onClick={refresh} className={`${button} w-fit`}>
        {busy ? "Проверяю остаток…" : "Проверить остаток токенов"}
      </button>
      {result?.balances.length > 0 && <ul className="grid gap-1">
        {result.balances.map(({ name, tokens }, index) => (
          <li key={`${name}-${index}`}>{name} · {tokens.toLocaleString("ru-RU")} токенов</li>
        ))}
      </ul>}
      {result?.balances.length === 0 && <p>GigaChat не вернул остаток пакета для этого ключа.</p>}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
    </div>
  );
}

function coachModelChoices(account) {
  const selected = account.coach_model_preset || account.coach_provider || "gigachat";
  const models = [
    ["gigachat", `Сбер · ${account.gigachat_model || "GigaChat"} (по умолчанию)`],
    ...Object.entries(account.gigachat_presets || {})
      .filter(([preset, model]) => preset === selected || model !== account.gigachat_model)
      .map(([preset, model]) => [preset, `Сбер · ${model}`]),
    ["openai", "OpenAI · GPT-6.2 Sol Medium"],
    ["openai-light", "OpenAI · GPT-6.2 Sol Light"],
    ["openai-luna", "OpenAI · GPT-6 Luna"],
    ["openai-astra", "OpenAI · GPT-6.2 Astra Medium"],
  ];
  return { selected, models };
}

export function selectedCoachModelLabel(account) {
  const { selected, models } = coachModelChoices(account);
  return models.find(([preset]) => preset === selected)?.[1] ?? "";
}

function CoachProviderSetting({ account, onChange, onPlanSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { selected, models } = coachModelChoices(account);

  async function select(event) {
    const provider = event.target.value;
    setBusy(true);
    setError("");
    try {
      const updated = await accountRequest("/coach-provider", { method: "PUT", body: JSON.stringify({ provider }) });
      onChange(updated);
      onPlanSaved();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function keyChanged(provider, configured) {
    onChange((previous) => ({
      ...previous, [provider]: configured,
      ai: (previous.coach_provider || "gigachat") === provider ? configured : previous.ai,
    }));
    onPlanSaved();
  }

  return (
    <>
      <label className="grid gap-1.5 rounded-2xl border border-slate-700 bg-[#1b262c] p-4 text-sm">
        Модель консультанта
        <select className={`${field} border-emerald-500/50`} value={selected} disabled={busy} onChange={select}>
          {models.map(([preset, label]) => (
            <option key={preset} value={preset}>{preset === selected ? `✓ ${label}` : label}</option>
          ))}
        </select>
      </label>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <KeySetting provider="ai" label="Ключ GigaChat" configured={account.gigachat ?? account.ai}
        onChange={(configured) => keyChanged("gigachat", configured)} />
      {(account.gigachat ?? account.ai) && <GigachatBalance />}
      <KeySetting provider="openai" label="Ключ OpenAI API" configured={account.openai}
        onChange={(configured) => keyChanged("openai", configured)} />
      {account.openai && <a href="https://platform.openai.com/usage" target="_blank" rel="noreferrer"
        className="w-fit px-1 text-xs text-[#ffc988] underline">Расход и бюджет в OpenAI</a>}
    </>
  );
}

export default function AccountPanel({ account, onChange, onPlanSaved, weatherLocation, onWeatherChange }) {
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("reset-password"));
  const [mode, setMode] = useState(() => resetToken ? "reset-password" : null);
  const [showUsers, setShowUsers] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const dialog = useRef(null);
  const settingsDialog = useRef(null);
  const settingsOpen = Boolean(account && mode === "settings");
  const registering = mode === "register";
  const requestingReset = mode === "forgot-password";
  const resetting = mode === "reset-password";
  const authOpen = resetting || requestingReset || (!account && (mode === "login" || registering));
  const title = requestingReset ? "Восстановление пароля" : resetting ? "Новый пароль"
    : registering ? "Создать аккаунт" : "Вход в дашборд";
  const description = requestingReset ? "Введи email своего аккаунта, чтобы получить ссылку."
    : resetting ? "Задай новый пароль для входа."
    : registering ? "Сохраняй свои тренировки и показатели Garmin в личном кабинете."
    : "Твои тренировки и показатели Garmin в одном месте.";

  useEffect(() => {
    if (new URLSearchParams(window.location.hash.slice(1)).has("reset-password")) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    const element = dialog.current;
    const settings = settingsDialog.current;
    if (!authOpen && element.open) element.close();
    if (!settingsOpen && settings.open) settings.close();
    if (authOpen && !element.open) element.showModal();
    if (settingsOpen && !settings.open) settings.showModal();
  }, [authOpen, settingsOpen]);

  function open(next) {
    setError("");
    setNotice("");
    if (next !== "reset-password") setResetToken(null);
    setMode(next);
    setShowUsers(false);
  }

  async function submit(event) {
    event?.preventDefault();
    const values = event ? Object.fromEntries(new FormData(event.currentTarget)) : null;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (values && (requestingReset || resetting)) {
        const body = requestingReset ? { email: values.email } : { password: values.password, token: resetToken };
        await accountRequest(`/${mode}`, { method: "POST", body: JSON.stringify(body) });
        if (requestingReset) {
          setNotice("Если аккаунт с таким email существует, на него придёт ссылка для восстановления.");
        } else {
          onChange(null);
          open("login");
          setNotice("Пароль обновлён. Войди с новым паролем.");
        }
        return;
      }
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
      <nav className="mx-auto flex max-w-[96rem] flex-wrap items-center justify-between gap-2 sm:px-2" aria-label="Аккаунт">
        <span className="min-w-0 flex-1 basis-36 truncate text-sm text-slate-300">{account?.email || "Демо · вымышленные данные"}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {account ? <>
          <button className={`${button} min-h-9`} onClick={() => open("settings")} aria-haspopup="dialog"><Settings2 size={15} />Настройки</button>
          <button className={button} disabled={busy} onClick={() => submit()}><LogOut size={15} />Выйти</button>
        </> : <>
          <button className={button} onClick={() => open("login")}><LogIn size={15} />Войти</button>
          <button className={`${button} ${primary}`} onClick={() => open("register")}><UserPlus size={15} />Регистрация</button>
        </>}
        </div>
      </nav>
      <dialog ref={dialog} aria-labelledby="auth-title"
        onCancel={(event) => { event.preventDefault(); if (!busy) open(null); }}
        className="m-auto [--dialog-vertical-gap:2rem] max-h-[calc(100dvh-var(--dialog-vertical-gap))] w-[calc(100%-2rem)] max-w-[420px] overflow-y-auto rounded-3xl border border-[#415157] bg-[#1b262c] p-0 text-slate-100 shadow-2xl backdrop:bg-[#091014]/80 backdrop:backdrop-blur-sm">
        {authOpen && <div className="relative bg-[radial-gradient(ellipse_at_top_left,#72533148,transparent_62%)] p-6 sm:p-8">
          <button type="button" aria-label="Закрыть" disabled={busy} onClick={() => open(null)}
            className="absolute right-4 top-4 rounded-full p-2 text-slate-300 hover:bg-white/10">
            <X size={20} />
          </button>
          <div className="mb-4 grid size-11 place-items-center rounded-2xl border border-[#a6794d] bg-[#3a3025] text-[#f3bc7f]">
            <Footprints size={22} aria-hidden="true" />
          </div>
          <h2 id="auth-title" className="mb-2 text-2xl font-bold">
            {title}
          </h2>
          <p className="mb-6 text-sm text-slate-300">
            {description}
          </p>
          <form key={mode} className="grid gap-4" onSubmit={submit}>
            {!resetting && <label className="grid gap-1.5 text-sm font-medium">
              Email
              <input className={`${field} h-12 text-base focus:border-[#eab16a] focus:outline-none`}
                name="email" type="email" autoComplete="email" placeholder="name@example.com"
                defaultValue={requestingReset ? account?.email : undefined} required />
            </label>}
            {!requestingReset && <label className="grid gap-1.5 text-sm font-medium">
              {resetting ? "Новый пароль" : "Пароль"}
              <input className={`${field} h-12 text-base focus:border-[#eab16a] focus:outline-none`}
                name="password" type="password" minLength={10} maxLength={128}
                autoComplete={registering || resetting ? "new-password" : "current-password"} required />
              {(registering || resetting) && <span className="font-normal text-slate-400">Минимум 10 символов</span>}
            </label>}
            {notice && <p className="text-sm text-emerald-300" role="status">{notice}</p>}
            {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
            <button disabled={busy} className="h-12 rounded-xl bg-[#eab16a] font-bold text-[#18130f] hover:bg-[#f4c38c] disabled:opacity-60">
              {busy ? "Подожди…" : requestingReset ? "Отправить ссылку" : resetting ? "Сохранить пароль" : registering ? "Создать аккаунт" : "Войти"}
            </button>
          </form>
          <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
            <button type="button" disabled={busy} className="font-semibold text-[#f3bc7f] hover:underline"
              onClick={() => open(account ? "settings" : mode === "login" ? "register" : "login")}>
              {account ? "Вернуться в настройки" : mode === "login" ? "Зарегистрироваться" : "Вернуться ко входу"}
            </button>
            {mode === "login" && <button type="button" disabled={busy} className="text-slate-300 hover:underline"
              onClick={() => open("forgot-password")}>Забыли пароль?</button>}
            {registering && <button type="button" disabled={busy} className="text-slate-300 hover:underline"
              onClick={() => open(null)}>Остаться в демо</button>}
          </div>
        </div>}
      </dialog>
      <dialog ref={settingsDialog} aria-labelledby="settings-title"
        onCancel={(event) => { event.preventDefault(); open(null); }}
        className="m-auto [--dialog-vertical-gap:1.5rem] max-h-[calc(100dvh-var(--dialog-vertical-gap))] w-[calc(100%-1.5rem)] max-w-[900px] overflow-y-auto overscroll-contain rounded-2xl border border-[#415157] bg-[#162128] p-0 text-slate-100 shadow-2xl backdrop:bg-[#091014]/80 backdrop:backdrop-blur-sm sm:rounded-3xl">
        {settingsOpen && (
          <>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#415157] bg-[#1d2a31] px-4 py-3 sm:px-6 sm:py-4">
              <div className="min-w-0">
                <h2 id="settings-title" className="flex items-center gap-2 text-lg font-bold">
                  <Settings2 size={18} aria-hidden="true" /> Настройки
                </h2>
                <p className="mt-0.5 truncate text-sm text-slate-400" title={account.email}>{account.email}</p>
              </div>
              <button type="button" aria-label="Закрыть настройки" onClick={() => open(null)}
                className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-300 hover:bg-white/10 focus-visible:outline-2">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="grid gap-4 p-3 sm:p-5">
              {account.recovery_admin === "verify" && (
                <div className="grid gap-2 rounded-xl border border-slate-700 p-3 text-sm text-slate-300">
                  <p>Чтобы открыть вкладку «Пользователи», один раз подтверди свою почту через смену пароля по ссылке.</p>
                  <button type="button" className={`${button} w-fit`} onClick={() => open("forgot-password")}>Подтвердить почту</button>
                </div>
              )}
              {account.recovery_admin === "active" && (
                <button type="button" className={`${button} w-fit`} aria-expanded={showUsers}
                  onClick={() => setShowUsers((value) => !value)}>
                  {showUsers ? "Вернуться в настройки" : "Пользователи"}
                </button>
              )}
              {account.recovery_admin === "active" && <AdminDatabaseSize request={accountRequest} />}
              {showUsers ? <RecoveryUsers request={accountRequest} /> : (
                <div className="grid items-start gap-4 md:grid-cols-2">
                  <section className="grid min-w-0 gap-3" aria-labelledby="connection-settings-title">
                    <h3 id="connection-settings-title" className="px-1 text-sm font-semibold text-slate-300">Подключения</h3>
                    <KeySetting provider="garmin" label="Garmin Personal API key" configured={account.garmin}
                      onChange={(garmin) => onChange((previous) => ({ ...previous, garmin }))} />
                    <CoachProviderSetting account={account} onChange={onChange} onPlanSaved={onPlanSaved} />
                  </section>
                  <section className="grid min-w-0 gap-3" aria-labelledby="personal-settings-title">
                    <h3 id="personal-settings-title" className="px-1 text-sm font-semibold text-slate-300">Предпочтения</h3>
                    <WeatherSettings key={account.id} location={weatherLocation} request={accountRequest} onChange={onWeatherChange} />
                    <RunnerPlanForm key={account.id} request={accountRequest} onSaved={onPlanSaved} />
                    <CoachMemorySettings key={`memory-${account.id}`} />
                  </section>
                  <details className="rounded-xl border border-[#415157] p-3 text-sm text-slate-300 md:col-span-2">
                    <summary className="cursor-pointer font-semibold">Как общаться с консультантом</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      <li>Предпочтение: «Запомни: по понедельникам и средам я бегаю в манеже».</li>
                      <li>Правило: «Запиши правило: в сводке сначала расскажи, что получилось, потом — что поправить».</li>
                      <li>Ошибка: «Запиши ошибку: день недели не совпал с датой. Перед предложением сверяй их».</li>
                      <li>Просмотр: «Покажи свой Markdown».</li>
                    </ul>
                    <p className="mt-2">Нажми «Запомнить» в карточке, чтобы сохранить заметку. Исправить или очистить записи можно в «Памяти консультанта» выше.</p>
                  </details>
                  <p className="px-1 text-xs text-slate-400 md:col-span-2">Версия {appVersion}</p>
                </div>
              )}
            </div>
          </>
        )}
      </dialog>
      {error && !authOpen && <p className="mt-2 text-rose-300" role="alert">{error}</p>}
    </header>
  );
}
