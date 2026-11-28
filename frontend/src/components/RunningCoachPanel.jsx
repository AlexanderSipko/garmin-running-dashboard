import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Maximize2, Minimize2, ScanLine, Send, Sparkles, X } from "lucide-react";
import CoachChatHistory, { CoachMessages } from "./CoachChatHistory";
import { localDateKey } from "../lib/wellnessDates";
import { requestWeek } from "./PlannedSessionEditor";
import CoachDisclosure from "./CoachDisclosure";
import CoachSessionProposal from "./CoachSessionProposal";
import { CoachMemoryProposal } from "./CoachMemory";
import TrainingWeekPanel from "./TrainingWeekPanel";
import useRunningCoach from "../hooks/useRunningCoach";

function Consultation({ active, focusDay, label, period, periodStart, periodEnd, syncedAt, calendarPlanVersion, onTrainingWeekChanged, review, viewScope }) {
  const [question, setQuestion] = useState("");
  const [completedReview, setCompletedReview] = useState(null);
  const sentReview = useRef(null);
  const [failedReview, setFailedReview] = useState(null);
  const composer = useRef(null);
  const latestMessages = useRef(null);
  const reviewActivity = review !== completedReview ? review?.activity : null;
  const [trainingWeekId, setTrainingWeekId] = useState(null);
  const [sessionProposal, setSessionProposal] = useState(null);
  const [memoryProposal, setMemoryProposal] = useState(null);
  const [memorySaved, setMemorySaved] = useState(false);
  const [weekProposal, setWeekProposal] = useState(null);
  const [savingWeek, setSavingWeek] = useState(false);
  const [weekError, setWeekError] = useState("");
  const [weekRefresh, setWeekRefresh] = useState(0);
  const [moveProposal, setMoveProposal] = useState(null);
  const coach = useRunningCoach({ period, periodStart, periodEnd, syncedAt, focusDay, active, trainingWeekId });
  const ready = coach.statusChecked && coach.configured && !coach.unavailable;
  const busy = coach.loadingSummary || coach.sending;

  useEffect(() => {
    if (!active || !reviewActivity || sentReview.current === review || !ready || busy || coach.historyLoading) return;
    sentReview.current = review;
    setFailedReview(null);
    const date = String(reviewActivity.start_time).slice(0, 10);
    const prompt = `Разбери тренировку Garmin за ${date} (№${reviewActivity.id}). Что получилось и что учесть в следующий раз?`;
    void coach.ask(prompt, reviewActivity.id, true).then((result) => {
      if (result) {
        setCompletedReview(review);
        if (result.activity_analysis) review.onAnalysis?.(result.activity_analysis);
        requestAnimationFrame(() => latestMessages.current?.scrollIntoView({ block: "start" }));
      }
      else setFailedReview(review);
    });
    composer.current?.scrollIntoView({ block: "nearest" });
  }, [active, review, reviewActivity, ready, busy, coach.historyLoading, coach.ask]);

  function submit(event) {
    event.preventDefault();
    if (!question.trim() || busy) return;
    setMemorySaved(false);
    void coach.ask(question).then((result) => {
      if (result?.training_week_proposal) {
        setWeekProposal(result.training_week_proposal);
        setWeekError("");
      }
      if (result?.training_session) setSessionProposal(result.training_session);
      if (result?.memory_proposal) setMemoryProposal(result.memory_proposal);
      if (result?.training_move) setMoveProposal(result.training_move);
    });
    setQuestion("");
  }

  async function createWeekDraft() {
    setSavingWeek(true);
    setWeekError("");
    try {
      await requestWeek("", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: localDateKey(focusDay), preferences: weekProposal }),
      });
      setWeekProposal(null);
      setWeekRefresh((value) => value + 1);
    } catch (error) {
      setWeekError(error.message);
    } finally {
      setSavingWeek(false);
    }
  }

  return (
    <div className="grid gap-3">
      <CoachDisclosure storageKey={`coach-section:${viewScope}:summary`}
        title={<span className="flex items-center gap-2"><Sparkles size={15} aria-hidden="true" /> Сводка и рекомендации</span>}>
        <p className="mt-1 text-xs text-slate-400">Сегодня · период: {label}</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed" aria-live="polite">
          {coach.summary || (coach.loadingSummary
            ? "Готовлю сводку…"
            : "Разбор сегодняшней тренировки, восстановления и прогресса к цели.")}
        </p>
        <button className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#eab16a] px-3 text-sm font-semibold text-[#17120e] disabled:opacity-50"
          type="button" onClick={coach.refreshSummary} disabled={!ready || busy}>
          {coach.loadingSummary && <LoaderCircle size={14} className="animate-spin" />}
          {coach.summary ? "Обновить сводку" : "Получить сводку"}
        </button>
      </CoachDisclosure>
      <CoachDisclosure storageKey={`coach-section:${viewScope}:week`} title="План тренировок">
        <TrainingWeekPanel key={weekRefresh} active={active} today={focusDay} syncedAt={syncedAt} calendarPlanVersion={calendarPlanVersion}
        disabled={busy} onPlanVersion={setTrainingWeekId} onPlanChanged={onTrainingWeekChanged}
        moveProposal={moveProposal} onDismissMove={() => setMoveProposal(null)} />
      </CoachDisclosure>
      {weekProposal && <section className="grid gap-2 rounded-xl border border-[#52658b] bg-[#202b37] p-3 text-sm">
        <p>Открой черновик недели, чтобы посмотреть занятия перед утверждением.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={savingWeek} onClick={createWeekDraft}
            className="rounded-lg bg-[#eab16a] px-3 py-2 font-semibold text-[#17120e] disabled:opacity-50">
            {savingWeek ? "Готовлю…" : "Открыть черновик недели"}
          </button>
          <button type="button" disabled={savingWeek} onClick={() => setWeekProposal(null)}
            className="rounded-lg border border-slate-600 px-3 py-2">Отмена</button>
        </div>
        {weekError && <p role="alert" className="text-rose-300">{weekError}</p>}
      </section>}
      {sessionProposal && <CoachSessionProposal key={JSON.stringify(sessionProposal)} proposal={sessionProposal}
        onCancel={() => setSessionProposal(null)} onSave={(result) => {
          onTrainingWeekChanged(result.active, result.session);
          setWeekRefresh((value) => value + 1);
          setSessionProposal(null);
        }} />}
      {memoryProposal && <CoachMemoryProposal key={memoryProposal.note} proposal={memoryProposal}
        onClose={(saved) => { setMemorySaved(saved); setMemoryProposal(null); }} />}
      {memorySaved && <p role="status" className="text-xs text-emerald-300">Сохранено в памяти консультанта.</p>}
      <div ref={composer} className="grid gap-2">
        {reviewActivity && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#6f5540] bg-[#302820] px-3 py-2 text-xs text-[#f3bc7f]">
            <span>Разбор: {reviewActivity.name || "Тренировка Garmin"} · {String(reviewActivity.start_time).slice(0, 10)}</span>
          </div>
        )}
        <form className="grid grid-cols-[minmax(0,1fr)_40px] gap-2" onSubmit={submit}>
          <input aria-label="Самочувствие или вопрос консультанту" className="min-w-0 rounded-lg border border-[#415157] bg-[#172229] px-3 py-2 text-sm"
            value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1200}
            placeholder="Как себя чувствуешь? Или задай вопрос" />
          <button aria-label="Отправить вопрос" type="submit" disabled={!ready || busy || coach.historyLoading || !question.trim()}
            className="grid place-items-center rounded-lg bg-[#31434b] disabled:opacity-50">
            {coach.sending ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>
      {coach.error && <p role="alert" className="text-sm text-rose-300">{coach.error}</p>}
      {reviewActivity && failedReview === review && (
        <button type="button" disabled={!ready || busy} onClick={() => {
          sentReview.current = null;
          setFailedReview(null);
        }} className="w-fit rounded-lg border border-[#6f5540] px-3 py-2 text-sm text-[#f3bc7f] disabled:opacity-50">
          Повторить разбор
        </button>
      )}
      {coach.unavailable && <p className="text-sm text-rose-300">Консультация сейчас недоступна.</p>}
      {coach.usage?.total_tokens > 0 && (
        <p className="text-xs text-slate-400">
          Сегодня: {coach.usage.total_tokens.toLocaleString("ru-RU")} токенов
          {" · вход "}{coach.usage.input_tokens.toLocaleString("ru-RU")}
          {" · выход "}{coach.usage.output_tokens.toLocaleString("ru-RU")}
        </p>
      )}
      {coach.messages.length > 0 && (
        <section ref={latestMessages} className="grid gap-2" aria-live="polite">
          <h3 className="text-sm font-semibold text-slate-300">Сегодня</h3>
          <CoachMessages messages={coach.messages} onDeleted={coach.removeExchange} disabled={busy} />
        </section>
      )}
      {coach.hasHistory && <CoachChatHistory day={localDateKey(focusDay)} active={active} disabled={busy} />}
    </div>
  );
}

