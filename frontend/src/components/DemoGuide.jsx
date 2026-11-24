import { ArrowLeft, ArrowUpRight, Footprints, KeyRound, ShieldCheck } from "lucide-react";

import { PageLink } from "../app/DashboardRouter";
import { dashboardPath, guidePath } from "../lib/dashboardRoutes";

const garminKeys = "https://connect.garmin.com/app/settings/personalApiToken";
const gigachatGuide = "https://developers.sber.ru/docs/ru/gigachat/quickstart/ind-using-api";
const gigachatStudio = "https://developers.sber.ru/studio/";

const panel = "rounded-2xl border border-[#35454e] bg-[#1b262c] p-5 sm:p-6";
const link = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#806044] bg-[#3a3025] px-3 py-2 text-sm font-semibold text-[#f3bc7f] hover:bg-[#493827] focus-visible:outline focus-visible:outline-[#f3bc7f]";

function ProviderLink({ href, children }) {
  return (
    <a className={link} href={href} target="_blank" rel="noreferrer">
      {children}<ArrowUpRight size={15} aria-hidden="true" />
    </a>
  );
}

export function DemoIntro() {
  return (
    <section className="border-b border-[#35454e] bg-[#19242a] text-[#e3eaed]" aria-labelledby="demo-title">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <div className="max-w-xl">
          <p className="flex items-center gap-2 text-xs font-semibold text-[#f3bc7f]"><Footprints size={16} aria-hidden="true" /> Демо на вымышленных данных</p>
          <h1 id="demo-title" className="mt-2 text-xl font-bold sm:text-2xl">Бег и прогресс в одном месте</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
            Сравнивай объём, темп и пульс, открывай детали тренировок и следи за восстановлением.
            Подключи свой Garmin, чтобы увидеть личную статистику.
          </p>
        </div>
        <PageLink className={link} to={guidePath}><KeyRound size={16} aria-hidden="true" /> Как подключить Garmin и ИИ</PageLink>
      </div>
    </section>
  );
}

export function ConnectionGuide() {
  return (
    <main className="min-h-screen bg-[#141b20] text-[#e3eaed]" aria-labelledby="connection-title">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <PageLink className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#f3bc7f] hover:underline" to={dashboardPath}>
          <ArrowLeft size={17} aria-hidden="true" /> К дашборду
        </PageLink>
        <h1 id="connection-title" className="mt-3 text-2xl font-bold sm:text-3xl">Подключение аккаунта</h1>
        <p className="mt-2 text-sm text-slate-300">Создай аккаунт в дашборде. После входа открой «Настройки».</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className={panel} aria-labelledby="garmin-connect-title">
            <h2 id="garmin-connect-title" className="text-lg font-bold">1. Garmin Connect</h2>
            <ol className="my-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
              <li>Войди в Garmin Connect и открой страницу Personal API Key.</li>
              <li>Выбери <b>Create Key</b>, прими условия и укажи срок действия. Скопируй ключ при создании: Garmin показывает его один раз.</li>
              <li>В настройках дашборда вставь ключ в поле Garmin, нажми «Сохранить» и «Проверить». Затем нажми «Обновить Garmin».</li>
            </ol>
            <ProviderLink href={garminKeys}>Получить ключ Garmin</ProviderLink>
          </section>

          <section className={panel} aria-labelledby="gigachat-connect-title">
            <h2 id="gigachat-connect-title" className="text-lg font-bold">2. GigaChat <span className="text-sm font-normal text-slate-400">по желанию</span></h2>
            <ol className="my-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
              <li>Войди в Studio, создай проект GigaChat API и проверь доступную пробную квоту в кабинете.</li>
              <li>В проекте открой «Настройки API» → «Получить ключ» и скопируй <b>Authorization Key</b>.</li>
              <li>В настройках дашборда вставь ключ в поле GigaChat, сохрани и проверь его. Откроется «Консультация и анализ».</li>
            </ol>
            <div className="flex flex-wrap items-center gap-3">
              <ProviderLink href={gigachatStudio}>Открыть Studio</ProviderLink>
              <a href={gigachatGuide} target="_blank" rel="noreferrer" className="text-sm text-[#f3bc7f] underline underline-offset-4">Инструкция Сбера</a>
            </div>
          </section>
        </div>

        <section className={`mt-4 ${panel}`} aria-labelledby="connection-privacy-title">
          <h2 id="connection-privacy-title" className="flex items-center gap-2 text-base font-bold">
            <ShieldCheck size={19} className="text-[#96cca9]" aria-hidden="true" /> Как используются ключи и данные
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
            <li>Ключи Garmin и GigaChat хранятся на сервере в зашифрованном виде. История тренировок и метрики доступны в твоём аккаунте после входа.</li>
            <li>Ключ GigaChat используется для проверки подключения и запросов консультанта в твоём аккаунте. Когда ты просишь сводку или задаёшь вопрос, сервер передаёт в GigaChat вопрос и сводку нужных показателей.</li>
            <li>Ключи можно удалить в настройках аккаунта. Демо открывается без ключей.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
