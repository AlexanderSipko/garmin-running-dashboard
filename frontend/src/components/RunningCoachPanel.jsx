import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Maximize2, Minimize2, ScanLine, Send, Sparkles, X } from "lucide-react";
import useRunningCoach from "../hooks/useRunningCoach";

function Consultation({ daily, label, period, periodStart, periodEnd, syncedAt }) {
  const [question, setQuestion] = useState("");
  const coach = useRunningCoach({ period, periodStart, periodEnd, syncedAt, daily });
  const ready = coach.statusChecked && coach.configured && !coach.unavailable;
  const busy = coach.loadingSummary || coach.sending;

  function submit(event) {
    event.preventDefault();
    if (!question.trim() || busy) return;
    void coach.ask(question);
    setQuestion("");
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-[#415157] bg-[#172229] p-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#f3bc7f]">
          <Sparkles size={15} /> {daily ? "Сводка дня" : label}
        </h3>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed" aria-live="polite">
          {coach.summary || (coach.loadingSummary ? "Готовлю сводку…" : daily
            ? "Сон, восстановление, нагрузка и фраза дня."
            : "Объём, динамика и совет по выбранному периоду.")}
        </p>
        <button className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#eab16a] px-3 text-sm font-semibold text-[#17120e] disabled:opacity-50"
          type="button" onClick={coach.refreshSummary} disabled={!ready || busy}>
          {coach.loadingSummary && <LoaderCircle size={14} className="animate-spin" />}
          {coach.summary ? "Обновить сводку" : daily ? "Получить сводку дня" : "Разобрать период"}
        </button>
      </div>
      {coach.messages.length > 0 && <div className="grid max-h-72 gap-2 overflow-y-auto" aria-live="polite">
        {coach.messages.map((message, index) => (
          <div key={index} className={`rounded-xl p-3 text-sm leading-relaxed ${message.role === "user" ? "bg-[#382e24]" : "bg-[#172229]"}`}>
            <b className="text-xs text-[#f3bc7f]">{message.role === "user" ? "Ты" : "Консультант"}</b>
            <p className="mt-1 whitespace-pre-wrap break-words">{message.content}</p>
          </div>
        ))}
      </div>}
      <form className="grid grid-cols-[minmax(0,1fr)_40px] gap-2" onSubmit={submit}>
        <input aria-label="Уточняющий вопрос" className="min-w-0 rounded-lg border border-[#415157] bg-[#172229] px-3 py-2 text-sm"
          value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1200}
          placeholder={daily ? "Что сделать сегодня?" : "Уточнить по периоду"} />
        <button aria-label="Отправить вопрос" type="submit" disabled={!ready || busy || !question.trim()}
          className="grid place-items-center rounded-lg bg-[#31434b] disabled:opacity-50">
          {coach.sending ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
      {coach.error && <p role="alert" className="text-sm text-rose-300">{coach.error}</p>}
      {coach.unavailable && <p className="text-sm text-rose-300">Консультация сейчас недоступна.</p>}
      {coach.totalTokens > 0 && <p className="text-xs text-slate-400">{coach.totalTokens.toLocaleString("ru-RU")} токенов</p>}
    </div>
  );
}

export default function RunningCoachPanel({ period, periodStart, periodEnd, label, syncedAt }) {
  const modal = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isOpen && !modal.current.open) modal.current.showModal();
    if (!isOpen && modal.current.open) modal.current.close();
  }, [isOpen]);

  const [view, setView] = useState("today");
  const [openedPeriod, setOpenedPeriod] = useState(false);
  const today = new Date();
  const activeToday = view === "today";

  return (
    <>
      <button type="button" onClick={() => { setOpened(true); setIsOpen(true); }} aria-haspopup="dialog"
        className="inline-flex min-h-10 w-fit items-center gap-2 rounded-xl border border-[#6f5540] bg-[#302820] px-3 py-2 text-sm font-bold text-[#f3bc7f] hover:bg-[#413426]">
        <ScanLine size={17} /> Консультация и анализ
      </button>
      <dialog ref={modal} onClose={() => setIsOpen(false)} aria-labelledby="consultation-title"
        className={`overflow-hidden border border-[#3b4a50] bg-[#202c31] p-0 text-slate-100 shadow-2xl backdrop:bg-[#0b1116]/80 max-[760px]:fixed max-[760px]:inset-0 max-[760px]:m-0 max-[760px]:h-dvh max-[760px]:max-h-none max-[760px]:w-screen max-[760px]:max-w-none max-[760px]:rounded-none ${expanded ? "fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none" : "m-auto h-[min(82dvh,740px)] w-[min(760px,calc(100%-2rem))] max-w-none rounded-2xl"}`}>
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-[#3b4a50] px-4 py-3">
            <h2 id="consultation-title" className="flex items-center gap-2 text-base font-bold"><ScanLine size={17} /> Консультация и анализ</h2>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Уменьшить окно" : "Развернуть на весь экран"}
                className="grid size-10 place-items-center rounded-lg hover:bg-white/10 max-[760px]:hidden">
                {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Закрыть консультацию"
                className="grid size-10 place-items-center rounded-lg hover:bg-white/10"><X size={21} /></button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
            <div className="my-3 grid grid-cols-2 gap-1 rounded-xl bg-[#172229] p-1">
              {[["today", "Сегодня"], ["period", "Выбранный период"]].map(([key, title]) => (
                <button key={key} type="button" aria-pressed={view === key} onClick={() => { setView(key); if (key === "period") setOpenedPeriod(true); }}
                  className={`min-h-9 rounded-lg px-1 text-xs font-semibold ${view === key ? "bg-[#413426] text-[#f3bc7f]" : "text-slate-300"}`}>
                  {title}
                </button>
              ))}
            </div>
            <div hidden={!activeToday}>
              {opened && <Consultation key={today.toDateString()} daily period="day" periodStart={today} periodEnd={today} syncedAt={syncedAt} />}
            </div>
            <div hidden={activeToday}>
              {openedPeriod && <Consultation key={`${period}:${periodStart}:${periodEnd}`}
                label={label} period={period} periodStart={periodStart} periodEnd={periodEnd} syncedAt={syncedAt} />}
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