export default function RunningCoachPanel({ period, periodStart, periodEnd, label, syncedAt, calendarPlanVersion, onTrainingWeekChanged,
  activityReview, viewScope, modelLabel, onClose, showOpenButtons = true }) {
  const modal = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isOpen && !modal.current.open) modal.current.showModal();
    if (!isOpen && modal.current.open) modal.current.close();
  }, [isOpen]);

  useEffect(() => {
    if (activityReview) {
      setOpened(true);
      setIsOpen(true);
    }
  }, [activityReview]);

  const focusDay = new Date();

  function openConsultation() {
    setOpened(true);
    setIsOpen(true);
  }

  return (
    <>
      {showOpenButtons && <>
        <button type="button" onClick={openConsultation} aria-haspopup="dialog"
          className="inline-flex min-h-10 w-fit items-center gap-2 rounded-xl border border-[#6f5540] bg-[#302820] px-3 py-2 text-sm font-bold text-[#f3bc7f] hover:bg-[#413426]">
          <ScanLine size={17} /> Консультация и анализ
        </button>
        <button type="button" onClick={openConsultation} aria-haspopup="dialog"
          aria-label="Открыть консультацию" title="Консультация и анализ"
          className="fixed bottom-[calc(var(--footer-height,0px)+0.75rem)] right-[max(1rem,env(safe-area-inset-right))] z-40 grid size-12 place-items-center rounded-full border border-[#715339] bg-[#eab16a] text-[#211810] shadow-lg shadow-black/40 hover:bg-[#f5c58e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3bc7f]">
          <ScanLine size={22} aria-hidden="true" />
        </button>
      </>}
      <dialog ref={modal} onClose={() => { setIsOpen(false); onClose?.(); }} aria-labelledby="consultation-title"
        className={`overflow-hidden border border-[#3b4a50] bg-[#202c31] p-0 text-slate-100 shadow-2xl backdrop:bg-[#0b1116]/80 max-[760px]:fixed max-[760px]:inset-0 max-[760px]:m-0 max-[760px]:h-dvh max-[760px]:max-h-none max-[760px]:w-screen max-[760px]:max-w-none max-[760px]:rounded-none ${expanded ? "fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none" : "m-auto h-[min(82dvh,740px)] w-[min(760px,calc(100%-2rem))] max-w-none rounded-2xl"}`}>
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-[#3b4a50] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <ScanLine size={17} className="shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <h2 id="consultation-title" className="text-base font-bold">Консультация и анализ</h2>
                {modelLabel && <p className="mt-0.5 break-words text-xs text-[#f3bc7f]">{modelLabel}</p>}
              </div>
            </div>
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
            {opened && (
              <div className="pt-3">
                <Consultation active={isOpen} review={activityReview} viewScope={viewScope} focusDay={focusDay} label={label}
                  period={period} periodStart={periodStart} periodEnd={periodEnd} syncedAt={syncedAt} calendarPlanVersion={calendarPlanVersion}
                  onTrainingWeekChanged={onTrainingWeekChanged} />
              </div>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
